// feat/recordar-jugador-dispositivo — "Recordar este jugador en este dispositivo".
//
// Preferencia LOCAL y optativa: cada navegador recuerda, si el usuario lo marca, al último
// jugador habitual elegido. Guarda SÓLO la identidad habitual canónica en localStorage (clave
// propia, distinta de LOCAL_CURRENT_PLAYER_KEY). No vincula celular/desktop, no crea cuentas y
// NO da acceso a la response de otro dispositivo: el claim actual sigue siendo obligatorio.
//
// Código REAL de demo.html en node:vm con un localStorage y un DOM de mentira. Sin red, sin
// Supabase, cero escrituras reales.
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

function extractConst(source, name) {
  const m = source.match(new RegExp(`^const\\s+${name}\\s*=.*;$`, "m"));
  assert.ok(m, `no encontré la constante ${name} en demo.html`);
  return m[0];
}

const KEY = "asp_remembered_habitual_v1";

/* ═════════════════ 1. Helpers de la preferencia local ═════════════════ */

function makeWorld({ stored = null, habituales = [] } = {}) {
  const store = new Map();
  if (stored !== null) store.set(KEY, stored);
  const storage = {
    removed: [],
    written: [],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem(k, v) { store.set(k, String(v)); storage.written.push([k, String(v)]); },
    removeItem(k) { store.delete(k); storage.removed.push(k); },
    raw: () => store.get(KEY) ?? null,
  };
  const ctx = vm.createContext({ localStorage: storage, String, Array });
  vm.runInContext(
    `${extractConst(demo, "LOCAL_REMEMBERED_HABITUAL_KEY")}
     let state = ${JSON.stringify({ habitualPlayers: habituales })};
     ${extractFunction(demo, "leerJugadorRecordado")}
     ${extractFunction(demo, "guardarJugadorRecordado")}
     ${extractFunction(demo, "olvidarJugadorRecordado")}
     globalThis.__read = leerJugadorRecordado;
     globalThis.__save = guardarJugadorRecordado;
     globalThis.__forget = olvidarJugadorRecordado;`,
    ctx,
  );
  return {
    storage,
    read: (estado) => ctx.__read(estado),
    save: (n) => ctx.__save(n),
    forget: (n) => ctx.__forget(n),
  };
}

test("la clave local nueva es distinta de la clave de sesión existente", () => {
  assert.equal(extractConst(demo, "LOCAL_REMEMBERED_HABITUAL_KEY"), "const LOCAL_REMEMBERED_HABITUAL_KEY = 'asp_remembered_habitual_v1';");
  assert.notEqual(KEY, "asp_current_player_demo_v1");
});

test("leerJugadorRecordado conserva el casing canónico del roster", () => {
  const w = makeWorld({ stored: "  alejandro leupold de souza jr. ", habituales: ["Alejandro Leupold de Souza Jr."] });
  assert.equal(w.read(), "Alejandro Leupold de Souza Jr.");
  assert.deepEqual(w.storage.removed, []);
});

test("leerJugadorRecordado borra una identidad que ya salió del roster", () => {
  const w = makeWorld({ stored: "Ale", habituales: ["Pablo de Achaval"] });
  assert.equal(w.read(), "");
  assert.deepEqual(w.storage.removed, [KEY]);
  assert.equal(w.storage.raw(), null);
});

test("leerJugadorRecordado sin preferencia devuelve '' y no escribe ni borra nada", () => {
  const w = makeWorld({ habituales: ["Ale"] });
  assert.equal(w.read(), "");
  assert.deepEqual(w.storage.removed, []);
  assert.deepEqual(w.storage.written, []);
});

