// C2 — la gestión de canchas guardadas superpone su intención sobre el estado fresco.
//
// Los tres handlers (alta, edición, baja) mutaban state.sedes y llamaban a persist(),
// que reconcilia con mergeSedesArr(fresh.sedes, state.sedes). Ese merge mete PRIMERO
// los locales en el Map, así que la versión fresca de una cancha que ya existía
// localmente se descartaba: una corrección de dirección ajena se revertía. Y una cancha
// con nombre nuevo que no estaba ni en la copia local ni en knownSedeNames se agregaba,
// así que un rename ajeno se degradaba en dos canchas.
//
// Además los tres se direccionaban por índice del array local. En el estado fresco esa
// misma posición puede ser otra cancha, o ninguna: la identidad ahora es sedeKey.
//
// Mismo mecanismo que historial-partido-focalizado.test.mjs: se ejecuta el código REAL
// de demo.html en un node:vm con un Supabase de mentira. Las tres operaciones son
// funciones nombradas y sin DOM, así que se prueban directo.
//
// Fuera de C2, a propósito: qué pasa con matchInfo.loc o con el historial cuando se
// renombra o se borra la cancha activa. Ninguno de los tres handlers toca esos campos
// hoy —populateLocSelect sólo repinta el <select>—, así que la persistencia se puede
// arreglar sin decidir esa semántica de producto.
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

// Los motivos se extraen del archivo real para que el test no los repita a mano y un
// rename se note.
function extractDeclaration(source, name) {
  const match = source.match(new RegExp(`^(?:const|let)\\s+${name}\\s*=\\s*.+;$`, "m"));
  assert.ok(match, `no encontré la declaración ${name} en demo.html`);
  return match[0];
}

const NEEDED = [
  // fetchServerState delega la lectura cruda: sin esto no resuelve el nombre.
  "leerEstadoDelServidor",
  "fetchServerState",
  "saveState",
  "persistFocalizado",
  "updateKnownSets",
  "sedeKey",
  "buscarSedeEnFresco",
  "sedeOcupadaEnFresco",
  "agregarSede",
  "editarSede",
  "eliminarSede",
];

const DISPOSITIVO_A = "device-a";

const BASE_ROW = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "Cancha del barrio", type: "F8", priceTotal: "190000", alias: "picado.demo" },
  players: [{ name: "Ana", status: "in", team: "negro", paid: false, number: null, isCaptain: false, pos: { x: 50, y: 50 } }],
  history: [{ finalizedAt: "2026-07-04T22:00:00.000Z", matchInfo: { date: "2026-07-04" }, players: [], responses: [], score: { negro: 1, blanco: 0 }, goals: {}, formations: {} }],
  sedes: [
    { name: "Cancha del barrio", address: "Av. Siempreviva 742" },
    { name: "Polideportivo", address: "Calle 8" },
  ],
  formations: { negro: "3-2-2", blanco: "3-2-2" },
  responses: [{ responseId: "r-ana", ownerId: DISPOSITIVO_A, ownerIds: [DISPOSITIVO_A], name: "Ana", status: "in", from: "16:00", to: "18:00", paid: false, team: "negro" }],
  frequentAliases: ["alias.viejo"],
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
    ${extractDeclaration(demo, "SEDE_DUPLICADA")}
    ${extractDeclaration(demo, "SEDE_SIN_OBJETIVO")}
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

const nombres = (sedes) => sedes.map((s) => s.name);
const DUPLICADO = "duplicado";
const BARRIO = "cancha del barrio";
const POLI = "polideportivo";

// ---------------------------------------------------------------------------
// Drivers: reproducen el cuerpo actual de los handlers del DOM.
// ---------------------------------------------------------------------------

// Los resultados cruzan el borde del vm serializados: un objeto creado adentro tiene
// otro Object.prototype y deepStrictEqual lo rechazaría por realm, no por contenido.
// `motivo` viaja como null cuando no hay, para que las aserciones no dependan de si la
// implementación lo omite o lo pone en null.
const traer = async (w, src) => {
  const { ok, motivo } = JSON.parse(await w.run(`(async ()=>{
    const r = await (${src});
    return JSON.stringify({ok: r.ok === true, motivo: r.motivo || null});
  })()`));
  return { ok, motivo };
};

// Los tres reciben la identidad de la cancha, nunca su índice.
const agregarSede = (w, name, address) =>
  traer(w, `agregarSede(${JSON.stringify(name)}, ${JSON.stringify(address)})`);

