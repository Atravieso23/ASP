// PR #19 — "Saldar birra": acción manual con confirmación dentro de "Lista de morosos".
// Prueba el writer (saldarBirra) y el handler del botón SIN Supabase real: se extraen de
// demo.html por nombre / por slice y corren en un node:vm con un persistFocalizado de
// mentira (blob en memoria) y un window.confirm falso. Sin red, sin navegador, sin tocar
// producción.
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
    log: [{ at: "2026-09-05T23:00:00.000Z", player: "Fran Forrester", kind: "beer" }],
  },
  players: [{ name: "Ale", number: 9, isCaptain: true }],
  history: [{ finalizedAt: "2026-08-01T00:00:00.000Z" }],
  sedes: [{ name: "Cancha", address: "" }],
  formations: {},
  frequentAliases: ["picado.demo"],
  ...over,
});

// Mundo mínimo: saldarBirra + un persistFocalizado que lee del blob, aplica la intención
// y sólo commitea si devolvió true. Mismo contrato que el real.
function makeWorld(server) {
  let serverBlob = clone(server);
  const writes = [];
  let persistCalls = 0;

  const context = vm.createContext({
    JSON, Object, Array, String, Number, Math, Promise,
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
  vm.runInContext(extractFunction(demo, "saldarBirra") + "\nglobalThis.__saldar = saldarBirra;", context);

  return {
    saldar: (name) => context.__saldar(name),
    writes,
    persistCalls: () => persistCalls,
    server: () => serverBlob,
  };
}

/* ---------- writer: decremento ---------- */

test("6. confirmar con beers:1 -> beers queda 0", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 1, beers: 1 } }));
  const ok = await w.saldar("Fran Forrester");
  assert.equal(ok, true);
  assert.equal(w.server().cards.byPlayer["Fran Forrester"].beers, 0);
});

test("7. confirmar con beers:2 -> beers queda 1", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 1, beers: 2 } }));
  await w.saldar("Fran Forrester");
  assert.equal(w.server().cards.byPlayer["Fran Forrester"].beers, 1);
});

test("8. confirmar preserva yellows", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 0, beers: 1 } }));
  await w.saldar("Fran Forrester");
  assert.equal(w.server().cards.byPlayer["Fran Forrester"].yellows, 1);
});

test("9. confirmar preserva reds", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 3, beers: 1 } }));
  await w.saldar("Fran Forrester");
  assert.equal(w.server().cards.byPlayer["Fran Forrester"].reds, 3);
});

test("10. confirmar preserva el latch evaluated", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 0, beers: 1 } }));
  const before = clone(w.server().cards.evaluated);
  await w.saldar("Fran Forrester");
  assert.deepEqual(w.server().cards.evaluated, before);
});

test("11. confirmar preserva el log de auditoría", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 0, beers: 1 } }));
  const before = clone(w.server().cards.log);
  await w.saldar("Fran Forrester");
  assert.deepEqual(w.server().cards.log, before);
});

test("12. confirmar no toca responses/habitualPlayers/history/matchInfo/players/frequentAliases", async () => {
  const server = serverOf({ "Fran Forrester": { yellows: 0, reds: 0, beers: 2 } });
  const w = makeWorld(server);
  const before = clone(server);
  await w.saldar("Fran Forrester");
  for (const k of ["responses", "habitualPlayers", "history", "matchInfo", "players", "frequentAliases", "sedes", "formations"]) {
    assert.deepEqual(w.server()[k], before[k], `${k} intacto`);
  }
});

test("12b. el registro del jugador sobrevive aunque quede {yellows:0, reds:n, beers:0}", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 2, beers: 1 } }));
  await w.saldar("Fran Forrester");
  assert.deepEqual(w.server().cards.byPlayer["Fran Forrester"], { yellows: 0, reds: 2, beers: 0 });
});

/* ---------- writer: aborta sin escribir ---------- */

