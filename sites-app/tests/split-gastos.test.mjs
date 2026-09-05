// Split (tercer tiempo) — PR 4: gastos editables básicos. Alta (un solo pagador,
// varios consumidores por checkbox) y baja. Sin edición: la corrección es borrar y
// volver a cargar. Sin balances/liquidación todavía (PR 5): calcularBalances/
// liquidarMinimo siguen sin caller.
//
// Mismo mecanismo que split-participantes.test.mjs: node:vm + Supabase de mentira
// stateful, para reproducir "otro dispositivo escribió entre mi lectura y mi guardado".
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

function extractDeclaration(source, name) {
  const match = source.match(new RegExp(`^(?:const|let)\\s+${name}\\s*=\\s*.+;$`, "m"));
  assert.ok(match, `no encontré la declaración ${name} en demo.html`);
  return match[0];
}

const NEEDED = [
  "leerEstadoDelServidor",
  "fetchServerState",
  "saveState",
  "persistFocalizado",
  "updateKnownSets",
  "normalizeSplit",
  "validarGasto",
  "agregarGastoSplit",
  "eliminarGastoSplit",
];

const DISPOSITIVO_A = "device-a";

const BASE_ROW = (split) => ({
  matchInfo: { teamName: "ASP", date: "2026-09-05", time: "20:00", loc: "Cancha del barrio", type: "F7", priceTotal: "140000", alias: "picado.demo" },
  players: [],
  history: [],
  sedes: [{ name: "Cancha del barrio", address: "" }],
  formations: {},
  responses: [],
  frequentAliases: [],
  habitualPlayers: [],
  cards: { byPlayer: {}, evaluated: {}, log: [] },
  split: split || {
    participants: [
      { id: "p1", name: "Tito", source: "manual", responseId: null },
      { id: "p2", name: "Fede", source: "manual", responseId: null },
      { id: "p3", name: "Nacho", source: "manual", responseId: null },
    ],
    expenses: [],
  },
});

function makeWorld({ local, failRead = false, failWrite = false } = {}) {
  const db = { row: local ? structuredClone(local) : BASE_ROW(), writes: 0, reads: 0, rejectedWrites: 0 };
  const copiaLocal = local || structuredClone(db.row);

  const supabaseClient = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          db.reads++;
          if (failRead) return Promise.resolve({ data: null, error: { message: "lectura rechazada" } });
          return Promise.resolve({ data: { data: structuredClone(db.row) }, error: null });
        },
        upsert(payload) {
          if (failWrite) {
            db.rejectedWrites++;
            return Promise.resolve({ error: { message: "guardado rechazado" } });
          }
          db.writes++;
          db.row = structuredClone(payload.data);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  let uuidCounter = 0;
  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    structuredClone,
    crypto: { randomUUID: () => `id-${++uuidCounter}` },
    Set, Map, Array, Object, JSON, Date, Boolean, Number, String, Promise, Math, Error,
    supabaseClient,
    ROW_ID: 1,
    db,
  });

  vm.runInContext(
    `
    let state = null;
    let saving = false;
    let localAvailabilityResponses = [];
    let knownPlayerNames = new Set();
    let knownSedeNames = new Set();
    let currentSessionUserId = ${JSON.stringify(DISPOSITIVO_A)};
    ${extractDeclaration(demo, "SPLIT_GASTO_SIN_OBJETIVO")}
    ${extractDeclaration(demo, "SPLIT_GASTO_PARTICIPANTE_INVALIDO")}
    ${NEEDED.map((n) => extractFunction(demo, n)).join("\n")}
    `,
    context,
  );

  vm.runInContext(
    `
    state = ${JSON.stringify(copiaLocal)};
    localAvailabilityResponses = state.responses;
    updateKnownSets(state);
    `,
    context,
  );

  return { db, run: (src) => vm.runInContext(src, context) };
}

function otroDispositivoEscribe(w, cambio) {
  Object.assign(w.db.row, cambio);
}

const traer = async (w, src) => {
  const { ok, motivo } = JSON.parse(await w.run(`(async ()=>{
    const r = await (${src});
    return JSON.stringify({ok: r.ok === true, motivo: r.motivo || null});
  })()`));
  return { ok, motivo };
};

const agregar = (w, datos) => traer(w, `agregarGastoSplit(${JSON.stringify(datos)})`);
const remover = (w, expenseId) => traer(w, `eliminarGastoSplit(${JSON.stringify(expenseId)})`);

const gastoBase = () => ({
  label: "Cervezas",
  amount: 24000,
  payers: [{ participantId: "p1", amount: 24000 }],
  consumers: ["p1", "p2", "p3"],
});

/* ---------- alta: válida ---------- */

test("agrega un gasto válido con un pagador y varios consumidores", async () => {
  const w = makeWorld();
  const r = await agregar(w, gastoBase());
  assert.equal(r.ok, true);
  assert.equal(w.db.row.split.expenses.length, 1);
  assert.deepEqual(w.db.row.split.expenses[0], { id: "id-1", ...gastoBase() });
});