test("leerJugadorRecordado no rompe con localStorage que lanza o con roster ausente", () => {
  const ctx = vm.createContext({
    localStorage: { getItem() { throw new Error("bloqueado"); }, removeItem() { throw new Error("bloqueado"); } },
    String, Array,
  });
  vm.runInContext(
    `${extractConst(demo, "LOCAL_REMEMBERED_HABITUAL_KEY")}
     let state = {};
     ${extractFunction(demo, "leerJugadorRecordado")}
     globalThis.__read = leerJugadorRecordado;`,
    ctx,
  );
  assert.equal(ctx.__read(), "");
  const w = makeWorld({ stored: "Ale", habituales: undefined });
  assert.equal(w.read({}), "");
});

test("guardarJugadorRecordado guarda la identidad CANÓNICA (no lo tipeado) y sólo si está en el roster", () => {
  const w = makeWorld({ habituales: ["Félix BV", "Ale"] });
  assert.equal(w.save("  félix bv "), true);
  assert.equal(w.storage.raw(), "Félix BV");
  assert.deepEqual(w.storage.written, [[KEY, "Félix BV"]]);
});

test("guardarJugadorRecordado rechaza vacío o ausente del roster sin escribir", () => {
  const w = makeWorld({ habituales: ["Ale"] });
  assert.equal(w.save(""), false);
  assert.equal(w.save("   "), false);
  assert.equal(w.save("Nadie"), false);
  assert.deepEqual(w.storage.written, []);
});

test("olvidarJugadorRecordado borra sólo si el recuerdo es de esa identidad", () => {
  const w = makeWorld({ stored: "Ale", habituales: ["Ale", "Fran"] });
  assert.equal(w.forget("Fran"), false, "otra identidad: no toca nada");
  assert.deepEqual(w.storage.removed, []);
  assert.equal(w.storage.raw(), "Ale");
  assert.equal(w.forget("  ale "), true);
  assert.deepEqual(w.storage.removed, [KEY]);
  assert.equal(w.storage.raw(), null);
});

test("olvidarJugadorRecordado sin recuerdo o con nombre vacío no hace nada", () => {
  const w = makeWorld({ habituales: ["Ale"] });
  assert.equal(w.forget("Ale"), false);
  assert.equal(w.forget(""), false);
  assert.deepEqual(w.storage.removed, []);
});

test("los helpers de la preferencia no tocan estado compartido ni ownership", () => {
  for (const name of ["leerJugadorRecordado", "guardarJugadorRecordado", "olvidarJugadorRecordado"]) {
    const fn = extractFunction(demo, name);
    assert.doesNotMatch(fn, /persistFocalizado|savePlayerRegistration|guardarCambioEnResponses|saveState|supabase|upsert/i);
    assert.doesNotMatch(fn, /ownerId|ownerIds/);
    assert.doesNotMatch(fn, /state\.\w+\s*=|\.responses\s*=|\.habitualPlayers\s*=/);
  }
});

test("la preferencia guarda sólo un string: nada de response, pago, disponibilidad ni ownerId", () => {
  const w = makeWorld({ habituales: ["Ale"] });
  w.save("Ale");
  assert.equal(w.storage.written.length, 1);
  assert.equal(typeof w.storage.written[0][1], "string");
  assert.equal(w.storage.written[0][1], "Ale");
});

/* ═════════════════ 2. Checkbox contextual junto a la identidad ═════════════════ */

test("el checkbox de recuerdo tiene el copy exacto, sin texto auxiliar, y está entre la identidad y el Estado", () => {
  assert.match(demo, /<input type="checkbox" id="remember-player-device">/);
  assert.match(demo, /<label for="remember-player-device">Recordar este jugador en este dispositivo<\/label>/);
  assert.equal((demo.match(/>Recordar este jugador en este dispositivo</g) || []).length, 1, "único texto nuevo visible (markup)");
  const desde = demo.indexOf('id="my-player-name"');
  const hasta = demo.indexOf('<span class="my-status-label">Estado</span>');
  const zona = demo.slice(desde, hasta);
  assert.match(zona, /id="remember-player-device-field"/, "debajo de la identidad y antes del Estado");
  const campo = demo.match(/<div class="remember-player-field"[^>]*id="remember-player-device-field"[^>]*>[\s\S]*?<\/div>/)[0];
  assert.match(campo, /\shidden/, "arranca oculto hasta que hay una identidad válida");
  assert.doesNotMatch(campo, /<p |<small|help|title=/i, "sin texto auxiliar");
});

