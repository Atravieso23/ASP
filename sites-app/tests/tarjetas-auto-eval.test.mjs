// Tarjetas — PR #17: evaluación automática latcheada. Prueba el writer
// (evaluarTarjetasSiCorresponde) y sus dos triggers SIN Supabase real: se extraen
// normalizeCards/computeCards/evaluarTarjetasSiCorresponde por nombre de demo.html y
// corren en un node:vm con un persistFocalizado de mentira (blob en memoria) y un
// Date falso para controlar "ahora". Sin red, sin navegador, sin tocar producción.
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

const BASE14 = [
  "Pablo de Achaval", "Agustín Travieso", "Segun Campos", "Francisco Sánchez Keenan",
  "Félix de Achaval", "Nacho Duncan", "Joaco el Deiker", "Fran Forrester",
  "Nahuel Gutiérrez", "Félix Beccar", "Agustín Mingolla", "Juampi Ramos",
  "Facu Santos", "Ale",
];
const MATCH = { date: "2026-09-05", time: "20:00", type: "F7", priceTotal: "140000" };
const KEY = "2026-09-05|20:00";
const ANTES = "2026-09-05T19:00:00-03:00";
const DESPUES = "2026-09-05T20:05:00-03:00";

let n = 0;
const R = (over) => ({ responseId: "r" + ++n, isGuest: false, status: "in", paid: false, from: "20:00", to: "22:00", ...over });
const EMPTY_CARDS = { byPlayer: {}, evaluated: {}, log: [] };

// Un "servidor" de mentira: matchInfo/responses/habitualPlayers/cards + relleno de
// otras keys para verificar que no se tocan.
const serverOf = (over) => ({
  matchInfo: { ...MATCH },
  responses: [],
  habitualPlayers: [...BASE14],
  cards: JSON.parse(JSON.stringify(EMPTY_CARDS)),
  players: [{ name: "Ale", number: 9, isCaptain: true }],
  history: [{ finalizedAt: "2026-08-01T00:00:00.000Z" }],
  sedes: [{ name: "Cancha", address: "" }],
  formations: {},
  frequentAliases: ["picado.demo"],
  ...over,
});

const clone = (x) => JSON.parse(JSON.stringify(x));

function makeWorld({ now = DESPUES, server }) {
  let NOW = typeof now === "number" ? now : Date.parse(now);
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
    static now() { return NOW; }
  }
  let serverBlob = clone(server);
  const writes = [];
  let persistCalls = 0; // cuántas veces se llegó a leer el servidor (persistFocalizado)

  const context = vm.createContext({
    Date: FakeDate, JSON, Map, Set, Object, Array, String, Number, RegExp, isNaN, NaN,
    Promise,
    console: { error() {}, warn() {}, log() {} },
  });
  // persistFocalizado de mentira: lee fresh del blob, aplica la intención, y sólo si
  // devuelve true commitea y registra el write. Mismo contrato que el real.
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
  vm.runInContext(
    [
      extractFunction(demo, "normalizeCards"),
      extractFunction(demo, "computeCards"),
      extractFunction(demo, "evaluarTarjetasSiCorresponde"),
    ].join("\n"),
    context,
  );

  return {
    // localState: lo que ve el dispositivo antes de evaluar. Por defecto, una copia
    // fresca del servidor (el caso normal: init/refresh acaban de setear state).
    async run(localState) {
      context.state = localState === undefined ? clone(serverBlob) : clone(localState);
      await vm.runInContext("evaluarTarjetasSiCorresponde()", context);
      return { writes, persistCalls, server: () => serverBlob, state: () => context.state };
    },
    setNow(v) { NOW = typeof v === "number" ? v : Date.parse(v); },
  };
}

/* ---------- deadline ---------- */

test("1. antes del deadline: no escribe ni siquiera lee el servidor", async () => {
  const w = makeWorld({ now: ANTES, server: serverOf({ responses: [R({ habitualName: "Ale" })] }) });
  const { writes, persistCalls } = await w.run();
  assert.equal(writes.length, 0);
  assert.equal(persistCalls, 0, "el pre-chequeo local corta antes de tocar la red");
});

test("2. después del deadline, habitual Estoy impago: escribe amarilla + latch", async () => {
  const w = makeWorld({ server: serverOf({ responses: [R({ habitualName: "Ale" })] }) });
  const { writes, server } = await w.run();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].byPlayer["Ale"], { yellows: 1, reds: 0, beers: 0 });
  assert.equal(writes[0].evaluated[KEY], true);
  assert.equal(server().cards.evaluated[KEY], true);
});

/* ---------- latch ---------- */