const editarSede = (w, clave, campo, valor) =>
  traer(w, `editarSede(${JSON.stringify(clave)}, ${JSON.stringify(campo)}, ${JSON.stringify(valor)})`);

const eliminarSede = (w, clave) =>
  traer(w, `eliminarSede(${JSON.stringify(clave)})`);

// ---------------------------------------------------------------------------
// RED 1 — una dirección corregida en otro dispositivo
// ---------------------------------------------------------------------------
test("agregar una cancha no revierte la dirección que otro dispositivo corrigió", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, {
    sedes: [{ name: "Cancha del barrio", address: "Dirección corregida" }, { name: "Polideportivo", address: "Calle 8" }],
  });

  assert.deepEqual(await agregarSede(w, "Cancha nueva", "Ruta 3"), { ok: true, motivo: null });

  const barrio = w.db.row.sedes.find((s) => s.name === "Cancha del barrio");
  assert.equal(barrio.address, "Dirección corregida", "la dirección corregida por el otro dispositivo volvió atrás");
  assert.ok(w.db.row.sedes.some((s) => s.name === "Cancha nueva"), "no se guardó el alta propia");
});

// ---------------------------------------------------------------------------
// RED 2 — un rename hecho en otro dispositivo
// ---------------------------------------------------------------------------
test("editar una cancha no duplica el rename que otro dispositivo guardó", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, {
    sedes: [{ name: "Cancha renombrada", address: "Av. Siempreviva 742" }, { name: "Polideportivo", address: "Calle 8" }],
  });

  assert.deepEqual(await editarSede(w, POLI, "address", "Calle 8 bis"), { ok: true, motivo: null });

  assert.deepEqual(nombres(w.db.row.sedes), ["Cancha renombrada", "Polideportivo"],
    "el rename ajeno se degradó: quedaron el nombre viejo y el nuevo");
  assert.equal(w.db.row.sedes.find((s) => s.name === "Polideportivo").address, "Calle 8 bis",
    "no se guardó la edición propia");
});

// ---------------------------------------------------------------------------
// RED 3 — una cancha eliminada en otro dispositivo
// ---------------------------------------------------------------------------
test("editar una cancha no resucita la que otro dispositivo eliminó", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, { sedes: [{ name: "Cancha del barrio", address: "Av. Siempreviva 742" }] });

  assert.deepEqual(await editarSede(w, BARRIO, "address", "Av. Siempreviva 100"), { ok: true, motivo: null });

  assert.deepEqual(nombres(w.db.row.sedes), ["Cancha del barrio"],
    "resucitó la cancha que el otro dispositivo eliminó");
  assert.equal(w.db.row.sedes[0].address, "Av. Siempreviva 100", "no se guardó la edición propia");
});

// ---------------------------------------------------------------------------
// RED 4 — el mismo nombre desde dos dispositivos
// ---------------------------------------------------------------------------
test("agregar una cancha revalida el duplicado contra el estado fresco", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, {
    sedes: [...BASE_ROW().sedes, { name: "Cancha nueva", address: "La dirección de B" }],
  });
  const writesPrevias = w.db.writes;

  const resultado = await agregarSede(w, "Cancha nueva", "La dirección de A");

  assert.equal(resultado.ok, false, "aceptó un nombre que otro dispositivo ya había usado");
  assert.equal(resultado.motivo, DUPLICADO, "no distinguió el duplicado de un fallo de red");
  assert.equal(w.db.writes, writesPrevias, "escribió pese al duplicado");
  assert.equal(w.db.row.sedes.filter((s) => s.name === "Cancha nueva").length, 1);
  assert.equal(w.db.row.sedes.find((s) => s.name === "Cancha nueva").address, "La dirección de B",
    "pisó la dirección que había guardado el otro dispositivo");
});

// ---------------------------------------------------------------------------
// RED 5 — el índice corrido entre el render y el guardado
// ---------------------------------------------------------------------------
test("la edición cae en la cancha correcta aunque el índice se haya corrido", async () => {
  const w = makeWorld();
  // La lista de A se dibujó con [Cancha del barrio, Polideportivo]: Polideportivo es
  // el índice 1. B borra la primera, así que en el servidor el índice 1 ya no existe.
  otroDispositivoEscribe(w, { sedes: [{ name: "Polideportivo", address: "Calle 8" }] });

  assert.deepEqual(await editarSede(w, POLI, "address", "Calle 8 bis"), { ok: true, motivo: null });

  assert.deepEqual(nombres(w.db.row.sedes), ["Polideportivo"],
    "resucitó la cancha que el otro dispositivo eliminó");
  assert.equal(w.db.row.sedes[0].address, "Calle 8 bis", "la edición no cayó en Polideportivo");
});

