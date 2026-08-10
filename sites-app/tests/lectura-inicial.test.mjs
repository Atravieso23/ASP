// PR-D0 — "no pude leer el servidor" ≠ "el estado todavía no existe".
//
// fetchServerState() colapsaba seis situaciones distintas en un único `null`.
// Los nueve writers lo interpretan bien (fallan cerrado), pero init() lo leía
// como "todavía no hay nada" y arrancaba con defaultState(): una copia local
// editable con los defaults de demo. La primera acción del organizador la
// publicaba y borraba el historial real, pisaba matchInfo y reseteaba formations.
//
// La distinción fina importa: `{data:null, error:null}` NO prueba que la fila no
// exista, porque una lectura que RLS oculta llega exactamente igual. Sólo se
// puede afirmar "no hay estado" cuando la fila se leyó y su columna `data` está
// vacía. Todo lo demás es no-confiable y no puede inicializar nada.
//
// Estos tests ejecutan el código REAL de demo.html. La lectura no toca el DOM,
// así que se extrae por NOMBRE y corre en un node:vm con un Supabase de mentira.
// No hay red, no hay navegador y no se toca producción.
//
// init() es un IIFE que sí toca el DOM y no se puede extraer: su rama de fallo
// se verifica sobre el texto del bloque, igual que rendered-html.test.mjs hace
// con los handlers.
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
  "leerEstadoDelServidor",
  "fetchServerState",
  "saveState",
  "updateKnownSets",
  "mergeKeepingDeletions",
  "mergePlayers",
  "mergeSedesArr",
  "syncLocalAvailabilityWithPlayers",
  "persist",
  "defaultState",
  "nextSaturdayISO",
];

// Las seis situaciones que antes devolvían todas `null`, con el motivo que les
// corresponde ahora.
const LECTURAS = {
  errorDeSupabase: { responder: () => ({ data: null, error: { message: "network" } }), motivo: "no-confiable" },
  excepcion: { responder: () => { throw new Error("boom"); }, motivo: "no-confiable" },
  // Fila inexistente y fila oculta por RLS son EL MISMO resultado: indistinguibles.
  filaAusenteOrlsOculta: { responder: () => ({ data: null, error: null }), motivo: "no-confiable" },
  // Acá sí se leyó la fila: se puede afirmar que no tiene estado.
  columnaNula: { responder: () => ({ data: { data: null }, error: null }), motivo: "vacio" },
  objetoVacio: { responder: () => ({ data: { data: {} }, error: null }), motivo: "vacio" },
};

const NO_CONFIABLES = ["errorDeSupabase", "excepcion", "filaAusenteOrlsOculta"];

function makeWorld({ lectura = "ok", row = null, sinCliente = false } = {}) {
  const db = { row: row ? structuredClone(row) : null, writes: 0, reads: 0 };

  const supabaseClient = sinCliente ? null : {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          db.reads++;
          if (lectura !== "ok") return Promise.resolve().then(LECTURAS[lectura].responder);
          return Promise.resolve({ data: { data: structuredClone(db.row) }, error: null });
        },
        upsert(payload) {
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

  return {
    db,
    run: (code) => vm.runInContext(code, context),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context)),
  };
}

const ROW_REAL = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "21:00", loc: "Cancha real", type: "F5", priceTotal: "200000", alias: "picado.real" },
  players: [{ name: "Ana", status: "in", team: "negro", paid: false, pos: { x: 20, y: 30 }, number: null, isCaptain: false }],
  history: [{ finalizedAt: "2026-08-01T00:00:00.000Z", players: [], precio: "150000" }],
  sedes: [{ name: "Cancha real", address: "Calle 1" }],
  formations: { negro: "2-2", blanco: "2-2" },
  responses: [{ responseId: "r1", ownerId: "o1", ownerIds: ["o1"], name: "Ana", status: "in", team: "negro", paid: false }],
  frequentAliases: [],
});

// El bloque de arranque, para las aserciones sobre su rama de fallo.
function bloqueInit() {
  const start = demo.indexOf("(async function init(){");
  assert.notEqual(start, -1, "no encontré el IIFE init en demo.html");
  return demo.slice(start);
}

/* ---------- El contrato de la lectura ---------- */

test("una fila ausente y una fila oculta por RLS no pueden llamarse vacías", async () => {
  const w = makeWorld({ lectura: "filaAusenteOrlsOculta" });
  const r = await w.run("leerEstadoDelServidor()");
  assert.equal(r.motivo, "no-confiable",
    "`data:null` sin error no autoriza a afirmar que la fila no exista: RLS llega igual");
  assert.equal(r.estado, null);
});

