// PR #29 — identidad vs "Nombre en la casaca": una response no invitada con habitualName
// no debe duplicarse porque cambió su `name`.
//
// Bug real (Pablo): registra "Pablo de Achaval" en el teléfono, renombra la casaca a
// "Tito", entra desde escritorio (otra sesión anónima = otro ownerId), elige "Pablo de
// Achaval" del selector -> NO aparecía el prompt de claim (matcheaba sólo por `name`, y el
// `name` ahora era "Tito") -> Guardar creaba una segunda response. Resultado: dos jugadores.
//
// Fix: el matching de identidad mira `name` Y `habitualName` (normalizado). Tres puntos:
//   1. renderRecurrentPlayerMenu: el claim del selector encuentra la response aunque su
//      `name` (casaca) sea distinto de la identidad elegida;
//   2. handler de #my-status-confirm: si no hay response propia pero sí una ajena con la
//      misma identidad, enruta al overlay de claim en vez de crear otra;
//   3. savePlayerRegistration: backstop que rechaza el alta si el servidor ya tiene una
//      response no invitada con el mismo habitualName (cubre la carrera vs. la copia local).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar ${name}`);
}

function extractHandler(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `no encontré el handler ${marker}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar ${marker}`);
}

/* ---------- 1. wiring ---------- */

test("el claim del selector matchea por name O habitualName normalizado", () => {
  const menu = extractFunction(demo, "renderRecurrentPlayerMenu");
  assert.match(menu, /item\.name\.toLocaleLowerCase\('es'\)===selKey/);
  assert.match(menu, /item\.habitualName && item\.habitualName\.trim\(\)\.toLocaleLowerCase\('es'\)===selKey/);
  // El prompt muestra la identidad base, no el "Nombre en la casaca".
  assert.match(menu, /¿Sos \$\{selectedResponse\.habitualName \|\| selectedResponse\.name\}\?/);
});

test("el handler de guardar enruta al claim si la identidad ya existe en otro dispositivo", () => {
  const handler = extractHandler(demo, "document.getElementById('my-status-confirm').onclick");
  // PR #37: el bloque cubre elegir identidad en general (registro o "Cambiar jugador"),
  // no sólo el registro sin response propia -> `if(!editandoMiEstado)`.
  assert.match(handler, /if\(!editandoMiEstado\)\{/);
  assert.match(handler, /!responseBelongsToCurrentDevice\(item\) && \(/);
  assert.match(handler, /item\.habitualName && item\.habitualName\.trim\(\)\.toLocaleLowerCase\('es'\)===idKey/);
  assert.match(handler, /pendingClaimResponseId = yaRegistrada\.responseId;/);
  assert.match(handler, /classList\.add\('open'\);\s*return;/);
  // Registro (sin response propia) -> claim. Ese camino no construye la response ni llama
  // a savePlayerRegistration.
  const antesDelClaim = handler.slice(0, handler.indexOf("yaRegistrada"));
  assert.doesNotMatch(antesDelClaim, /savePlayerRegistration/);
  // El claim sólo se abre cuando NO hay response propia; con response propia ("Cambiar
  // jugador") el sub-branch bloquea sin abrirlo (ver cambiar-jugador-identidad-tomada).
  assert.match(handler, /if\(yaRegistrada\)\{\s*if\(existingResponse\)\{/);
});

test("savePlayerRegistration: el backstop de duplicados también mira habitualName", () => {
  const fn = extractFunction(demo, "savePlayerRegistration");
  assert.match(fn, /response\.habitualName \? response\.habitualName\.trim\(\)\.toLocaleLowerCase\('es'\) : ''/);
  assert.match(fn, /habitualNorm && !item\.isGuest && String\(item\.habitualName\|\|''\)\.trim\(\)\.toLocaleLowerCase\('es'\)===habitualNorm/);
  // savePlayerRegistration sigue sin tocar habitualPlayers.
  assert.doesNotMatch(fn, /habitualPlayers/);
});

test("`name` sigue siendo el nombre visual: el render de listas no cambia", () => {
  const sync = extractFunction(demo, "syncLocalAvailabilityWithPlayers");
  assert.match(sync, /responses\.map\(response=>response\.name\.toLocaleLowerCase\('es'\)\)/);
  assert.doesNotMatch(sync, /habitualName/, "las listas del partido se derivan de response.name");
  const glp = extractFunction(demo, "getResponsePlayers");
  assert.doesNotMatch(glp, /habitualName/);
});

test("guardar 'Nombre en la casaca' preserva habitualName (sin cambios)", () => {
  const handler = extractHandler(demo, "document.getElementById('my-status-confirm').onclick");
  assert.match(handler, /const habitualName = editandoMiEstado \? existingResponse\.habitualName : habitualExacto;/);
  assert.match(handler, /if\(habitualName\) response\.habitualName = habitualName;/);
});

/* ---------- 2. funcional: el selector encuentra la response renombrada ---------- */

test("segundo dispositivo: elegir la identidad del selector abre el claim aunque la casaca difiera", () => {
  const src = ["responseBelongsToCurrentDevice", "escapeHtml", "hideRecurrentPlayerMenu", "renderRecurrentPlayerMenu"]
    .map((n) => extractFunction(demo, n)).join("\n");

  const overlayClasses = new Set();
  const claimText = { textContent: "" };
  const menuEl = { hidden: true, innerHTML: "", _buttons: [], querySelectorAll: () => menuEl._buttons };
  const input = { value: "", setAttribute() {} };
  const els = {
    "my-player-name": input,
    "recurrent-player-menu": menuEl,
    "claim-player-text": claimText,
    "claim-player-overlay": { classList: { add: (c) => overlayClasses.add(c) } },
  };
  // El `name` de la response existente (casaca renombrada) NO coincide con la identidad base.
  const otraResponse = {
    isGuest: false, name: "Tito", habitualName: "Pablo de Achaval",
    ownerId: "device-telefono", ownerIds: ["device-telefono"], responseId: "r-pablo",
  };
  const ctx = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(
    `let currentSessionUserId = "device-escritorio";
     let registeringFirstTime = false;
     let changingRegisteredPlayer = true;
     let recurrentPlayers = ["Pablo de Achaval"];
     let localAvailabilityResponses = ${JSON.stringify([otraResponse])};
     let pendingClaimResponseId = null;
     ${src}
     globalThis.__render = renderRecurrentPlayerMenu;`,
    ctx,
  );
  const button = { dataset: { recurrentIndex: "0" }, onclick: null };
  menuEl._buttons = [button];
  ctx.__render();
  assert.equal(typeof button.onclick, "function", "el menú cableó el onclick de la opción");
  button.onclick();

  assert.equal(vm.runInContext("pendingClaimResponseId", ctx), "r-pablo");
  assert.ok(overlayClasses.has("open"), "se abrió el overlay de claim");
  assert.equal(claimText.textContent, "¿Sos Pablo de Achaval?", "el prompt muestra la identidad base");
});

/* ---------- 3. funcional: savePlayerRegistration backstop ---------- */

function makeRegistrationWorld(row, device) {
  const NEEDED = [
    "leerEstadoDelServidor", "fetchServerState", "saveState", "updateKnownSets",
    "syncLocalAvailabilityWithPlayers", "chooseBalancedTeam",
    "responseBelongsToCurrentDevice", "savePlayerRegistration",
  ];
  const db = { row: structuredClone(row), writes: 0 };
  const supabaseClient = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: { data: structuredClone(db.row) }, error: null }); },
        upsert(payload) { db.writes++; db.row = structuredClone(payload.data); return Promise.resolve({ error: null }); },
      };
    },
  };
  const ctx = vm.createContext({
    console: { error() {}, warn() {}, log() {} }, structuredClone,
    Set, Map, Array, Object, JSON, Date, Boolean, Number, String, Promise, Math, Error,
    supabaseClient, ROW_ID: 1,
  });
  vm.runInContext(
    `let state = null; let saving = false; let localAvailabilityResponses = [];
     let knownPlayerNames = new Set(); let knownSedeNames = new Set();
     let currentSessionUserId = ${JSON.stringify(device)};
     ${NEEDED.map((n) => extractFunction(demo, n)).join("\n")}
     state = ${JSON.stringify(row)}; localAvailabilityResponses = state.responses;`,
    ctx,
  );
  return {
    db,
    register: async (response) =>
      JSON.parse(await vm.runInContext(
        `savePlayerRegistration(${JSON.stringify(response)}).then(r => JSON.stringify(r))`, ctx,
      )),
  };
}

