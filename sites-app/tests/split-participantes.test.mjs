// Split (tercer tiempo) — PR 3B: participantes editables. Agregar manual, agregar
// sugerido del partido, sacar (bloqueado si ya participa en gastos). Todavía SIN
// gastos, sin conectar el motor puro, sin roles nuevos.
//
// Mismo mecanismo que sedes-focalizadas.test.mjs: se ejecuta el código REAL de
// demo.html en un node:vm con un Supabase de mentira, statefull, para poder
// reproducir "otro dispositivo escribió entre mi lectura y mi guardado".
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
  "agregarParticipanteSplit",
  "removerParticipanteSplit",
];

const DISPOSITIVO_A = "device-a";

const BASE_ROW = () => ({
  matchInfo: { teamName: "ASP", date: "2026-09-05", time: "20:00", loc: "Cancha del barrio", type: "F7", priceTotal: "140000", alias: "picado.demo" },
  players: [],
  history: [],
  sedes: [{ name: "Cancha del barrio", address: "" }],
  formations: {},
  responses: [
    { responseId: "r-tito", ownerId: DISPOSITIVO_A, ownerIds: [DISPOSITIVO_A], name: "Tito", status: "in", from: "16:00", to: "20:00", paid: false, isGuest: false },
    { responseId: "r-fede", ownerId: "device-b", ownerIds: ["device-b"], name: "Fede", status: "duda", from: "17:00", to: "21:00", paid: false, isGuest: false },
  ],
  frequentAliases: [],
  habitualPlayers: [],
  cards: { byPlayer: {}, evaluated: {}, log: [] },
  split: { participants: [], expenses: [] },
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
    ${extractDeclaration(demo, "SPLIT_PARTICIPANTE_DUPLICADO")}
    ${extractDeclaration(demo, "SPLIT_PARTICIPANTE_SIN_OBJETIVO")}
    ${extractDeclaration(demo, "SPLIT_PARTICIPANTE_CON_GASTOS")}
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

const agregar = (w, { name, source = "manual", responseId = null }) =>
  traer(w, `agregarParticipanteSplit(${JSON.stringify({ name, source, responseId })})`);

const remover = (w, participantId) =>
  traer(w, `removerParticipanteSplit(${JSON.stringify(participantId)})`);

const DUPLICADO = "duplicado";
const SIN_OBJETIVO = "sin-objetivo";
const CON_GASTOS = "con-gastos";

/* ---------- alta ---------- */

test("agrega un participante manual con id propio, source y responseId:null", async () => {
  const w = makeWorld();
  const r = await agregar(w, { name: "Nacho" });
  assert.equal(r.ok, true);
  assert.deepEqual(w.db.row.split.participants, [{ id: "id-1", name: "Nacho", source: "manual", responseId: null }]);
});

test("agrega un participante importado del partido con su responseId como backlink", async () => {
  const w = makeWorld();
  const r = await agregar(w, { name: "Tito", source: "match", responseId: "r-tito" });
  assert.equal(r.ok, true);
  assert.deepEqual(w.db.row.split.participants, [{ id: "id-1", name: "Tito", source: "match", responseId: "r-tito" }]);
});

/* ---------- dedupe: sólo contra split.participants, nunca contra responses/habitualPlayers ---------- */

test("bloquea un nombre duplicado normalizado (trim + minúsculas) dentro del Split", async () => {
  const w = makeWorld();
  assert.equal((await agregar(w, { name: "Nacho" })).ok, true);
  const r = await agregar(w, { name: "  NACHO  " });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, DUPLICADO);
  assert.equal(w.db.row.split.participants.length, 1, "no debe agregar el duplicado");
});

test("un nombre puede repetirse entre el partido y el Split sin bloquearse", async () => {
  // "Tito" ya existe en responses (BASE_ROW), pero no en split.participants todavía:
  // el dedupe de Split no mira responses/habitualPlayers, sólo split.participants.
  const w = makeWorld();
  const r = await agregar(w, { name: "Tito", source: "manual" });
  assert.equal(r.ok, true);
});

test("el duplicado se revalida contra el estado fresco, no sólo contra la copia local", async () => {
  const w = makeWorld();
  // Otro dispositivo agregó "Nacho" entre la lectura local y este guardado.
  otroDispositivoEscribe(w, { split: { participants: [{ id: "id-otro", name: "Nacho", source: "manual", responseId: null }], expenses: [] } });
  const r = await agregar(w, { name: "nacho" });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, DUPLICADO);
  assert.equal(w.db.row.split.participants.length, 1);
});