test("sólo una fila leída con la columna data vacía se puede afirmar vacía", async () => {
  for (const lectura of ["columnaNula", "objetoVacio"]) {
    const w = makeWorld({ lectura });
    const r = await w.run("leerEstadoDelServidor()");
    assert.equal(r.motivo, "vacio", `${lectura}: la fila se leyó y no tiene estado`);
    assert.equal(r.estado, null);
  }
});

test("los fallos de lectura se reportan como no confiables", async () => {
  for (const lectura of ["errorDeSupabase", "excepcion"]) {
    const w = makeWorld({ lectura });
    const r = await w.run("leerEstadoDelServidor()");
    assert.equal(r.motivo, "no-confiable", `${lectura}: debería ser una lectura no confiable`);
    assert.equal(r.estado, null);
  }
  const sin = makeWorld({ sinCliente: true });
  const r = await sin.run("leerEstadoDelServidor()");
  assert.equal(r.motivo, "no-confiable", "sin cliente de Supabase no hay lectura posible");
  assert.equal(r.estado, null);
});

test("una lectura buena devuelve el estado y el motivo ok", async () => {
  const w = makeWorld({ row: ROW_REAL() });
  const r = await w.run("leerEstadoDelServidor()");
  assert.equal(r.motivo, "ok");
  assert.equal(r.estado.matchInfo.loc, "Cancha real");
});

test("la lectura normaliza igual que antes: el motivo no cambia el estado devuelto", async () => {
  const row = ROW_REAL();
  delete row.formations;
  delete row.frequentAliases;
  row.roster = ["viejo"];
  row.sedes = ["Cancha vieja"];
  const w = makeWorld({ row });
  // Round-trip por JSON: los objetos nacen dentro del vm y no comparten prototipo
  // con los de acá, así que deepEqual estricto los rechazaría por el realm.
  const estado = JSON.parse(await w.run("leerEstadoDelServidor().then(r=>JSON.stringify(r.estado))"));
  assert.deepEqual(estado.formations, {});
  assert.deepEqual(estado.frequentAliases, []);
  assert.equal(estado.roster, undefined, "el plantel fijo se sigue descartando");
  assert.deepEqual(estado.sedes, [{ name: "Cancha vieja", address: "" }]);
});

/* ---------- El arranque falla cerrado con toda lectura no confiable ---------- */

test("el arranque no produce estado editable con una lectura que no sabe qué pasó", () => {
  const init = bloqueInit();
  const asignacion = init.indexOf("state =");
  const setInterval = init.indexOf("setInterval");

  assert.ok(!/state\s*=\s*\(await fetchServerState\(\)\)\s*\|\|\s*defaultState\(\)/.test(init),
    "init sigue colapsando 'no pude leer' y 'no hay nada' en el mismo defaultState()");

  const rama = init.indexOf("'no-confiable'");
  assert.notEqual(rama, -1, "init no contempla las lecturas no confiables");
  assert.ok(rama < asignacion,
    "init mira el motivo DESPUÉS de asignar state: la copia editable ya existe");
  assert.ok(rama < setInterval,
    "init mira el motivo DESPUÉS de arrancar el sondeo");

  // La rama corta con return antes de tocar nada.
  const corte = init.slice(init.indexOf("if(motivo ==="), asignacion);
  assert.match(corte, /return;/, "la rama de fallo no corta el arranque");
  assert.match(corte, /No se pudo leer el partido/, "la rama de fallo no avisa al usuario");
});

test("una lectura RLS-like seguida de una acción no escribe nada", async () => {
  const w = makeWorld({ lectura: "filaAusenteOrlsOculta", row: ROW_REAL() });

  const { estado, motivo } = await w.run("leerEstadoDelServidor()");
  assert.equal(motivo, "no-confiable");
  assert.equal(estado, null, "no hay estado que adoptar");

  // Y si aun así alguien arrancara con defaults e intentara guardar, el servidor
  // real no puede quedar con el historial vacío ni con la sede de demo.
  w.run(`state = defaultState(); localAvailabilityResponses = []; updateKnownSets(state);`);
  const escribio = await w.run("persist()");

  assert.equal(escribio, false, "una acción sobre defaults nunca debería llegar a escribir");
  assert.equal(w.db.writes, 0, "no puede haber ni una escritura");
  assert.equal(w.db.row.history.length, 1, "el historial real sobrevive");
  assert.equal(w.db.row.matchInfo.loc, "Cancha real", "matchInfo real sobrevive");
  assert.deepEqual(w.db.row.formations, { negro: "2-2", blanco: "2-2" }, "las formaciones reales sobreviven");
});

