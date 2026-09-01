// PR #31 — "Mi estado" no permite crear jugadores no invitados desde texto libre.
//
// Registro = buscador/selector cerrado sobre identidades existentes (habitualPlayers /
// deriveSelectorNames). Se eliminó el afordance de alta libre "Este soy yo" /
// registeringFirstTime / setFirstTimeRegistration / addRecurrentPlayer. Toda response no
// invitada nueva nace con habitualName (guard duro: exige habitualExacto). El nombre visible
// ("Nombre en la casaca") sigue siendo texto libre SÓLO después de estar identificado.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFn(name) {
  const start = demo.search(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.ok(start > -1, `no encontré la función ${name}`);
  const open = demo.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < demo.length; i++) {
    if (demo[i] === "{") depth++;
    else if (demo[i] === "}" && --depth === 0) return demo.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar la función ${name}`);
}

function confirmHandler() {
  const start = demo.indexOf("document.getElementById('my-status-confirm').onclick = async ()=>{");
  assert.ok(start > -1);
  const end = demo.indexOf("document.getElementById('change-player-btn').onclick", start);
  return demo.slice(start, end);
}

const HELPER_BASE = "Elegí tu nombre de la lista. ¿No estás? Pedí que te agreguen al grupo.";
const HELPER_REGISTRO = `${HELPER_BASE} (Seguro estuviste 👻)`;
const EMPTY_COPY = "No encontramos ese nombre. Pedile a un organizador que te sume al grupo.";
const GATE_COPY = "No encontramos ese nombre. Elegí uno de la lista o pedí que te agreguen al grupo.";

/* ---------- 1. el alta libre ya no existe ---------- */

test("1. #first-time-player-btn / 'Este soy yo' / 'Cancelar' / registeringFirstTime / setFirstTimeRegistration no existen", () => {
  assert.doesNotMatch(demo, /first-time-player-btn/);
  assert.doesNotMatch(demo, /player-picker-mode/);
  assert.doesNotMatch(demo, /Este soy yo/);
  assert.doesNotMatch(demo, /Estás creando un jugador nuevo/);
  assert.doesNotMatch(demo, /registeringFirstTime/);
  assert.doesNotMatch(demo, /function setFirstTimeRegistration/);
  // El cluster muerto del selector local también se fue.
  assert.doesNotMatch(demo, /function addRecurrentPlayer/);
  assert.doesNotMatch(demo, /function saveRecurrentPlayers/);
  assert.doesNotMatch(demo, /LOCAL_RECURRENT_PLAYERS_KEY/);
});

/* ---------- 2. un nombre libre en Registro no crea response ---------- */

test("2. el gate bloquea SIEMPRE un nombre libre y su return va antes de crear la response", () => {
  const h = confirmHandler();
  // Gate sin escape por registeringFirstTime ni por changingRegisteredPlayer.
  assert.match(h, /if\(!recurrentMatch && !editandoMiEstado\)\{/);
  assert.doesNotMatch(h, /!registeringFirstTime/);
  // El bloqueo ocurre ANTES de construir/guardar la response.
  const gateReturn = h.indexOf("if(!recurrentMatch && !editandoMiEstado){");
  const crea = h.indexOf("crypto.randomUUID()");
  const guarda = h.indexOf("savePlayerRegistration(response)");
  assert.ok(gateReturn > -1 && crea > gateReturn, "el gate corta antes del crypto.randomUUID()");
  assert.ok(guarda > gateReturn, "el gate corta antes de savePlayerRegistration");
  // Copy orientativo (no técnico) en el bloque del gate.
  const gateBlock = h.slice(gateReturn, h.indexOf("return;", gateReturn) + 7);
  assert.match(gateBlock, new RegExp(GATE_COPY.replace(/[.?]/g, "\\$&")));
  assert.doesNotMatch(gateBlock, /jugador nuevo|Este soy yo/);
});

/* ---------- 3. guard duro: response nueva exige habitualExacto ---------- */

test("3. una response no invitada nueva sólo se crea con habitualExacto y setea habitualName", () => {
  const h = confirmHandler();
  assert.match(h, /const habitualExacto = \(state\.habitualPlayers \|\| \[\]\)\.find\(h=>String\(h\)\.toLocaleLowerCase\('es'\)===playerName\.toLocaleLowerCase\('es'\)\);/);
  assert.match(h, /const habitualName = editandoMiEstado \? existingResponse\.habitualName : habitualExacto;/);
  assert.match(h, /if\(habitualName\) response\.habitualName = habitualName;/);
  // Guard duro: fuera de editar la casaca, sin habitualExacto no se guarda.
  assert.match(h, /if\(!editandoMiEstado && !habitualExacto\)\{[\s\S]*?return;\s*\}/);
  const guard = h.indexOf("if(!editandoMiEstado && !habitualExacto){");
  const guarda = h.indexOf("savePlayerRegistration(response)");
  assert.ok(guard > -1 && guarda > guard, "el guard corta antes de guardar");
});

/* ---------- 4. helper de Registro ---------- */

const esc = (s) => s.replace(/[.?*+^$()[\]{}|\\]/g, "\\$&");

test("4. el helper de Registro usa el copy aprobado con el remate 👻 (markup + JS)", () => {
  // Markup inicial (estado Registro) + reset del picker llevan el remate.
  assert.match(demo, new RegExp(`id="player-picker-help">${esc(HELPER_REGISTRO)}`));
  const reset = extractFn("resetPlayerPicker");
  assert.match(reset, new RegExp(`help\\.textContent = '${esc(HELPER_REGISTRO)}';`));
  // En setRegisteredPlayerNameMode: la rama anónima (Registro) lleva el remate; la rama
  // "Cambiar jugador" mantiene el copy base (sin remate).
  const mode = extractFn("setRegisteredPlayerNameMode");
  assert.match(mode, new RegExp(`\\}else\\{\\s*help\\.textContent = '${esc(HELPER_REGISTRO)}';`));
  assert.match(mode, new RegExp(`\\}else if\\(ownResponse\\)\\{\\s*help\\.textContent = '${esc(HELPER_BASE)}';`));
  assert.doesNotMatch(mode, /Usá siempre el mismo nombre/);
});

/* ---------- 5. empty state del menú ---------- */

test("5. el empty state del menú de identidades usa el copy aprobado", () => {
  const menu = extractFn("renderRecurrentPlayerMenu");
  assert.match(menu, new RegExp(`recurrent-player-empty">${EMPTY_COPY.replace(/[.?]/g, "\\$&")}`));
  assert.doesNotMatch(menu, /Este soy yo|usar uno nuevo/);
});