/* ---------- remoción ---------- */

test("remueve sin gastos asociados: borrado real", async () => {
  const w = makeWorld({ local: { ...BASE_ROW(), split: { participants: [{ id: "p1", name: "Nacho", source: "manual", responseId: null }], expenses: [] } } });
  const r = await remover(w, "p1");
  assert.equal(r.ok, true);
  assert.deepEqual(w.db.row.split.participants, []);
});

test("bloquea la remoción si el participante es consumer de un gasto", async () => {
  const w = makeWorld({
    local: {
      ...BASE_ROW(),
      split: {
        participants: [{ id: "p1", name: "Nacho", source: "manual", responseId: null }],
        expenses: [{ id: "e1", label: "Cervezas", amount: 1000, payers: [{ participantId: "p1", amount: 1000 }], consumers: ["p1"] }],
      },
    },
  });
  const r = await remover(w, "p1");
  assert.equal(r.ok, false);
  assert.equal(r.motivo, CON_GASTOS);
  assert.equal(w.db.row.split.participants.length, 1, "no debe borrar al participante con gastos");
});

test("bloquea la remoción si el participante es payer de un gasto (aunque no consuma)", async () => {
  const w = makeWorld({
    local: {
      ...BASE_ROW(),
      split: {
        participants: [
          { id: "p1", name: "Nacho", source: "manual", responseId: null },
          { id: "p2", name: "Fede", source: "manual", responseId: null },
        ],
        expenses: [{ id: "e1", label: "Hielo", amount: 500, payers: [{ participantId: "p1", amount: 500 }], consumers: ["p2"] }],
      },
    },
  });
  const r = await remover(w, "p1");
  assert.equal(r.ok, false);
  assert.equal(r.motivo, CON_GASTOS);
});

test("remover un participante que ya no existe (otro dispositivo lo sacó) falla cerrado y no escribe", async () => {
  const w = makeWorld({ local: { ...BASE_ROW(), split: { participants: [{ id: "p1", name: "Nacho", source: "manual", responseId: null }], expenses: [] } } });
  otroDispositivoEscribe(w, { split: { participants: [], expenses: [] } });
  const writesPrevias = w.db.writes;
  const r = await remover(w, "p1");
  assert.equal(r.ok, false);
  assert.equal(r.motivo, SIN_OBJETIVO);
  assert.equal(w.db.writes, writesPrevias);
});

/* ---------- sin lectura fresca / guardado rechazado ---------- */

test("sin lectura fresca ninguna operación de participantes escribe", async () => {
  for (const [nombre, operacion] of [
    ["alta", (w) => agregar(w, { name: "Nacho" })],
    ["baja", (w) => remover(w, "p1")],
  ]) {
    const w = makeWorld({ failRead: true });
    const r = await operacion(w);
    assert.equal(r.ok, false, `${nombre}: avisó éxito sin lectura fresca`);
    assert.equal(w.db.writes, 0, `${nombre}: escribió sin lectura fresca`);
  }
});

