// C1 — las ediciones del historial superponen su intención sobre el estado fresco.
//
// persist() lee fresco pero adopta de esa lectura sólo players, sedes y responses.
// matchInfo, history y frequentAliases salían de la copia local, de hasta 4s de
// antigüedad —o de minutos, porque el sondeo se suspende mientras el foco está dentro
// del historial (demo.html:1073)—. Así, cargar un gol alcanzaba para revertir la hora
// del partido, borrar una fecha recién archivada o hacer desaparecer un alias que otro
// teléfono acababa de guardar.
//
// Además, las tres ediciones resolvían su fecha por índice del array local. En el
// estado fresco esa misma posición puede ser otra fecha: la identidad ahora es
// finalizedAt.
//
// Mismo mecanismo que persist-responses.test.mjs: se ejecuta el código REAL de
// demo.html en un node:vm con un Supabase de mentira.
//
// Finalizar sigue siendo un closure del DOM y no se refactoriza en C1, así que acá se
// reproduce el cuerpo de su handler; rendered-html.test.mjs fija el texto del original
// para que la reproducción no se desincronice en silencio.
//
// Fuera de C1: "Editar partido" sigue pisando el historial fresco (su rama de cambio
// de tipo de cancha cruza con players/pos y formations). Queda para el PR siguiente.
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
  // fetchServerState delega la lectura cruda: sin esto no resuelve el nombre.
  "leerEstadoDelServidor",
  "fetchServerState",
  "saveState",
  "persistFocalizado",
  "conFechaDeHistorial",
  "guardarPrecioDeHistorial",
  "guardarResultadoDeHistorial",
  "guardarGolesDeHistorial",
  "updateKnownSets",
  "mergeKeepingDeletions",
  "mergePlayers",
  "mergeSedesArr",
  "syncLocalAvailabilityWithPlayers",
  "getResponsePlayers",
  "blankMatchInfo",
];

const DISPOSITIVO_A = "device-a";

const FECHA_JULIO = () => ({
  finalizedAt: "2026-07-04T22:00:00.000Z",
  matchInfo: { teamName: "ASP", date: "2026-07-04", time: "16:00", loc: "Cancha del barrio", type: "F8", priceTotal: "40000", alias: "picado" },
  players: [{ name: "Ana", status: "in", team: "negro", paid: true, number: null, isCaptain: false }],
  responses: [{ responseId: "r-ana", ownerId: DISPOSITIVO_A, ownerIds: [DISPOSITIVO_A], name: "Ana", status: "in", from: "16:00", to: "18:00", paid: true, team: "negro" }],
  score: { negro: 0, blanco: 0 },
  goals: {},
  formations: { negro: "3-2-2", blanco: "3-2-2" },
});

const FECHA_AGOSTO = () => ({
  ...FECHA_JULIO(),
  finalizedAt: "2026-08-01T22:00:00.000Z",
  matchInfo: { ...FECHA_JULIO().matchInfo, date: "2026-08-01" },
});

const BASE_ROW = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "Cancha del barrio", type: "F8", priceTotal: "190000", alias: "picado.demo" },
  players: [{ name: "Ana", status: "in", team: "negro", paid: false, number: null, isCaptain: false, pos: { x: 50, y: 50 } }],
  history: [FECHA_JULIO()],
  sedes: [{ name: "Cancha del barrio", address: "Av. Siempreviva 742" }],
  formations: { negro: "3-2-2", blanco: "3-2-2" },
  responses: [{ responseId: "r-ana", ownerId: DISPOSITIVO_A, ownerIds: [DISPOSITIVO_A], name: "Ana", status: "in", from: "16:00", to: "18:00", paid: false, team: "negro" }],
  frequentAliases: ["alias.viejo"],
});

