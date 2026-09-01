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
    { name: "Roca", habitualName: "Roca", isGuest: false },
    { name: "Amigo de Roca", isGuest: true },
  ];
  const nombres = derive({ habitualPlayers: ["Pablo", "Roca"] }, responses);
  assert.deepEqual(nombres, ["Pablo", "Roca"]);
  assert.ok(!nombres.includes("Amigo de Roca"), "un invitado no puede aparecer en el selector");
});

test("un habitual y una response con esa misma identidad base cuentan una sola vez", () => {
  const derive = selectorWorld();
  // La response ya se re-identificó: su habitualName llega con otra capitalización.
  const nombres = derive(
    { habitualPlayers: ["Pablo"] },
    [{ name: 'Pablo "el Capi"', habitualName: "pablo", isGuest: false }],
  );
  assert.deepEqual(nombres, ["Pablo"], "dedup por identidad normalizada; el nombre visible no aparece");
});

test("con habitualPlayers configurado, una response legacy SIN habitualName no entra al selector", () => {
  const derive = selectorWorld();
  // El selector representa identidad base, no historial: un name legacy de una response
  // vieja ("Suplente", "Achita", 'Pablo "el Capi"') no ensucia la lista de las 14.
  const nombres = derive(
    { habitualPlayers: ["Pablo", "Ale"] },
    [
      { name: "Suplente", isGuest: false },
      { name: 'Pablo "el Capi"', isGuest: false },
      { name: "Achita", isGuest: false },
    ],
  );
  assert.deepEqual(nombres, ["Ale", "Pablo"], "sólo las identidades base, sin los names legacy");
});

