// PR #37 — "Cambiar jugador" hacia una identidad ya registrada en otro dispositivo.
//
// Bug: con response propia en este dispositivo, entrar a "Cambiar jugador" y elegir una
// identidad que ya tiene response de otro owner/device NO routeaba a claim (el claim es
// para el caso sin response propia) y terminaba mostrando el copy de homónimo
// ("Nombre ya tomado / agregá tu apellido"), imposible de seguir desde una lista cerrada.
//
// Fix (Opción A): el bloque de "identidad ya registrada" pasa de `if(!existingResponse)` a
// `if(!editandoMiEstado)`, y cuando además hay `existingResponse` (= modo "Cambiar
// jugador") bloquea con un mensaje honesto SIN abrir claim, sin llamar
// savePlayerRegistration, sin pisar ni duplicar. Sin response propia sigue routeando a
// claim. Identidad libre: comportamiento intacto (se reutiliza existingResponse.responseId).
//
// NO se toca: claim confirm handler, data model, Supabase, liberación de identidad previa.
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
  throw new Error(`no pude cerrar ${name}`);
}

function confirmHandlerBody() {
  const marker = "document.getElementById('my-status-confirm').onclick = async ()=>";
  const start = demo.indexOf(marker);
  assert.ok(start > -1, "no encontré el handler de #my-status-confirm");
  const open = demo.indexOf("{", start + marker.length);
  let depth = 0;
  for (let i = open; i < demo.length; i++) {
    if (demo[i] === "{") depth++;
    else if (demo[i] === "}" && --depth === 0) return demo.slice(open, i + 1); // "{ ... }"
  }
  throw new Error("no pude cerrar el handler");
}

const FEEDBACK_TITLE = "Esa identidad ya está en uso.";
const FEEDBACK_MSG =
  " Si sos vos, entrá desde el dispositivo donde la registraste o pedile a un organizador que te la libere.";

/* ---------- 1. estructura del handler (control de flujo) ---------- */

