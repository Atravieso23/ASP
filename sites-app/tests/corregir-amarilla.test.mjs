// PR "Sacar la amarilla" — corrección manual de una 🟨 pendiente en la Lista de morosos,
// para cuando alguien pagó y no quedó registrado antes del inicio del partido.
//
// Fuente de verdad = state.cards (NO responses[].paid). Writer nuevo corregirAmarilla,
// gemelo de saldarBirra: escritura focalizada e independiente, no llama a computeCards ni
// al writer automático. Baja yellows a 0 sólo si yellows>0; NO toca reds/beers/evaluated;
// agrega una entrada compensatoria a cards.log (append-only). UI: modal "Editar lista".
//
// Se ejecuta el código REAL de demo.html en un node:vm con un persistFocalizado de mentira
// (blob en memoria) y window.confirm falso. Sin red, sin navegador, sin producción.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name} en demo.html`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar la función ${name}`);
}

const clone = (x) => JSON.parse(JSON.stringify(x));

// "Servidor" de mentira: cards + relleno de otras keys para verificar que no se tocan.
const serverOf = (byPlayer, over) => ({
  matchInfo: { date: "2026-09-05", time: "20:00", type: "F7", priceTotal: "140000" },
  responses: [{ responseId: "r1", isGuest: false, status: "in", paid: false, name: "Ale" }],
  habitualPlayers: ["Ale", "Fran Forrester"],
  cards: {
    byPlayer: clone(byPlayer),
    evaluated: { "2026-09-05|20:00": true },
    log: [{ matchKey: "2026-09-05|20:00", player: "Ale", card: "yellow", reason: "sin-pago-al-inicio", at: "2026-09-05T23:00:00.000Z" }],
  },
  players: [{ name: "Ale", number: 9, isCaptain: true }],
  history: [{ finalizedAt: "2026-08-01T00:00:00.000Z" }],
  sedes: [{ name: "Cancha", address: "" }],
  formations: {},
  frequentAliases: ["picado.demo"],
  ...over,
});

function makeWorld(server) {
  let serverBlob = clone(server);
  const writes = [];
  let persistCalls = 0;

  const context = vm.createContext({
    JSON, Object, Array, String, Number, Math, Promise, Date,
    console: { error() {}, warn() {}, log() {} },
  });
  context.persistFocalizado = function (aplicar) {
    persistCalls++;
    const fresh = clone(serverBlob);
    let ok = false;
    try { ok = aplicar(fresh); } catch { ok = false; }
    if (!ok) return Promise.resolve(false);
    serverBlob = fresh;
    writes.push(clone(fresh.cards));
    context.state = fresh;
    return Promise.resolve(true);
  };
  vm.runInContext(extractFunction(demo, "corregirAmarilla") + "\nglobalThis.__c = corregirAmarilla;", context);

  return {
    corregir: (name) => context.__c(name),
    writes,
    persistCalls: () => persistCalls,
    server: () => serverBlob,
  };
}

const rec = (w, id) => w.server().cards.byPlayer[id];

/* ---------- writer: baja yellows a 0 ---------- */

test("1. {yellows:1,reds:0,beers:0} -> yellows:0 y la fila desaparece de morososDeCards", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }));
  const ok = await w.corregir("Fran Forrester");
  assert.equal(ok, true);
  assert.equal(rec(w, "Fran Forrester").yellows, 0);
  // morososDeCards (pura, extraída del archivo real) ya no la lista.
  const ctx = vm.createContext({ Number, Object, Array, String });
  vm.runInContext(extractFunction(demo, "morososDeCards") + "\nglobalThis.__m = morososDeCards;", ctx);
  assert.equal(ctx.__m(w.server().cards).length, 0);
});

test("2. {yellows:1,reds:2,beers:1} -> yellows:0, reds y beers intactos, la fila queda con birra", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 2, beers: 1 } }));
  await w.corregir("Fran Forrester");
  assert.deepEqual(rec(w, "Fran Forrester"), { yellows: 0, reds: 2, beers: 1 });
  const ctx = vm.createContext({ Number, Object, Array, String });
  vm.runInContext(extractFunction(demo, "morososDeCards") + "\n" + extractFunction(demo, "marcasDeMoroso") + "\nglobalThis.__m = morososDeCards; globalThis.__k = marcasDeMoroso;", ctx);
  const filas = ctx.__m(w.server().cards);
  assert.equal(filas.length, 1);
  assert.equal(ctx.__k(filas[0]), "🍺 debe 1 birra");
});