test("sin habitualPlayers sembrado, el selector todavía cae al name de la response (estado pre-seed)", () => {
  const derive = selectorWorld();
  // Retrocompat: antes del seed no hay con qué poblar el selector salvo las responses.
  const nombres = derive({ habitualPlayers: [] }, [{ name: "Suplente", isGuest: false }]);
  assert.deepEqual(nombres, ["Suplente"]);
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

test("Falta confirmar es sólo lectura: no toca habitualPlayers ni recurrentPlayers", () => {
  const src = [
    extractFunction(demo, "faltanConfirmar"),
    extractFunction(demo, "mensajeFaltaConfirmar"),
    extractFunction(demo, "renderFaltaConfirmar"),
  ].join("\n");
  assert.ok(
    !/habitualPlayers\s*=|recurrentPlayers\s*[=.]|\.splice\(|saveRecurrentPlayers|localStorage/.test(src),
    "la feature no debe escribir habituales/recurrentes",
  );
});

test("el menú del selector no tiene acción de borrar identidades base", () => {
  // La lista base se administra por seed/patch, no desde la app: el menú "¿Quién sos?"
  // sólo elige identidad. Nada de "×" ni de eliminarJugador colgando del selector.
  const menu = extractFunction(demo, "renderRecurrentPlayerMenu");
  assert.doesNotMatch(menu, /data-delete-recurrent-index/);
  assert.doesNotMatch(menu, /recurrent-player-delete/);
  assert.doesNotMatch(menu, /eliminarJugador/);
  assert.doesNotMatch(menu, /de la lista compartida/);
  assert.doesNotMatch(demo, /data-delete-recurrent-index/);
  assert.doesNotMatch(demo, /class="recurrent-player-delete"/);
  // El botón de la opción es sólo el de seleccionar.
  assert.match(menu, /class="recurrent-player-select" data-recurrent-index=/);
});

/* ---------- Selector post-release identidad base: sólo las 14, sin ruido legacy ---------- */

const LISTA_BASE_14 = [
  "Pablo de Achaval", "Agustín Travieso", "Segun Campos", "Francisco Sánchez Keenan",
  "Félix de Achaval", "Nacho Duncan", "Joaco el Deiker", "Fran Forrester",
  "Nahuel Gutiérrez", "Félix Beccar", "Agustín Mingolla", "Juampi Ramos",
  "Facu Santos", "Ale",
];

test("con las 14 identidades base sembradas, el selector muestra exactamente esas 14", () => {
  const derive = selectorWorld();
  // Escenario de producción real: 14 habituales + responses legacy del partido en curso
  // sin habitualName (Roca, Negro, Frankie, Nahui, 'Pablo \"el Capi\"', chursi, amigo chursi 1...).
  const responsesLegacy = [
    "Roca", "Negro", "Achita", "Frankie", "Nahui", 'Pablo "el Capi"',
    "chursi", "amigo chursi 1", "Juan", "Felix bv", "Mingo",
  ].map((name) => ({ name, isGuest: false }));
  const nombres = derive({ habitualPlayers: LISTA_BASE_14 }, responsesLegacy);
  assert.deepEqual(nombres, [...LISTA_BASE_14].sort((a, b) => a.localeCompare(b, "es")));
  assert.equal(nombres.length, 14, "ni uno más que las 14 identidades base");
  for (const legacy of ["Roca", "Negro", "Frankie", "Nahui", 'Pablo "el Capi"', "chursi"]) {
    assert.ok(!nombres.includes(legacy), `${legacy} (name legacy) no debe estar en el selector`);
  }
});

test('buscar "Juampi" en el selector encuentra "Juampi Ramos"', () => {
  const derive = selectorWorld();
  const recurrentPlayers = derive({ habitualPlayers: LISTA_BASE_14 }, []);
  // Mismo filtro que renderRecurrentPlayerMenu: substring normalizado.
  const query = "juampi";
  const encontrados = recurrentPlayers.filter((n) => n.toLocaleLowerCase("es").includes(query));
  assert.deepEqual(encontrados, ["Juampi Ramos"]);
});

test("el menú del selector filtra por substring y muestra hasta 20 (entran las 14)", () => {
  const menu = extractFunction(demo, "renderRecurrentPlayerMenu");
  assert.match(menu, /\.filter\(item=>item\.name\.toLocaleLowerCase\('es'\)\.includes\(query\)\)/);
  assert.match(menu, /\.slice\(0,20\)/, "el corte sube de 12 a 20 para que las 14 bases rendericen");
  assert.doesNotMatch(menu, /\.slice\(0,12\)/);
});

test("PR #31: el alta libre desde 'Mi estado' ya no existe (Registro = buscador cerrado)", () => {
  // El afordance de crear un jugador nuevo tipeando texto libre se eliminó por completo.
  assert.doesNotMatch(demo, /id="first-time-player-btn"/);
  assert.doesNotMatch(demo, /Este soy yo/);
  assert.doesNotMatch(demo, /function setFirstTimeRegistration/);
  assert.doesNotMatch(demo, /registeringFirstTime/);
  // El gate de confirmación bloquea siempre un nombre que no matchea el selector.
  const handler = extractHandler(demo, "document.getElementById('my-status-confirm').onclick");
  assert.doesNotMatch(handler, /!registeringFirstTime/);
  assert.match(handler, /if\(!recurrentMatch && !editandoMiEstado\)\{/);
});

test("deriveSelectorNames no toca faltanConfirmar (bloque independiente, sin cambios)", () => {
  const falta = extractFunction(demo, "faltanConfirmar");
  assert.ok(!/recurrentPlayers|deriveSelectorNames/.test(falta), "faltanConfirmar no depende del selector");
  assert.match(falta, /String\(item\.habitualName \|\| item\.name\)/);
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

test("deriveSelectorNames: una response con habitualName fuera de la lista igual ofrece su identidad base", () => {
  const derive = selectorWorld();
  // Un habitual que salió de la lista base (p. ej. quedó sin cupo) pero ya tiene response
  // con habitualName: puede seguir identificándose. Distinto de un name legacy suelto.
  const nombres = derive(
    { habitualPlayers: ["Pablo"] },
    [{ name: "Ex Habitual", habitualName: "Ex Habitual", isGuest: false }],
  );
  assert.deepEqual(nombres, ["Ex Habitual", "Pablo"]);
});

test("al confirmar como habitual 'Pablo', la response guarda habitualName:'Pablo'", () => {
  const handler = extractHandler(demo, "document.getElementById('my-status-confirm').onclick");
  // El valor sale de habitualPlayers (identidad base), nunca de un input libre.
  assert.match(handler, /const habitualExacto = \(state\.habitualPlayers \|\| \[\]\)\.find\(/);
  assert.match(handler, /const habitualName = editandoMiEstado \? existingResponse\.habitualName : habitualExacto;/);
  assert.match(handler, /if\(habitualName\) response\.habitualName = habitualName;/);
  // El dueño editando su propio estado no rebota por el gate de "no encontramos ese nombre".
  assert.match(handler, /const editandoMiEstado = Boolean\(existingResponse\) && !changingRegisteredPlayer;/);
  assert.match(handler, /!recurrentMatch && !editandoMiEstado\)\{/);
  // Guard duro: sin habitualExacto (y fuera de editar la casaca) no se guarda.
  assert.match(handler, /if\(!editandoMiEstado && !habitualExacto\)\{/);
});

test("al elegir identidad, name y habitualName quedan en la identidad base exacta", () => {
  const handler = extractHandler(demo, "document.getElementById('my-status-confirm').onclick");
  // Eligiendo identidad (no editando el estado propio) el texto se normaliza a la entrada
  // exacta del selector (= identidad base sembrada) antes de construir la response.
  assert.match(handler, /if\(recurrentMatch && !editandoMiEstado\) playerName = recurrentMatch;/);
  // La response nace con name = ese mismo string...
  assert.match(handler, /name:\s*playerName,/);
  // ...y habitualName sale de la entrada exacta de habitualPlayers, no de un input libre.
  assert.match(handler, /habitualExacto = \(state\.habitualPlayers \|\| \[\]\)\.find\(h=>String\(h\)\.toLocaleLowerCase\('es'\)===playerName\.toLocaleLowerCase\('es'\)\)/);
  // recurrentPlayers (lo que matchea recurrentMatch) se deriva de habitualPlayers.
  assert.match(extractFunction(demo, "deriveSelectorNames"), /estado\.habitualPlayers/);
});

test("las listas del partido muestran el nombre visible (response.name), no habitualName", () => {
  const getResponsePlayers = extractFunction(demo, "getResponsePlayers");
  assert.match(getResponsePlayers, /response\.name\.toLocaleLowerCase\('es'\)/);
  assert.ok(!/habitualName/.test(getResponsePlayers),
    "el armado de las listas del partido no debe mirar habitualName");
});

test("la copy de identidad del jugador no sugiere 'apodo' como default", () => {
  // Identidad base = nombre real/corto. El desambiguador de homónimos es el apellido.
  assert.match(demo, /agregá tu apellido para diferenciarte/);
  assert.match(demo, /Agregá tu apellido para distinguirte/);
  assert.doesNotMatch(demo, /agregá tu apellido o apodo/);
  assert.doesNotMatch(demo, /Agregá apellido o apodo para distinguirte/);
});

test("los invitados nunca reciben habitualName", () => {
  const alta = extractFunction(demo, "agregarInvitado");
  assert.ok(!/habitualName/.test(alta), "agregarInvitado no debe setear habitualName en ningún caso");
});

test("pago/borrado de invitados sigue resolviendo por responseId", () => {
  assert.match(extractFunction(demo, "marcarPagoDeInvitado"), /item\.responseId===responseId && item\.isGuest/);
  assert.match(extractFunction(demo, "eliminarInvitado"), /item\.responseId===responseId && item\.isGuest/);
});

/* ---------- PR #11: el nombre visible se guarda por el CTA de "Mi estado" ---------- */
// El editor inline `guardarNombreVisible` se retiró: el input "Nombre de jugador" es
// editable y su guardado va por el mismo handler que el estado (savePlayerRegistration).

test("PR #11: no queda el editor de nombre visible separado", () => {
  assert.ok(!/function guardarNombreVisible/.test(demo), "guardarNombreVisible se folded en el CTA");
  assert.ok(!/function renderDisplayNameControl/.test(demo));
  assert.doesNotMatch(demo, /id="display-name-editor"|id="edit-display-name-btn"/);
});

test("editar tu nombre visible desde el CTA preserva la identidad base y no toca el selector", () => {
  const handler = extractHandler(demo, "document.getElementById('my-status-confirm').onclick");
  // editandoMiEstado = ya identificado y sin estar eligiendo/cambiando identidad.
  assert.match(handler, /const editandoMiEstado = Boolean\(existingResponse\) && !changingRegisteredPlayer;/);
  // La identidad base NUNCA cambia editando tu estado (aunque el nombre visible coincida
  // con otra identidad de la lista).
  assert.match(handler, /const habitualName = editandoMiEstado \? existingResponse\.habitualName : habitualExacto;/);
  // Input vacío -> vuelve a la identidad base.
  assert.match(handler, /playerName = existingResponse\.habitualName \|\| existingResponse\.name;/);
  // El selector "¿Quién sos?" se deriva de habitualPlayers: no se le agregan nombres desde acá.
  assert.doesNotMatch(handler, /addRecurrentPlayer/);
});

test("el CTA resuelve la response propia por responseId y preserva paid/team/ownerIds", () => {
  const handler = extractHandler(demo, "document.getElementById('my-status-confirm').onclick");
  assert.match(handler, /responseId:existingResponse\?\.responseId \|\| crypto\.randomUUID\(\)/);
  assert.match(handler, /ownerIds:existingResponse\?\.ownerIds \|\| \[currentSessionUserId\]/);
  assert.match(handler, /paid:mockAvailability==='in' \? \(existingResponse\?\.paid === true\)/);
  assert.match(handler, /team:mockAvailability==='in' \? \(existingResponse\?\.team \|\| chooseBalancedTeam\(playerName\)\)/);
  // Colisión de nombre con otra response no invitada sigue bloqueando.
  assert.match(handler, /item\.responseId!==existingResponse\?\.responseId && item\.name\.toLocaleLowerCase\('es'\)===playerName\.toLocaleLowerCase\('es'\)/);
});

test("tieneCambiosSinGuardar detecta un cambio de nombre visible en el input", () => {
  const fn = extractFunction(demo, "tieneCambiosSinGuardar");
  assert.match(fn, /document\.getElementById\('my-player-name'\)\.value\.trim\(\)/);
  assert.match(fn, /const objetivo = escrito \|\| saved\.habitualName \|\| saved\.name;/);
  assert.match(fn, /return objetivo\.toLocaleLowerCase\('es'\) !== saved\.name\.toLocaleLowerCase\('es'\);/);
});