// ---------------------------------------------------------------------------
// RED 6 — el objetivo ya no existe
// ---------------------------------------------------------------------------
test("editar una cancha que el servidor ya no tiene falla cerrado y no escribe nada", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, { sedes: [{ name: "Cancha del barrio", address: "Av. Siempreviva 742" }] });
  const writesPrevias = w.db.writes;

  const resultado = await editarSede(w, POLI, "address", "Calle 9");

  assert.equal(resultado.ok, false, "avisó éxito sobre una cancha que ya no existe");
  assert.equal(w.db.writes, writesPrevias, "escribió aunque su objetivo había desaparecido");
  assert.deepEqual(nombres(w.db.row.sedes), ["Cancha del barrio"], "resucitó la cancha eliminada");
});

test("eliminar una cancha que el servidor ya no tiene falla cerrado y no escribe nada", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, { sedes: [{ name: "Cancha del barrio", address: "Av. Siempreviva 742" }] });
  const writesPrevias = w.db.writes;

  const resultado = await eliminarSede(w, POLI);

  assert.equal(resultado.ok, false, "avisó éxito sobre una cancha que ya no existe");
  assert.equal(w.db.writes, writesPrevias, "escribió aunque su objetivo había desaparecido");
  assert.deepEqual(nombres(w.db.row.sedes), ["Cancha del barrio"]);
});

// ---------------------------------------------------------------------------
// RED 7 — sin lectura fresca
// ---------------------------------------------------------------------------
test("sin lectura fresca ninguna operación de canchas escribe", async () => {
  for (const [nombre, operacion] of [
    ["alta", (w) => agregarSede(w, "Cancha nueva", "Ruta 3")],
    ["edición", (w) => editarSede(w, BARRIO, "address", "Otra")],
    ["baja", (w) => eliminarSede(w, BARRIO)],
  ]) {
    const w = makeWorld({ failRead: true });
    const resultado = await operacion(w);
    assert.equal(resultado.ok, false, `${nombre}: avisó éxito sin lectura fresca`);
    assert.equal(w.db.writes, 0, `${nombre}: escribió sin lectura fresca`);
  }
});

