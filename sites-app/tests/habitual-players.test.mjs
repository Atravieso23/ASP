// habitualPlayers — miembros estables del grupo, como fuente de verdad COMPARTIDA
// dentro del blob de match_data. No es localStorage, no es una tabla nueva: es una
// key más del JSON que ya viaja al servidor.
//
// El bug de producción: "Limpiar todo" escribía responses:[] al blob compartido, y
// el selector "¿Quién sos?" se derivaba SÓLO de responses. Al limpiar la fecha, la
// lista para identificarse quedaba vacía para todos. Con habitualPlayers persistente
// el selector sobrevive a una fecha vacía.
//
// Reglas que estos tests fijan:
//   1. limpiar la fecha (responses/players/formations) NO borra habitualPlayers;
//   2. el selector sigue poblado aunque responses=[];
//   3. los invitados (isGuest:true) nunca entran al selector ni a los habituales;
//   4. otro dispositivo lee los mismos habituales desde el servidor (blob compartido);
//   + retrocompat: un blob viejo sin la key se normaliza a [];
//   + gestión explícita: ninguna alta agrega solo a habitualPlayers.
//
// Igual que lectura-inicial.test.mjs, ejecutan el código REAL de demo.html: se extrae
// la función por nombre y corre en un node:vm. Los handlers que tocan el DOM se
// verifican sobre el texto del bloque. No hay red, no hay navegador, no se toca prod.
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