/* ---------- alta: validarGasto (motor puro) rechaza sin tocar el servidor ---------- */

test("rechaza monto inválido sin leer ni escribir el servidor", async () => {
  const w = makeWorld();
  const r = await agregar(w, { ...gastoBase(), amount: 0 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "monto-invalido");
  assert.equal(w.db.reads, 0, "no debería leer: validarGasto corre antes");
  assert.equal(w.db.writes, 0);
});

test("rechaza sin consumidores", async () => {
  const w = makeWorld();
  const r = await agregar(w, { ...gastoBase(), consumers: [] });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "sin-consumidores");
});

test("rechaza consumidor duplicado", async () => {
  const w = makeWorld();
  const r = await agregar(w, { ...gastoBase(), consumers: ["p1", "p1"] });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "consumidor-duplicado");
});

test("rechaza sin pagadores", async () => {
  const w = makeWorld();
  const r = await agregar(w, { ...gastoBase(), payers: [] });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "sin-pagadores");
});

test("rechaza cuando lo pagado no cierra con el monto total", async () => {
  const w = makeWorld();
  const r = await agregar(w, { ...gastoBase(), payers: [{ participantId: "p1", amount: 20000 }] });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "pagadores-no-cierran");
});

/* ---------- alta: participantes inválidos contra el estado fresco ---------- */

test("rechaza si el consumidor ya no es participante en el estado fresco", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, {
    split: { participants: [{ id: "p1", name: "Tito", source: "manual", responseId: null }, { id: "p2", name: "Fede", source: "manual", responseId: null }], expenses: [] },
  });
  const r = await agregar(w, gastoBase()); // consumers incluye p3, que ya no está
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "participante-invalido");
  assert.equal(w.db.row.split.expenses.length, 0);
});

test("rechaza si el pagador ya no es participante en el estado fresco", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, {
    split: { participants: [{ id: "p2", name: "Fede", source: "manual", responseId: null }, { id: "p3", name: "Nacho", source: "manual", responseId: null }], expenses: [] },
  });
  const r = await agregar(w, { ...gastoBase(), consumers: ["p2", "p3"] }); // payer p1 ya no está
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "participante-invalido");
});

/* ---------- baja ---------- */

test("borra un gasto existente", async () => {
  const local = BASE_ROW();
  local.split.expenses = [{ id: "e1", ...gastoBase() }];
  const w = makeWorld({ local });
  const r = await remover(w, "e1");
  assert.equal(r.ok, true);
  assert.deepEqual(w.db.row.split.expenses, []);
});

test("borrar un gasto que ya no existe (otro dispositivo lo borró) falla cerrado", async () => {
  const local = BASE_ROW();
  local.split.expenses = [{ id: "e1", ...gastoBase() }];
  const w = makeWorld({ local });
  otroDispositivoEscribe(w, { split: { ...w.db.row.split, expenses: [] } });
  const writesPrevias = w.db.writes;
  const r = await remover(w, "e1");
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "sin-objetivo");
  assert.equal(w.db.writes, writesPrevias);
});

/* ---------- sin lectura fresca / guardado rechazado ---------- */

test("sin lectura fresca ninguna operación de gastos escribe", async () => {
  for (const [nombre, operacion] of [
    ["alta", (w) => agregar(w, gastoBase())],
    ["baja", (w) => remover(w, "e1")],
  ]) {
    const w = makeWorld({ failRead: true });
    const r = await operacion(w);
    assert.equal(r.ok, false, `${nombre}: avisó éxito sin lectura fresca`);
    assert.equal(w.db.writes, 0, `${nombre}: escribió sin lectura fresca`);
  }
});

test("un guardado rechazado deja split.expenses intacto", async () => {
  const local = BASE_ROW();
  local.split.expenses = [{ id: "e1", ...gastoBase() }];
  for (const [nombre, operacion] of [
    ["alta", (w) => agregar(w, { ...gastoBase(), label: "Hielo", amount: 1000, payers: [{ participantId: "p2", amount: 1000 }] })],
    ["baja", (w) => remover(w, "e1")],
  ]) {
    const w = makeWorld({ local, failWrite: true });
    const antes = JSON.stringify(w.db.row.split);
    const r = await operacion(w);
    assert.equal(r.ok, false, `${nombre}: avisó éxito con el guardado rechazado`);
    assert.equal(JSON.stringify(w.db.row.split), antes, `${nombre}: publicó estado que el servidor rechazó`);
    assert.equal(w.run("saving"), false, `${nombre}: dejó el sondeo congelado`);
  }
});

/* ---------- aislamiento ---------- */

