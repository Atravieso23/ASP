// PR #44 — mini-bloque "Próximo partido": ancla de orientación al inicio de
// #tab-partido, ANTES de #my-status-card. El ticket y su .scoreboard no se tocan.
//
// PR #53 — el bloque pasó a "quick glance" con dos frames según el estado del
// partido. Acá quedan los invariantes de PR #44 (ubicación, ticket intacto,
// estado B = definido). El comportamiento del estado A ("en armado") y el scrim
// viven en quick-glance-partido.test.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar ${name}`);
}

/* ---------- 1. el bloque existe y tiene los nodos ---------- */

test("1. el bloque #proximo-partido existe con eyebrow + main + sub", () => {
  assert.equal(demo.split('id="proximo-partido"').length - 1, 1, "un único bloque");
  const block = demo.slice(
    demo.indexOf('<section class="proximo-partido"'),
    demo.indexOf("</section>", demo.indexOf('<section class="proximo-partido"')) + 10,
  );
  assert.match(block, /<section class="proximo-partido" id="proximo-partido" aria-label="Próximo partido">/);
  // PR #53 — el eyebrow pasó a poblarse por JS (texto según estado): nace vacío con id.
  assert.match(block, /<p class="proximo-partido-eyebrow" id="proximo-partido-eyebrow"><\/p>/);
  assert.match(block, /<p class="proximo-partido-main" id="proximo-partido-main"><\/p>/);
  assert.match(block, /<p class="proximo-partido-sub" id="proximo-partido-sub"><\/p>/);
});

/* ---------- 2. ubicación: antes de #my-status-card, dentro de #tab-partido ---------- */

test("2. va dentro de #tab-partido y ANTES de #my-status-card", () => {
  const tabPartido = demo.indexOf('<div id="tab-partido">');
  const block = demo.indexOf('id="proximo-partido"');
  const statusCard = demo.indexOf('id="my-status-card"');
  assert.ok(tabPartido > -1 && block > tabPartido, "el bloque no está dentro de #tab-partido");
  assert.ok(block < statusCard, "el bloque tiene que ir antes de #my-status-card");
});

/* ---------- 3. NO está dentro del ticket, y el ticket/scoreboard no se tocaron ---------- */

test("3. el bloque NO está dentro del ticket", () => {
  const block = demo.indexOf('id="proximo-partido"');
  const ticket = demo.indexOf('<div class="ticket">');
  assert.ok(block < ticket, "el bloque quedó dentro/después del ticket");
});

test("4. el ticket y su .scoreboard siguen intactos (día/hora/cancha)", () => {
  const ticket = demo.indexOf('<div class="ticket">');
  const teams = demo.indexOf('class="section teams-section"');
  const ticketMarkup = demo.slice(ticket, teams);
  // Estructura del scoreboard sin cambios.
  assert.match(ticketMarkup, /class="ticket-heading-row"[\s\S]*id="team-name"[\s\S]*id="sb-type"/);
  assert.match(ticketMarkup, /<div class="sb-label">Día<\/div><div class="sb-value" id="sb-date">/);
  assert.match(ticketMarkup, /<div class="sb-label">Hora<\/div><div class="sb-value" id="sb-time">/);
  assert.match(ticketMarkup, /<div class="sb-label">Cancha<\/div>/);
  assert.match(ticketMarkup, /class="money-summary"/);
  // El bloque nuevo no se coló dentro del ticket.
  assert.doesNotMatch(ticketMarkup, /proximo-partido/);
});

/* ---------- 5. render() delega en renderProximoPartido() ---------- */

test("5. render() llama a renderProximoPartido()", () => {
  const render = extractFunction(demo, "render");
  assert.match(render, /renderProximoPartido\(\);/);
});