test("un error explícito de lectura se comporta igual: fail-closed y cero escrituras", async () => {
  const w = makeWorld({ lectura: "errorDeSupabase", row: ROW_REAL() });

  const { estado, motivo } = await w.run("leerEstadoDelServidor()");
  assert.equal(motivo, "no-confiable");
  assert.equal(estado, null);

  w.run(`state = defaultState(); localAvailabilityResponses = []; updateKnownSets(state);`);
  const escribio = await w.run("persist()");

  assert.equal(escribio, false);
  assert.equal(w.db.writes, 0, "no puede haber ni una escritura");
  assert.equal(w.db.row.history.length, 1, "el historial real sobrevive");
  assert.equal(w.db.row.matchInfo.loc, "Cancha real", "matchInfo real sobrevive");
});

/* ---------- Los dos arranques que sí proceden ---------- */

test("una fila leída sin estado sigue arrancando con los defaults", async () => {
  for (const lectura of ["columnaNula", "objetoVacio"]) {
    const w = makeWorld({ lectura });
    const { estado, motivo } = await w.run("leerEstadoDelServidor()");
    assert.equal(motivo, "vacio");
    // Es el único caso donde `estado || defaultState()` sigue siendo correcto.
    const arranque = w.json(`(${JSON.stringify(estado)} || defaultState())`);
    assert.equal(arranque.matchInfo.type, "F8");
    assert.deepEqual(arranque.players, []);
    assert.deepEqual(arranque.history, []);
  }
});

test("un estado válido arranca normal, sin pasar por los defaults", async () => {
  const w = makeWorld({ row: ROW_REAL() });
  const { estado, motivo } = await w.run("leerEstadoDelServidor()");
  assert.equal(motivo, "ok");
  const arranque = w.json(`(${JSON.stringify(estado)} || defaultState())`);
  assert.equal(arranque.matchInfo.loc, "Cancha real");
  assert.equal(arranque.matchInfo.type, "F5", "no se coló el F8 de defaultState");
  assert.equal(arranque.history.length, 1);
  assert.equal(estado.players.length, 1);
});

/* ---------- El contrato que ven los nueve writers no cambia ---------- */

test("fetchServerState sigue devolviendo null en todo lo que no sea una lectura buena", async () => {
  for (const lectura of Object.keys(LECTURAS)) {
    const w = makeWorld({ lectura });
    assert.equal(await w.run("fetchServerState()"), null, `${lectura}: el contrato de los writers cambió`);
  }
  const sin = makeWorld({ sinCliente: true });
  assert.equal(await sin.run("fetchServerState()"), null);

  const w = makeWorld({ row: ROW_REAL() });
  const estado = await w.run("fetchServerState()");
  assert.equal(estado.matchInfo.loc, "Cancha real");
});

test("ninguna lectura no confiable puede escribir, venga del motivo que venga", async () => {
  for (const lectura of NO_CONFIABLES) {
    const w = makeWorld({ lectura, row: ROW_REAL() });
    w.run(`state = defaultState(); localAvailabilityResponses = []; updateKnownSets(state);`);
    assert.equal(await w.run("persist()"), false, `${lectura}: escribió`);
    assert.equal(w.db.writes, 0, `${lectura}: hubo escrituras`);
  }
});

/* ---------- Candado de regresión sobre el sondeo ---------- */

test("un error transitorio del sondeo no reemplaza un estado válido por defaults", async () => {
  for (const lectura of NO_CONFIABLES) {
    const w = makeWorld({ lectura, row: ROW_REAL() });
    w.run(`state = ${JSON.stringify(ROW_REAL())}; localAvailabilityResponses = state.responses; updateKnownSets(state);`);

    // El cuerpo del sondeo, sin las guardas de DOM: lee y aborta si no hay estado.
    const siguio = await w.run(`(async ()=>{ const fresh = await fetchServerState(); if(!fresh) return false; state = fresh; return true; })()`);

    assert.equal(siguio, false, `${lectura}: el sondeo siguió adelante con una lectura fallida`);
    assert.equal(w.json("state.matchInfo.loc"), "Cancha real");
    assert.equal(w.json("state.history.length"), 1);
  }
});
