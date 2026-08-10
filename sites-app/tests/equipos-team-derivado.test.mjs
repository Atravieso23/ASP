// PR-2 — Equipos: `responses.team` es la fuente de verdad y `players.team` se deriva.
//
// Como en persist-responses.test.mjs, se ejecuta el código REAL de demo.html en un
// node:vm: las funciones en juego (syncLocalAvailabilityWithPlayers, persist y sus
// ayudantes) no tocan el DOM. Sin red, sin navegador, sin producción.
//
// Los handlers de la interfaz (botones de la tabla, tap en la ficha, arrastre y
// formación) se verifican aparte con el harness de dos dispositivos: dependen del DOM
// y no se pueden extraer.
//
// A propósito no se afirma nada sobre el texto del archivo.
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

const NEEDED = [
  "fetchServerState",
  "saveState",
  "updateKnownSets",
  "mergeKeepingDeletions",
  "mergePlayers",
  "mergeSedesArr",
  "syncLocalAvailabilityWithPlayers",
  "persist",
];

function makeWorld({ row, failRead = false, failWrite = false }) {
  const db = { row: structuredClone(row), writes: 0, reads: 0, rejectedWrites: 0 };

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

  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    structuredClone,
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
    ${NEEDED.map((n) => extractFunction(demo, n)).join("\n")}
    `,
    context,
  );

  vm.runInContext(
    `
    state = ${JSON.stringify(row)};
    localAvailabilityResponses = state.responses;
    updateKnownSets(state);
    `,
    context,
  );

  return {
    db,
    run: (code) => vm.runInContext(code, context),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context)),
  };
}

const RESPONSE = (id, name, extra = {}) => ({
  responseId: id, ownerId: `owner-${id}`, ownerIds: [`owner-${id}`],
  name, status: "in", from: "16:00", to: "20:00",
  paid: false, team: "negro", updatedAt: "2026-08-08T12:00:00.000Z", ...extra,
});

const PLAYER = (name, extra = {}) => ({
  name, status: "in", team: "negro", paid: false,
  pos: { x: 30, y: 30 }, number: null, isCaptain: false, ...extra,
});

const BASE_ROW = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "Cancha", type: "F8", priceTotal: "96000", alias: "a.b" },
  responses: [RESPONSE("r-ariel", "Ariel"), RESPONSE("r-bruno", "Bruno", { team: "blanco" })],
  players: [PLAYER("Ariel"), PLAYER("Bruno", { team: "blanco", pos: { x: 60, y: 60 } })],
  history: [],
  sedes: [{ name: "Cancha", address: "Calle 1" }],
  formations: { negro: "3-2-2", blanco: "3-2-2" },
  frequentAliases: [],
});

const jugador = (w, nombre) => w.json("state.players").find((p) => p.name === nombre);

// ───────────────────────── B: players.team derivado ─────────────────────────

test("players.team deriva de response.team aunque el local ya tenga uno distinto", () => {
  const w = makeWorld({ row: BASE_ROW() });
  // Cambio hecho en otro dispositivo, ya presente en las responses.
  w.run(`localAvailabilityResponses.find(r=>r.name==='Ariel').team = 'blanco';`);

  w.run("syncLocalAvailabilityWithPlayers()");

  assert.equal(jugador(w, "Ariel").team, "blanco",
    "el team local viejo no puede ganarle al de la response");
});

test("si el team efectivo cambia, la posición se invalida", () => {
  const w = makeWorld({ row: BASE_ROW() });
  w.run(`localAvailabilityResponses.find(r=>r.name==='Ariel').team = 'blanco';`);

  w.run("syncLocalAvailabilityWithPlayers()");

  assert.equal(jugador(w, "Ariel").pos, null,
    "una posición pertenece a un equipo: no sobrevive al cambio");
});

test("si el team no cambia, la posición se conserva", () => {
  const w = makeWorld({ row: BASE_ROW() });

  w.run("syncLocalAvailabilityWithPlayers()");

  assert.deepEqual(jugador(w, "Ariel").pos, { x: 30, y: 30 });
  assert.deepEqual(jugador(w, "Bruno").pos, { x: 60, y: 60 });
});

test("un jugador que no está `in` queda sin equipo ni posición", () => {
  const w = makeWorld({ row: BASE_ROW() });
  w.run(`
    const r = localAvailabilityResponses.find(x=>x.name==='Ariel');
    r.status = 'duda'; r.team = 'negro';
  `);

  w.run("syncLocalAvailabilityWithPlayers()");

  assert.equal(jugador(w, "Ariel").team, null);
  assert.equal(jugador(w, "Ariel").pos, null);
});

test("response sin equipo deja al jugador sin equipo", () => {
  const w = makeWorld({ row: BASE_ROW() });
  w.run(`localAvailabilityResponses.find(r=>r.name==='Ariel').team = null;`);

  w.run("syncLocalAvailabilityWithPlayers()");

  assert.equal(jugador(w, "Ariel").team, null,
    "sin team en la response el jugador no puede quedarse con el viejo");
});

test("un valor de equipo inválido en la response no se adopta", () => {
  const w = makeWorld({ row: BASE_ROW() });
  w.run(`localAvailabilityResponses.find(r=>r.name==='Ariel').team = 'violeta';`);

  w.run("syncLocalAvailabilityWithPlayers()");

  assert.equal(jugador(w, "Ariel").team, null);
});

test("un jugador nuevo también deriva su equipo con las mismas reglas", () => {
  const w = makeWorld({ row: BASE_ROW() });
  // Altas que este cliente todavía no tenía en players: la rama que crea el jugador
  // tiene que validar igual que la que lo actualiza.
  w.run(`
    localAvailabilityResponses.push(${JSON.stringify(RESPONSE("r-kevin", "Kevin", { team: "violeta" }))});
    localAvailabilityResponses.push(${JSON.stringify(RESPONSE("r-nora", "Nora", { team: "blanco" }))});
    localAvailabilityResponses.push(${JSON.stringify(RESPONSE("r-omar", "Omar", { status: "duda", team: "negro" }))});
  `);

  w.run("syncLocalAvailabilityWithPlayers()");

  assert.equal(jugador(w, "Kevin").team, null, "un equipo inválido no se adopta en el alta");
  assert.equal(jugador(w, "Nora").team, "blanco", "uno válido sí");
  assert.equal(jugador(w, "Omar").team, null, "quien no está `in` nace sin equipo");
});

// ───────────────────── A: overlay focalizado en persist() ─────────────────────

// El overlay recibe las responses recién leídas del servidor y aplica encima sólo
// el cambio de esta acción. Devuelve false si no encuentra su objetivo.
const OVERLAY = (id, team) => `
  (function(responses){
    const target = responses.find(r=>r.responseId===${JSON.stringify(id)});
    if(!target) return false;
    target.team = ${JSON.stringify(team)};
    return true;
  })
`;

test("el overlay cambia su response y preserva las frescas del servidor", async () => {
  const w = makeWorld({ row: BASE_ROW() });
  // Otro dispositivo agrega a Kevin y le pagan a Bruno, sin que este cliente sondee.
  w.db.row.responses.push(RESPONSE("r-kevin", "Kevin"));
  w.db.row.responses.find((r) => r.name === "Bruno").paid = true;

  const ok = await w.run(`persist(${OVERLAY("r-ariel", "blanco")})`);

  assert.equal(ok, true);
  assert.equal(w.db.writes, 1, "exactamente una escritura por cambio de equipo");
  assert.equal(w.db.row.responses.find((r) => r.name === "Ariel").team, "blanco");
  assert.ok(w.db.row.responses.some((r) => r.name === "Kevin"), "la alta remota se preserva");
  assert.equal(w.db.row.responses.find((r) => r.name === "Bruno").paid, true,
    "el pago remoto se preserva");
});

test("el overlay deriva players.team antes de guardar", async () => {
  const w = makeWorld({ row: BASE_ROW() });

  await w.run(`persist(${OVERLAY("r-ariel", "blanco")})`);

  assert.equal(jugador(w, "Ariel").team, "blanco");
  assert.equal(w.db.row.players.find((p) => p.name === "Ariel").team, "blanco");
  assert.equal(jugador(w, "Ariel").pos, null, "el cambio de equipo invalida la posición");
});

test("si el overlay no encuentra su response, no se escribe nada", async () => {
  const w = makeWorld({ row: BASE_ROW() });
  // Otro dispositivo borró esa response mientras tanto.
  w.db.row.responses = w.db.row.responses.filter((r) => r.name !== "Ariel");
  const antes = structuredClone(w.db.row);

  const ok = await w.run(`persist(${OVERLAY("r-ariel", "blanco")})`);

  assert.equal(ok, false, "no puede decir que guardó");
  assert.equal(w.db.writes, 0, "no resucita una response borrada");
  assert.deepEqual(w.db.row, antes);
  assert.equal(w.json("saving"), false);
});

test("con overlay y sin lectura fresca no se escribe nada", async () => {
  const w = makeWorld({ row: BASE_ROW(), failRead: true });
  const antesLocal = w.json("localAvailabilityResponses");

  const ok = await w.run(`persist(${OVERLAY("r-ariel", "blanco")})`);

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0);
  assert.equal(w.db.rejectedWrites, 0);
  assert.deepEqual(w.json("localAvailabilityResponses"), antesLocal,
    "sin lectura no se toca nada local");
  assert.equal(w.json("saving"), false);
});

test("si el guardado falla, el overlay se puede revertir a lo que decía el servidor", async () => {
  const w = makeWorld({ row: BASE_ROW(), failWrite: true });

  const ok = await w.run(`persist(${OVERLAY("r-ariel", "blanco")})`);

  assert.equal(ok, false);
  assert.equal(w.db.row.responses.find((r) => r.name === "Ariel").team, "negro",
    "el servidor no cambió");
  // El llamador revierte con el valor previo y vuelve a derivar.
  w.run(`
    localAvailabilityResponses.find(r=>r.responseId==='r-ariel').team = 'negro';
    syncLocalAvailabilityWithPlayers();
  `);
  assert.equal(jugador(w, "Ariel").team, "negro");
});

test("persist() sin overlay sigue comportándose igual", async () => {
  const w = makeWorld({ row: BASE_ROW() });
  // Un cambio remoto de equipo que este cliente todavía no derivó.
  w.db.row.responses.find((r) => r.name === "Ariel").team = "blanco";

  const ok = await w.run("persist()");

  assert.equal(ok, true);
  assert.equal(w.db.writes, 1);
  assert.equal(w.json("localAvailabilityResponses").find((r) => r.name === "Ariel").team, "blanco",
    "adopta las responses frescas, como desde PR-1");
  assert.equal(w.db.row.responses.find((r) => r.name === "Ariel").team, "blanco",
    "y no revierte el cambio remoto");
});

test("un guardado del dispositivo viejo no revierte un cambio remoto de equipo", async () => {
  const w = makeWorld({ row: BASE_ROW() });
  // Otro dispositivo pasa a Ariel a blanco, en responses y en players.
  w.db.row.responses.find((r) => r.name === "Ariel").team = "blanco";
  w.db.row.players.find((p) => p.name === "Ariel").team = "blanco";

  // Este cliente, sin sondear, cambia el equipo de OTRO jugador.
  const ok = await w.run(`persist(${OVERLAY("r-bruno", "negro")})`);

  assert.equal(ok, true);
  assert.equal(w.db.row.responses.find((r) => r.name === "Ariel").team, "blanco",
    "el cambio remoto sobrevive");
  assert.equal(w.db.row.players.find((p) => p.name === "Ariel").team, "blanco",
    "y players queda derivado en el mismo sentido");
  assert.equal(w.db.row.responses.find((r) => r.name === "Bruno").team, "negro");
});