function makeUiWorld({ habituales = ["Ale", "Félix BV"], stored = null, propia = null, changing = false, inputValue = "" } = {}) {
  const store = new Map();
  if (stored !== null) store.set(KEY, stored);
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    raw: () => store.get(KEY) ?? null,
  };
  const els = {
    "my-player-name": { value: inputValue },
    "remember-player-device-field": { hidden: true },
    "remember-player-device": { checked: false },
  };
  const calls = { server: 0 };
  const ctx = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    localStorage: storage, String, Array, Boolean,
    console: { error() {}, warn() {}, log() {} },
    persistFocalizado: () => { calls.server++; return Promise.resolve(true); },
    savePlayerRegistration: () => { calls.server++; },
    saveState: () => { calls.server++; },
  });
  vm.runInContext(
    `${extractConst(demo, "LOCAL_REMEMBERED_HABITUAL_KEY")}
     let state = ${JSON.stringify({ habitualPlayers: habituales })};
     let changingRegisteredPlayer = ${JSON.stringify(changing)};
     function responseDelJugadorActual(){ return ${JSON.stringify(propia)}; }
     ${extractFunction(demo, "leerJugadorRecordado")}
     ${extractFunction(demo, "guardarJugadorRecordado")}
     ${extractFunction(demo, "olvidarJugadorRecordado")}
     ${extractFunction(demo, "identidadParaRecordar")}
     ${extractFunction(demo, "renderRememberPlayerDevice")}
     ${extractFunction(demo, "onRememberPlayerDeviceChange")}
     globalThis.__render = renderRememberPlayerDevice;
     globalThis.__change = onRememberPlayerDeviceChange;
     globalThis.__identidad = identidadParaRecordar;`,
    ctx,
  );
  return { els, storage, calls, render: () => ctx.__render(), change: () => ctx.__change(), identidad: () => ctx.__identidad() };
}

test("identidad elegida en Registro (nombre exacto del roster) muestra el checkbox DESMARCADO", () => {
  const w = makeUiWorld({ inputValue: "  félix bv " });
  w.render();
  assert.equal(w.els["remember-player-device-field"].hidden, false);
  assert.equal(w.els["remember-player-device"].checked, false);
  assert.equal(w.identidad(), "Félix BV", "canónica, no lo tipeado");
});

test("si este navegador ya recuerda a esa identidad, el checkbox aparece MARCADO", () => {
  const w = makeUiWorld({ stored: "Félix BV", inputValue: "Félix BV" });
  w.render();
  assert.equal(w.els["remember-player-device"].checked, true);
});

test("recordar a OTRA persona no marca el checkbox de esta identidad", () => {
  const w = makeUiWorld({ stored: "Ale", inputValue: "Félix BV" });
  w.render();
  assert.equal(w.els["remember-player-device"].checked, false);
});

test("nombre libre / no habitual / input vacío: el checkbox queda oculto", () => {
  for (const inputValue of ["", "Nadie", "Fél"]) {
    const w = makeUiWorld({ inputValue });
    w.render();
    assert.equal(w.els["remember-player-device-field"].hidden, true, `oculto con "${inputValue}"`);
    assert.equal(w.els["remember-player-device"].checked, false);
  }
});

test("identificado: usa la identidad base de su response (no la casaca escrita en el input)", () => {
  const w = makeUiWorld({ propia: { name: "Tito", habitualName: "Ale" }, inputValue: "Tito" });
  w.render();
  assert.equal(w.identidad(), "Ale");
  assert.equal(w.els["remember-player-device-field"].hidden, false);
});

test("identificado con identidad ya fuera del roster: oculto", () => {
  const w = makeUiWorld({ habituales: ["Fran"], propia: { name: "Tito", habitualName: "Ale" }, inputValue: "Tito" });
  w.render();
  assert.equal(w.els["remember-player-device-field"].hidden, true);
});

