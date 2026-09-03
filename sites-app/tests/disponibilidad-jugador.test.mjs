// PR #51 — "Horarios que mejor cierran" en la vista Jugador: señal compacta de
// disponibilidad inferida por horario, arriba, dentro de "Próximo partido".
//
// - Disponibilidad inferida, NO decisión: sin "ganador", sin "se juega a X", sin
//   destacar una franja como elegida, sin barras.
// - Función pura compartida `horariosDisponibles(responses, {top})`: slots 09:00–21:00,
//   cuenta si status==='in' && from<=slot && to>slot (fin exclusivo), full-day
//   (09:00–22:00) cuenta los 13 slots, invitados cuentan, duda/out no; ordena por
//   cantidad desc y hora asc; recorta a `top`.
// - El chart del Organizador reusa la misma función y su HTML no cambia.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name}`);
  // Saltear la lista de parámetros (puede llevar destructuring con llaves) antes
  // de contar el cuerpo.
  let i = source.indexOf("(", start);
  let paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === "(") paren++;
    else if (source[i] === ")" && --paren === 0) { i++; break; }
  }
  const open = source.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === "{") depth++;
    else if (source[j] === "}" && --depth === 0) return source.slice(start, j + 1);
  }
  throw new Error(`no pude cerrar ${name}`);
}

const puraSrc = extractFunction(demo, "horariosDisponibles");
const helperSrc = extractFunction(demo, "renderHorariosDisponibles");
const organizerSrc = extractFunction(demo, "renderLocalOrganizer");

function pura(responses, opts) {
  const ctx = vm.createContext({ String });
  vm.runInContext(`${puraSrc}\nglobalThis.__out = JSON.stringify(horariosDisponibles(${JSON.stringify(responses)}, ${JSON.stringify(opts || {})}));`, ctx);
  return JSON.parse(ctx.__out); // copia en el realm del test (evita cross-realm en deepEqual)
}

let seq = 0;
const IN = (from, to, extra = {}) => ({ name: `p${++seq}`, status: "in", from, to, ...extra });

/* ============ función pura ============ */

test("1. una response 'in' cuenta en los slots que cubre su franja", () => {
  const out = pura([IN("18:00", "19:00")]);
  assert.deepEqual(out, [{ label: "18:00", total: 1 }]);
});

test("2. 'duda' no cuenta", () => {
  assert.deepEqual(pura([{ status: "duda", from: "18:00", to: "20:00" }]), []);
});

test("3. 'out' no cuenta", () => {
  assert.deepEqual(pura([{ status: "out", from: "18:00", to: "20:00" }]), []);
});

test("4. invitado (isGuest:true, status:'in') cuenta igual que un jugador", () => {
  const out = pura([IN("18:00", "19:00", { isGuest: true, invitedBy: "Ana" })]);
  assert.deepEqual(out, [{ label: "18:00", total: 1 }]);
});

test("5. full-day 09:00–22:00 cuenta en los 13 slots (09:00 … 21:00)", () => {
  const out = pura([IN("09:00", "22:00")], { top: 20 });
  assert.equal(out.length, 13);
  assert.equal(out[0].label, "09:00");
  assert.equal(out[out.length - 1].label, "21:00");
  assert.ok(out.every((s) => s.total === 1));
});

test("6. fin exclusivo [from, to): 16:00–20:00 cuenta 19:00 y NO 20:00", () => {
  const out = pura([IN("16:00", "20:00")], { top: 20 });
  const labels = out.map((s) => s.label);
  assert.deepEqual(labels, ["16:00", "17:00", "18:00", "19:00"]);
  assert.ok(!labels.includes("20:00"));
});

test("7. empate: ordena por cantidad desc y, a igual cantidad, hora más temprana", () => {
  // 18:00 junta 3; 16:00 y 20:00 juntan 2 cada uno.
  const responses = [
    IN("18:00", "19:00"), IN("18:00", "19:00"), IN("18:00", "19:00"),
    IN("16:00", "17:00"), IN("16:00", "17:00"),
    IN("20:00", "21:00"), IN("20:00", "21:00"),
  ];
  const out = pura(responses, { top: 20 });
  assert.deepEqual(out, [
    { label: "18:00", total: 3 },
    { label: "16:00", total: 2 },
    { label: "20:00", total: 2 },
  ]);
});