test("agregar/borrar gastos no toca responses, players, habitualPlayers, cards ni participants", async () => {
  const local = BASE_ROW();
  local.split.expenses = [{ id: "e1", ...gastoBase() }];
  for (const [nombre, operacion] of [
    ["alta", (w) => agregar(w, { ...gastoBase(), label: "Hielo", amount: 1000, payers: [{ participantId: "p2", amount: 1000 }] })],
    ["baja", (w) => remover(w, "e1")],
  ]) {
    const w = makeWorld({ local });
    otroDispositivoEscribe(w, {
      matchInfo: { ...w.db.row.matchInfo, time: "21:30" },
      players: [{ name: "Ana", status: "in", team: "negro", paid: true, number: null, isCaptain: false, pos: { x: 1, y: 1 } }],
      habitualPlayers: ["Ana"],
      cards: { byPlayer: { Ana: { yellows: 1, reds: 0, beers: 0 } }, evaluated: {}, log: [] },
    });
    const restoAntes = JSON.stringify({
      matchInfo: w.db.row.matchInfo, players: w.db.row.players,
      habitualPlayers: w.db.row.habitualPlayers, cards: w.db.row.cards, responses: w.db.row.responses,
      participants: w.db.row.split.participants,
    });

    assert.equal((await operacion(w)).ok, true, `${nombre}: no guardó`);

    const restoDespues = JSON.stringify({
      matchInfo: w.db.row.matchInfo, players: w.db.row.players,
      habitualPlayers: w.db.row.habitualPlayers, cards: w.db.row.cards, responses: w.db.row.responses,
      participants: w.db.row.split.participants,
    });
    assert.equal(restoDespues, restoAntes, `${nombre}: tocó campos que no le pertenecen`);
  }
});

test("cada operación de gastos es una sola escritura y una sola lectura", async () => {
  const local = BASE_ROW();
  local.split.expenses = [{ id: "e1", ...gastoBase() }];
  for (const [nombre, operacion] of [
    ["alta", (w) => agregar(w, { ...gastoBase(), label: "Hielo", amount: 1000, payers: [{ participantId: "p2", amount: 1000 }] })],
    ["baja", (w) => remover(w, "e1")],
  ]) {
    const w = makeWorld({ local });
    assert.equal((await operacion(w)).ok, true, `${nombre}: no guardó`);
    assert.equal(w.db.writes, 1, `${nombre}: no escribió exactamente una vez`);
    assert.equal(w.db.reads, 1, `${nombre}: no leyó exactamente una vez`);
  }
});

/* ---------- estáticos: UI, copy, alcance del MVP ---------- */

test("botón 'Cargar gastos' bajo la card Split, junto a 'Gestionar participantes'", () => {
  const cardStart = demo.indexOf('<section class="organizer-card split-money-card"');
  const cardEnd = demo.indexOf("</section>", cardStart);
  const card = demo.slice(cardStart, cardEnd);
  assert.match(card, /<button type="button" class="link-btn" id="open-manage-split-expenses-btn">Cargar gastos<\/button>/);
});

test("el modal de gastos tiene lista, formulario con checkboxes de consumidores y un solo select de pagador", () => {
  const start = demo.indexOf('<div class="modal-overlay" id="manage-split-expenses-overlay">');
  const end = demo.indexOf('<div class="modal-overlay" id="finalize-overlay">', start);
  const modal = demo.slice(start, end);
  assert.match(modal, /<ul class="manage-list" id="split-expenses-list">/);
  assert.match(modal, /<select id="new-split-expense-payer">/);
  // Un solo <select> de pagador: nada de múltiples inputs de "monto del pagador".
  assert.equal((modal.match(/<select/g) || []).length, 1, "MVP: un solo pagador, sin UI de repartir el pago");
  assert.match(modal, /<ul class="manage-list" id="new-split-expense-consumers">/);
  assert.match(modal, /<p class="modal-error" id="split-expenses-error"/);
});

test("manage-split-expenses-overlay está registrado en anyModalOpen", () => {
  assert.match(demo, /anyModalOpen = \[[^\]]*'manage-split-expenses-overlay'[^\]]*\]/);
});

test("sin edición de gastos en el MVP: no hay acción 'editar', sólo borrar", () => {
  assert.doesNotMatch(demo, /data-action="edit-split-expense"|editarGastoSplit/);
});

// El guard "sin balances/liquidación conectados todavía" vivía acá con la premisa
// de PR 4 (sin PR 5). Esa premisa quedó superada por diseño: PR 5 conecta
// calcularBalances/liquidarMinimo vía armarResumenSplit(), read-only, sin writers
// nuevos. La invariante correspondiente ahora vive en split-balances.test.mjs.

test("copy nuevo no afirma pagado/saldada/confirmado/mínimo garantizado", () => {
  const bloque = [
    extractFunction(demo, "agregarGastoSplit"),
    extractFunction(demo, "eliminarGastoSplit"),
    extractFunction(demo, "renderSplitExpensesList"),
  ].join("\n");
  // "Pagó" (quién pagó, descriptivo) es distinto de "pagado"/"saldada"/"confirmado"
  // como afirmación de que la plata ya se resolvió — eso es lo que no debe decir.
  assert.doesNotMatch(bloque, /\bpagado\b|saldada|confirmado|mínimo garantizado/i);
});
