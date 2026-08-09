// PR-1 — persist() no puede pisar `responses` con la copia local.
//
// Estos tests ejecutan el código REAL de demo.html. Las funciones bajo prueba
// (persist, fetchServerState, saveState, guardarCambioEnResponses y sus ayudantes)
// no tocan el DOM, así que se extraen por NOMBRE y se corren en un node:vm con
// un Supabase de mentira. No hay red, no hay navegador y no se toca producción.
//
// A propósito no se afirma nada sobre el texto del archivo: cualquier
// implementación que preserve las invariantes de abajo pasa.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

// Extrae una función por nombre balanceando llaves desde su apertura.
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
  // El ejecutor y no el que encola: acá se prueba persist(), no la serialización.
  // La cola tiene su propia cobertura en responses-escrituras.test.mjs.
  "ejecutarCambioEnResponses",
  "persist",
];

// Construye un mundo aislado con el código real y una base de datos falsa.
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

  // Estado inicial del cliente: adopta el row tal como lo haría init().
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
    get: (expr) => vm.runInContext(`JSON.stringify(${expr})`, context),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context)),
  };
}

const RESPONSE = (id, name, extra = {}) => ({
  responseId: id, ownerId: `owner-${id}`, ownerIds: [`owner-${id}`],
  name, status: "in", from: "16:00", to: "20:00",
  paid: false, team: "negro", updatedAt: "2026-08-08T12:00:00.000Z", ...extra,
});

const PLAYER = (name) => ({
  name, status: "in", team: "negro", paid: false,
  pos: { x: 30, y: 30 }, number: null, isCaptain: false,
});

const BASE_ROW = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "Cancha", type: "F8", priceTotal: "96000", alias: "a.b" },
  responses: [RESPONSE("r-ariel", "Ariel"), RESPONSE("r-bruno", "Bruno")],
  players: [PLAYER("Ariel"), PLAYER("Bruno")],
  history: [],
  sedes: [{ name: "Cancha", address: "Calle 1" }],
  formations: { negro: "3-2-2", blanco: "3-2-2" },
  frequentAliases: [],
});

// Nombres de las responses, que es lo que importa para altas y borrados.
const names = (arr) => arr.map((r) => r.name).sort();

test("sin `fresh`: persist() falla cerrado, cero escrituras y servidor intacto", async () => {
  const w = makeWorld({ row: BASE_ROW(), failRead: true });
  const antes = structuredClone(w.db.row);

  const ok = await w.run("persist()");

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0, "no debe intentar escribir sin lectura fresca");
  assert.equal(w.db.rejectedWrites, 0, "ni siquiera debe llamar a saveState");
  assert.deepEqual(w.db.row, antes, "el servidor queda intacto");
  assert.equal(w.json("saving"), false, "saving vuelve a false");
});

test("sin `fresh` no se pisan las responses locales", async () => {
  const w = makeWorld({ row: BASE_ROW(), failRead: true });
  const antes = w.json("localAvailabilityResponses");

  await w.run("persist()");

  assert.deepEqual(w.json("localAvailabilityResponses"), antes);
  assert.deepEqual(w.json("state.responses"), antes);
});

test("con `fresh`, state.responses adopta las responses del servidor", async () => {
  const w = makeWorld({ row: BASE_ROW() });
  // Alta remota que este cliente todavía no conoce.
  w.db.row.responses.push(RESPONSE("r-kevin", "Kevin"));

  const ok = await w.run("persist()");

  assert.equal(ok, true);
  assert.deepEqual(names(w.json("state.responses")), ["Ariel", "Bruno", "Kevin"]);
  assert.deepEqual(names(w.db.row.responses), ["Ariel", "Bruno", "Kevin"],
    "la alta remota no puede perderse al guardar");
});

test("localAvailabilityResponses representa esas mismas responses", async () => {
  const w = makeWorld({ row: BASE_ROW() });
  w.db.row.responses.push(RESPONSE("r-kevin", "Kevin"));

  await w.run("persist()");

  assert.deepEqual(
    w.json("localAvailabilityResponses"),
    w.json("state.responses"),
    "la caché que usa saveLocalAvailability() debe quedar sincronizada",
  );
});

test("un save rechazado no revierte a la caché vieja", async () => {
  const w = makeWorld({ row: BASE_ROW(), failWrite: true });
  w.db.row.responses.push(RESPONSE("r-kevin", "Kevin"));

  const ok = await w.run("persist()");

  assert.equal(ok, false);
  assert.equal(w.db.rejectedWrites, 1);
  assert.ok(names(w.json("state.responses")).includes("Kevin"),
    "la adopción representa lo que acabamos de leer y no se revierte");
  assert.deepEqual(w.json("localAvailabilityResponses"), w.json("state.responses"));
  assert.equal(w.json("saving"), false);
});

test("updateKnownSets sólo corre si el guardado funcionó", async () => {
  const w = makeWorld({ row: BASE_ROW(), failWrite: true });
  w.db.row.players.push(PLAYER("Kevin"));

  await w.run("persist()");

  assert.ok(!w.json("[...knownPlayerNames]").includes("kevin"),
    "un guardado rechazado no puede registrar nombres como ya conocidos");
});

// ── La invariante central: persist() y después un guardado real de availability,
//    sin sondeo intermedio. Es lo que demuestra que la caché quedó sincronizada.
const ESCENARIOS = [
  {
    nombre: "alta remota",
    remoto: (row) => { row.responses.push(RESPONSE("r-kevin", "Kevin")); },
    espera: (resp) => assert.ok(names(resp).includes("Kevin"), "Kevin debe seguir existiendo"),
  },
  {
    nombre: "pago remoto",
    remoto: (row) => { row.responses.find((r) => r.name === "Bruno").paid = true; },
    espera: (resp) => assert.equal(resp.find((r) => r.name === "Bruno").paid, true,
      "el pago remoto debe sobrevivir"),
  },
  {
    nombre: "borrado remoto",
    remoto: (row) => { row.responses = row.responses.filter((r) => r.name !== "Bruno"); },
    espera: (resp) => assert.ok(!names(resp).includes("Bruno"),
      "una response borrada no puede resucitar"),
  },
  {
    nombre: "claim remoto (ownerIds)",
    remoto: (row) => { row.responses.find((r) => r.name === "Bruno").ownerIds.push("device-nuevo"); },
    espera: (resp) => assert.ok(resp.find((r) => r.name === "Bruno").ownerIds.includes("device-nuevo"),
      "el claim remoto debe sobrevivir"),
  },
];

for (const escenario of ESCENARIOS) {
  test(`${escenario.nombre}: persist() y luego una escritura de responses sin sondeo`, async () => {
    const w = makeWorld({ row: BASE_ROW() });
    escenario.remoto(w.db.row);

    const okPersist = await w.run("persist()");
    assert.equal(okPersist, true);
    escenario.espera(w.json("localAvailabilityResponses"));

    // Camino real de pagos/invitados, sin sondear en el medio: un pago sobre Ariel,
    // que existe en todos los escenarios.
    const okSave = await w.run(`ejecutarCambioEnResponses(responses => {
      const target = responses.find(r => r.name === "Ariel");
      if (!target) return false;
      target.paid = true;
      return true;
    })`);
    assert.equal(okSave, true);

    escenario.espera(w.db.row.responses);
  });
}