test("13. fresh sin el jugador -> aborta sin write", async () => {
  const w = makeWorld(serverOf({ "Ale": { yellows: 0, reds: 0, beers: 1 } }));
  const ok = await w.saldar("Fran Forrester");
  assert.equal(ok, false);
  assert.equal(w.writes.length, 0);
});

test("14. fresh con beers:0 -> aborta sin write", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }));
  const ok = await w.saldar("Fran Forrester");
  assert.equal(ok, false);
  assert.equal(w.writes.length, 0);
});

test("14b. nombre vacío / null -> aborta sin siquiera leer el servidor", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 0, beers: 1 } }));
  assert.equal(await w.saldar(""), false);
  assert.equal(await w.saldar(null), false);
  assert.equal(await w.saldar(undefined), false);
  assert.equal(w.persistCalls(), 0);
});

test("15. doble llamada seguida: la segunda ve beers ya en 0 y no baja de 0", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 0, beers: 1 } }));
  const a = await w.saldar("Fran Forrester");
  const b = await w.saldar("Fran Forrester");
  assert.equal(a, true);
  assert.equal(b, false);
  assert.equal(w.writes.length, 1);
  assert.equal(w.server().cards.byPlayer["Fran Forrester"].beers, 0);
});

test("15b. beers:3 -> tres saldados bajan 3->2->1->0 y el cuarto aborta", async () => {
  const w = makeWorld(serverOf({ "Fran Forrester": { yellows: 0, reds: 0, beers: 3 } }));
  assert.deepEqual(
    [await w.saldar("Fran Forrester"), await w.saldar("Fran Forrester"), await w.saldar("Fran Forrester"), await w.saldar("Fran Forrester")],
    [true, true, true, false],
  );
  assert.equal(w.server().cards.byPlayer["Fran Forrester"].beers, 0);
});

test("15c. beers roto (NaN / negativo / ausente) -> aborta sin write, nunca negativo", async () => {
  for (const bad of [{ beers: -2 }, { beers: "x" }, { yellows: 1 }, {}]) {
    const w = makeWorld(serverOf({ "Fran Forrester": bad }));
    assert.equal(await w.saldar("Fran Forrester"), false);
    assert.equal(w.writes.length, 0);
  }
});

/* ---------- handler del botón ---------- */

// El handler es un arrow inline sobre el <ul>. Se aísla por slice y se corre con un
// window.confirm falso y stubs para saldarBirra / showToast / renderListaMorosos.
function extractHandler() {
  const m = demo.match(/getElementById\('lista-morosos-list'\)\.addEventListener\('click', async \(ev\)=>\{([\s\S]*?)\n\}\);/);
  assert.ok(m, "no encontré el handler de saldar birra");
  return m[1];
}

function runHandler({ confirmReturns = true, saldarReturns = true, target }) {
  const calls = { confirm: [], saldar: [], toast: [], render: 0 };
  const context = vm.createContext({
    Promise, String, Object,
    window: { confirm: (msg) => { calls.confirm.push(msg); return confirmReturns; } },
    saldarBirra: async (name) => { calls.saldar.push(name); return saldarReturns; },
    showToast: (msg) => calls.toast.push(msg),
    renderListaMorosos: () => { calls.render++; },
  });
  const fn = vm.runInContext(`(async (ev)=>{${extractHandler()}\n})`, context);
  return fn({ target }).then(() => calls);
}

// target.closest(sel) que devuelve un "botón" con dataset.saldarBirra.
const botonTarget = (nombre) => {
  const boton = { disabled: false, dataset: { saldarBirra: nombre } };
  return { closest: (sel) => (sel === "[data-saldar-birra]" ? boton : null), __boton: boton };
};

test("1+4. click en botón: confirma con el nombre y llama a saldarBirra", async () => {
  const calls = await runHandler({ target: botonTarget("Fran Forrester") });
  assert.deepEqual(calls.confirm, ["¿Confirmás que Fran Forrester saldó una birra?"]);
  assert.deepEqual(calls.saldar, ["Fran Forrester"]);
});