/* ---------- writer: aborta sin escribir ---------- */

test("3. {yellows:0,beers:1} -> aborta sin write (no hay amarilla que sacar)", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 1, beers: 1 } }));
  const ok = await w.corregir("Fran Forrester");
  assert.equal(ok, false);
  assert.equal(w.writes.length, 0);
});

test("4. registro inexistente -> aborta sin write", async () => {
  const w = makeWorld(serverOf({ "Ale": { yellows: 1, reds: 0, beers: 0 } }));
  const ok = await w.corregir("Fran Forrester");
  assert.equal(ok, false);
  assert.equal(w.writes.length, 0);
});

test("5. yellows roto / ausente / negativo -> aborta sin write", async () => {
  for (const bad of [{ yellows: "x" }, { yellows: -1 }, { reds: 2 }, {}]) {
    const w = makeWorld(serverOf({ "Fran Forrester": bad }));
    assert.equal(await w.corregir("Fran Forrester"), false);
    assert.equal(w.writes.length, 0);
  }
});

test("5b. nombre vacío / null / undefined -> aborta sin siquiera leer el servidor", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }));
  assert.equal(await w.corregir(""), false);
  assert.equal(await w.corregir(null), false);
  assert.equal(await w.corregir(undefined), false);
  assert.equal(w.persistCalls(), 0);
});

/* ---------- preservación ---------- */

test("6. evaluated deepEqual antes/después (el latch NO se toca)", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }));
  const before = clone(w.server().cards.evaluated);
  await w.corregir("Fran Forrester");
  assert.deepEqual(w.server().cards.evaluated, before);
});

test("7. responses/paid/habitualPlayers/matchInfo/history/players/sedes/formations/frequentAliases intactos", async () => {
  const server = serverOf({ "Fran Forrester": { yellows: 1, reds: 1, beers: 1 } });
  const w = makeWorld(server);
  const before = clone(server);
  await w.corregir("Fran Forrester");
  for (const k of ["responses", "habitualPlayers", "matchInfo", "history", "players", "sedes", "formations", "frequentAliases"]) {
    assert.deepEqual(w.server()[k], before[k], `${k} intacto`);
  }
  assert.equal(w.server().responses[0].paid, false, "paid nunca se toca");
});

test("8. no borra la clave de byPlayer: queda {yellows:0, reds, beers}", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 3, beers: 0 } }));
  await w.corregir("Fran Forrester");
  assert.deepEqual(w.server().cards.byPlayer["Fran Forrester"], { yellows: 0, reds: 3, beers: 0 });
});

/* ---------- log: entrada compensatoria, append-only ---------- */

test("9. log recibe EXACTAMENTE 1 entrada nueva {player, card:'correccion', reason:'amarilla-sacada-manualmente', at}", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }));
  const prefijo = clone(w.server().cards.log);
  await w.corregir("Fran Forrester");
  const log = w.server().cards.log;
  assert.equal(log.length, prefijo.length + 1, "exactamente una entrada nueva");
  assert.deepEqual(log.slice(0, prefijo.length), prefijo, "el prefijo previo queda intacto (append-only)");
  const nueva = log[log.length - 1];
  assert.equal(nueva.player, "Fran Forrester");
  assert.equal(nueva.card, "correccion");
  assert.equal(nueva.reason, "amarilla-sacada-manualmente");
  assert.match(nueva.at, /^\d{4}-\d\d-\d\dT/, "at es un ISO timestamp");
});

test("10. si cards.log no es array -> no crashea, igual corrige yellows", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }, { cards: { byPlayer: { "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }, evaluated: {}, log: null } }));
  const ok = await w.corregir("Fran Forrester");
  assert.equal(ok, true);
  assert.equal(rec(w, "Fran Forrester").yellows, 0);
});

/* ---------- concurrencia ---------- */

test("11. doble llamada: la primera escribe, la segunda ve yellows:0 y aborta; writes.length === 1", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }));
  const a = await w.corregir("Fran Forrester");
  const b = await w.corregir("Fran Forrester");
  assert.equal(a, true);
  assert.equal(b, false);
  assert.equal(w.writes.length, 1);
  // y el log no acumula una segunda entrada compensatoria
  assert.equal(w.server().cards.log.filter((e) => e.card === "correccion").length, 1);
});

/* ---------- guards estáticos ---------- */