const ROW_CON_PABLO = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "C", type: "F8", priceTotal: "", alias: "" },
  responses: [{
    responseId: "r-pablo", ownerId: "device-telefono", ownerIds: ["device-telefono"],
    name: "Tito", habitualName: "Pablo de Achaval", status: "in", from: "16:00", to: "20:00",
    paid: false, team: "negro", isGuest: false, updatedAt: "2026-08-09T12:00:00.000Z",
  }],
  players: [{ name: "Tito", status: "in", team: "negro", paid: false, pos: null, number: null, isCaptain: false }],
  history: [], sedes: [], formations: {}, frequentAliases: [], habitualPlayers: ["Pablo de Achaval", "Juampi Ramos"],
});

test("backstop: NO se crea una 2ª response si el servidor ya tiene esa identidad (otro ownerId)", async () => {
  const w = makeRegistrationWorld(ROW_CON_PABLO(), "device-escritorio");
  const result = await w.register({
    responseId: "r-nueva", ownerId: "device-escritorio", ownerIds: ["device-escritorio"],
    name: "Pablo de Achaval", habitualName: "Pablo de Achaval",
    status: "in", from: "16:00", to: "20:00", paid: false, team: null,
    updatedAt: "2026-08-31T12:00:00.000Z",
  });
  assert.equal(result.ok, false);
  assert.equal(result.duplicate, true);
  assert.equal(w.db.writes, 0, "no escribe: es el mismo jugador desde otro dispositivo");
  assert.equal(w.db.row.responses.length, 1, "sigue habiendo una sola response para esa identidad");
});

test("backstop: NO bloquea a un jugador realmente distinto con otra identidad", async () => {
  const w = makeRegistrationWorld(ROW_CON_PABLO(), "device-escritorio");
  const result = await w.register({
    responseId: "r-juampi", ownerId: "device-escritorio", ownerIds: ["device-escritorio"],
    name: "Juampi Ramos", habitualName: "Juampi Ramos",
    status: "in", from: "16:00", to: "20:00", paid: false, team: null,
    updatedAt: "2026-08-31T12:00:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(w.db.writes, 1);
  assert.equal(w.db.row.responses.length, 2, "dos identidades distintas conviven");
});