test("5. cancelar la confirmación -> no escribe (saldarBirra nunca se llama)", async () => {
  const calls = await runHandler({ confirmReturns: false, target: botonTarget("Fran Forrester") });
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.saldar.length, 0);
  assert.equal(calls.render, 0);
  assert.equal(calls.toast.length, 0);
});

test("handler: éxito -> re-render + toast 'Birra saldada.'", async () => {
  const calls = await runHandler({ target: botonTarget("Fran Forrester") });
  assert.equal(calls.render, 1);
  assert.deepEqual(calls.toast, ["Birra saldada."]);
});

test("handler: saldarBirra falla -> toast de error, sin re-render", async () => {
  const calls = await runHandler({ saldarReturns: false, target: botonTarget("Fran Forrester") });
  assert.equal(calls.render, 0);
  assert.match(calls.toast[0], /No se pudo saldar la birra/);
});

test("handler: click fuera de un botón -> no hace nada", async () => {
  const calls = await runHandler({ target: { closest: () => null } });
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.saldar.length, 0);
});

test("handler: deshabilita el botón mientras persiste y lo vuelve a habilitar", async () => {
  const t = botonTarget("Fran Forrester");
  let vistoDeshabilitado = false;
  const context = vm.createContext({
    Promise, String, Object,
    window: { confirm: () => true },
    saldarBirra: async () => { vistoDeshabilitado = t.__boton.disabled; return true; },
    showToast: () => {},
    renderListaMorosos: () => {},
  });
  const fn = vm.runInContext(`(async (ev)=>{${extractHandler()}\n})`, context);
  await fn({ target: t });
  assert.equal(vistoDeshabilitado, true, "disabled durante el await");
  assert.equal(t.__boton.disabled, false, "rehabilitado al terminar");
});

/* ---------- guards estáticos ---------- */

test("18/19/20. reglas siguen visibles; sin 'Fair Play' ni 'Birras para la banda: X'", () => {
  assert.match(demo, /<p class="lista-morosos-rules">[\s\S]*?sumás 🟨[\s\S]*?birra para la banda 🍺[\s\S]*?<\/p>/);
  assert.doesNotMatch(demo, /fair\s*play/i);
  assert.doesNotMatch(demo, /Birras para la banda\s*:/i);
});

test("21. no toca computeCards ni evaluarTarjetasSiCorresponde", () => {
  // computeCards: definición + 1 caller (writer PR #17). evaluarTarjetas: definición + 2 triggers.
  assert.equal([...demo.matchAll(/computeCards\s*\(/g)].length, 2);
  assert.equal([...demo.matchAll(/evaluarTarjetasSiCorresponde\(\)/g)].length, 3);
  assert.doesNotMatch(extractFunction(demo, "computeCards"), /saldarBirra|Saldar birra/);
  assert.doesNotMatch(extractFunction(demo, "evaluarTarjetasSiCorresponde"), /saldarBirra|Saldar birra/);
});

test("22. saldarBirra es el único persistFocalizado nuevo y sólo baja beers", () => {
  const saldar = extractFunction(demo, "saldarBirra");
  assert.match(saldar, /rec\.beers = Math\.max\(0, beers - 1\)/);
  assert.doesNotMatch(saldar, /\.yellows\s*=(?!=)|\.reds\s*=(?!=)|\.evaluated\s*=(?!=)|\.log\s*=(?!=)|\.paid\s*=(?!=)|\.status\s*=(?!=)|\.responses\s*=(?!=)/);
  // sin paidAt, sin cron, sin auth, sin tablas nuevas
  assert.doesNotMatch(saldar, /paidAt|cron|supabase|createClient/i);
});

test("no hay paidAt en ningún lado del módulo de morosos/tarjetas nuevo", () => {
  assert.doesNotMatch(demo, /paidAt/);
});