test("5b. vm: sin identificar y sin match el menú muestra el empty state orientativo", () => {
  const src = ["responseBelongsToCurrentDevice", "escapeHtml", "hideRecurrentPlayerMenu", "renderRecurrentPlayerMenu"]
    .map(extractFn).join("\n");
  const input = { value: "zzz-no-existe", setAttribute() {} };
  const menu = { hidden: true, innerHTML: "", querySelectorAll: () => [] };
  const ctx = vm.createContext({
    document: { getElementById: (id) => ({ "my-player-name": input, "recurrent-player-menu": menu }[id] || null) },
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(
    `let currentSessionUserId = "d1";
     let changingRegisteredPlayer = false;
     let recurrentPlayers = ["Juampi Ramos", "Pablo de Achaval"];
     let localAvailabilityResponses = [];
     let pendingClaimResponseId = null;
     ${src}
     globalThis.__render = renderRecurrentPlayerMenu;`,
    ctx,
  );
  ctx.__render();
  assert.equal(menu.hidden, false);
  assert.match(menu.innerHTML, /Pedile a un organizador que te sume al grupo/);
  assert.doesNotMatch(menu.innerHTML, /recurrent-player-select/);
});

/* ---------- 6. "Nombre en la casaca" sigue libre post-identificación ---------- */

test("6. identificado: el input es texto libre (editandoMiEstado) y NO abre el menú", () => {
  const h = confirmHandler();
  assert.match(h, /const editandoMiEstado = Boolean\(existingResponse\) && !changingRegisteredPlayer;/);
  // Editar tu estado deja pasar cualquier texto (es el nombre visible) y no toca habitualName.
  assert.match(h, /if\(recurrentMatch && !editandoMiEstado\) playerName = recurrentMatch;/);
  assert.match(h, /playerName = existingResponse\.habitualName \|\| existingResponse\.name;/);
  const menu = extractFn("renderRecurrentPlayerMenu");
  assert.match(menu, /if\(propiaResponse && !changingRegisteredPlayer\)\{ hideRecurrentPlayerMenu\(\); return; \}/);
});

/* ---------- 7. deriveSelectorNames intacto ---------- */

test("7. deriveSelectorNames sigue basado en habitualPlayers + identidades existentes", () => {
  const fn = extractFn("deriveSelectorNames");
  assert.match(fn, /estado\.habitualPlayers/);
  assert.match(fn, /const conHabituales = habituales\.length > 0;/);
  assert.match(fn, /conHabituales \? item\.habitualName : \(item\.habitualName \|\| item\.name\)/);
});

/* ---------- 8. state.habitualPlayers no se muta desde la app ---------- */

test("8. state.habitualPlayers nunca se muta desde el cliente", () => {
  // Ninguna asignación ni mutación de array sobre habitualPlayers (salvo el guard de
  // normalización de lectura: `if(!Array.isArray(parsed.habitualPlayers)) parsed.habitualPlayers = []`).
  assert.doesNotMatch(demo, /\bstate\.habitualPlayers\s*=/);
  assert.doesNotMatch(demo, /habitualPlayers\.(push|pop|shift|unshift|splice|sort)\(/);
  assert.doesNotMatch(demo, /\.habitualPlayers\s*=\s*\[[^\]]/);
});