test("8. `top` recorta el resultado (default 3)", () => {
  const responses = [
    IN("16:00", "17:00"), IN("16:00", "17:00"), IN("16:00", "17:00"), IN("16:00", "17:00"),
    IN("17:00", "18:00"), IN("17:00", "18:00"), IN("17:00", "18:00"),
    IN("18:00", "19:00"), IN("18:00", "19:00"),
    IN("19:00", "20:00"),
  ];
  assert.equal(pura(responses).length, 3);
  assert.deepEqual(pura(responses).map((s) => s.label), ["16:00", "17:00", "18:00"]);
  assert.equal(pura(responses, { top: 2 }).length, 2);
});

test("9. sin responses 'in' -> [] (también con entrada no-array)", () => {
  assert.deepEqual(pura([]), []);
  assert.deepEqual(pura([{ status: "duda", from: "18:00", to: "20:00" }, { status: "out" }]), []);
  assert.deepEqual(pura(null), []);
});

test("9b. la función pura vive fuera del rango slice-sensible renderGuestManager→renderLocalOrganizer", () => {
  const guardado = demo.indexOf("function renderGuestManager(){");
  const organizer = demo.indexOf("\nfunction renderLocalOrganizer(){");
  const pos = demo.indexOf("function horariosDisponibles");
  assert.ok(pos > organizer || pos < guardado, "no debe caer entre renderGuestManager y renderLocalOrganizer");
});

/* ============ markup / ubicación ============ */

test("10. #proximo-partido-horarios existe, único, dentro de la <section> Próximo partido", () => {
  assert.equal(demo.split('id="proximo-partido-horarios"').length - 1, 1, "un único nodo");
  const block = demo.slice(
    demo.indexOf('<section class="proximo-partido"'),
    demo.indexOf("</section>", demo.indexOf('<section class="proximo-partido"')) + 10,
  );
  assert.match(block, /<div class="proximo-partido-horarios" id="proximo-partido-horarios"><\/div>/);
});

test("11. va después de #proximo-partido-squad", () => {
  const block = demo.slice(
    demo.indexOf('<section class="proximo-partido"'),
    demo.indexOf("</section>", demo.indexOf('<section class="proximo-partido"')) + 10,
  );
  assert.ok(block.indexOf('id="proximo-partido-squad"') < block.indexOf('id="proximo-partido-horarios"'));
});

test("12. va antes de #my-status-card", () => {
  assert.ok(demo.indexOf('id="proximo-partido-horarios"') < demo.indexOf('id="my-status-card"'));
});

test("12b. render() llama renderHorariosDisponibles pasándole si hay una HORA REAL", () => {
  // PR #56 introdujo el argumento; PR #57 lo envuelve en isHoraValida() para que
  // "a coordinar"/"20hs" NO oculten los horarios (la decisión de cuándo sigue abierta).
  assert.match(
    extractFunction(demo, "render"),
    /renderProximoPartido\(\);\s*renderHorariosDisponibles\(isHoraValida\(state\.matchInfo && state\.matchInfo\.time\)\);/,
  );
});

/* ============ comportamiento del helper de Jugador ============ */

function runHelper(responses, horaYaCargada) {
  const box = { innerHTML: "PREV" };
  const ctx = vm.createContext({
    document: { getElementById: (id) => (id === "proximo-partido-horarios" ? box : null) },
    localAvailabilityResponses: responses,
    String,
  });
  vm.runInContext(
    `${puraSrc}\n${helperSrc}\nrenderHorariosDisponibles(${JSON.stringify(horaYaCargada ?? null)});`,
    ctx,
  );
  return box.innerHTML;
}

test("13. heading 'Horarios que mejor cierran' + hasta 3 filas", () => {
  const html = runHelper([
    IN("18:00", "19:00"), IN("18:00", "19:00"),
    IN("17:00", "18:00"),
    IN("16:00", "17:00"), IN("16:00", "17:00"), IN("16:00", "17:00"),
  ]);
  assert.match(html, /<p class="proximo-partido-horarios-eyebrow">Horarios que mejor cierran<\/p>/);
  assert.equal((html.match(/proximo-partido-horarios-row/g) || []).length, 3);
});