test("'Cambiar jugador': usa lo escrito en el buscador, no la response propia", () => {
  const w = makeUiWorld({ propia: { name: "Ale", habitualName: "Ale" }, changing: true, inputValue: "Félix BV" });
  w.render();
  assert.equal(w.identidad(), "Félix BV");
});

test("marcar guarda SÓLO la preferencia local canónica: sin escritura al servidor", () => {
  const w = makeUiWorld({ inputValue: "félix bv" });
  w.render();
  w.els["remember-player-device"].checked = true;
  w.change();
  assert.equal(w.storage.raw(), "Félix BV");
  assert.equal(w.calls.server, 0);
});

test("desmarcar borra la preferencia local de esa identidad y nada más", () => {
  const w = makeUiWorld({ stored: "Félix BV", inputValue: "Félix BV" });
  w.render();
  w.els["remember-player-device"].checked = false;
  w.change();
  assert.equal(w.storage.raw(), null);
  assert.equal(w.calls.server, 0);
  // desmarcar mientras el recuerdo es de otra persona no lo pisa
  const otro = makeUiWorld({ stored: "Ale", inputValue: "Félix BV" });
  otro.els["remember-player-device"].checked = false;
  otro.change();
  assert.equal(otro.storage.raw(), "Ale");
});

test("el cambio del checkbox con una identidad inválida no guarda nada", () => {
  const w = makeUiWorld({ inputValue: "Nadie" });
  w.els["remember-player-device"].checked = true;
  w.change();
  assert.equal(w.storage.raw(), null);
});

test("el handler y el render del checkbox no escriben estado compartido ni ownership ni disparan claim/toast", () => {
  for (const name of ["identidadParaRecordar", "renderRememberPlayerDevice", "onRememberPlayerDeviceChange"]) {
    const fn = extractFunction(demo, name);
    assert.doesNotMatch(fn, /persistFocalizado|savePlayerRegistration|guardarCambioEnResponses|saveState|upsert|supabase/i);
    assert.doesNotMatch(fn, /ownerId|ownerIds|pendingClaimResponseId|claim-player-overlay|showToast|showSaveFeedback/);
    assert.doesNotMatch(fn, /mockAvailability|currentLocalResponseName\s*=/);
  }
});

test("wiring: el checkbox se re-evalúa al escribir, al elegir del menú y en cada renderIdentityHeader", () => {
  assert.match(demo, /getElementById\('remember-player-device'\)\.addEventListener\('change', onRememberPlayerDeviceChange\)/);
  assert.match(demo, /myStatusCard\.addEventListener\('input', onMyStatusCardInputRemember\)/);
  assert.match(extractFunction(demo, "renderIdentityHeader"), /renderRememberPlayerDevice\(\);/);
  assert.match(extractFunction(demo, "renderRecurrentPlayerMenu"), /renderRememberPlayerDevice\(\);/);
  assert.match(extractFunction(demo, "refreshFromServer"), /renderRememberPlayerDevice\(\);/);
});

/* ═════════════════ 3. Restauración segura al abrir ═════════════════ */