// La fila del servidor es compartida. `local` es lo que este dispositivo cree que hay,
// y puede estar arbitrariamente viejo: es exactamente la condición que reproduce el bug.
function makeWorld({ local, failRead = false, failWrite = false } = {}) {
  const db = { row: BASE_ROW(), writes: 0, reads: 0, rejectedWrites: 0 };
  if (local) db.row = structuredClone(local);
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

  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    structuredClone,
    crypto: { randomUUID: () => `id-${Math.random().toString(36).slice(2, 10)}` },
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

// Simula lo que hace otro dispositivo: escribe directo en la fila compartida, sin que
// este dispositivo se entere.
function otroDispositivoEscribe(w, cambio) {
  Object.assign(w.db.row, cambio);
}

// demo.html:2212-2280 — #f-confirm onclick. Se reproduce la construcción de nextState
// y su guardado, que es lo que decide qué sobrevive. Finalizar no se refactoriza en C1.
const finalizarFecha = (w) => w.run(`
  (async ()=>{
    saving = true;
    try{
      const fresh = await fetchServerState();
      if(!fresh) return false;
      const basePlayers = mergePlayers(fresh.players, state.players);
      const baseHistory = (fresh.history && fresh.history.length > (state.history||[]).length)
        ? fresh.history : (state.history || []);
      const baseSedes = mergeSedesArr(fresh.sedes, state.sedes);
      const archived = {
        finalizedAt: '2026-08-15T22:00:00.000Z',
        matchInfo: {...state.matchInfo},
        players: getResponsePlayers(undefined, basePlayers).map(p=>({...p})),
        responses: localAvailabilityResponses.map(r=>({...r})),
        formations: {...state.formations}
      };
      const nextState = {
        ...state,
        sedes: baseSedes,
        frequentAliases: fresh.frequentAliases,
        history: [...baseHistory, archived],
        responses: [],
        players: [],
        formations: {},
        matchInfo: blankMatchInfo()
      };
      const ok = await saveState(nextState);
      if(!ok) return false;
      state = nextState;
      updateKnownSets(state);
      return true;
    } finally { saving = false; }
  })()
`);

const JULIO = FECHA_JULIO().finalizedAt;
const AGOSTO = FECHA_AGOSTO().finalizedAt;

// ---------------------------------------------------------------------------
// RED 1 — la hora del partido
// ---------------------------------------------------------------------------
test("editar el historial no revierte la hora que otro dispositivo guardó", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, { matchInfo: { ...w.db.row.matchInfo, time: "18:00" } });

  assert.equal(await w.run(`guardarPrecioDeHistorial(${JSON.stringify(JULIO)}, '50000')`), true);

  assert.equal(w.db.row.matchInfo.time, "18:00", "la hora que guardó el otro dispositivo volvió atrás");
  assert.equal(w.db.row.history[0].matchInfo.priceTotal, "50000", "el precio propio no se guardó");
});

// ---------------------------------------------------------------------------
// RED 2 — una fecha recién archivada
// ---------------------------------------------------------------------------
test("editar una fecha vieja no borra la fecha que otro dispositivo archivó", async () => {
  const w = makeWorld();
  // El sondeo de A está suspendido por el foco en el historial: no vio la fecha nueva.
  otroDispositivoEscribe(w, { history: [FECHA_JULIO(), FECHA_AGOSTO()] });

  assert.equal(await w.run(`guardarGolesDeHistorial(${JSON.stringify(JULIO)}, 'Ana', 2)`), true);

  assert.deepEqual(w.db.row.history.map((h) => h.finalizedAt), [JULIO, AGOSTO],
    "la fecha recién archivada desapareció");
  assert.equal(w.db.row.history.find((h) => h.finalizedAt === JULIO).goals.Ana, 2,
    "el gol propio no se guardó");
});

// ---------------------------------------------------------------------------
// RED 3 — el índice corrido
// ---------------------------------------------------------------------------
test("la edición no cae en la fecha que pasó a ocupar el índice viejo", async () => {
  // A ve [julio, agosto]: en su DOM, agosto está en el índice 1.
  const local = BASE_ROW();
  local.history = [FECHA_JULIO(), FECHA_AGOSTO()];
  const w = makeWorld({ local });

  // B deshace agosto y archiva una fecha nueva. En el servidor el índice 1 ya no es
  // agosto: es septiembre.
  const septiembre = { ...FECHA_AGOSTO(), finalizedAt: "2026-09-05T22:00:00.000Z" };
  otroDispositivoEscribe(w, { history: [FECHA_JULIO(), septiembre] });
  const writesPrevias = w.db.writes;

  const ok = await w.run(`guardarResultadoDeHistorial(${JSON.stringify(AGOSTO)}, 'negro', 3)`);

  assert.equal(ok, false, "avisó éxito sobre una fecha que el servidor ya no tiene");
  assert.equal(w.db.writes, writesPrevias, "escribió aunque su objetivo había desaparecido");
  const septiembreGuardada = w.db.row.history.find((h) => h.finalizedAt === septiembre.finalizedAt);
  assert.equal(septiembreGuardada.score.negro, 0, "el resultado cayó en la fecha del índice viejo");
  assert.equal(w.db.row.history.some((h) => h.finalizedAt === AGOSTO), false,
    "resucitó la fecha que el otro dispositivo deshizo");
});

// ---------------------------------------------------------------------------
// RED 4 — el alias, desde el historial
// ---------------------------------------------------------------------------
test("editar el historial no borra un alias que otro dispositivo agregó", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, { frequentAliases: ["alias.nuevo", "alias.viejo"] });

  assert.equal(await w.run(`guardarPrecioDeHistorial(${JSON.stringify(JULIO)}, '50000')`), true);

  assert.deepEqual(w.db.row.frequentAliases, ["alias.nuevo", "alias.viejo"],
    "el alias del otro dispositivo desapareció");
});

