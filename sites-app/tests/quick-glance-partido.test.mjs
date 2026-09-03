// PR #53 — el bloque superior de la vista Jugador pasó de "Próximo partido"
// permanente a un quick glance con dos frames según el estado del partido:
//
//   A. en armado  (!matchInfo.date || !matchInfo.time):
//      eyebrow "Así viene el partido"; NO "Próximo partido sin confirmar";
//      la convocatoria (#proximo-partido-squad) sube a línea primaria via la
//      clase .proximo-partido--armado; sub lleva pistas neutras ("… hora a
//      definir", "faltan N por responder"). Nunca "reservado"/"confirmado".
//
//   B. definido  (matchInfo.date && matchInfo.time):
//      eyebrow "Próximo partido"; main = fecha·hora; sub = cancha·countdown;
//      convocatoria queda como línea de apoyo (como antes).
//
// Scrim de fondo para recuperar contraste sobre el glow del body, sin volverlo
// card. horariosDisponibles / renderLocalOrganizer / el chart del Organizador /
// matchInfo NO se tocan.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name}`);
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

const fnSrc = extractFunction(demo, "renderProximoPartido");

function runGlance(matchInfo, { faltan = 0 } = {}) {
  const classes = new Set();
  const nodes = {
    "proximo-partido": {
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    },
    "proximo-partido-eyebrow": { textContent: "" },
    "proximo-partido-main": { textContent: "" },
    "proximo-partido-sub": { textContent: "" },
    "proximo-partido-hint": { textContent: "" },
  };
  const ctx = vm.createContext({
    document: { getElementById: (id) => nodes[id] || null },
    state: { matchInfo },
    faltanConfirmar: () => Array.from({ length: faltan }, (_, i) => `x${i}`),
    formatDateDisplay: (iso) => (iso ? "Sábado, 6 de septiembre" : ""),
    daysUntilLabel: () => "faltan 3 días",
    Boolean, String, Array,
  });
  vm.runInContext(`${fnSrc}\nrenderProximoPartido();`, ctx);
  const g = (id) => nodes[id].textContent;
  return {
    eyebrow: g("proximo-partido-eyebrow"),
    main: g("proximo-partido-main"),
    sub: g("proximo-partido-sub"),
    hint: g("proximo-partido-hint"),
    armado: classes.has("proximo-partido--armado"),
    all: ["proximo-partido-eyebrow", "proximo-partido-main", "proximo-partido-sub", "proximo-partido-hint"].map(g).join(" | "),
  };
}

/* ============ estado A — partido en armado ============ */

test("1. sin date ni time -> eyebrow 'Así viene el partido' + clase .proximo-partido--armado", () => {
  const out = runGlance({ date: "", time: "" });
  assert.equal(out.eyebrow, "Así viene el partido");
  assert.equal(out.armado, true);
});

test("2. estado A no muestra 'Próximo partido sin confirmar' (ni como main ni en ningún nodo)", () => {
  for (const mi of [{ date: "", time: "" }, { date: "2026-09-06", time: "" }, { date: "", time: "20:00" }, {}]) {
    const out = runGlance(mi);
    assert.equal(out.main, "", `main debería quedar vacío en estado A (${JSON.stringify(mi)})`);
    assert.doesNotMatch(out.all, /sin confirmar/i);
  }
});

test("3. estado A promueve la convocatoria a línea primaria (CSS .proximo-partido--armado)", () => {
  const css = demo.slice(demo.indexOf(".proximo-partido--armado .proximo-partido-squad{"), demo.indexOf("/* MI ESTADO"));
  assert.match(css, /\.proximo-partido--armado \.proximo-partido-squad\{[^}]*color:var\(--navy\)/);
  // no más pesada que una CTA: peso 600, tamaño ~13-14px (no clamp grande como el main).
  assert.match(css, /\.proximo-partido--armado \.proximo-partido-squad\{[^}]*font:600 13\.5px/);
  // el string de la convocatoria lo sigue armando render() sin cambios (cubierto por
  // proximo-partido-convocatoria.test.mjs): acá sólo verificamos que renderProximoPartido
  // no lo reescribe.
  assert.doesNotMatch(fnSrc, /proximo-partido-squad/);
});

