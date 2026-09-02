// PR #44 — mini-bloque "Próximo partido": ancla de orientación (fecha/hora/cancha/
// countdown) al inicio de #tab-partido, ANTES de #my-status-card. El ticket y su
// .scoreboard no se tocan: acá es el vistazo rápido, el ticket sigue siendo el
// detalle completo + edición. Sólo markup + CSS aislado + poblar nodos con
// textContent en render() (vía renderProximoPartido()).
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
  assert.match(block, /<p class="proximo-partido-eyebrow">Próximo partido<\/p>/);
  assert.match(block, /<p class="proximo-partido-main" id="proximo-partido-main">/);
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

test("6. renderProximoPartido sólo usa textContent (no toca estado ni innerHTML)", () => {
  const fn = extractFunction(demo, "renderProximoPartido");
  assert.match(fn, /getElementById\('proximo-partido-main'\)/);
  assert.match(fn, /getElementById\('proximo-partido-sub'\)/);
  assert.match(fn, /formatDateDisplay\(mi\.date\)/);
  assert.match(fn, /mi\.time/);
  assert.match(fn, /mi\.loc/);
  assert.match(fn, /daysUntilLabel\(mi\.date\)/);
  // Guard de fecha+hora, sin inventar horario.
  assert.match(fn, /if\(mi\.date && mi\.time\)/);
  assert.match(fn, /Próximo partido sin confirmar/);
  // Lee state.matchInfo pero no escribe: sólo asigna a .textContent, sin innerHTML,
  // sin classList, sin writers, sin asignar a state/mi.
  assert.doesNotMatch(fn, /innerHTML|\.classList|saveState\(|persistFocalizado|guardarCambio/);
  assert.doesNotMatch(fn, /(?:state|mi)\.\w+\s*=[^=]/);
  assert.equal((fn.match(/\.textContent\s*=/g) || []).length, 4, "sólo debería asignar textContent (main/sub x2)");
});

/* ---------- 7. comportamiento real de renderProximoPartido ---------- */

function runRender(matchInfo) {
  const nodes = {
    "proximo-partido-main": { textContent: "" },
    "proximo-partido-sub": { textContent: "" },
  };
  const context = vm.createContext({
    document: { getElementById: (id) => nodes[id] || null },
    state: { matchInfo },
    Boolean, String, Array,
  });
  vm.runInContext(
    [
      extractFunction(demo, "formatDateDisplay"),
      extractFunction(demo, "daysUntilLabel"),
      extractFunction(demo, "renderProximoPartido"),
      "renderProximoPartido();",
    ].join("\n"),
    context,
  );
  return { main: nodes["proximo-partido-main"].textContent, sub: nodes["proximo-partido-sub"].textContent };
}

test("7. matchInfo lleno: main = 'fecha · hora', sub = 'cancha · countdown'", () => {
  const out = runRender({ date: "2099-12-25", time: "16:00", loc: "Cancha del barrio" });
  assert.match(out.main, /· 16:00$/);
  assert.ok(/diciembre/i.test(out.main), `main sin fecha legible: ${out.main}`);
  assert.match(out.sub, /^Cancha del barrio · /);
  assert.match(out.sub, /(faltan|falta) \d+ d/); // countdown reutilizado
});

test("8. sin hora: estado sobrio, sin inventar horario", () => {
  const out = runRender({ date: "2099-12-25", time: "", loc: "Cancha del barrio" });
  assert.equal(out.main, "Próximo partido sin confirmar");
  assert.equal(out.sub, "");
});

test("9. sin fecha: estado sobrio, sin crashear", () => {
  assert.doesNotThrow(() => {
    const out = runRender({ date: "", time: "16:00", loc: "Cancha del barrio" });
    assert.equal(out.main, "Próximo partido sin confirmar");
    assert.equal(out.sub, "");
  });
});

test("10. matchInfo vacío entero: no crashea y cae al estado sobrio", () => {
  assert.doesNotThrow(() => {
    const out = runRender({});
    assert.equal(out.main, "Próximo partido sin confirmar");
  });
});

test("11. fecha+hora sin cancha: sub queda sólo con el countdown", () => {
  const out = runRender({ date: "2099-12-25", time: "16:00", loc: "" });
  assert.match(out.main, /· 16:00$/);
  assert.match(out.sub, /^(faltan|falta) \d+ d/);
});

/* ---------- 8. CSS: bloque sutil, no una card ---------- */

test("12. CSS: el bloque no tiene fondo de card ni borde (no compite con el ticket)", () => {
  const css = demo.slice(demo.indexOf(".proximo-partido{"), demo.indexOf("/* MI ESTADO"));
  assert.doesNotMatch(css, /\.proximo-partido\{[^}]*background/);
  assert.doesNotMatch(css, /\.proximo-partido\{[^}]*border:/);
  assert.match(css, /\.proximo-partido-sub:empty\{display:none;\}/);
});