// Bloque de un handler asignado (p. ej. `clearConfirmBtn.onclick = async ()=>{ ... }`),
// para las aserciones de texto sobre código que toca el DOM y no se puede extraer.
function extractHandler(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `no encontré el handler ${marker} en demo.html`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar el handler ${marker}`);
}

/* ---------- deriveSelectorNames: el corazón del selector ---------- */

function selectorWorld() {
  const context = vm.createContext({
    Set, Array, Object, JSON,
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(
    `let state = null; let localAvailabilityResponses = [];
     ${extractFunction(demo, "deriveSelectorNames")}`,
    context,
  );
  return (estado, responses) =>
    JSON.parse(vm.runInContext(
      `JSON.stringify(deriveSelectorNames(${JSON.stringify(estado)}, ${JSON.stringify(responses)}))`,
      context,
    ));
}

test("el selector sigue poblado con responses=[]: los habituales lo sostienen", () => {
  const derive = selectorWorld();
  const nombres = derive({ habitualPlayers: ["Pablo", "Mingo", "Roca"] }, []);
  assert.deepEqual(nombres, ["Mingo", "Pablo", "Roca"], "con la fecha vacía el selector = habituales, ordenados");
});

test("los invitados nunca entran al selector ni contaminan la lista", () => {
  const derive = selectorWorld();
  const responses = [
    { name: "Roca", isGuest: false },
    { name: "Amigo de Roca", isGuest: true },
  ];
  const nombres = derive({ habitualPlayers: ["Pablo"] }, responses);
  assert.deepEqual(nombres, ["Pablo", "Roca"]);
  assert.ok(!nombres.includes("Amigo de Roca"), "un invitado no puede aparecer en el selector");
});

test("un habitual y una response del mismo nombre cuentan una sola vez", () => {
  const derive = selectorWorld();
  // La response llega con otra capitalización; el habitual gana el display.
  const nombres = derive({ habitualPlayers: ["Pablo"] }, [{ name: "pablo", isGuest: false }]);
  assert.deepEqual(nombres, ["Pablo"], "dedup por nombre normalizado, sin duplicar a Pablo");
});

test("una response no invitada que no es habitual igual aparece en el selector", () => {
  const derive = selectorWorld();
  // Alguien se anotó esta fecha sin ser habitual: tiene que poder identificarse hoy,
  // pero eso NO lo vuelve habitual (no se escribe en habitualPlayers).
  const nombres = derive({ habitualPlayers: ["Pablo"] }, [{ name: "Suplente", isGuest: false }]);
  assert.deepEqual(nombres, ["Pablo", "Suplente"]);
});

/* ---------- La lectura del servidor: normalización y retrocompat ---------- */

function readerWorld({ row }) {
  const db = { row: structuredClone(row) };
  const supabaseClient = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          return Promise.resolve({ data: { data: structuredClone(db.row) }, error: null });
        },
      };
    },
  };
  const context = vm.createContext({
    structuredClone, Set, Array, Object, JSON, Date, Promise, Error,
    console: { error() {}, warn() {}, log() {} },
    supabaseClient, ROW_ID: 1,
  });
  vm.runInContext(extractFunction(demo, "leerEstadoDelServidor"), context);
  return () => vm.runInContext(
    "leerEstadoDelServidor().then(r=>JSON.stringify(r.estado))",
    context,
  ).then((s) => JSON.parse(s));
}

test("un blob viejo sin habitualPlayers se normaliza a [] (retrocompat)", async () => {
  const read = readerWorld({ row: {
    matchInfo: { teamName: "ASP" }, players: [], history: [], sedes: [],
    formations: {}, responses: [], frequentAliases: [],
    // sin habitualPlayers a propósito
  } });
  const estado = await read();
  assert.deepEqual(estado.habitualPlayers, [], "la key ausente arranca vacía, no undefined");
});

test("otro dispositivo lee los mismos habituales desde el servidor", async () => {
  const habituales = ["Pablo", "Mingo", "Roca", "Negro"];
  const read = readerWorld({ row: {
    matchInfo: { teamName: "ASP" }, players: [], history: [], sedes: [],
    formations: {}, responses: [], frequentAliases: [],
    habitualPlayers: structuredClone(habituales),
  } });
  const estado = await read();
  assert.deepEqual(estado.habitualPlayers, habituales, "la lista viaja intacta en el blob compartido");
  // Y sobre ese estado del servidor, con la fecha vacía, el selector se puebla igual.
  const derive = selectorWorld();
  assert.deepEqual(derive({ habitualPlayers: estado.habitualPlayers }, []),
    ["Mingo", "Negro", "Pablo", "Roca"]);
});

/* ---------- Limpiar todo y finalizar: preservación por construcción ---------- */

test("Limpiar todo vacía la fecha pero no toca habitualPlayers", () => {
  const bloque = extractHandler(demo, "clearConfirmBtn.onclick");
  assert.match(bloque, /responses:\s*\[\],\s*players:\s*\[\],\s*formations:\s*\{\}/,
    "el handler tiene que seguir vaciando responses/players/formations");
  assert.ok(!/habitualPlayers/.test(bloque),
    "el handler de limpiar NO debe mencionar habitualPlayers: se preserva vía {...fresh}");
  // Semántica del spread que usa el handler: lo no listado sobrevive.
  const fresh = { habitualPlayers: ["Pablo", "Mingo"], responses: [{ name: "x" }], players: [{}], formations: { a: 1 }, sedes: ["S"] };
  const next = { ...fresh, responses: [], players: [], formations: {} };
  assert.deepEqual(next.habitualPlayers, ["Pablo", "Mingo"], "los habituales sobreviven a limpiar la fecha");
  assert.deepEqual(next.responses, []);
  assert.deepEqual(next.sedes, ["S"], "y la cancha también, como ya era");
});

test("finalizar arrastra habitualPlayers desde la lectura fresca", () => {
  const bloque = extractHandler(demo, "finalizeConfirmBtn.onclick");
  assert.match(bloque, /habitualPlayers:\s*fresh\.habitualPlayers/,
    "finalizar debe tomar habitualPlayers de fresh, como frequentAliases, para no pisar una edición ajena");
});

/* ---------- Gestión explícita: nada agrega solo a habitualPlayers ---------- */

test("ninguna alta agrega automáticamente a habitualPlayers", () => {
  // Altas y bajas de habituales son explícitas/controladas. El alta de un jugador
  // (savePlayerRegistration) no debe escribir en habitualPlayers, ni el alta de
  // invitados. Si alguien cablea auto-add acá, este test cae.
  const alta = extractFunction(demo, "savePlayerRegistration");
  assert.ok(!/habitualPlayers/.test(alta),
    "registrarse NO debe tocar habitualPlayers: la pertenencia se gestiona aparte");
});