function makeRestoreWorld({ habituales = ["Alejandro", "Félix BV"], stored = null, propia = null, responses = [], inputValue = "", focused = false } = {}) {
  const store = new Map();
  if (stored !== null) store.set(KEY, stored);
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    raw: () => store.get(KEY) ?? null,
  };
  const input = { value: inputValue };
  const doc = { getElementById: (id) => (id === "my-player-name" ? input : null), activeElement: focused ? input : null };
  const calls = { server: 0, claim: 0, save: 0 };
  const ctx = vm.createContext({
    document: doc, localStorage: storage, String, Array, Boolean,
    console: { error() {}, warn() {}, log() {} },
    persistFocalizado: () => { calls.server++; return Promise.resolve(true); },
    savePlayerRegistration: () => { calls.save++; },
    saveState: () => { calls.server++; },
    abrirClaim: () => { calls.claim++; },
  });
  vm.runInContext(
    `${extractConst(demo, "LOCAL_REMEMBERED_HABITUAL_KEY")}
     let state = ${JSON.stringify({ habitualPlayers: habituales, responses })};
     let currentLocalResponseName = '';
     let pendingClaimResponseId = '';
     let changingRegisteredPlayer = false;
     let jugadorRecordadoPrefill = '';
     function responseDelJugadorActual(){ return ${JSON.stringify(propia)}; }
     ${extractFunction(demo, "leerJugadorRecordado")}
     ${extractFunction(demo, "restaurarJugadorRecordado")}
     globalThis.__restore = restaurarJugadorRecordado;
     globalThis.__get = (n) => eval(n);`,
    ctx,
  );
  return { input, storage, calls, run: (code) => vm.runInContext(code, ctx), restore: (o) => ctx.__restore(o), get: (n) => ctx.__get(n), state: () => JSON.parse(JSON.stringify(ctx.__get("state"))) };
}

test("restaurarJugadorRecordado: partido nuevo sin response propia preselecciona la identidad sin crear ni confirmar nada", () => {
  const w = makeRestoreWorld({ stored: "  alejandro ", responses: [] });
  assert.equal(w.restore(), true);
  assert.equal(w.input.value, "Alejandro", "identidad canónica en el buscador");
  assert.equal(w.calls.save, 0);
  assert.equal(w.calls.server, 0);
  assert.equal(w.calls.claim, 0);
  assert.deepEqual(w.state().responses, [], "no crea ninguna response");
  assert.equal(w.get("currentLocalResponseName"), "", "no queda 'identificado'");
  assert.equal(w.get("pendingClaimResponseId"), "");
});

test("restaurarJugadorRecordado: con response propia deja la restauración normal (no toca el input)", () => {
  const w = makeRestoreWorld({ stored: "Alejandro", propia: { name: "Tito", habitualName: "Alejandro" }, inputValue: "" });
  assert.equal(w.restore(), false);
  assert.equal(w.input.value, "");
});

test("restaurarJugadorRecordado: response de OTRO dispositivo — rellena el nombre pero no reclama ni cambia ownership", () => {
  const ajena = { responseId: "r-ale", isGuest: false, name: "Alejandro", habitualName: "Alejandro", ownerId: "device-celu", ownerIds: ["device-celu"] };
  const w = makeRestoreWorld({ stored: "Alejandro", responses: [ajena], propia: null });
  const antes = JSON.stringify(w.state().responses);
  assert.equal(w.restore(), true);
  assert.equal(w.input.value, "Alejandro");
  assert.equal(JSON.stringify(w.state().responses), antes, "ownerId/ownerIds intactos");
  assert.equal(w.get("currentLocalResponseName"), "", "sin identidad local adquirida");
  assert.equal(w.get("pendingClaimResponseId"), "", "no abre el claim solo");
  assert.equal(w.calls.server + w.calls.save + w.calls.claim, 0);
});

test("restaurarJugadorRecordado: identidad que ya salió del roster borra el recuerdo y deja Registro vacío", () => {
  const w = makeRestoreWorld({ stored: "Fulano", habituales: ["Alejandro"] });
  assert.equal(w.restore(), false);
  assert.equal(w.storage.raw(), null);
  assert.equal(w.input.value, "");
});

test("restaurarJugadorRecordado: sin preferencia no hace nada", () => {
  const w = makeRestoreWorld({});
  assert.equal(w.restore(), false);
  assert.equal(w.input.value, "");
});

test("restaurarJugadorRecordado: no pisa lo que la persona está escribiendo ni el input enfocado", () => {
  const escribiendo = makeRestoreWorld({ stored: "Alejandro", inputValue: "Fél" });
  assert.equal(escribiendo.restore(), false);
  assert.equal(escribiendo.input.value, "Fél");
  const enfocado = makeRestoreWorld({ stored: "Alejandro", focused: true });
  assert.equal(enfocado.restore(), false);
  assert.equal(enfocado.input.value, "");
});

