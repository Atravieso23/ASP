// Tarjetas (módulo por pago fuera de término) — PR #12: SÓLO el cálculo puro y la
// normalización de state.cards. NO hay escritura automática, NO hay UI, NO hay trigger.
//
// Estos tests portan los 19 casos del spike (sites-app/work/spike-tarjetas/, throwaway)
// al código REAL de demo.html: se extrae computeCards()/normalizeCards() por nombre y
// corren en un node:vm. Sin red, sin navegador, sin tocar producción.
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

function cardsWorld() {
  const context = vm.createContext({
    Date, JSON, Map, Set, Object, Array, String, Number, RegExp, isNaN, NaN,
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(
    `${extractFunction(demo, "normalizeCards")}\n${extractFunction(demo, "computeCards")}`,
    context,
  );
  return {
    compute: (args) =>
      JSON.parse(vm.runInContext(
        `JSON.stringify(computeCards(${JSON.stringify(args)}))`,
        context,
      )),
    normalize: (previas) =>
      JSON.parse(vm.runInContext(
        `JSON.stringify(normalizeCards(${JSON.stringify(previas)}))`,
        context,
      )),
  };
}

const W = cardsWorld();

const BASE14 = [
  "Pablo de Achaval", "Agustín Travieso", "Segun Campos", "Francisco Sánchez Keenan",
  "Félix de Achaval", "Nacho Duncan", "Joaco el Deiker", "Fran Forrester",
  "Nahuel Gutiérrez", "Félix Beccar", "Agustín Mingolla", "Juampi Ramos",
  "Facu Santos", "Ale",
];
const MATCH = { date: "2026-09-05", time: "20:00", type: "F7", priceTotal: "140000" };
const ANTES = "2026-09-05T19:59:00-03:00";
const DESPUES = "2026-09-05T20:01:00-03:00";

let n = 0;
const R = (over) => ({ responseId: "r" + ++n, isGuest: false, status: "in", paid: false, from: "20:00", to: "22:00", ...over });
const args = (over) => ({ responses: [], habitualPlayers: BASE14, matchInfo: MATCH, cardsPrevias: undefined, now: DESPUES, ...over });

/* ---------- 19 casos del spike ---------- */

test("1. now antes del deadline -> no evalúa", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" })], now: ANTES }));
  assert.equal(r.evaluated, false);
  assert.equal(r.skipped, true);
  assert.equal(r.reason, "antes-del-deadline");
  assert.deepEqual(r.playersSancionados, []);
});

test("2. now después + habitual Estoy + paid false -> amarilla", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" })] }));
  assert.equal(r.evaluated, true);
  assert.deepEqual(r.playersSancionados, [{ player: "Ale", card: "yellow" }]);
  assert.deepEqual(r.cardsNext.byPlayer["Ale"], { yellows: 1, reds: 0, beers: 0 });
  assert.equal(r.cardsNext.evaluated["2026-09-05|20:00"], true);
});

test("3. habitual Estoy + paid true -> sin tarjeta", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale", paid: true })] }));
  assert.equal(r.evaluated, true);
  assert.deepEqual(r.playersSancionados, []);
  assert.deepEqual(r.cardsNext.byPlayer, {});
});

test("4. En duda impago -> sin tarjeta", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale", status: "duda" })] }));
  assert.deepEqual(r.playersSancionados, []);
});

test("5. Soy baja impago -> sin tarjeta", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale", status: "out" })] }));
  assert.deepEqual(r.playersSancionados, []);
});

test("6. Invitado impago -> sin tarjeta", () => {
  const r = W.compute(args({ responses: [R({ name: "Ale", isGuest: true, invitedBy: "Pablo de Achaval" })] }));
  assert.deepEqual(r.playersSancionados, []);
});

test("7. No habitual impago -> sin tarjeta", () => {
  const r = W.compute(args({ responses: [R({ name: "Suplente Nico" })] }));
  assert.deepEqual(r.playersSancionados, []);
});

test("8. Legacy sin habitualName pero name matchea habitualPlayers -> cuenta", () => {
  const r = W.compute(args({ responses: [R({ name: "ALE" })] }));
  assert.deepEqual(r.playersSancionados, [{ player: "Ale", card: "yellow" }]);
  assert.ok(r.cardsNext.byPlayer["Ale"], "se keyea con el casing canónico de habitualPlayers");
});

test("9. Legacy sin habitualName y name no matchea -> no cuenta", () => {
  const r = W.compute(args({ responses: [R({ name: "Roca" })] }));
  assert.deepEqual(r.playersSancionados, []);
});

test("10. habitualName fuera de habitualPlayers vigente -> no cuenta", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Chursi", name: "Chursi" })] }));
  assert.deepEqual(r.playersSancionados, []);
});