test("14. filas con formato 'HH:MM · N pueden'", () => {
  const html = runHelper([IN("18:00", "19:00"), IN("18:00", "19:00"), IN("16:00", "17:00")]);
  assert.match(html, /<p class="proximo-partido-horarios-row">18:00 · 2 pueden<\/p>/);
  assert.match(html, /<p class="proximo-partido-horarios-row">16:00 · 1 pueden<\/p>/);
});

test("14b. una sola franja -> una sola fila", () => {
  const html = runHelper([IN("18:00", "19:00")]);
  assert.equal((html.match(/proximo-partido-horarios-row/g) || []).length, 1);
  assert.match(html, /18:00 · 1 pueden/);
});

test("15. sin confirmados -> nodo vacío (:empty lo oculta)", () => {
  assert.equal(runHelper([]), "");
  assert.equal(runHelper([{ status: "duda", from: "18:00", to: "20:00" }, { status: "out" }]), "");
});

/* ============ PR #56 — el helper oculta con el argumento truthy ============ */
// El helper es un primitivo: oculta si su argumento es truthy, sin mirar formato.
// Quién decide si pasarle truthy (el call site: PR #56 = time no vacío, PR #57 =
// isHoraValida(time)) se prueba en hora-valida.test.mjs / el test 12b de arriba.

const CONF = [IN("18:00", "19:00"), IN("18:00", "19:00"), IN("17:00", "18:00")];

test("15c. argumento falsy (o vacío / null / undefined) -> horarios VISIBLES", () => {
  assert.match(runHelper(CONF), /Horarios que mejor cierran/);
  assert.match(runHelper(CONF, ""), /Horarios que mejor cierran/);
  assert.match(runHelper(CONF, null), /Horarios que mejor cierran/);
  assert.match(runHelper(CONF, false), /Horarios que mejor cierran/);
  // llamada literal sin argumento
  const box = { innerHTML: "PREV" };
  const ctx = vm.createContext({
    document: { getElementById: (id) => (id === "proximo-partido-horarios" ? box : null) },
    localAvailabilityResponses: CONF,
    String,
  });
  vm.runInContext(`${puraSrc}\n${helperSrc}\nrenderHorariosDisponibles();`, ctx);
  assert.match(box.innerHTML, /Horarios que mejor cierran/);
});

test("15d. argumento truthy (true / string) -> horarios OCULTOS (nodo vacío, :empty lo esconde)", () => {
  assert.equal(runHelper(CONF, true), "");
  assert.equal(runHelper(CONF, "20:00"), "");
});

test("15f. el early return ocurre ANTES de llamar a horariosDisponibles", () => {
  const cuerpo = helperSrc.slice(helperSrc.indexOf("{"));
  const iEarly = cuerpo.indexOf("if(horaYaCargada)");
  const iCalc = cuerpo.indexOf("horariosDisponibles(localAvailabilityResponses");
  assert.ok(iEarly !== -1 && iCalc !== -1, "no ubiqué las dos líneas");
  assert.ok(iEarly < iCalc, "el guard de hora tiene que ir antes del cálculo");
  assert.match(cuerpo, /if\(horaYaCargada\)\{ box\.innerHTML=''; return; \}/);
});

test("15b. CSS: filas compactas muted, heading tipo eyebrow diferenciado, sin barras, con :empty", () => {
  const css = demo.slice(demo.indexOf(".proximo-partido-horarios{"), demo.indexOf("/* MI ESTADO"));
  assert.match(css, /\.proximo-partido-horarios:empty\{display:none;\}/);
  // PR #52/#53 — el heading dejó de ser una fila más: eyebrow compacto (Oswald 10px,
  // uppercase, muted), distinto de las filas "HH:MM · N pueden" (12px sentence-case).
  assert.match(css, /\.proximo-partido-horarios-eyebrow\{[^}]*font:700 10px 'Oswald'[^}]*text-transform:uppercase[^}]*color:var\(--muted\)/);
  assert.match(css, /\.proximo-partido-horarios-row\{[^}]*font-size:12px[^}]*color:var\(--muted\)/);
  // separador hairline permitido (border-top 1px), pero sin fondo propio ni caja de card.
  assert.doesNotMatch(css, /\.proximo-partido-horarios[^{]*\{[^}]*background/);
  assert.match(css, /\.proximo-partido-horarios\{[^}]*border-top:1px solid var\(--card-border\)/);
  assert.doesNotMatch(css, /availability-fill|availability-track|\.peak/);
});