test("1. el bloque de identidad tomada cubre también 'Cambiar jugador' (if(!editandoMiEstado))", () => {
  const h = confirmHandlerBody();
  assert.match(h, /if\(!editandoMiEstado\)\{/);
  assert.doesNotMatch(h, /if\(!existingResponse\)\{\s*const idKey/);
  // El matcher de yaRegistrada: name O habitualName normalizado, sin invitados, sin las
  // responses de este dispositivo.
  assert.match(
    h,
    /const yaRegistrada = localAvailabilityResponses\.find\(item=>\s*item && !item\.isGuest && !responseBelongsToCurrentDevice\(item\) && \(\s*item\.name\.toLocaleLowerCase\('es'\)===idKey \|\|\s*\(item\.habitualName && item\.habitualName\.trim\(\)\.toLocaleLowerCase\('es'\)===idKey\)/,
  );
});

test("2. con response propia el sub-branch bloquea antes de claim y de savePlayerRegistration", () => {
  const h = confirmHandlerBody();
  const bloque = h.slice(h.indexOf("if(!editandoMiEstado){"));
  const subBranch = bloque.slice(bloque.indexOf("if(yaRegistrada){"));
  const cierraExistente = subBranch.indexOf("if(existingResponse){");
  const feedback = subBranch.indexOf("showPlayerNameFeedback('error','Esa identidad ya está en uso.'");
  const toast = subBranch.indexOf("ya está en uso en otro dispositivo.");
  const abreClaim = subBranch.indexOf("classList.add('open')");
  const routeClaimId = subBranch.indexOf("pendingClaimResponseId = yaRegistrada.responseId");
  const returnSub = subBranch.indexOf("return;", feedback);

  assert.ok(cierraExistente > -1, "existe el sub-branch if(existingResponse)");
  assert.ok(feedback > cierraExistente && toast > cierraExistente, "feedback + toast dentro del sub-branch");
  assert.ok(returnSub > feedback && returnSub < abreClaim, "el return del bloqueo va ANTES de abrir el claim");
  assert.ok(returnSub < routeClaimId, "el return del bloqueo va ANTES de setear pendingClaimResponseId");
  // El copy exacto aprobado.
  assert.match(subBranch, new RegExp(FEEDBACK_MSG.replace(/[.?()]/g, "\\$&")));
  assert.doesNotMatch(subBranch.slice(0, returnSub), /savePlayerRegistration/);
});

test("3. 'Nombre ya tomado / agregá tu apellido' sigue existiendo para homónimos, pero NO en este bloque", () => {
  // El copy de homónimo sigue vivo (nameCollision / showDuplicateNameFeedback).
  assert.match(demo, /Nombre ya tomado\./);
  assert.match(demo, /agregá tu apellido para diferenciarte/);
  assert.match(demo, /Agregá tu apellido para distinguirte/);
  // ...pero el bloque de identidad tomada no lo usa.
  const h = confirmHandlerBody();
  const bloque = h.slice(h.indexOf("if(!editandoMiEstado){"), h.indexOf("if(mockAvailability !== 'out' && (!from || !to))"));
  assert.doesNotMatch(bloque, /showDuplicateNameFeedback|agregá tu apellido/);
});

/* ---------- 2. comportamiento (vm) ---------- */

function makeConfirmWorld(opts) {
  const {
    inputValue,
    localAvailabilityResponses,
    currentSessionUserId = "device-actual",
    changingRegisteredPlayer = false,
    recurrentPlayers,
    habitualPlayers = [],
    mockAvailability = "in",
    from = "16:00",
    to = "20:00",
  } = opts;

  const calls = { save: [], feedback: [], toast: [], menu: 0, claimOpened: false, dupName: null, claimText: "" };
  const nameInput = {
    value: inputValue,
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
    focus() {},
    setSelectionRange() {},
  };
  const els = {
    "my-status-confirm": { disabled: false, textContent: "Guardar cambios" },
    "my-player-name": nameInput,
    "my-status-from": { value: from, focus() {} },
    "my-status-to": { value: to, focus() {} },
    "claim-player-text": { set textContent(v) { calls.claimText = v; }, get textContent() { return calls.claimText; } },
    "claim-player-overlay": { classList: { add(c) { if (c === "open") calls.claimOpened = true; }, remove() {} } },
  };
  const sandbox = {
    document: { getElementById: (id) => els[id] || { focus() {}, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} } },
    console: { error() {}, warn() {}, log() {} },
    crypto: { randomUUID: () => "uuid-nueva" },
    localStorage: { setItem() {}, getItem() { return null; } },
    Date, Boolean, Set, Array, Object, JSON, String, Number, Promise, Math,
    showPlayerNameFeedback: (kind, title, msg) => calls.feedback.push({ kind, title, msg }),
    hidePlayerNameFeedback: () => {},
    showToast: (m) => calls.toast.push(m),
    showSaveFeedback: () => {},
    showDuplicateNameFeedback: (n) => { calls.dupName = n; },
    renderRecurrentPlayerMenu: () => { calls.menu++; },
    chooseBalancedTeam: () => "negro",
    savePlayerRegistration: async (r) => { calls.save.push(r); return { ok: true }; },
    render: () => {}, renderLocalOrganizer: () => {}, setRegisteredPlayerNameMode: () => {},
    syncPagoControls: () => {}, renderGuestManager: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `let currentSessionUserId = ${JSON.stringify(currentSessionUserId)};
     let changingRegisteredPlayer = ${JSON.stringify(changingRegisteredPlayer)};
     let recurrentPlayers = ${JSON.stringify(recurrentPlayers)};
     let localAvailabilityResponses = ${JSON.stringify(localAvailabilityResponses)};
     let mockAvailability = ${JSON.stringify(mockAvailability)};
     let pendingClaimResponseId = '';
     let currentLocalResponseName = '';
     let state = { habitualPlayers: ${JSON.stringify(habitualPlayers)} };
     const LOCAL_CURRENT_PLAYER_KEY = 'k';
     ${extractFn("responseBelongsToCurrentDevice")}
     globalThis.__confirm = async ()=>${confirmHandlerBody()};`,
    sandbox,
  );
  return { run: () => sandbox.__confirm(), calls, nameInput };
}

const MI_RESPONSE = {
  responseId: "r-mia", ownerId: "device-actual", ownerIds: ["device-actual"],
  name: "Pablo de Achaval", habitualName: "Pablo de Achaval", isGuest: false,
  status: "in", from: "16:00", to: "20:00", paid: false, team: "negro",
};
const RESPONSE_AJENA = {
  responseId: "r-mingo", ownerId: "device-otro", ownerIds: ["device-otro"],
  name: "Mingo el crack", habitualName: "Mingo", isGuest: false,
  status: "in", from: "16:00", to: "20:00", paid: false, team: "blanco",
};

test("4. Cambiar jugador -> identidad tomada en otro dispositivo: bloquea, sin claim, sin guardar", async () => {
  const w = makeConfirmWorld({
    inputValue: "Mingo",
    changingRegisteredPlayer: true,
    localAvailabilityResponses: [MI_RESPONSE, RESPONSE_AJENA],
    recurrentPlayers: ["Pablo de Achaval", "Mingo"],
    habitualPlayers: ["Pablo de Achaval", "Mingo"],
  });
  await w.run();

  assert.equal(w.calls.save.length, 0, "no llama savePlayerRegistration");
  assert.equal(w.calls.claimOpened, false, "no abre el claim overlay");
  assert.equal(w.calls.dupName, null, "no usa el copy de homónimo");
  assert.deepEqual(w.calls.feedback.at(-1), { kind: "error", title: FEEDBACK_TITLE, msg: FEEDBACK_MSG });
  assert.equal(w.calls.toast.at(-1), "“Mingo” ya está en uso en otro dispositivo.");
  assert.equal(w.nameInput._attrs["aria-invalid"], "true");
});

test("5. Cambiar jugador -> identidad tomada aunque la casaca ajena difiera del habitualName", async () => {
  // RESPONSE_AJENA.name = "Mingo el crack", habitualName = "Mingo". El match es por habitualName.
  const w = makeConfirmWorld({
    inputValue: "Mingo",
    changingRegisteredPlayer: true,
    localAvailabilityResponses: [MI_RESPONSE, RESPONSE_AJENA],
    recurrentPlayers: ["Pablo de Achaval", "Mingo"],
    habitualPlayers: ["Pablo de Achaval", "Mingo"],
  });
  await w.run();
  assert.equal(w.calls.save.length, 0);
  assert.equal(w.calls.claimOpened, false);
  assert.equal(w.calls.feedback.at(-1).title, FEEDBACK_TITLE);
});

test("6. Cambiar jugador -> identidad LIBRE: guarda reutilizando existingResponse.responseId", async () => {
  const w = makeConfirmWorld({
    inputValue: "Nacho Duncan",
    changingRegisteredPlayer: true,
    localAvailabilityResponses: [MI_RESPONSE], // nadie tiene "Nacho Duncan"
    recurrentPlayers: ["Pablo de Achaval", "Nacho Duncan"],
    habitualPlayers: ["Pablo de Achaval", "Nacho Duncan"],
  });
  await w.run();

  assert.equal(w.calls.claimOpened, false);
  assert.equal(w.calls.feedback.length, 0, "no hay feedback de error");
  assert.equal(w.calls.save.length, 1, "guarda");
  const saved = w.calls.save[0];
  assert.equal(saved.responseId, "r-mia", "reutiliza el responseId de la response propia");
  assert.equal(saved.name, "Nacho Duncan");
  assert.equal(saved.habitualName, "Nacho Duncan", "la identidad base pasa a la elegida");
});

test("7. regresión: SIN response propia, identidad ya registrada en otro dispositivo -> abre claim", async () => {
  const w = makeConfirmWorld({
    inputValue: "Mingo",
    changingRegisteredPlayer: false,
    localAvailabilityResponses: [RESPONSE_AJENA], // no hay response de device-actual
    recurrentPlayers: ["Pablo de Achaval", "Mingo"],
    habitualPlayers: ["Pablo de Achaval", "Mingo"],
  });
  await w.run();

  assert.equal(w.calls.save.length, 0, "no guarda: routea a claim");
  assert.equal(w.calls.claimOpened, true, "abre el claim overlay");
  assert.equal(w.calls.claimText, "¿Sos Mingo?", "el prompt muestra la identidad base");
  assert.equal(w.calls.feedback.length, 0, "no muestra el feedback de bloqueo");
});

test("8. regresión: registro normal de una identidad libre sigue guardando", async () => {
  const w = makeConfirmWorld({
    inputValue: "Mingo",
    changingRegisteredPlayer: false,
    localAvailabilityResponses: [], // registro desde cero
    recurrentPlayers: ["Pablo de Achaval", "Mingo"],
    habitualPlayers: ["Pablo de Achaval", "Mingo"],
  });
  await w.run();
  assert.equal(w.calls.claimOpened, false);
  assert.equal(w.calls.save.length, 1);
  assert.equal(w.calls.save[0].habitualName, "Mingo");
});