// ---------------------------------------------------------------------------
// RED 5 — el alias, desde Finalizar
// ---------------------------------------------------------------------------
test("finalizar la fecha no borra un alias que otro dispositivo agregó", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, { frequentAliases: ["alias.nuevo", "alias.viejo"] });

  assert.equal(await finalizarFecha(w), true);

  assert.deepEqual(w.db.row.frequentAliases, ["alias.nuevo", "alias.viejo"],
    "el alias del otro dispositivo desapareció");
  assert.equal(w.db.row.history.length, 2, "la fecha no se archivó");
  assert.deepEqual(w.db.row.responses, [], "finalizar dejó de vaciar las respuestas");
});

// ---------------------------------------------------------------------------
// RED 7 — el objetivo ya no existe
// ---------------------------------------------------------------------------
test("editar una fecha que el servidor ya no tiene falla cerrado y no escribe nada", async () => {
  const local = BASE_ROW();
  local.history = [FECHA_JULIO(), FECHA_AGOSTO()];
  const w = makeWorld({ local });

  otroDispositivoEscribe(w, { history: [FECHA_JULIO()] });
  const writesPrevias = w.db.writes;

  const ok = await w.run(`guardarResultadoDeHistorial(${JSON.stringify(AGOSTO)}, 'negro', 3)`);

  assert.equal(ok, false, "avisó éxito sobre una fecha que ya no existe");
  assert.equal(w.db.writes, writesPrevias, "escribió aunque su objetivo había desaparecido");
  assert.equal(w.db.row.history.length, 1, "resucitó la fecha que el otro dispositivo deshizo");
});

// ---------------------------------------------------------------------------
// Contrato de persistFocalizado
// ---------------------------------------------------------------------------
test("cada edición del historial es una sola escritura", async () => {
  const w = makeWorld();
  assert.equal(await w.run(`guardarPrecioDeHistorial(${JSON.stringify(JULIO)}, '70000')`), true);
  assert.equal(w.db.writes, 1);
  assert.equal(w.db.reads, 1);
});

test("sin lectura fresca no se escribe nada", async () => {
  const w = makeWorld({ failRead: true });
  assert.equal(await w.run(`guardarGolesDeHistorial(${JSON.stringify(JULIO)}, 'Ana', 1)`), false);
  assert.equal(w.db.writes, 0);
});

test("sin finalizedAt no se escribe nada", async () => {
  const w = makeWorld();
  assert.equal(await w.run(`guardarPrecioDeHistorial('', '70000')`), false);
  assert.equal(await w.run(`guardarPrecioDeHistorial(undefined, '70000')`), false);
  assert.equal(w.db.writes, 0);
});

test("un guardado rechazado deja el estado global intacto", async () => {
  const w = makeWorld({ failWrite: true });
  // El servidor trae además un jugador y una cancha que este dispositivo no tiene: si
  // los known sets se actualizaran sin que la escritura llegue, mergeKeepingDeletions
  // leería esas altas ajenas como borrados propios y el sondeo no las repondría nunca.
  otroDispositivoEscribe(w, {
    matchInfo: { ...w.db.row.matchInfo, time: "21:00" },
    players: [...w.db.row.players, { name: "Beto", status: "in", team: "blanco", paid: false, number: null, isCaptain: false, pos: null }],
    sedes: [...w.db.row.sedes, { name: "Cancha nueva", address: "" }],
  });

  const foto = `JSON.stringify({
    matchInfo: state.matchInfo,
    history: state.history,
    players: state.players,
    sedes: state.sedes,
    responses: localAvailabilityResponses,
    knownPlayers: [...knownPlayerNames],
    knownSedes: [...knownSedeNames]
  })`;
  const antes = w.run(foto);

  assert.equal(await w.run(`guardarPrecioDeHistorial(${JSON.stringify(JULIO)}, '99999')`), false);

  const despues = w.run(foto);
  assert.equal(despues, antes, "publicó estado que el servidor rechazó");
  assert.equal(w.run(`saving`), false, "dejó el sondeo congelado");
});

test("los players del servidor llegan intactos: esta acción no es su dueña", async () => {
  const w = makeWorld();
  // Otro dispositivo movió una ficha y sumó un jugador. Nada de eso le pertenece a una
  // edición de historial.
  otroDispositivoEscribe(w, {
    players: [
      { name: "Ana", status: "in", team: "negro", paid: false, number: null, isCaptain: false, pos: { x: 11, y: 22 } },
      { name: "Beto", status: "in", team: "blanco", paid: false, number: null, isCaptain: false, pos: { x: 80, y: 40 } },
    ],
  });
  const playersDelServidor = structuredClone(w.db.row.players);

  assert.equal(await w.run(`guardarPrecioDeHistorial(${JSON.stringify(JULIO)}, '70000')`), true);

  assert.deepEqual(w.db.row.players, playersDelServidor,
    "reescribió los players con la copia local en vez de dejar pasar los del servidor");
});