test("4. estado A: sin duda el string de convocatoria no lleva 'en duda' (render() intacto)", () => {
  const render = extractFunction(demo, "render");
  // guard de dudas sin cambios: '· N en duda' sólo si dudaList.length > 0
  assert.match(render, /if\(dudaList\.length > 0\) partes\.push\(`\$\{dudaList\.length\} en duda`\)/);
  assert.match(render, /if\(mi\.type\) partes\.push\(`apuntamos a \$\{cap\}`\)/);
});

test("5. estado A muestra 'N todavía no respondieron' (en la pista, BAJO el resumen) SÓLO si faltanConfirmar().length > 0", () => {
  assert.match(runGlance({ date: "", time: "" }, { faltan: 3 }).hint, /^3 todavía no respondieron$/);
  assert.equal(runGlance({ date: "", time: "" }, { faltan: 0 }).hint, "");
  assert.match(fnSrc, /const faltan = faltanConfirmar\(\)\.length;/);
  assert.match(fnSrc, /if\(faltan > 0\)/);
  // la pista va DESPUÉS de #proximo-partido-squad en el markup (bajo el resumen primario)
  const block = demo.slice(demo.indexOf('<section class="proximo-partido"'), demo.indexOf("</section>", demo.indexOf('<section class="proximo-partido"')) + 10);
  assert.ok(block.indexOf('id="proximo-partido-squad"') < block.indexOf('id="proximo-partido-hint"'));
  assert.ok(block.indexOf('id="proximo-partido-hint"') < block.indexOf('id="proximo-partido-horarios"'));
});

test("6. PR #54 — nunca 'faltan N' a secas ni 'por responder'; el copy es 'N todavía no respondieron'", () => {
  assert.doesNotMatch(fnSrc, /faltan \$\{faltan\}|por responder/);
  for (const n of [1, 2, 7, 14]) {
    const hint = runGlance({ date: "", time: "" }, { faltan: n }).hint;
    assert.equal(hint, `${n} todavía no respondieron`);
    assert.doesNotMatch(hint, /faltan|cupo/i);
  }
});

test("7. estado A con fecha parcial (date sin time) puede mostrar 'hora a definir' neutral", () => {
  const out = runGlance({ date: "2026-09-06", time: "" });
  assert.match(out.hint, /hora a definir/);
  assert.doesNotMatch(out.hint, /confirmad|reservad/i);
});

test("7b. estado A sin fecha: no aparece 'hora a definir' colgada; sub queda vacío", () => {
  const out = runGlance({ date: "", time: "" });
  assert.doesNotMatch(out.hint, /hora a definir/);
  assert.equal(out.sub, "");
});

test("7c. una sola pista: si falta gente por responder, gana el nudge (no la fecha)", () => {
  const out = runGlance({ date: "2026-09-06", time: "" }, { faltan: 4 });
  assert.match(out.hint, /^4 todavía no respondieron$/);
  assert.doesNotMatch(out.hint, /hora a definir/);
});

/* ============ estado B — partido definido ============ */

test("8. date+time -> eyebrow 'Próximo partido', sin clase armado", () => {
  const out = runGlance({ date: "2026-09-06", time: "20:00", loc: "La Terraza F7" });
  assert.equal(out.eyebrow, "Próximo partido");
  assert.equal(out.armado, false);
});

test("9. estado B conserva fecha/hora como main", () => {
  const out = runGlance({ date: "2026-09-06", time: "20:00", loc: "La Terraza F7" });
  assert.match(out.main, /Sábado, 6 de septiembre · 20:00/);
});

test("10. estado B conserva cancha/countdown como sub; sin pista de armado (ni 'todavía no respondieron')", () => {
  const out = runGlance({ date: "2026-09-06", time: "20:00", loc: "La Terraza F7" }, { faltan: 7 });
  assert.match(out.sub, /^La Terraza F7 · faltan 3 días$/);
  assert.equal(out.hint, "");
  assert.doesNotMatch(out.all, /todavía no respondieron/);
});

test("11. estado B: la convocatoria queda como línea de apoyo (muted), no promovida", () => {
  // sin la clase armado, #proximo-partido-squad usa su regla base muted 12px
  const css = demo.slice(demo.indexOf(".proximo-partido-squad{"), demo.indexOf(".proximo-partido--armado .proximo-partido-squad{"));
  assert.match(css, /\.proximo-partido-squad\{[^}]*font-size:12px[^}]*color:var\(--muted\)/);
});