test("6. renderProximoPartido sólo lee: textContent + toggle de clase, sin writers", () => {
  const fn = extractFunction(demo, "renderProximoPartido");
  assert.match(fn, /getElementById\('proximo-partido-main'\)/);
  assert.match(fn, /getElementById\('proximo-partido-sub'\)/);
  assert.match(fn, /formatDateDisplay\(mi\.date\)/);
  assert.match(fn, /mi\.time/);
  assert.match(fn, /mi\.loc/);
  assert.match(fn, /daysUntilLabel\(mi\.date\)/);
  // Guard de fecha + hora REAL (PR #57): Estado B sólo con HH:MM, no con cualquier texto.
  assert.match(fn, /if\(mi\.date && isHoraValida\(mi\.time\)\)/);
  // PR #53 — ya NO escribe "Próximo partido sin confirmar" como línea principal.
  assert.doesNotMatch(fn, /Próximo partido sin confirmar/);
  // PR #53 — el único cambio de DOM además de textContent es toggle de esta clase.
  assert.match(fn, /classList\.(add|remove)\('proximo-partido--armado'\)/);
  // Lee state.matchInfo pero no escribe: sin innerHTML, sin writers, sin asignar a state/mi/matchInfo.
  assert.doesNotMatch(fn, /innerHTML|saveState\(|persistFocalizado|guardarCambio|guardarPartido|matchInfo\s*=/);
  assert.doesNotMatch(fn, /(?:state|mi)\.\w+\s*=[^=]/);
});

/* ---------- 7. comportamiento real de renderProximoPartido ---------- */

function runRender(matchInfo, { faltan = 0 } = {}) {
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
  const context = vm.createContext({
    document: { getElementById: (id) => nodes[id] || null },
    state: { matchInfo },
    faltanConfirmar: () => Array.from({ length: faltan }, (_, i) => `x${i}`),
    Boolean, String, Array,
  });
  vm.runInContext(
    [
      extractFunction(demo, "formatDateDisplay"),
      extractFunction(demo, "daysUntilLabel"),
      extractFunction(demo, "isHoraValida"),
      extractFunction(demo, "renderProximoPartido"),
      "renderProximoPartido();",
    ].join("\n"),
    context,
  );
  return {
    eyebrow: nodes["proximo-partido-eyebrow"].textContent,
    main: nodes["proximo-partido-main"].textContent,
    sub: nodes["proximo-partido-sub"].textContent,
    hint: nodes["proximo-partido-hint"].textContent,
    armado: classes.has("proximo-partido--armado"),
  };
}

test("7. estado B (fecha+hora): eyebrow 'Próximo partido', main = 'fecha · hora', sub = 'cancha · countdown'", () => {
  const out = runRender({ date: "2099-12-25", time: "16:00", loc: "Cancha del barrio" });
  assert.equal(out.eyebrow, "Próximo partido");
  assert.equal(out.armado, false);
  assert.match(out.main, /· 16:00$/);
  assert.ok(/diciembre/i.test(out.main), `main sin fecha legible: ${out.main}`);
  assert.match(out.sub, /^Cancha del barrio · /);
  assert.match(out.sub, /(faltan|falta) \d+ d/); // countdown reutilizado
});

test("8. sin hora: NO se inventa horario ni se escribe 'sin confirmar' como línea principal", () => {
  const out = runRender({ date: "2099-12-25", time: "", loc: "Cancha del barrio" });
  assert.equal(out.main, "");
  assert.equal(out.armado, true);
  assert.doesNotMatch([out.eyebrow, out.main, out.sub, out.hint].join(" "), /sin confirmar|se juega|reservad/i);
});

test("9. sin fecha: no crashea, cae al frame 'en armado'", () => {
  assert.doesNotThrow(() => {
    const out = runRender({ date: "", time: "16:00", loc: "Cancha del barrio" });
    assert.equal(out.main, "");
    assert.equal(out.eyebrow, "Así viene el partido");
  });
});

test("10. matchInfo vacío entero: no crashea y cae al frame 'en armado'", () => {
  assert.doesNotThrow(() => {
    const out = runRender({});
    assert.equal(out.main, "");
    assert.equal(out.armado, true);
  });
});

test("11. fecha+hora sin cancha: sub queda sólo con el countdown", () => {
  const out = runRender({ date: "2099-12-25", time: "16:00", loc: "" });
  assert.match(out.main, /· 16:00$/);
  assert.match(out.sub, /^(faltan|falta) \d+ d/);
});

/* ---------- 8. CSS: scrim sutil, no una card pesada ---------- */

test("12. CSS: el bloque tiene scrim de fondo pero NO sombra ni borde de card", () => {
  const css = demo.slice(demo.indexOf(".proximo-partido{"), demo.indexOf("/* MI ESTADO"));
  // PR #53 — scrim oscuro para recuperar contraste sobre el glow del body.
  assert.match(css, /\.proximo-partido\{[^}]*background:rgba\(8,20,32,\.6\)/);
  // pero sigue sin ser card: nada de box-shadow ni borde grueso.
  assert.doesNotMatch(css, /\.proximo-partido\{[^}]*box-shadow/);
  assert.doesNotMatch(css, /\.proximo-partido\{[^}]*border:/);
  assert.match(css, /\.proximo-partido-sub:empty\{display:none;\}/);
});

/* ---------- 9. Fecha vencida: copy honesto, sin "Próximo partido ... ya pasó" ----------
   Diagnóstico: daysUntilLabel() devuelve 'ya pasó' para cualquier fecha vencida, y hasta
   ahora eso se colaba tal cual en "Próximo partido ... ya pasó" (acá) y en
   "próximo picado ya pasó" (ticket, ver sección 10). ASP no sabe si el partido se jugó,
   se finalizó o se archivó, así que el copy nuevo sólo dice que la fecha pasó. */

function pastISO(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

test("13. fecha vencida + hora válida: no dice 'Próximo partido ... ya pasó', usa 'Fecha pasada'", () => {
  const out = runRender({ date: pastISO(3), time: "16:00", loc: "Cancha del barrio" });
  assert.equal(out.eyebrow, "Fecha pasada");
  const txt = [out.eyebrow, out.main, out.sub, out.hint].join(" ");
  assert.doesNotMatch(txt, /Próximo partido/);
  assert.doesNotMatch(txt, /ya pasó/, "el texto crudo de daysUntilLabel no debe colarse tal cual");
});

test("14. fecha vencida sin hora válida: no pide respuestas ni promete 'hora a definir'", () => {
  // faltan:2 fuerza el nudge que el frame 'en armado' mostraría si la fecha vencida
  // no tuviera prioridad: si esto fallara, "2 todavía no respondieron" se colaría.
  const out = runRender({ date: pastISO(10), time: "a coordinar", loc: "Cancha del barrio" }, { faltan: 2 });
  assert.equal(out.eyebrow, "Fecha pasada");
  const txt = [out.eyebrow, out.main, out.sub, out.hint].join(" ");
  assert.doesNotMatch(txt, /todavía no respondieron/);
  assert.doesNotMatch(txt, /hora a definir/);
});

test("15. fecha vencida: no aparecen 'finalizado', 'archivado', 'jugado' ni 'confirmado'", () => {
  for (const out of [
    runRender({ date: pastISO(1), time: "20:00", loc: "Cancha" }),
    runRender({ date: pastISO(20), time: "20hs", loc: "Cancha" }, { faltan: 3 }),
  ]) {
    const txt = [out.eyebrow, out.main, out.sub, out.hint].join(" ");
    for (const p of [/finalizad/i, /archivad/i, /jugad[oa]/i, /confirmad[oa]/i]) {
      assert.doesNotMatch(txt, p);
    }
  }
});

test("16. fecha vencida no queda marcada 'en armado' (no promueve convocatoria vieja a línea primaria)", () => {
  const out = runRender({ date: pastISO(5), time: "16:00", loc: "Cancha" });
  assert.equal(out.armado, false);
});

test("17. fecha futura sigue mostrando el frame B de siempre (sin regresión)", () => {
  const out = runRender({ date: "2099-12-25", time: "16:00", loc: "Cancha del barrio" });
  assert.equal(out.eyebrow, "Próximo partido");
  assert.match(out.sub, /^Cancha del barrio · (faltan|falta) \d+ d/);
});

/* ---------- 10. Ticket: "⚽ próximo picado ya pasó" ya no puede aparecer junto ----------
   El bloque vive dentro de render() (no en renderProximoPartido()), así que se extrae
   el fragmento puntual que resuelve el eyebrow/badge del ticket y se corre standalone,
   con la daysUntilLabel real — mismo patrón que runRender() de arriba. */

function runTicketEyebrow(matchInfo) {
  const start = demo.indexOf("const cd = document.getElementById('countdown-badge');");
  assert.ok(start > -1, "no encontré el bloque del countdown del ticket");
  const end = demo.indexOf("document.getElementById('negro-team-label')", start);
  assert.ok(end > start, "no encontré el final del bloque del countdown del ticket");
  const block = demo.slice(start, end);

  const nodes = {
    "countdown-badge": { style: {}, textContent: "" },
    "ticket-eyebrow-label": { textContent: "" },
  };
  const context = vm.createContext({
    document: { getElementById: (id) => nodes[id] || null },
    mi: matchInfo,
    String, Date, Math, isNaN,
  });
  vm.runInContext([extractFunction(demo, "daysUntilLabel"), block].join("\n"), context);
  return {
    eyebrowLabel: nodes["ticket-eyebrow-label"].textContent,
    badgeText: nodes["countdown-badge"].textContent,
    badgeVisible: nodes["countdown-badge"].style.display === "inline",
  };
}

test("18. ticket: fecha vencida usa 'Fecha pasada' en vez de 'próximo picado' + 'ya pasó'", () => {
  const out = runTicketEyebrow({ date: pastISO(4) });
  assert.equal(out.eyebrowLabel, "Fecha pasada");
  assert.equal(out.badgeVisible, false, "el badge no debe duplicar lo que ya dice el eyebrow");
});

test("19. ticket: fecha futura sigue mostrando '⚽ próximo picado' + countdown (sin regresión)", () => {
  const out = runTicketEyebrow({ date: "2099-12-25" });
  assert.equal(out.eyebrowLabel, "⚽ próximo picado");
  assert.equal(out.badgeVisible, true);
  assert.match(out.badgeText, /(faltan|falta) \d+ d/);
});

test("20. ticket: sin fecha, badge oculto y eyebrow default (sin regresión)", () => {
  const out = runTicketEyebrow({ date: "" });
  assert.equal(out.eyebrowLabel, "⚽ próximo picado");
  assert.equal(out.badgeVisible, false);
});

test("21. ticket: fecha vencida no dice 'finalizado', 'archivado', 'jugado' ni 'confirmado'", () => {
  const out = runTicketEyebrow({ date: pastISO(15) });
  const txt = `${out.eyebrowLabel} ${out.badgeText}`;
  for (const p of [/finalizad/i, /archivad/i, /jugad[oa]/i, /confirmad[oa]/i]) {
    assert.doesNotMatch(txt, p);
  }
});