test("restaurarJugadorRecordado({soloLimpiar}) nunca preselecciona: el sondeo no re-rellena un input vaciado a propósito", () => {
  const w = makeRestoreWorld({ stored: "Alejandro" });
  assert.equal(w.restore({ soloLimpiar: true }), false);
  assert.equal(w.input.value, "");
});

test("tras una baja de roster ajena: el sondeo limpia el recuerdo y el prefill sin editar, pero no un texto editado", () => {
  const w = makeRestoreWorld({ stored: "Alejandro" });
  w.restore();
  assert.equal(w.input.value, "Alejandro");
  w.run("state.habitualPlayers = ['Félix BV'];"); // otro dispositivo retiró a Alejandro
  assert.equal(w.restore({ soloLimpiar: true }), false);
  assert.equal(w.storage.raw(), null, "recuerdo borrado");
  assert.equal(w.input.value, "", "prefill sin editar se limpia");

  const editado = makeRestoreWorld({ stored: "Alejandro" });
  editado.restore();
  editado.input.value = "Alejandro Ma"; // la persona estaba editando
  editado.run("state.habitualPlayers = ['Félix BV'];");
  editado.restore({ soloLimpiar: true });
  assert.equal(editado.storage.raw(), null);
  assert.equal(editado.input.value, "Alejandro Ma", "no se pisa un texto en edición");
});

test("wiring: al iniciar restaura DESPUÉS de restoreCurrentLocalResponse y ANTES de renderIdentityHeader; el sondeo sólo limpia", () => {
  const i = demo.indexOf("  updateKnownSets(state);\r\n  render();\r\n  // Jugador recordado en este dispositivo");
  assert.ok(i > -1, "se llama al iniciar, tras armar el estado y el selector");
  const bloque = demo.slice(i, demo.indexOf("evaluarTarjetasSiCorresponde();", i));
  assert.ok(bloque.indexOf("restaurarJugadorRecordado();") < bloque.indexOf("restoreCurrentLocalResponse();"), "la restauración normal de una response propia sigue mandando (esta retorna si hay una)");
  assert.ok(bloque.indexOf("restaurarJugadorRecordado();") < bloque.indexOf("renderIdentityHeader();"), "antes del render de identidad");
  assert.match(extractFunction(demo, "refreshFromServer"), /restaurarJugadorRecordado\(\{ soloLimpiar:true \}\);/);
});

test("restaurarJugadorRecordado no escribe estado compartido, ownership ni abre el claim", () => {
  const fn = extractFunction(demo, "restaurarJugadorRecordado");
  assert.doesNotMatch(fn, /persistFocalizado|savePlayerRegistration|guardarCambioEnResponses|saveState|upsert|supabase/i);
  assert.doesNotMatch(fn, /ownerId|ownerIds|pendingClaimResponseId\s*=|claim-player-overlay|currentLocalResponseName\s*=|LOCAL_CURRENT_PLAYER_KEY|\.responses/);
});

test("regresión: el evento 'input' del propio checkbox no re-renderiza (si no, el tilde se pisa antes de 'change')", () => {
  let renders = 0;
  const ctx = vm.createContext({});
  vm.runInContext(
    `let calls = 0; function renderRememberPlayerDevice(){ calls++; }
     ${extractFunction(demo, "onMyStatusCardInputRemember")}
     globalThis.__on = onMyStatusCardInputRemember; globalThis.__calls = () => calls;`,
    ctx,
  );
  ctx.__on({ target: { id: "remember-player-device" } });
  assert.equal(ctx.__calls(), 0, "evento del checkbox: ignorado");
  ctx.__on({ target: { id: "my-player-name" } });
  assert.equal(ctx.__calls(), 1, "evento del buscador: re-renderiza");
  ctx.__on(undefined);
  assert.equal(ctx.__calls(), 2);
  assert.equal(renders, 0);
});