test("la copia local conserva sus posiciones: guardar el historial no mueve las fichas", async () => {
  const w = makeWorld();
  const posLocal = w.run(`JSON.stringify(state.players)`);
  otroDispositivoEscribe(w, {
    players: [{ name: "Ana", status: "in", team: "negro", paid: false, number: null, isCaptain: false, pos: { x: 11, y: 22 } }],
  });

  assert.equal(await w.run(`guardarPrecioDeHistorial(${JSON.stringify(JULIO)}, '70000')`), true);

  assert.equal(w.run(`JSON.stringify(state.players)`), posLocal,
    "adoptó las posiciones del servidor, que es semántica del PR de players/formations");
});

// Consecuencia deliberada de publicar el estado fresco: la copia local adopta lo que
// se acaba de escribir. `players` es la única excepción (ver el test de arriba: `pos`
// es estado de pantalla que se regenera en cada render). Para formations y sedes la
// adopción es lo correcto —son datos del grupo, no de esta pantalla— y además es lo
// que se acaba de mandar al servidor, así que state queda coherente con la fila.
test("publica el resto del estado fresco al confirmarse el guardado", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, {
    matchInfo: { ...w.db.row.matchInfo, time: "19:30" },
    responses: [{ responseId: "r-beto", ownerId: "device-b", ownerIds: ["device-b"], name: "Beto", status: "in", from: "19:00", to: "21:00", paid: true, team: "blanco" }],
    formations: { negro: "2-3-2", blanco: "3-3-1" },
    sedes: [{ name: "Cancha del barrio", address: "Dirección corregida" }],
  });

  assert.equal(await w.run(`guardarGolesDeHistorial(${JSON.stringify(JULIO)}, 'Ana', 1)`), true);

  assert.equal(w.run(`state.matchInfo.time`), "19:30", "no adoptó el matchInfo fresco");
  assert.equal(w.run(`localAvailabilityResponses.length`), 1);
  assert.equal(w.run(`localAvailabilityResponses[0].name`), "Beto", "no adoptó las responses frescas");
  assert.equal(w.run(`state.responses === localAvailabilityResponses`), true,
    "la caché de responses dejó de apuntar a state.responses");
  assert.equal(w.run(`state.formations.negro`), "2-3-2", "no adoptó las formaciones frescas");
  assert.equal(w.run(`state.sedes[0].address`), "Dirección corregida", "no adoptó las canchas frescas");

  // Y lo mismo llegó al servidor, sin pisarse con la copia local.
  assert.deepEqual(w.db.row.formations, { negro: "2-3-2", blanco: "3-3-1" });
  assert.equal(w.db.row.sedes[0].address, "Dirección corregida");
});

// ---------------------------------------------------------------------------
// Lo que cada función guarda
// ---------------------------------------------------------------------------
test("cada edición guarda su campo y sólo el suyo", async () => {
  const w = makeWorld();

  assert.equal(await w.run(`guardarPrecioDeHistorial(${JSON.stringify(JULIO)}, '88000')`), true);
  assert.equal(await w.run(`guardarResultadoDeHistorial(${JSON.stringify(JULIO)}, 'blanco', 4)`), true);
  assert.equal(await w.run(`guardarGolesDeHistorial(${JSON.stringify(JULIO)}, 'Ana', 3)`), true);

  const fecha = w.db.row.history.find((h) => h.finalizedAt === JULIO);
  assert.equal(fecha.matchInfo.priceTotal, "88000");
  assert.equal(fecha.score.blanco, 4);
  assert.equal(fecha.score.negro, 0, "el resultado del otro equipo cambió solo");
  assert.equal(fecha.hasScore, true);
  assert.deepEqual(fecha.goals, { Ana: 3 });
  assert.equal(fecha.matchInfo.date, "2026-07-04", "tocó otro campo del matchInfo archivado");
});

test("cargar cero goles borra al goleador en vez de guardarlo en cero", async () => {
  const w = makeWorld();
  assert.equal(await w.run(`guardarGolesDeHistorial(${JSON.stringify(JULIO)}, 'Ana', 2)`), true);
  assert.deepEqual(w.db.row.history[0].goals, { Ana: 2 });

  assert.equal(await w.run(`guardarGolesDeHistorial(${JSON.stringify(JULIO)}, 'Ana', 0)`), true);
  assert.deepEqual(w.db.row.history[0].goals, {});
});