test("un guardado rechazado deja split intacto", async () => {
  const local = { ...BASE_ROW(), split: { participants: [{ id: "p1", name: "Nacho", source: "manual", responseId: null }], expenses: [] } };
  for (const [nombre, operacion] of [
    ["alta", (w) => agregar(w, { name: "Fede" })],
    ["baja", (w) => remover(w, "p1")],
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

test("agregar/remover participantes no toca responses, players, habitualPlayers ni cards", async () => {
  const local = { ...BASE_ROW(), split: { participants: [{ id: "p1", name: "Nacho", source: "manual", responseId: null }], expenses: [] } };
  for (const [nombre, operacion] of [
    ["alta", (w) => agregar(w, { name: "Fede" })],
    ["baja", (w) => remover(w, "p1")],
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
    });

    assert.equal((await operacion(w)).ok, true, `${nombre}: no guardó`);

    const restoDespues = JSON.stringify({
      matchInfo: w.db.row.matchInfo, players: w.db.row.players,
      habitualPlayers: w.db.row.habitualPlayers, cards: w.db.row.cards, responses: w.db.row.responses,
    });
    assert.equal(restoDespues, restoAntes, `${nombre}: tocó campos que no le pertenecen`);
  }
});

test("cada operación de participantes es una sola escritura y una sola lectura", async () => {
  const local = { ...BASE_ROW(), split: { participants: [{ id: "p1", name: "Nacho", source: "manual", responseId: null }], expenses: [] } };
  for (const [nombre, operacion] of [
    ["alta", (w) => agregar(w, { name: "Fede" })],
    ["baja", (w) => remover(w, "p1")],
  ]) {
    const w = makeWorld({ local });
    assert.equal((await operacion(w)).ok, true, `${nombre}: no guardó`);
    assert.equal(w.db.writes, 1, `${nombre}: no escribió exactamente una vez`);
    assert.equal(w.db.reads, 1, `${nombre}: no leyó exactamente una vez`);
  }
});

/* ---------- estáticos: UI, copy, sugeridos, ausencia de auto-poblado ---------- */

test("botón 'Gestionar participantes' bajo la card Split, dentro de Vista Organizador", () => {
  const cardStart = demo.indexOf('<section class="organizer-card split-money-card"');
  const cardEnd = demo.indexOf("</section>", cardStart);
  const card = demo.slice(cardStart, cardEnd);
  assert.match(card, /<button type="button" class="link-btn" id="open-manage-split-btn">Gestionar participantes<\/button>/);
  // El copy ya no afirma que el Split "no se edita": eso dejó de ser cierto para participantes.
  assert.doesNotMatch(card, /todavía no se edita desde la app/i);
});

test("el modal de participantes reusa el patrón de sedes (manage-list/manage-add-row/modal-error)", () => {
  const start = demo.indexOf('<div class="modal-overlay" id="manage-split-overlay">');
  const end = demo.indexOf("</div>\n</div>", start);
  const modal = demo.slice(start, end);
  assert.match(modal, /<ul class="manage-list" id="split-participants-list">/);
  assert.match(modal, /<div class="manage-add-row">/);
  assert.match(modal, /<p class="modal-error" id="split-participants-error"/);
  // PR #76 — copy ajustado post-verificación de producción.
  assert.match(modal, /Agregá sólo a quienes participan de la cuenta del tercer tiempo\. Sacar a alguien de acá no lo saca del partido\./);
  assert.match(modal, /<input type="text" id="new-split-participant-name" placeholder="Nombre o apodo">/);
});

test("manage-split-overlay está registrado en anyModalOpen (no lo pisa el sondeo)", () => {
  assert.match(demo, /anyModalOpen = \[[^\]]*'manage-split-overlay'[^\]]*\]/);
});

test("sugeridos = responses status 'in', incluidos invitados, sin duda/out", () => {
  const fn = extractFunction(demo, "splitCandidatosSugeridos");
  assert.match(fn, /r\.status\s*===\s*'in'/);
  assert.doesNotMatch(fn, /isGuest/, "no debe excluir invitados por isGuest");
});

test("no hay importación masiva automática: sólo el alta uno-por-uno ya cubierto", () => {
  assert.doesNotMatch(demo, /function\s+importarTodos|function\s+poblarParticipantesDefault|function\s+seedSplitParticipants/i);
});

test("copy de bloqueo: duplicado y remoción con gastos usan el texto aprobado", () => {
  assert.match(demo, /Ya hay alguien con ese nombre en el Split\. Agregá apellido o apodo\./);
  assert.match(demo, /ya participa en gastos del Split\. Quitá o editá esos gastos primero\./);
});

test("no afirma pagado/saldada/confirmado/mínimo garantizado en el copy nuevo de Split", () => {
  const bloque = [
    extractFunction(demo, "agregarParticipanteSplit"),
    extractFunction(demo, "removerParticipanteSplit"),
  ].join("\n");
  assert.doesNotMatch(bloque, /pagad|saldada|confirmado|mínimo garantizado/i);
});