test("12. corregirAmarilla es escritura focalizada y NO toca lo prohibido", () => {
  const fn = extractFunction(demo, "corregirAmarilla");
  assert.match(fn, /persistFocalizado/);
  assert.match(fn, /if\(\(Number\(rec\.yellows\) \|\| 0\) <= 0\) return false;/);
  assert.match(fn, /rec\.yellows = 0;/);
  assert.match(fn, /fresh\.cards\.log\.push\(\{ player:nombre, card:'correccion', reason:'amarilla-sacada-manualmente', at:new Date\(\)\.toISOString\(\) \}\)/);
  for (const prohibido of [
    /\.cards\s*=(?!=)/, /computeCards\(/, /evaluarTarjetasSiCorresponde\(/,
    /\.evaluated\s*=(?!=)/, /\.reds\s*=(?!=)/, /\.beers\s*=(?!=)/, /\.paid/, /\.responses/,
    /delete\s+byPlayer/, /supabase|createClient/i,
  ]) {
    assert.doesNotMatch(fn, prohibido, `corregirAmarilla no debe contener ${prohibido}`);
  }
});

test("13. computeCards sigue con 2 matches y evaluarTarjetasSiCorresponde() con 3 (writers de tarjetas intactos)", () => {
  assert.equal([...demo.matchAll(/computeCards\s*\(/g)].length, 2);
  assert.equal([...demo.matchAll(/evaluarTarjetasSiCorresponde\(\)/g)].length, 3);
  // saldarBirra sin cambios
  const saldar = extractFunction(demo, "saldarBirra");
  assert.match(saldar, /rec\.beers = Math\.max\(0, beers - 1\)/);
  assert.doesNotMatch(saldar, /yellows\s*=(?!=)|corregirAmarilla/);
});

test("14. la asignación a .cards sigue viviendo sólo en lectura/writer automático (guard de tarjetas.test.mjs)", () => {
  const leer = extractFunction(demo, "leerEstadoDelServidor");
  const writer = extractFunction(demo, "evaluarTarjetasSiCorresponde");
  const asignaciones = [...demo.matchAll(/[A-Za-z_$][\w$.]*\.cards\s*=\s*[^=]/g)].map((m) =>
    demo.slice(m.index, m.index + 55).replace(/\s+/g, " ").trim(),
  );
  for (const a of asignaciones) {
    const lhs = a.split(" = ")[0] + " = ";
    assert.ok(leer.includes(lhs) || writer.includes(lhs), `asignación a .cards inesperada: "${a}"`);
  }
});

/* ---------- markup / modal ---------- */

test("15. #lista-morosos-block trae el disparador 'Editar lista' (oculto por defecto), y el <ul> dinámico no trae botones horneados", () => {
  const bloque = demo.slice(
    demo.indexOf('<section class="lista-morosos"'),
    demo.indexOf("</section>", demo.indexOf('<section class="lista-morosos"')),
  );
  const botones = bloque.match(/<button[^>]*>/gi) || [];
  assert.equal(botones.length, 1, "un único <button> estático en el <section>");
  assert.match(botones[0], /id="open-manage-morosos-btn"/);
  assert.match(botones[0], /\bhidden\b/, "arranca oculto (renderListaMorosos lo muestra si hay filas)");
  assert.match(bloque, />✏️ Editar lista</);
  assert.doesNotMatch(bloque, /Saldar birra|lm-saldar|Sacar la amarilla/, "esos botones los inyecta el JS, no el markup");
});

test("16. modal #manage-morosos-overlay: h2, copy de contexto, <ul> y botón Cerrar", () => {
  const start = demo.indexOf('<div class="modal-overlay" id="manage-morosos-overlay">');
  const modal = demo.slice(start, demo.indexOf('<div class="modal-overlay" id="manage-sedes-overlay">', start));
  assert.match(modal, /<h2>Editar lista de morosos<\/h2>/);
  assert.match(modal, /Sacá la amarilla sólo si la persona pagó y no llegó a marcarlo antes del inicio\. La birra que ya se debe no se toca acá\./);
  assert.match(modal, /<ul class="manage-list" id="morosos-manage-list"><\/ul>/);
  assert.match(modal, /<button class="btn-cancel" id="manage-morosos-close">Cerrar<\/button>/);
});

test("17. el modal está registrado en anyModalOpen (el sondeo se pausa mientras está abierto)", () => {
  assert.match(demo, /const anyModalOpen = \[[^\]]*'manage-morosos-overlay'[^\]]*\]/);
});

test("18. renderMorososManageList: fila por sancionado, 'Sacar la amarilla' SÓLO si yellows>0", () => {
  const render = (byPlayer) => {
    const ul = { innerHTML: "" };
    const ctx = vm.createContext({
      document: { getElementById: (id) => (id === "morosos-manage-list" ? ul : null) },
      state: { cards: { byPlayer } },
      Number, Object, Array, String,
    });
    vm.runInContext(
      extractFunction(demo, "escapeHtml") + "\n" +
      extractFunction(demo, "morososDeCards") + "\n" +
      extractFunction(demo, "marcasDeMoroso") + "\n" +
      extractFunction(demo, "renderMorososManageList") + "\nrenderMorososManageList();",
      ctx,
    );
    return ul.innerHTML;
  };
  const html = render({
    "Ana Aguirre": { yellows: 1, reds: 0, beers: 0 },   // sólo 🟨 -> botón
    "Zoe Zapata": { yellows: 1, reds: 1, beers: 2 },    // 🟨 + 🍺 -> botón
    "Beto Bravo": { yellows: 0, reds: 1, beers: 1 },    // sólo 🍺 -> SIN botón
  });
  assert.match(html, /data-sacar-amarilla="Ana Aguirre"[^>]*>Sacar la amarilla<\/button>/);
  assert.match(html, /data-sacar-amarilla="Zoe Zapata"/);
  assert.doesNotMatch(html, /data-sacar-amarilla="Beto Bravo"/);
  assert.equal((html.match(/data-sacar-amarilla=/g) || []).length, 2);
  // el nombre va escapado
  const html2 = render({ 'Fran "P" <b>': { yellows: 1, reds: 0, beers: 0 } });
  assert.match(html2, /data-sacar-amarilla="Fran &quot;P&quot; &lt;b&gt;"/);
});

test("18b. renderMorososManageList: sin sanciones -> empty-state", () => {
  const ul = { innerHTML: "" };
  const ctx = vm.createContext({
    document: { getElementById: () => ul },
    state: { cards: { byPlayer: {} } },
    Number, Object, Array, String,
  });
  vm.runInContext(
    extractFunction(demo, "escapeHtml") + "\n" + extractFunction(demo, "morososDeCards") + "\n" +
    extractFunction(demo, "marcasDeMoroso") + "\n" + extractFunction(demo, "renderMorososManageList") + "\nrenderMorososManageList();",
    ctx,
  );
  assert.match(ul.innerHTML, /No hay sanciones para corregir\./);
});

test("19. renderListaMorosos togglea la visibilidad del disparador según haya filas", () => {
  const fn = extractFunction(demo, "renderListaMorosos");
  assert.match(fn, /const editBtn = document\.getElementById\('open-manage-morosos-btn'\);/);
  assert.match(fn, /if\(editBtn\) editBtn\.hidden = filas\.length === 0;/);
  // sigue siendo pura: sin writers, sin asignaciones a cards
  assert.doesNotMatch(fn, /persistFocalizado|saveState|computeCards|corregirAmarilla/);
  assert.doesNotMatch(fn, /\.cards\s*=(?!=)|\.yellows\s*=(?!=)|\.beers\s*=(?!=)/);
});

/* ---------- handler del modal ---------- */

function extractHandler() {
  const m = demo.match(/getElementById\('morosos-manage-list'\)\.addEventListener\('click', async \(ev\)=>\{([\s\S]*?)\n\}\);/);
  assert.ok(m, "no encontré el handler de sacar amarilla");
  return m[1];
}

function runHandler({ confirmReturns = true, corregirReturns = true, nombre = "Fran Forrester" }) {
  const calls = { confirm: [], corregir: [], toast: [], renderLista: 0, renderModal: 0 };
  const boton = { disabled: false, dataset: { sacarAmarilla: nombre } };
  const target = { closest: (sel) => (sel === "[data-sacar-amarilla]" ? boton : null) };
  const context = vm.createContext({
    Promise, String, Object,
    window: { confirm: (msg) => { calls.confirm.push(msg); return confirmReturns; } },
    corregirAmarilla: async (n) => { calls.corregir.push(n); return corregirReturns; },
    showToast: (m) => calls.toast.push(m),
    renderListaMorosos: () => { calls.renderLista++; },
    renderMorososManageList: () => { calls.renderModal++; },
  });
  const fn = vm.runInContext(`(async (ev)=>{${extractHandler()}\n})`, context);
  return fn({ target }).then(() => ({ calls, boton }));
}

test("20. click: confirma nombrando a la persona + la razón, luego llama corregirAmarilla", async () => {
  const { calls } = await runHandler({});
  assert.deepEqual(calls.confirm, ["¿Sacar la amarilla de Fran Forrester? Es para cuando pagó y no quedó registrado a tiempo, no para perdonar."]);
  assert.deepEqual(calls.corregir, ["Fran Forrester"]);
});

test("21. cancelar el confirm -> no escribe, no re-render, no toast", async () => {
  const { calls } = await runHandler({ confirmReturns: false });
  assert.equal(calls.corregir.length, 0);
  assert.equal(calls.renderLista, 0);
  assert.equal(calls.renderModal, 0);
  assert.equal(calls.toast.length, 0);
});

test("22. éxito -> re-render de lista y modal + toast 'Amarilla sacada.'", async () => {
  const { calls } = await runHandler({});
  assert.equal(calls.renderLista, 1);
  assert.equal(calls.renderModal, 1);
  assert.deepEqual(calls.toast, ["Amarilla sacada."]);
});

test("23. fallo -> toast de error, sin re-render", async () => {
  const { calls } = await runHandler({ corregirReturns: false });
  assert.equal(calls.renderLista, 0);
  assert.deepEqual(calls.toast, ["No se pudo corregir la lista. Revisá la conexión e intentá otra vez."]);
});

test("24. el botón se deshabilita durante el await y se re-habilita al terminar", async () => {
  const boton = { disabled: false, dataset: { sacarAmarilla: "Fran Forrester" } };
  const target = { closest: () => boton };
  let vistoDeshabilitado = false;
  const context = vm.createContext({
    Promise, String, Object,
    window: { confirm: () => true },
    corregirAmarilla: async () => { vistoDeshabilitado = boton.disabled; return true; },
    showToast: () => {},
    renderListaMorosos: () => {},
    renderMorososManageList: () => {},
  });
  const fn = vm.runInContext(`(async (ev)=>{${extractHandler()}\n})`, context);
  await fn({ target });
  assert.equal(vistoDeshabilitado, true, "disabled durante el await");
  assert.equal(boton.disabled, false, "re-habilitado al terminar");
});

test("25. click fuera de un botón -> no hace nada", async () => {
  const context = vm.createContext({
    Promise, String, Object,
    window: { confirm: () => { throw new Error("no debería confirmar"); } },
    corregirAmarilla: async () => { throw new Error("no debería escribir"); },
    showToast: () => {}, renderListaMorosos: () => {}, renderMorososManageList: () => {},
  });
  const fn = vm.runInContext(`(async (ev)=>{${extractHandler()}\n})`, context);
  await fn({ target: { closest: () => null } });
});

/* ---------- handlers open/close del modal ---------- */

test("26. open-manage-morosos-btn abre el overlay tras renderizar; Cerrar lo cierra", () => {
  assert.match(demo, /getElementById\('open-manage-morosos-btn'\)\.onclick = \(\)=>\{\s*renderMorososManageList\(\);\s*document\.getElementById\('manage-morosos-overlay'\)\.classList\.add\('open'\);/);
  assert.match(demo, /getElementById\('manage-morosos-close'\)\.onclick = \(\)=>\{\s*document\.getElementById\('manage-morosos-overlay'\)\.classList\.remove\('open'\);/);
});

/* ---------- copy honesto ---------- */

test("27. copy honesto: nada de 'perdonado' / 'perdonar' fuera de la propia confirmación que lo niega", () => {
  // La única aparición de "perdonar" es la cláusula "...no para perdonar" del confirm.
  const perdon = [...demo.matchAll(/perdon\w*/gi)].map((m) => m[0]);
  assert.deepEqual(perdon, ["perdonar"], "sólo la negación explícita en el confirm");
  assert.doesNotMatch(demo, /amarilla perdonada|sanción perdonada|Perdonar amarilla/i);
});

test("28. #faltan-pagar y responses[].paid no se tocaron en este PR", () => {
  // El writer no menciona paid ni faltan-pagar; el módulo de morosos tampoco.
  assert.doesNotMatch(extractFunction(demo, "corregirAmarilla"), /paid|faltan-pagar/i);
  assert.doesNotMatch(extractFunction(demo, "renderMorososManageList"), /paid|faltan-pagar/i);
});