test("11. Dos responses del mismo habitual -> máximo 1 amarilla", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" }), R({ habitualName: "Ale" })] }));
  assert.deepEqual(r.playersSancionados, [{ player: "Ale", card: "yellow" }]);
  assert.deepEqual(r.cardsNext.byPlayer["Ale"], { yellows: 1, reds: 0, beers: 0 });
});

test("12. Segunda amarilla -> roja + birra + yellows reset 0", () => {
  const previas = { byPlayer: { "Ale": { yellows: 1, reds: 0, beers: 0 } }, evaluated: {}, log: [] };
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" })], cardsPrevias: previas }));
  assert.deepEqual(r.playersSancionados, [{ player: "Ale", card: "red" }]);
  assert.deepEqual(r.cardsNext.byPlayer["Ale"], { yellows: 0, reds: 1, beers: 1 });
});

test("13. Tercera infracción -> yellows 1, reds/birras preservadas", () => {
  const previas = { byPlayer: { "Ale": { yellows: 0, reds: 1, beers: 1 } }, evaluated: {}, log: [] };
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" })], cardsPrevias: previas }));
  assert.deepEqual(r.playersSancionados, [{ player: "Ale", card: "yellow" }]);
  assert.deepEqual(r.cardsNext.byPlayer["Ale"], { yellows: 1, reds: 1, beers: 1 });
});

test("14. Mismo matchKey ya evaluado -> no duplica", () => {
  const previas = {
    byPlayer: { "Ale": { yellows: 1, reds: 0, beers: 0 } },
    evaluated: { "2026-09-05|20:00": true }, log: [],
  };
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" })], cardsPrevias: previas }));
  assert.equal(r.evaluated, false);
  assert.equal(r.reason, "ya-evaluado");
  assert.deepEqual(r.cardsNext.byPlayer["Ale"], { yellows: 1, reds: 0, beers: 0 }, "sin cambios");
});

test("15. Dos runs con mismos inputs -> resultado idéntico", () => {
  const a = args({ responses: [R({ habitualName: "Ale" }), R({ habitualName: "Juampi Ramos" })] });
  assert.deepEqual(W.compute(a), W.compute(a));
});

test("16. matchInfo sin date/time -> no evalúa", () => {
  for (const bad of [{ time: "20:00" }, { date: "2026-09-05" }, {}, null]) {
    const r = W.compute(args({ responses: [R({ habitualName: "Ale" })], matchInfo: bad }));
    assert.equal(r.evaluated, false);
    assert.equal(r.reason, "sin-fecha-u-hora");
  }
});

test("17. matchInfo.time mal formado -> no crashea, skip", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" })], matchInfo: { date: "2026-09-05", time: "20 hs" } }));
  assert.equal(r.evaluated, false);
  assert.equal(r.reason, "fecha-u-hora-invalida");
  // "9:30" con una cifra sí se paddea y evalúa
  const ok = W.compute(args({
    responses: [R({ habitualName: "Ale" })],
    matchInfo: { date: "2026-09-05", time: "9:30" },
    now: "2026-09-05T10:00:00-03:00",
  }));
  assert.equal(ok.evaluated, true);
});

test("18. timezone -03:00: un minuto antes NO sanciona", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" })], now: "2026-09-05T19:59:00-03:00" }));
  assert.equal(r.evaluated, false);
});

test("19. timezone -03:00: un minuto después SÍ sanciona (y justo en el deadline también)", () => {
  assert.equal(W.compute(args({ responses: [R({ habitualName: "Ale" })], now: "2026-09-05T20:01:00-03:00" })).evaluated, true);
  assert.equal(W.compute(args({ responses: [R({ habitualName: "Ale" })], now: "2026-09-05T20:00:00-03:00" })).evaluated, true);
});

/* ---------- now: Date, epoch ms, string ---------- */

test("now acepta epoch ms y string ISO además de Date", () => {
  const base = { responses: [R({ habitualName: "Ale" })], habitualPlayers: BASE14, matchInfo: MATCH, cardsPrevias: undefined };
  assert.equal(W.compute({ ...base, now: Date.parse("2026-09-05T20:05:00-03:00") }).evaluated, true);
  assert.equal(W.compute({ ...base, now: "2026-09-05T20:05:00-03:00" }).evaluated, true);
  // now inválido no crashea
  assert.equal(W.compute({ ...base, now: "no-es-una-fecha" }).reason, "now-invalido");
});

/* ---------- escenarios realistas del spike ---------- */