test("3. después del deadline, todos pagados: latchea evaluated sin sancionados", async () => {
  const w = makeWorld({ server: serverOf({
    responses: [R({ habitualName: "Ale", paid: true }), R({ habitualName: "Juampi Ramos", paid: true })],
  }) });
  const { writes } = await w.run();
  assert.equal(writes.length, 1, "preferencia de producto: se marca evaluated igual");
  assert.deepEqual(writes[0].byPlayer, {});
  assert.equal(writes[0].evaluated[KEY], true);
});

test("4. evaluated ya existe (local y servidor): no escribe", async () => {
  const cards = { byPlayer: {}, evaluated: { [KEY]: true }, log: [] };
  const w = makeWorld({ server: serverOf({ responses: [R({ habitualName: "Ale" })], cards }) });
  const { writes, persistCalls } = await w.run();
  assert.equal(writes.length, 0);
  assert.equal(persistCalls, 0, "latch local: no relee el servidor");
});

test("5. state local sin latch pero fresh ya evaluado: aborta dentro de aplicar(fresh)", async () => {
  // El dispositivo cree que todavía no se evaluó, pero otro ya lo hizo.
  const server = serverOf({
    responses: [R({ habitualName: "Ale" })],
    cards: { byPlayer: { Ale: { yellows: 1, reds: 0, beers: 0 } }, evaluated: { [KEY]: true }, log: [] },
  });
  const localStale = serverOf({ responses: [R({ habitualName: "Ale" })] }); // cards vacío
  const w = makeWorld({ server });
  const { writes } = await w.run(localStale);
  assert.equal(writes.length, 0, "el re-chequeo de fresh corta la carrera");
});

test("6. segunda corrida tras evaluar: no vuelve a escribir (sin loop)", async () => {
  const w = makeWorld({ server: serverOf({ responses: [R({ habitualName: "Ale" })] }) });
  await w.run();
  await w.run();
  const { writes } = await w.run();
  assert.equal(writes.length, 1, "una sola escritura en tres corridas");
});

/* ---------- reglas de sanción (a través del writer) ---------- */

test("7. segunda infracción: roja + birra, yellows a 0", async () => {
  const cards = { byPlayer: { Ale: { yellows: 1, reds: 0, beers: 0 } }, evaluated: {}, log: [] };
  const w = makeWorld({ server: serverOf({ responses: [R({ habitualName: "Ale" })], cards }) });
  const { writes } = await w.run();
  assert.deepEqual(writes[0].byPlayer["Ale"], { yellows: 0, reds: 1, beers: 1 });
});

test("8. invitado impago: latchea sin sancionarlo", async () => {
  const w = makeWorld({ server: serverOf({
    responses: [R({ name: "Primo de Segun", isGuest: true, invitedBy: "Segun Campos" })],
  }) });
  const { writes } = await w.run();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].byPlayer, {});
});

test("9. en duda y soy baja impagos: no sancionan", async () => {
  const w = makeWorld({ server: serverOf({
    responses: [R({ habitualName: "Ale", status: "duda" }), R({ habitualName: "Nacho Duncan", status: "out" })],
  }) });
  const { writes } = await w.run();
  assert.deepEqual(writes[0].byPlayer, {});
});

test("10. no habitual impago: no sanciona", async () => {
  const w = makeWorld({ server: serverOf({ responses: [R({ name: "Suplente Random" })] }) });
  const { writes } = await w.run();
  assert.deepEqual(writes[0].byPlayer, {});
});

test("11. legacy: name que matchea habitualPlayers normalizado cuenta", async () => {
  const w = makeWorld({ server: serverOf({ responses: [R({ name: "ALE" })] }) });
  const { writes } = await w.run();
  assert.deepEqual(writes[0].byPlayer["Ale"], { yellows: 1, reds: 0, beers: 0 });
});

test("12. habitualName fuera de habitualPlayers vigente: no cuenta", async () => {
  const w = makeWorld({ server: serverOf({ responses: [R({ habitualName: "Chursi", name: "Chursi" })] }) });
  const { writes } = await w.run();
  assert.deepEqual(writes[0].byPlayer, {});
});

test("13. sin habitualPlayers: no escribe", async () => {
  const w = makeWorld({ server: serverOf({ habitualPlayers: [], responses: [R({ name: "Ale" })] }) });
  const { writes } = await w.run();
  assert.equal(writes.length, 0);
});

/* ---------- hora inválida / faltante ---------- */

test("14. matchInfo.time inválido: no escribe ni crashea", async () => {
  const w = makeWorld({ server: serverOf({
    matchInfo: { date: "2026-09-05", time: "20 hs" }, responses: [R({ habitualName: "Ale" })],
  }) });
  const { writes, persistCalls } = await w.run();
  assert.equal(writes.length, 0);
  assert.equal(persistCalls, 0, "hora rota: el guard local corta sin leer");
});