/* ============ horarios (PR #51) intactos ============ */

test("12. 'Horarios que mejor cierran' sigue en el bloque, poblado por renderHorariosDisponibles", () => {
  const block = demo.slice(
    demo.indexOf('<section class="proximo-partido"'),
    demo.indexOf("</section>", demo.indexOf('<section class="proximo-partido"')) + 10,
  );
  assert.match(block, /<div class="proximo-partido-horarios" id="proximo-partido-horarios"><\/div>/);
  assert.match(extractFunction(demo, "renderHorariosDisponibles"), /Horarios que mejor cierran/);
  // PR #56 — render() ahora le pasa la hora del partido (para ocultarlos si ya hay una).
  assert.match(extractFunction(demo, "render"), /renderProximoPartido\(\);\s*renderHorariosDisponibles\(state\.matchInfo && state\.matchInfo\.time\);/);
});

/* ============ copy prohibido ============ */

test("13. copy prohibido ausente del bloque quick glance", () => {
  const prohibidos = [/ganador/i, /se juega/i, /horario elegido/i, /reservad/i, /cancha reservada/i, /hora confirmada/i, /cancha confirmada/i];
  const salidas = [
    runGlance({ date: "", time: "" }, { faltan: 3 }).all,
    runGlance({ date: "2026-09-06", time: "" }).all,
    runGlance({ date: "2026-09-06", time: "20:00", loc: "La Terraza" }).all,
  ].join(" || ");
  for (const p of prohibidos) {
    assert.doesNotMatch(fnSrc, p, `renderProximoPartido no debe contener ${p}`);
    assert.doesNotMatch(salidas, p, `la salida no debe contener ${p}`);
  }
});

/* ============ sólo lectura ============ */

test("14. renderProximoPartido no escribe matchInfo", () => {
  assert.doesNotMatch(fnSrc, /matchInfo\s*=|\.time\s*=|\.date\s*=|\.loc\s*=|state\.matchInfo\./);
});

test("15. no llama writers ni persiste", () => {
  assert.doesNotMatch(fnSrc, /savePlayerRegistration|guardarCambioEnResponses|guardarPartido|saveState|persistFocalizado|marcarMiPago/i);
});

test("16. no toca Supabase / red / storage", () => {
  assert.doesNotMatch(fnSrc, /supabase|fetch\(|upsert|localStorage|XMLHttpRequest/i);
});

/* ============ Organizador intacto ============ */

test("17. renderLocalOrganizer y su chart no cambiaron", () => {
  const org = extractFunction(demo, "renderLocalOrganizer");
  assert.match(org, /horariosDisponibles\(localAvailabilityResponses, \{top:3\}\)/);
  assert.match(org, /availability-row \$\{index===0\?'peak':''\}/);
  assert.match(org, /\$\{item\.total===1\?'jugador':'jugadores'\}/);
  // la función pura tampoco: firma y regla intactas
  const pura = extractFunction(demo, "horariosDisponibles");
  assert.match(pura, /function horariosDisponibles\(responses, \{ top = 3 \} = \{\}\)/);
  assert.match(pura, /item\.status==='in' && item\.from<=label && item\.to>label/);
});

/* ============ scrim / contraste ============ */

test("18. CSS: el bloque tiene scrim de fondo y prohíbe box-shadow", () => {
  const css = demo.slice(demo.indexOf(".proximo-partido{"), demo.indexOf("/* MI ESTADO"));
  assert.match(css, /\.proximo-partido\{[^}]*background:rgba\(8,20,32,\.6\)/);
  assert.match(css, /\.proximo-partido\{[^}]*border-radius:12px/);
  assert.doesNotMatch(css, /\.proximo-partido\{[^}]*box-shadow/);
  // main/eyebrow/hint/sub vacíos no dejan hueco
  assert.match(css, /\.proximo-partido-main:empty\{display:none;\}/);
  assert.match(css, /\.proximo-partido-eyebrow:empty\{display:none;\}/);
  assert.match(css, /\.proximo-partido-hint:empty\{display:none;\}/);
  assert.match(css, /\.proximo-partido-sub:empty\{display:none;\}/);
});
