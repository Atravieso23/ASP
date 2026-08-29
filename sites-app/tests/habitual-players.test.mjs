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

/* ---------- Falta confirmar: quiénes del grupo todavía no respondieron ---------- */

function faltaConfirmarWorld() {
  const context = vm.createContext({
    Set, Array, Object,
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(
    `let state = null; let localAvailabilityResponses = [];
     ${extractFunction(demo, "faltanConfirmar")}
     ${extractFunction(demo, "mensajeFaltaConfirmar")}`,
    context,
  );
  return {
    faltan: (estado, responses) => JSON.parse(vm.runInContext(
      `JSON.stringify(faltanConfirmar(${JSON.stringify(estado)}, ${JSON.stringify(responses)}))`,
      context,
    )),
    mensaje: (estado, responses) => vm.runInContext(
      `mensajeFaltaConfirmar(${JSON.stringify(estado)}, ${JSON.stringify(responses)})`,
      context,
    ),
  };
}

test("faltanConfirmar = habitualPlayers menos las responses no invitadas", () => {
  const w = faltaConfirmarWorld();
  const faltan = w.faltan(
    { habitualPlayers: ["Pablo", "Mingo", "Roca", "Negro"] },
    [
      { name: "Pablo", isGuest: false, status: "in" },
      { name: "Roca", isGuest: false, status: "out" },
    ],
  );
  // Roca respondió "No estoy" -> respondió, no falta. Pablo respondió -> no falta.
  assert.deepEqual(faltan, ["Mingo", "Negro"]);
});

test("un invitado no cuenta como confirmación del habitual del mismo nombre", () => {
  const w = faltaConfirmarWorld();
  const faltan = w.faltan(
    { habitualPlayers: ["Pablo", "Mingo"] },
    [{ name: "Pablo", isGuest: true, invitedBy: "Roca" }],
  );
  assert.deepEqual(faltan, ["Pablo", "Mingo"], "el invitado 'Pablo' no confirma por Pablo habitual");
});

test("faltanConfirmar compara normalizado y muestra el nombre de habitualPlayers", () => {
  const w = faltaConfirmarWorld();
  // La response llega con otra capitalización/espacios: es la misma persona.
  assert.deepEqual(
    w.faltan({ habitualPlayers: ["Félix BV"] }, [{ name: "  félix bv ", isGuest: false }]),
    [],
    "'  félix bv ' responde por 'Félix BV'",
  );
  assert.deepEqual(
    w.faltan({ habitualPlayers: ["Félix BV"] }, []),
    ["Félix BV"],
    "se lista con el casing exacto de habitualPlayers",
  );
});

test("sin habitualPlayers (o key ausente) faltanConfirmar es []", () => {
  const w = faltaConfirmarWorld();
  assert.deepEqual(w.faltan({ habitualPlayers: [] }, [{ name: "x", isGuest: false }]), []);
  assert.deepEqual(w.faltan({}, []), []);
});

test("mensaje: varios faltantes usan coma y 'y' antes del último, con 👀", () => {
  const w = faltaConfirmarWorld();
  assert.equal(
    w.mensaje({ habitualPlayers: ["Pablo", "Mingo", "Roca", "Negro"] }, []),
    "Falta confirmar: Pablo, Mingo, Roca y Negro 👀",
  );
});

test("mensaje: un solo faltante, sin coma ni 'y'", () => {
  const w = faltaConfirmarWorld();
  assert.equal(
    w.mensaje({ habitualPlayers: ["Pablo", "Mingo"] }, [{ name: "Mingo", isGuest: false }]),
    "Falta confirmar: Pablo 👀",
  );
});

test("mensaje vacío cuando no falta nadie", () => {
  const w = faltaConfirmarWorld();
  assert.equal(
    w.mensaje({ habitualPlayers: ["Pablo"] }, [{ name: "Pablo", isGuest: false }]),
    "",
  );
});

test("Falta confirmar es sólo lectura: no toca habitualPlayers, recurrentPlayers ni el botón X", () => {
  const src = [
    extractFunction(demo, "faltanConfirmar"),
    extractFunction(demo, "mensajeFaltaConfirmar"),
    extractFunction(demo, "renderFaltaConfirmar"),
  ].join("\n");
  assert.ok(
    !/habitualPlayers\s*=|recurrentPlayers\s*[=.]|\.splice\(|saveRecurrentPlayers|localStorage|data-delete-recurrent-index/.test(src),
    "la feature no debe escribir habituales/recurrentes ni tocar el borrado del selector",
  );
  // El botón "×" del selector sigue intacto.
  assert.match(demo, /data-delete-recurrent-index="\$\{item\.index\}"/);
  assert.match(demo, /menu\.querySelectorAll\('\[data-delete-recurrent-index\]'\)/);
});

/* ---------- SPIKE: identidad base (habitualName) + nombre visible ---------- */

test("faltanConfirmar descuenta al habitual vía habitualName aunque name sea un apodo", () => {
  const w = faltaConfirmarWorld();
  const faltan = w.faltan(
    { habitualPlayers: ["Pablo", "Mingo"] },
    [{ name: 'Pablo "el Capi"', habitualName: "Pablo", isGuest: false, status: "duda" }],
  );
  assert.deepEqual(faltan, ["Mingo"], "habitualName:'Pablo' descuenta a Pablo; el apodo no aparece");
});

test("faltanConfirmar: datos viejos sin habitualName siguen matcheando por name", () => {
  const w = faltaConfirmarWorld();
  assert.deepEqual(
    w.faltan({ habitualPlayers: ["Pablo", "Mingo"] }, [{ name: "Pablo", isGuest: false }]),
    ["Mingo"],
    "sin habitualName, el fallback a name es idéntico a hoy",
  );
});

test("faltanConfirmar: un apodo SIN habitualName no se arregla mágicamente (fallback documentado)", () => {
  const w = faltaConfirmarWorld();
  assert.deepEqual(
    w.faltan({ habitualPlayers: ["Fran Forrester", "Mingo"] }, [{ name: "Frankie", isGuest: false }]),
    ["Fran Forrester", "Mingo"],
    "Frankie sin habitualName no descuenta a 'Fran Forrester': hay que re-identificarse una vez",
  );
});

test("deriveSelectorNames: una response con habitualName aporta la identidad base, no el nombre visible", () => {
  const derive = selectorWorld();
  const nombres = derive(
    { habitualPlayers: ["Pablo"] },
    [{ name: 'Pablo "el Capi"', habitualName: "Pablo", isGuest: false }],
  );
  assert.deepEqual(nombres, ["Pablo"], "el selector muestra 'Pablo' una vez, no 'Pablo \"el Capi\"'");
});

test("deriveSelectorNames: una response no-habitual SIN habitualName sigue apareciendo en el selector", () => {
  const derive = selectorWorld();
  const nombres = derive({ habitualPlayers: ["Pablo"] }, [{ name: "Suplente", isGuest: false }]);
  assert.deepEqual(nombres, ["Pablo", "Suplente"]);
});

test("al confirmar como habitual 'Pablo', la response guarda habitualName:'Pablo'", () => {
  const handler = extractHandler(demo, "document.getElementById('my-status-confirm').onclick");
  // El valor sale de habitualPlayers (identidad base), nunca de un input libre.
  assert.match(handler, /const habitualExacto = \(state\.habitualPlayers \|\| \[\]\)\.find\(/);
  assert.match(handler, /const habitualName = habitualExacto \|\| \(esMiNombreVisible \? existingResponse\.habitualName : undefined\);/);
  assert.match(handler, /if\(habitualName\) response\.habitualName = habitualName;/);
  // Re-guardar tu propio nombre visible no rebota por el gate de "no encontramos ese jugador".
  assert.match(handler, /const esMiNombreVisible = existingResponse && /);
  assert.match(handler, /!recurrentMatch && !esMiNombreVisible\)\{/);
});

test("los invitados nunca reciben habitualName", () => {
  const alta = extractFunction(demo, "agregarInvitado");
  assert.ok(!/habitualName/.test(alta), "agregarInvitado no debe setear habitualName en ningún caso");
});

test("pago/borrado de invitados sigue resolviendo por responseId", () => {
  assert.match(extractFunction(demo, "marcarPagoDeInvitado"), /item\.responseId===responseId && item\.isGuest/);
  assert.match(extractFunction(demo, "eliminarInvitado"), /item\.responseId===responseId && item\.isGuest/);
});

// guardarNombreVisible corriendo de verdad, con un guardarCambioEnResponses de mentira
// que aplica el mutator sobre las responses provistas.
function nombreVisibleWorld(responses, { device = "dev-1" } = {}) {
  const rows = structuredClone(responses);
  const context = vm.createContext({
    String, Array, Object, Date, Promise, structuredClone,
    console: { error() {}, warn() {}, log() {} },
    localAvailabilityResponses: rows,
    currentSessionUserId: device,
  });
  vm.runInContext(
    `${extractFunction(demo, "responseBelongsToCurrentDevice")}
     function guardarCambioEnResponses(fn){ return Promise.resolve(fn(localAvailabilityResponses)); }
     ${extractFunction(demo, "guardarNombreVisible")}`,
    context,
  );
  return {
    rows,
    run: (nuevo) => vm.runInContext(
      `guardarNombreVisible(${JSON.stringify(nuevo)}).then(r => JSON.stringify(r))`,
      context,
    ).then((s) => JSON.parse(s)),
  };
}

const MI_RESPONSE = () => ({
  responseId: "r1", ownerId: "dev-1", ownerIds: ["dev-1"],
  name: "Pablo", habitualName: "Pablo", status: "duda", paid: null, team: null,
  isGuest: false, updatedAt: "2026-08-01T00:00:00.000Z",
});

test("editar nombre visible cambia sólo name y preserva habitualName/responseId/status/paid/team", async () => {
  const w = nombreVisibleWorld([MI_RESPONSE()]);
  const r = await w.run('Pablo "el Capi"');
  assert.equal(r.ok, true);
  const row = w.rows[0];
  assert.equal(row.name, 'Pablo "el Capi"', "el nombre visible cambió");
  assert.equal(row.habitualName, "Pablo", "la identidad base se preserva");
  assert.equal(row.responseId, "r1");
  assert.equal(row.status, "duda");
  assert.equal(row.paid, null);
  assert.equal(row.team, null);
  assert.deepEqual(row.ownerIds, ["dev-1"]);
  assert.notEqual(row.updatedAt, "2026-08-01T00:00:00.000Z", "updatedAt se toca");
});

test("editar nombre visible resuelve por responseId, no por name", async () => {
  const otro = { ...MI_RESPONSE(), responseId: "r2", ownerId: "dev-2", ownerIds: ["dev-2"], name: "Pablo", habitualName: "Pablo" };
  const w = nombreVisibleWorld([MI_RESPONSE(), otro]);
  await w.run("Pablito");
  assert.equal(w.rows.find((x) => x.responseId === "r1").name, "Pablito", "sólo cambió mi response");
  assert.equal(w.rows.find((x) => x.responseId === "r2").name, "Pablo", "la otra response homónima no se tocó");
});

test("nombre visible vacío vuelve a habitualName", async () => {
  const w = nombreVisibleWorld([{ ...MI_RESPONSE(), name: 'Pablo "el Capi"' }]);
  const r = await w.run("   ");
  assert.equal(r.ok, true);
  assert.equal(w.rows[0].name, "Pablo", "input vacío -> identidad base");
  assert.equal(w.rows[0].habitualName, "Pablo");
});

test("nombre visible vacío sin habitualName deja el nombre actual", async () => {
  const sinHabitual = MI_RESPONSE();
  delete sinHabitual.habitualName;
  sinHabitual.name = "Suplente Ariel";
  const w = nombreVisibleWorld([sinHabitual]);
  await w.run("");
  assert.equal(w.rows[0].name, "Suplente Ariel", "sin identidad base, se conserva el nombre visible");
});

test("editar nombre visible rechaza colisión con otra response no invitada", async () => {
  const otro = { ...MI_RESPONSE(), responseId: "r2", ownerId: "dev-2", ownerIds: ["dev-2"], name: "Colo", habitualName: "Colo" };
  const w = nombreVisibleWorld([MI_RESPONSE(), otro]);
  const r = await w.run("colo");
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "duplicado");
  assert.equal(w.rows[0].name, "Pablo", "no se escribió el nombre en colisión");
});