test("ESCENARIO A: sábado 20:00, 14 habituales, 8 pagaron, 4 no, 2 en duda + invitado", () => {
  const pagaron = BASE14.slice(0, 8);
  const noPagaron = BASE14.slice(8, 12);
  const enDuda = BASE14.slice(12);
  const responses = [
    ...pagaron.map((h) => R({ habitualName: h, paid: true })),
    ...noPagaron.map((h) => R({ habitualName: h })),
    ...enDuda.map((h) => R({ habitualName: h, status: "duda" })),
    R({ name: "Primo de Segun", isGuest: true, invitedBy: "Segun Campos" }),
  ];
  const r = W.compute(args({ responses }));
  assert.deepEqual(r.playersSancionados.map((x) => x.player).sort(), [...noPagaron].sort());
  assert.ok(r.playersSancionados.every((x) => x.card === "yellow"));
  for (const h of noPagaron) assert.deepEqual(r.cardsNext.byPlayer[h], { yellows: 1, reds: 0, beers: 0 });
  for (const h of pagaron) assert.equal(r.cardsNext.byPlayer[h], undefined);
});

test("ESCENARIO B: uno ya tenía 1 amarilla y vuelve a caer; birras acumulan", () => {
  const previas = {
    byPlayer: { "Nacho Duncan": { yellows: 1, reds: 0, beers: 0 }, "Ale": { yellows: 0, reds: 2, beers: 2 } },
    evaluated: { "2026-08-29|20:00": true }, log: [],
  };
  const responses = [
    R({ habitualName: "Nacho Duncan" }),
    R({ habitualName: "Ale" }),
    R({ habitualName: "Pablo de Achaval" }),
    R({ habitualName: "Fran Forrester", paid: true }),
  ];
  const r = W.compute(args({ responses, cardsPrevias: previas }));
  assert.deepEqual(r.cardsNext.byPlayer["Nacho Duncan"], { yellows: 0, reds: 1, beers: 1 });
  assert.deepEqual(r.cardsNext.byPlayer["Ale"], { yellows: 1, reds: 2, beers: 2 });
  assert.deepEqual(r.cardsNext.byPlayer["Pablo de Achaval"], { yellows: 1, reds: 0, beers: 0 });
  assert.equal(r.cardsNext.byPlayer["Fran Forrester"], undefined);
  assert.equal(r.cardsNext.evaluated["2026-08-29|20:00"], true, "el partido viejo sigue latcheado");
  assert.equal(r.cardsNext.evaluated["2026-09-05|20:00"], true);
  const birras = Object.values(r.cardsNext.byPlayer).reduce((a, p) => a + p.beers, 0);
  assert.equal(birras, 3);
});

test("ESCENARIO C: responses legacy mezcladas", () => {
  const responses = [
    R({ habitualName: "Pablo de Achaval", name: "Pablito" }),
    R({ name: "ale" }),
    R({ name: "Roca" }),
    R({ name: "Frankie" }),
    R({ habitualName: "Segun Campos", name: "Segun Campos", paid: true }),
    R({ habitualName: "Chursi", name: "Chursi" }),
    R({ name: "Amigo de Fran", isGuest: true, invitedBy: "Fran Forrester" }),
  ];
  const r = W.compute(args({ responses }));
  assert.deepEqual(r.playersSancionados.map((x) => x.player).sort(), ["Ale", "Pablo de Achaval"]);
});

/* ---------- log del cálculo ---------- */