test("15. matchInfo sin date/time: no escribe", async () => {
  for (const bad of [{ teamName: "ASP" }, { date: "2026-09-05" }, { time: "20:00" }, {}]) {
    const w = makeWorld({ server: serverOf({ matchInfo: bad, responses: [R({ habitualName: "Ale" })] }) });
    assert.equal((await w.run()).writes.length, 0);
  }
});

test("16. time con una cifra ('9:30') se paddea y evalúa", async () => {
  const w = makeWorld({
    now: "2026-09-05T10:00:00-03:00",
    server: serverOf({ matchInfo: { date: "2026-09-05", time: "9:30" }, responses: [R({ habitualName: "Ale" })] }),
  });
  const { writes } = await w.run();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].evaluated["2026-09-05|9:30"], true);
});

/* ---------- concurrencia determinista ---------- */

test("17. dos evaluaciones desde el mismo estado fresco dan el mismo byPlayer", async () => {
  const server = serverOf({ responses: [R({ habitualName: "Ale" }), R({ habitualName: "Juampi Ramos" })] });
  const a = (await makeWorld({ now: "2026-09-05T20:05:00-03:00", server }).run()).writes[0];
  const b = (await makeWorld({ now: "2026-09-05T20:40:00-03:00", server }).run()).writes[0];
  assert.deepEqual(a.byPlayer, b.byPlayer);
  assert.deepEqual(Object.keys(a.evaluated).sort(), Object.keys(b.evaluated).sort());
});

/* ---------- no toca otras keys ---------- */

test("18. el write sólo cambia cards: responses/habitualPlayers/history/pagos/players intactos", async () => {
  const server = serverOf({
    responses: [R({ habitualName: "Ale" }), R({ habitualName: "Segun Campos", paid: true })],
  });
  const w = makeWorld({ server });
  const before = clone(server);
  const { server: after } = await w.run();
  assert.deepEqual(after().responses, before.responses, "responses sin tocar (incluido paid)");
  assert.deepEqual(after().habitualPlayers, before.habitualPlayers);
  assert.deepEqual(after().history, before.history);
  assert.deepEqual(after().players, before.players);
  assert.deepEqual(after().frequentAliases, before.frequentAliases);
  assert.notDeepEqual(after().cards, before.cards, "cards sí cambió");
});

/* ---------- guards estáticos sobre demo.html ---------- */

test("19. el trigger se llama al final de init y de refreshFromServer", () => {
  assert.match(extractFunction(demo, "init"), /evaluarTarjetasSiCorresponde\(\)/);
  assert.match(extractFunction(demo, "refreshFromServer"), /evaluarTarjetasSiCorresponde\(\)/);
});

test("20. finalizar preserva cards desde la lectura fresca", () => {
  const inicio = demo.indexOf("finalizeConfirmBtn.onclick");
  const fin = demo.indexOf("const clearOverlay");
  const handler = demo.slice(inicio, fin);
  assert.match(handler, /cards:\s*fresh\.cards/, "nextState toma cards de fresh");
  assert.doesNotMatch(handler, /cards:\s*state\.cards/);
});

test("21. 'Limpiar todo' parte de {...fresh}: preserva cards sin nombrarlo", () => {
  const inicio = demo.indexOf("clearConfirmBtn.onclick");
  const handler = demo.slice(inicio, inicio + 1600);
  assert.match(handler, /\{\s*\.\.\.fresh,\s*responses:\s*\[\]/);
  assert.doesNotMatch(handler, /\bcards\b/);
});

test("22. el writer no toca pagos, status, responses, players ni Mi estado", () => {
  const writer = extractFunction(demo, "evaluarTarjetasSiCorresponde");
  assert.doesNotMatch(writer, /\.paid\s*=|\.status\s*=|savePlayerRegistration|renderIdentityHeader|resetMyStatusCard|\.players\s*=|\.responses\s*=/);
});

test("23. sigue sin UI 'Tarjetas' ni copy del módulo", () => {
  assert.doesNotMatch(demo, /id="tarjetas|class="tarjetas|>Tarjetas<|renderTarjetas|renderCards/i);
  assert.doesNotMatch(demo, /Las amarillas son por no figurar pago|Debe birra para la banda/);
});

test("24. Mi estado: copy y helpers de PR #13–#16 sin cambios de convivencia", () => {
  // Los dos modos de la card y el texto libre de la casaca siguen intactos.
  assert.match(demo, /Jugador convocado esta fecha/);
  assert.match(demo, /Nombre en la casaca/);
  for (const fn of ["renderLocalOrganizer", "renderIdentityHeader", "marcarMiPago"]) {
    assert.ok(!/\bcards\b/.test(extractFunction(demo, fn)), `${fn} no debe mencionar cards`);
  }
});