// ---------------------------------------------------------------------------
// RED 8 — el guardado rechazado
// ---------------------------------------------------------------------------
test("un guardado rechazado deja el estado global intacto en las tres operaciones", async () => {
  const foto = `JSON.stringify({
    sedes: state.sedes,
    matchInfo: state.matchInfo,
    history: state.history,
    players: state.players,
    formations: state.formations,
    frequentAliases: state.frequentAliases,
    responses: localAvailabilityResponses,
    knownSedes: [...knownSedeNames]
  })`;

  for (const [nombre, operacion] of [
    ["alta", (w) => agregarSede(w, "Cancha nueva", "Ruta 3")],
    ["edición", (w) => editarSede(w, BARRIO, "address", "Otra")],
    ["baja", (w) => eliminarSede(w, BARRIO)],
  ]) {
    const w = makeWorld({ failWrite: true });
    // El servidor trae una cancha que este dispositivo todavía no vio: si el escritor
    // la adopta sin que la escritura llegue, queda estado no confirmado en pantalla.
    otroDispositivoEscribe(w, { sedes: [...BASE_ROW().sedes, { name: "Cancha de B", address: "Ruta 8" }] });

    const antes = w.run(foto);
    const resultado = await operacion(w);
    assert.equal(resultado.ok, false, `${nombre}: avisó éxito con el guardado rechazado`);
    assert.equal(w.run(foto), antes, `${nombre}: publicó estado que el servidor rechazó`);
    assert.equal(w.run(`saving`), false, `${nombre}: dejó el sondeo congelado`);
  }
});

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------
test("cada operación de canchas sólo cambia la cancha que le pertenece", async () => {
  const casos = [
    ["alta", (w) => agregarSede(w, "Cancha nueva", "Ruta 3"), (sedes) => {
      assert.deepEqual(nombres(sedes), ["Cancha del barrio", "Polideportivo", "Cancha nueva"]);
    }],
    ["edición de dirección", (w) => editarSede(w, POLI, "address", "Calle 80"), (sedes) => {
      assert.deepEqual(nombres(sedes), ["Cancha del barrio", "Polideportivo"]);
      assert.equal(sedes[0].address, "Av. Siempreviva 742", "tocó la dirección de otra cancha");
      assert.equal(sedes[1].address, "Calle 80");
    }],
    ["rename", (w) => editarSede(w, POLI, "name", "Polideportivo Municipal"), (sedes) => {
      assert.deepEqual(nombres(sedes), ["Cancha del barrio", "Polideportivo Municipal"]);
      assert.equal(sedes[1].address, "Calle 8", "el rename perdió la dirección");
    }],
    ["baja", (w) => eliminarSede(w, BARRIO), (sedes) => {
      assert.deepEqual(nombres(sedes), ["Polideportivo"]);
    }],
  ];

  for (const [nombre, operacion, comprobar] of casos) {
    const w = makeWorld();
    // El servidor se movió en TODO lo que no son sedes desde la última lectura de este
    // dispositivo. Nada de eso le pertenece a una acción de canchas: tiene que llegar
    // al servidor tal como vino.
    otroDispositivoEscribe(w, {
      matchInfo: { ...w.db.row.matchInfo, time: "21:30", priceTotal: "250000" },
      history: [...w.db.row.history, { finalizedAt: "2026-08-08T22:00:00.000Z", matchInfo: { date: "2026-08-08" }, players: [], responses: [], score: { negro: 2, blanco: 2 }, goals: {}, formations: {} }],
      players: [{ name: "Ana", status: "in", team: "blanco", paid: true, number: null, isCaptain: false, pos: { x: 11, y: 22 } }],
      formations: { negro: "2-3-2", blanco: "3-3-1" },
      responses: [{ responseId: "r-ana", ownerId: DISPOSITIVO_A, ownerIds: [DISPOSITIVO_A], name: "Ana", status: "in", from: "16:00", to: "18:00", paid: true, team: "blanco" }],
      frequentAliases: ["alias.nuevo", "alias.viejo"],
    });
    const restoAntes = JSON.stringify({
      matchInfo: w.db.row.matchInfo, history: w.db.row.history, players: w.db.row.players,
      formations: w.db.row.formations, responses: w.db.row.responses, frequentAliases: w.db.row.frequentAliases,
    });

    assert.equal((await operacion(w)).ok, true, `${nombre}: no guardó`);

    comprobar(w.db.row.sedes);
    const restoDespues = JSON.stringify({
      matchInfo: w.db.row.matchInfo, history: w.db.row.history, players: w.db.row.players,
      formations: w.db.row.formations, responses: w.db.row.responses, frequentAliases: w.db.row.frequentAliases,
    });
    assert.equal(restoDespues, restoAntes, `${nombre}: tocó campos que no le pertenecen`);
  }
});

test("cada operación de canchas es una sola escritura", async () => {
  for (const [nombre, operacion] of [
    ["alta", (w) => agregarSede(w, "Cancha nueva", "Ruta 3")],
    ["edición", (w) => editarSede(w, BARRIO, "address", "Otra")],
    ["baja", (w) => eliminarSede(w, BARRIO)],
  ]) {
    const w = makeWorld();
    assert.equal((await operacion(w)).ok, true, `${nombre}: no guardó`);
    assert.equal(w.db.writes, 1, `${nombre}: no escribió exactamente una vez`);
    assert.equal(w.db.reads, 1, `${nombre}: no leyó exactamente una vez`);
  }
});

// ---------------------------------------------------------------------------
// Duplicados dentro del propio estado fresco
// ---------------------------------------------------------------------------
test("renombrar a una cancha que ya existe en fresco no fusiona las dos", async () => {
  const w = makeWorld();
  const writesPrevias = w.db.writes;

  const resultado = await editarSede(w, POLI, "name", "cancha DEL barrio");

  assert.equal(resultado.ok, false, "aceptó un rename que colapsa dos canchas");
  assert.equal(resultado.motivo, DUPLICADO);
  assert.equal(w.db.writes, writesPrevias, "escribió pese al duplicado");
  assert.deepEqual(nombres(w.db.row.sedes), ["Cancha del barrio", "Polideportivo"]);
});

test("renombrar a un nombre que otro dispositivo acaba de ocupar falla contra fresco", async () => {
  const w = makeWorld();
  otroDispositivoEscribe(w, {
    sedes: [...BASE_ROW().sedes, { name: "Cancha nueva", address: "La de B" }],
  });
  const writesPrevias = w.db.writes;

  const resultado = await editarSede(w, POLI, "name", "Cancha nueva");

  assert.equal(resultado.ok, false, "aceptó un nombre que otro dispositivo ya había usado");
  assert.equal(resultado.motivo, DUPLICADO);
  assert.equal(w.db.writes, writesPrevias, "escribió pese al duplicado");
});