test("el log del cálculo lleva matchKey/player/card/reason/at y se capa a 200", () => {
  const r = W.compute(args({ responses: [R({ habitualName: "Ale" })] }));
  assert.equal(r.cardsNext.log.length, 1);
  const e = r.cardsNext.log[0];
  assert.equal(e.matchKey, "2026-09-05|20:00");
  assert.equal(e.player, "Ale");
  assert.equal(e.card, "yellow");
  assert.equal(e.reason, "sin-pago-al-inicio");
  assert.match(e.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
  // log largo previo -> se recorta a las últimas 200
  const logLargo = Array.from({ length: 250 }, (_, i) => ({ matchKey: "x", player: "p" + i, card: "yellow", reason: "r", at: "t" }));
  const r2 = W.compute(args({ responses: [R({ habitualName: "Ale" })], cardsPrevias: { byPlayer: {}, evaluated: {}, log: logLargo } }));
  assert.equal(r2.cardsNext.log.length, 200);
  assert.equal(r2.cardsNext.log[199].player, "Ale", "la entrada nueva queda al final");
});

test("pureza: cardsPrevias no se muta", () => {
  const previas = { byPlayer: { "Ale": { yellows: 1, reds: 0, beers: 0 } }, evaluated: {}, log: [] };
  const snapshot = JSON.stringify(previas);
  W.compute(args({ responses: [R({ habitualName: "Ale" })], cardsPrevias: previas }));
  assert.equal(JSON.stringify(previas), snapshot, "computeCards no debe tocar el argumento");
});

/* ---------- normalizador de state.cards ---------- */

test("normalizeCards: blob sin cards -> default { byPlayer:{}, evaluated:{}, log:[] }", () => {
  assert.deepEqual(W.normalize(undefined), { byPlayer: {}, evaluated: {}, log: [] });
  assert.deepEqual(W.normalize(null), { byPlayer: {}, evaluated: {}, log: [] });
  assert.deepEqual(W.normalize({}), { byPlayer: {}, evaluated: {}, log: [] });
});

test("normalizeCards: cards existente se preserva", () => {
  const existente = {
    byPlayer: { "Ale": { yellows: 0, reds: 1, beers: 1 } },
    evaluated: { "2026-09-05|20:00": true },
    log: [{ matchKey: "2026-09-05|20:00", player: "Ale", card: "red", reason: "sin-pago-al-inicio", at: "2026-09-05T23:00:00.000Z" }],
  };
  assert.deepEqual(W.normalize(existente), existente);
});

test("normalizeCards: campos parcialmente rotos se reparan sin perder lo válido", () => {
  const roto = { byPlayer: { "Ale": { yellows: 1, reds: 0, beers: 0 } }, evaluated: "no-es-objeto", log: "tampoco" };
  const n = W.normalize(roto);
  assert.deepEqual(n.byPlayer, { "Ale": { yellows: 1, reds: 0, beers: 0 } }, "byPlayer válido se conserva");
  assert.deepEqual(n.evaluated, {});
  assert.deepEqual(n.log, []);
});

test("la lectura del servidor normaliza state.cards a la forma canónica", () => {
  const leer = extractFunction(demo, "leerEstadoDelServidor");
  assert.match(leer, /parsed\.cards = \{ byPlayer:\{\}, evaluated:\{\}, log:\[\] \}/);
  assert.match(leer, /parsed\.cards\.byPlayer = \{\}/);
  assert.match(leer, /parsed\.cards\.evaluated = \{\}/);
  assert.match(leer, /parsed\.cards\.log = \[\]/);
  // y defaultState arranca con la key en la misma forma
  assert.match(extractFunction(demo, "defaultState"), /cards: \{ byPlayer:\{\}, evaluated:\{\}, log:\[\] \}/);
});

/* ---------- guards de no-regresión: PR #12 es read-only ---------- */

test("PR #12 no escribe cards fuera del normalizador de lectura", () => {
  // Todas las asignaciones a `X.cards =` en demo.html tienen que estar dentro de
  // leerEstadoDelServidor (la forma canónica). NADA de state.cards = / fresh.cards = /
  // nextState.cards = en writers. (defaultState usa `cards:` de objeto, no matchea.)
  const leer = extractFunction(demo, "leerEstadoDelServidor");
  const asignaciones = [...demo.matchAll(/[A-Za-z_$][\w$.]*\.cards\s*=\s*[^=]/g)].map((m) =>
    demo.slice(m.index, m.index + 55).replace(/\s+/g, " ").trim(),
  );
  assert.ok(asignaciones.length >= 1);
  for (const a of asignaciones) {
    assert.ok(leer.includes(a.split(" = ")[0] + " = "), `asignación a .cards fuera del normalizador: "${a}"`);
  }
  assert.doesNotMatch(demo, /(state|fresh|nextState|nextEstado|archived|s)\.cards\s*=/);
});

test("PR #12 no llama computeCards con efectos (no hay caller todavía)", () => {
  // Sólo aparece en su definición.
  const usos = [...demo.matchAll(/computeCards\s*\(/g)];
  assert.equal(usos.length, 1, "computeCards sólo debe aparecer en su propia definición");
  assert.match(demo.slice(usos[0].index - 20, usos[0].index + 20), /function computeCards\(/);
});

test("PR #12 no agrega UI 'Tarjetas'", () => {
  assert.doesNotMatch(demo, /id="tarjetas|class="tarjetas|>Tarjetas<|renderTarjetas|renderCards/i);
  assert.doesNotMatch(demo, /Las amarillas son por no figurar pago|Debe birra para la banda/);
});

test("PR #12 no toca pagos / invitados / Falta confirmar / selector", () => {
  assert.match(extractFunction(demo, "marcarMiPago"), /target\.paid = paid;\s*target\.updatedAt/);
  assert.match(extractFunction(demo, "agregarInvitado"), /isGuest:\s*true/);
  assert.match(extractFunction(demo, "faltanConfirmar"), /String\(item\.habitualName \|\| item\.name\)/);
  assert.match(extractFunction(demo, "deriveSelectorNames"), /item\.habitualName \|\| item\.name/);
  // ninguna de esas funciones menciona cards
  for (const fn of ["marcarMiPago", "agregarInvitado", "faltanConfirmar", "deriveSelectorNames", "renderLocalOrganizer"]) {
    assert.ok(!/\bcards\b/.test(extractFunction(demo, fn)), `${fn} no debe mencionar cards`);
  }
});