/* ============ copy prohibido / seguridad ============ */

test("16. copy prohibido ausente en el helper y en su salida", () => {
  const html = runHelper([IN("18:00", "19:00"), IN("16:00", "17:00")]);
  for (const prohibido of [
    /ganador/i, /se juega/i, /elegido/i, /horario ganador/i, /viene ganando/i,
    // PR #56 — ocultar por hora cargada no debe insinuar reserva/confirmación/cupo
    /reservad/i, /\breserva\b/i, /confirmad[oa]/i, /\bcupo\b/i,
  ]) {
    assert.doesNotMatch(helperSrc, prohibido, `el helper no debe decir ${prohibido}`);
    assert.doesNotMatch(html, prohibido, `la salida no debe decir ${prohibido}`);
  }
});

test("17. el helper no escribe matchInfo (ni lo menciona)", () => {
  assert.doesNotMatch(helperSrc, /matchInfo/);
  assert.doesNotMatch(puraSrc, /matchInfo/);
});

test("18. el helper no llama writers ni persiste", () => {
  assert.doesNotMatch(helperSrc, /savePlayerRegistration|guardarCambioEnResponses|guardarCambio|saveState|persist|marcarMiPago|evaluarTarjetas|editarPartido/i);
  // sólo escribe innerHTML de su propio nodo; no asigna a state ni a matchInfo
  assert.doesNotMatch(helperSrc, /state\.\w+\s*=|\.time\s*=/);
});

test("19. el helper no toca Supabase / red / storage", () => {
  assert.doesNotMatch(helperSrc, /supabase|fetch\(|upsert|localStorage|XMLHttpRequest/i);
  assert.doesNotMatch(puraSrc, /supabase|fetch\(|upsert|localStorage/i);
});

/* ============ regresión: chart del Organizador sin cambios ============ */

function runOrganizer(responses) {
  const chart = { innerHTML: "" };
  const els = {
    "organizer-availability-chart": chart,
    "organizer-responses-body": { innerHTML: "", querySelectorAll: () => [] },
    "organizer-responses-count": { textContent: "" },
    "organizer-response-search": { value: "" },
  };
  const ctx = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    localAvailabilityResponses: responses,
    state: { players: [] },
    escapeHtml: (v) => String(v),
    String,
  });
  vm.runInContext(`${puraSrc}\n${organizerSrc}\nrenderLocalOrganizer();`, ctx);
  return chart.innerHTML;
}

test("20. renderLocalOrganizer() conserva el HTML del chart (barras, .peak, 'N jugadores', top 3)", () => {
  // 5 'in' cubriendo 16/17/18 (una es invitada) + duda + out que no cuentan.
  const responses = [
    IN("16:00", "19:00"), IN("16:00", "19:00"), IN("16:00", "19:00"), IN("16:00", "19:00"),
    IN("16:00", "19:00", { isGuest: true }),
    { name: "d1", status: "duda", from: "16:00", to: "19:00" },
    { name: "o1", status: "out" },
  ];
  const expected = [
    { label: "16:00", peak: true },
    { label: "17:00", peak: false },
    { label: "18:00", peak: false },
  ].map(({ label, peak }) => `
      <div class="availability-row ${peak ? "peak" : ""}">
        <span class="availability-time">${label}</span>
        <div class="availability-track"><div class="availability-fill" style="--availability:100%"></div></div>
        <span class="availability-count" title="5 confirmados">5 jugadores</span>
      </div>`).join("");
  assert.equal(runOrganizer(responses), expected);
});

test("20b. renderLocalOrganizer() usa singular 'jugador' con 1 y muestra vacío sin datos", () => {
  assert.match(runOrganizer([IN("18:00", "19:00")]), /1 jugador<\/span>/);
  assert.match(runOrganizer([]), /Todavía no hay horarios para comparar/);
});
