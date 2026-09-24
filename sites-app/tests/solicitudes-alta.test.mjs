// feat/solicitudes-alta-habitual — "Pedir sumarme": quien no está en la lista cerrada
// puede pedir que lo sumen. La solicitud nace PENDIENTE en solicitudesAlta y nunca crea
// ni toca una response: aprobarla agrega el nombre a habitualPlayers, pero la persona
// sigue sin "Estoy" — recién aparece en el selector "¿Quién sos?" y responde como
// cualquier habitual. Resueltas (aprobada/rechazada) nunca se borran; reenviar después
// de un rechazo agrega una fila pendiente nueva, no reescribe la vieja.
//
// Prueba el código REAL de demo.html en node:vm con un persistFocalizado de mentira
// (blob en memoria, sin red) y un fakeDocument mínimo para los renders. Sin Supabase,
// sin navegador, cero escrituras reales. Ver también:
//   - tests/registro-lista-cerrada.test.mjs test 8: acota el guard de habitualPlayers
//     para que aprobarSolicitudDeAlta() sea la única excepción documentada.
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

const clone = (x) => JSON.parse(JSON.stringify(x));

const WRITER_SOURCE = [
  extractConst(demo, "SOLICITUD_YA_HABITUAL"),
  extractConst(demo, "SOLICITUD_YA_PENDIENTE"),
  extractFunction(demo, "pedirSumarme"),
  extractFunction(demo, "aprobarSolicitudDeAlta"),
  extractFunction(demo, "rechazarSolicitudDeAlta"),
  extractFunction(demo, "sacarDelRoster"),
].join("\n");

// "Servidor" de mentira: solicitudesAlta + relleno de otras keys para verificar que los
// tres writers no las tocan.
const serverOf = (solicitudesAlta, over) => ({
  matchInfo: { date: "2026-09-26", time: "19:00", type: "F7", priceTotal: "140000" },
  responses: [{ responseId: "r1", isGuest: false, status: "in", paid: false, name: "Ale", ownerId: "o-ale", ownerIds: ["o-ale"] }],
  habitualPlayers: ["Ale", "Fran Forrester"],
  solicitudesAlta: clone(solicitudesAlta),
  cards: { byPlayer: {}, evaluated: {}, log: [] },
  players: [{ name: "Ale", number: 9, isCaptain: true }],
  history: [{ finalizedAt: "2026-08-01T00:00:00.000Z" }],
  sedes: [{ name: "Cancha", address: "" }],
  formations: {},
  frequentAliases: ["picado.demo"],
  ...over,
});

// Mundo mínimo: los 3 writers + un persistFocalizado que lee del blob, aplica la
// intención y sólo commitea si devolvió true. Mismo contrato que el real. `crypto` de
// mentira, contador propio: no depende de UUIDs reales, sólo de que sean únicos.
function makeWorld(server, { ownerId = "device-a" } = {}) {
  let serverBlob = clone(server);
  const writes = [];
  let persistCalls = 0;
  let uuidCounter = 0;

  const context = vm.createContext({
    JSON, Object, Array, String, Number, Math, Promise, Boolean, Date,
    console: { error() {}, warn() {}, log() {} },
    crypto: { randomUUID: () => `sol-${++uuidCounter}` },
  });
  context.currentSessionUserId = ownerId;
  context.persistFocalizado = function (aplicar) {
    persistCalls++;
    const fresh = clone(serverBlob);
    let ok = false;
    try { ok = aplicar(fresh); } catch { ok = false; }
    if (!ok) return Promise.resolve(false);
    serverBlob = fresh;
    writes.push(clone(fresh));
    context.state = fresh;
    return Promise.resolve(true);
  };
  vm.runInContext(
    `${WRITER_SOURCE}
     globalThis.__pedir = pedirSumarme;
     globalThis.__aprobar = aprobarSolicitudDeAlta;
     globalThis.__rechazar = rechazarSolicitudDeAlta;
     globalThis.__sacar = sacarDelRoster;`,
    context,
  );

  return {
    pedir: (nombre) => context.__pedir(nombre),
    aprobar: (id) => context.__aprobar(id),
    rechazar: (id) => context.__rechazar(id),
    sacar: (nombre) => context.__sacar(nombre),
    writes,
    persistCalls: () => persistCalls,
    server: () => serverBlob,
  };
}

/* ═════════════════ 1. Creación ═════════════════ */

test("pedirSumarme: crea una solicitud pendiente con ownerId, id y nombre tal cual se escribió", async () => {
  const w = makeWorld(serverOf([]), { ownerId: "device-a" });
  const { ok, motivo } = await w.pedir("  Nacho Duncan  ");
  assert.equal(ok, true);
  assert.equal(motivo, null);
  const solicitudes = w.server().solicitudesAlta;
  assert.equal(solicitudes.length, 1);
  const s = solicitudes[0];
  assert.equal(s.nombre, "Nacho Duncan", "se guarda trim() pero sin normalizar casing");
  assert.equal(s.estado, "pendiente");
  assert.equal(s.ownerId, "device-a");
  assert.equal(s.resolvedAt, null);
  assert.ok(s.id && typeof s.id === "string");
  assert.ok(s.createdAt && typeof s.createdAt === "string");
});

test("pedirSumarme: nombre vacío o sólo espacios no crea nada", async () => {
  const w = makeWorld(serverOf([]));
  const r1 = await w.pedir("");
  const r2 = await w.pedir("   ");
  assert.equal(r1.ok, false);
  assert.equal(r2.ok, false);
  assert.equal(w.server().solicitudesAlta.length, 0);
  assert.equal(w.persistCalls(), 0, "ni siquiera abre una lectura fresca sin nombre");
});

/* ═════════════════ 2. Duplicados ═════════════════ */

test("pedirSumarme: rechaza si el nombre normalizado ya está en habitualPlayers", async () => {
  const w = makeWorld(serverOf([], { habitualPlayers: ["Pablo de Achaval"] }));
  const { ok, motivo } = await w.pedir("pablo DE achaval");
  assert.equal(ok, false);
  assert.equal(motivo, "ya-habitual");
  assert.equal(w.server().solicitudesAlta.length, 0, "no se escribe nada");
});

test("pedirSumarme: rechaza una segunda solicitud pendiente con el mismo nombre normalizado", async () => {
  const previa = [{ id: "sol-1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }];
  const w = makeWorld(serverOf(previa));
  const { ok, motivo } = await w.pedir("nacho duncan");
  assert.equal(ok, false);
  assert.equal(motivo, "ya-pendiente");
  assert.equal(w.server().solicitudesAlta.length, 1, "no se duplica la fila");
});

test("pedirSumarme: una solicitud pendiente de OTRO nombre no bloquea", async () => {
  const previa = [{ id: "sol-1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }];
  const w = makeWorld(serverOf(previa));
  const { ok } = await w.pedir("Otro Nombre");
  assert.equal(ok, true);
  assert.equal(w.server().solicitudesAlta.length, 2);
});

/* ═════════════════ 3. Rechazo y reenvío ═════════════════ */

test("pedirSumarme: una solicitud RECHAZADA con el mismo nombre no bloquea el reenvío", async () => {
  const previa = [{ id: "sol-vieja", nombre: "Nacho Duncan", estado: "rechazada", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: "2026-09-20T10:05:00.000Z" }];
  const w = makeWorld(serverOf(previa));
  const { ok } = await w.pedir("Nacho Duncan");
  assert.equal(ok, true);
  const solicitudes = w.server().solicitudesAlta;
  assert.equal(solicitudes.length, 2, "el reenvío agrega una fila nueva, no reescribe la vieja");
  assert.equal(solicitudes[0].estado, "rechazada", "la rechazada original queda como historial, intacta");
  assert.equal(solicitudes[0].id, "sol-vieja");
  assert.equal(solicitudes[1].estado, "pendiente");
  assert.notEqual(solicitudes[1].id, solicitudes[0].id);
});

test("rechazarSolicitudDeAlta: marca rechazada, no toca habitualPlayers", async () => {
  const previa = [{ id: "sol-1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }];
  const w = makeWorld(serverOf(previa));
  const habitualesAntes = w.server().habitualPlayers.slice();
  const ok = await w.rechazar("sol-1");
  assert.equal(ok, true);
  const s = w.server().solicitudesAlta[0];
  assert.equal(s.estado, "rechazada");
  assert.ok(s.resolvedAt);
  assert.deepEqual(w.server().habitualPlayers, habitualesAntes);
});

test("rechazarSolicitudDeAlta: idempotente — la segunda vez no escribe (ya no está pendiente)", async () => {
  const previa = [{ id: "sol-1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }];
  const w = makeWorld(serverOf(previa));
  const primera = await w.rechazar("sol-1");
  const resolvedAtPrimera = w.server().solicitudesAlta[0].resolvedAt;
  const segunda = await w.rechazar("sol-1");
  assert.equal(primera, true);
  assert.equal(segunda, false);
  assert.equal(w.server().solicitudesAlta[0].resolvedAt, resolvedAtPrimera, "no se reescribe resolvedAt");
});

test("rechazarSolicitudDeAlta: id inexistente no escribe", async () => {
  const w = makeWorld(serverOf([]));
  const ok = await w.rechazar("no-existe");
  assert.equal(ok, false);
  assert.equal(w.writes.length, 0);
});

/* ═════════════════ 4. Aprobar: agrega a habitualPlayers, no crea response ═════════════════ */

test("aprobarSolicitudDeAlta: agrega el nombre a habitualPlayers y marca aprobada", async () => {
  const previa = [{ id: "sol-1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }];
  const w = makeWorld(serverOf(previa));
  const ok = await w.aprobar("sol-1");
  assert.equal(ok, true);
  assert.deepEqual(w.server().habitualPlayers, ["Ale", "Fran Forrester", "Nacho Duncan"]);
  const s = w.server().solicitudesAlta[0];
  assert.equal(s.estado, "aprobada");
  assert.ok(s.resolvedAt);
});

test("aprobarSolicitudDeAlta: NO crea response ni response.status='in' — sigue sin 'Estoy'", async () => {
  const previa = [{ id: "sol-1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }];
  const responsesAntes = serverOf(previa).responses;
  const w = makeWorld(serverOf(previa));
  await w.aprobar("sol-1");
  assert.deepEqual(w.server().responses, responsesAntes, "responses no cambia: ni cantidad ni contenido");
  assert.ok(!w.server().responses.some((r) => r.name === "Nacho Duncan"), "no aparece ninguna response para el aprobado");
});

test("aprobarSolicitudDeAlta: idempotente — doble aprobación (doble click / dos organizadores) no duplica en habitualPlayers", async () => {
  const previa = [{ id: "sol-1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }];
  const w = makeWorld(serverOf(previa));
  const primera = await w.aprobar("sol-1");
  const segunda = await w.aprobar("sol-1");
  assert.equal(primera, true);
  assert.equal(segunda, false, "la segunda ve estado!=='pendiente' y no escribe");
  const veces = w.server().habitualPlayers.filter((h) => h === "Nacho Duncan").length;
  assert.equal(veces, 1, "habitualPlayers no queda con el nombre duplicado");
});

test("aprobarSolicitudDeAlta: revalida contra fresh — si el nombre ya es habitual (alta por script en el medio), no duplica pero igual resuelve la solicitud", async () => {
  const previa = [{ id: "sol-1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }];
  const w = makeWorld(serverOf(previa, { habitualPlayers: ["Ale", "Fran Forrester", "Nacho Duncan"] }));
  const ok = await w.aprobar("sol-1");
  assert.equal(ok, true);
  assert.deepEqual(w.server().habitualPlayers, ["Ale", "Fran Forrester", "Nacho Duncan"], "no se duplica");
  assert.equal(w.server().solicitudesAlta[0].estado, "aprobada", "la solicitud igual queda resuelta, no pendiente para siempre");
});

test("aprobarSolicitudDeAlta: id inexistente o ya resuelto no escribe", async () => {
  const w1 = makeWorld(serverOf([]));
  assert.equal(await w1.aprobar("no-existe"), false);

  const yaResuelta = [{ id: "sol-1", nombre: "X", estado: "rechazada", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: "2026-09-20T10:05:00.000Z" }];
  const w2 = makeWorld(serverOf(yaResuelta));
  assert.equal(await w2.aprobar("sol-1"), false);
  assert.equal(w2.server().habitualPlayers.length, 2, "no se agrega nada de una solicitud ya rechazada");
});

/* ═════════════════ 5. Los 3 writers no tocan lo que no les pertenece ═════════════════ */

test("los 3 writers preservan matchInfo, cards, players, history, sedes, frequentAliases y NO borran solicitudes resueltas", async () => {
  const previa = [
    { id: "sol-1", nombre: "Rechazado Viejo", estado: "rechazada", ownerId: "device-x", createdAt: "2026-09-01T00:00:00.000Z", resolvedAt: "2026-09-01T00:05:00.000Z" },
    { id: "sol-2", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null },
  ];
  const server = serverOf(previa);
  const w = makeWorld(server);
  await w.aprobar("sol-2");
  const post = w.server();
  assert.deepEqual(post.matchInfo, server.matchInfo);
  assert.deepEqual(post.cards, server.cards);
  assert.deepEqual(post.players, server.players);
  assert.deepEqual(post.history, server.history);
  assert.deepEqual(post.sedes, server.sedes);
  assert.deepEqual(post.frequentAliases, server.frequentAliases);
  assert.equal(post.solicitudesAlta.length, 2, "la rechazada vieja sigue ahí: nada se borra");
  assert.equal(post.solicitudesAlta[0].estado, "rechazada");
});

/* ═════════════════ 6. Render: estado de la solicitud en Registro ═════════════════ */

function makeStatusContext({ ownerId = "device-a", propia = null, changingRegisteredPlayer = false, solicitudesAlta = [] } = {}) {
  const el = { hidden: true, className: "", innerHTML: "" };
  const els = { "join-request-status": el };
  const context = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    String, Boolean,
    escapeHtml: (s) => String(s),
  });
  vm.runInContext(
    `let currentSessionUserId = ${JSON.stringify(ownerId)};
     let changingRegisteredPlayer = ${JSON.stringify(changingRegisteredPlayer)};
     let state = { solicitudesAlta: ${JSON.stringify(solicitudesAlta)} };
     function responseDelJugadorActual(){ return ${JSON.stringify(propia)}; }
     ${extractFunction(demo, "renderJoinRequestStatus")}
     globalThis.__render = renderJoinRequestStatus;`,
    context,
  );
  context.__render();
  return el;
}

test("renderJoinRequestStatus: pendiente muestra el nombre solicitado y usa 'solicitud', no 'pedido'", () => {
  const el = makeStatusContext({
    solicitudesAlta: [{ id: "s1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }],
  });
  assert.equal(el.hidden, false);
  assert.match(el.innerHTML, /Nacho Duncan/);
  assert.match(el.innerHTML, /Tu solicitud para .* está pendiente\. Avisamos cuando la resuelvan\./);
  assert.doesNotMatch(el.innerHTML, /pedido/i);
  assert.match(el.className, /pending/);
});

test("renderJoinRequestStatus: rechazada usa el copy EXACTO aprobado", () => {
  const el = makeStatusContext({
    solicitudesAlta: [{ id: "s1", nombre: "Nacho Duncan", estado: "rechazada", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: "2026-09-20T10:05:00.000Z" }],
  });
  assert.equal(el.hidden, false);
  assert.match(el.innerHTML, /No se aprobó tu solicitud\. Corregí el nombre o hablá con el grupo\./);
});

test("renderJoinRequestStatus: aprobada no muestra nada (ya sigue el camino normal del selector)", () => {
  const el = makeStatusContext({
    solicitudesAlta: [{ id: "s1", nombre: "Nacho Duncan", estado: "aprobada", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: "2026-09-20T10:05:00.000Z" }],
  });
  assert.equal(el.hidden, true);
});

test("renderJoinRequestStatus: una solicitud de OTRO ownerId no se muestra", () => {
  const el = makeStatusContext({
    ownerId: "device-a",
    solicitudesAlta: [{ id: "s1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-b", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }],
  });
  assert.equal(el.hidden, true);
});

test("renderJoinRequestStatus: identificado (con response propia, sin cambiar) no muestra nada", () => {
  const el = makeStatusContext({
    propia: { name: "Ale" },
    changingRegisteredPlayer: false,
    solicitudesAlta: [{ id: "s1", nombre: "Nacho Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null }],
  });
  assert.equal(el.hidden, true);
});

test("renderJoinRequestStatus: reenvío tras rechazo — se muestra la MÁS RECIENTE (pendiente), no la vieja rechazada", () => {
  const el = makeStatusContext({
    solicitudesAlta: [
      { id: "s1", nombre: "Nacho Duncan", estado: "rechazada", ownerId: "device-a", createdAt: "2026-09-19T10:00:00.000Z", resolvedAt: "2026-09-19T10:05:00.000Z" },
      { id: "s2", nombre: "Nacho A. Duncan", estado: "pendiente", ownerId: "device-a", createdAt: "2026-09-20T10:00:00.000Z", resolvedAt: null },
    ],
  });
  assert.equal(el.hidden, false);
  assert.match(el.className, /pending/);
  assert.match(el.innerHTML, /Nacho A\. Duncan/);
});

/* ═════════════════ 7. Render: cola del Organizador ═════════════════ */

function makeOrganizerListContext(solicitudesAlta) {
  const empty = { hidden: false };
  const list = { hidden: true, innerHTML: "" };
  const els = { "join-requests-empty": empty, "join-requests-list": list };
  const context = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    String,
    escapeHtml: (s) => String(s),
  });
  vm.runInContext(
    `let state = { solicitudesAlta: ${JSON.stringify(solicitudesAlta)} };
     ${extractFunction(demo, "renderSolicitudesAlta")}
     globalThis.__render = renderSolicitudesAlta;`,
    context,
  );
  context.__render();
  return { empty, list };
}

test("renderSolicitudesAlta: sin pendientes muestra el empty state y esconde la lista", () => {
  const { empty, list } = makeOrganizerListContext([
    { id: "s1", nombre: "X", estado: "aprobada" },
    { id: "s2", nombre: "Y", estado: "rechazada" },
  ]);
  assert.equal(empty.hidden, false);
  assert.equal(list.hidden, true);
  assert.equal(list.innerHTML, "");
});

test("renderSolicitudesAlta: lista SÓLO las pendientes, con botones Aprobar/Rechazar por id", () => {
  const { empty, list } = makeOrganizerListContext([
    { id: "s1", nombre: "Aprobada Vieja", estado: "aprobada" },
    { id: "s2", nombre: "Nacho Duncan", estado: "pendiente" },
    { id: "s3", nombre: "Rechazada Vieja", estado: "rechazada" },
  ]);
  assert.equal(empty.hidden, true);
  assert.equal(list.hidden, false);
  assert.match(list.innerHTML, /Nacho Duncan/);
  assert.doesNotMatch(list.innerHTML, /Aprobada Vieja/);
  assert.doesNotMatch(list.innerHTML, /Rechazada Vieja/);
  assert.match(list.innerHTML, /data-aprobar-solicitud="s2"/);
  assert.match(list.innerHTML, /data-rechazar-solicitud="s2"/);
});

/* ═════════════════ 8. Sincronización por refresh (wiring) ═════════════════ */

test("refreshFromServer llama a renderJoinRequestStatus() (el estado lo puede resolver otro dispositivo)", () => {
  const fn = extractFunction(demo, "refreshFromServer");
  assert.match(fn, /renderJoinRequestStatus\(\);/);
});

test("renderLocalOrganizer llama a renderSolicitudesAlta() (la cola se actualiza con cada sondeo del Organizador)", () => {
  const fn = extractFunction(demo, "renderLocalOrganizer");
  assert.match(fn, /^function renderLocalOrganizer\(\)\{\s*renderSolicitudesAlta\(\);/);
});

test("leerEstadoDelServidor normaliza solicitudesAlta ausente/roto a []", () => {
  const fn = extractFunction(demo, "leerEstadoDelServidor");
  assert.match(fn, /if\(!Array\.isArray\(parsed\.solicitudesAlta\)\) parsed\.solicitudesAlta = \[\];/);
});

/* ═════════════════ 9. Copy y markup aprobados ═════════════════ */

test("copy de rechazo EXACTO en el markup fuente (no sólo en el render)", () => {
  assert.match(demo, /No se aprobó tu solicitud\. Corregí el nombre o hablá con el grupo\./);
});

test("Solicitudes: el modal 'Solicitudes pendientes' tiene Aprobar y Rechazar", () => {
  assert.match(demo, /<h2 id="join-requests-title">Solicitudes pendientes<\/h2>/);
  assert.match(demo, />Aprobar</);
  assert.match(demo, />Rechazar</);
});

test("Jugador: botón 'Solicitar sumarme' sólo en el empty state del selector (sin botón permanente)", () => {
  const menu = extractFunction(demo, "renderRecurrentPlayerMenu");
  assert.match(menu, /Solicitar sumarme/);
  assert.doesNotMatch(menu, /Pedir sumarme/);
  assert.match(menu, /data-join-request/);
});

/* ═════════════════ 10. No se abren otras vías de mutación ═════════════════ */

test("pedirSumarme y rechazarSolicitudDeAlta nunca tocan habitualPlayers en escritura", () => {
  const pedir = extractFunction(demo, "pedirSumarme");
  const rechazar = extractFunction(demo, "rechazarSolicitudDeAlta");
  for (const fn of [pedir, rechazar]) {
    assert.doesNotMatch(fn, /habitualPlayers\.(push|pop|shift|unshift|splice|sort)\(/);
    assert.doesNotMatch(fn, /habitualPlayers\s*=/);
  }
});

test("los 3 writers no llaman a savePlayerRegistration / guardarCambioEnResponses ni tocan responses/paid", () => {
  for (const name of ["pedirSumarme", "aprobarSolicitudDeAlta", "rechazarSolicitudDeAlta"]) {
    const fn = extractFunction(demo, name);
    assert.doesNotMatch(fn, /savePlayerRegistration|guardarCambioEnResponses|guardarCambio\(/);
    assert.doesNotMatch(fn, /\.responses\s*=|\.paid\s*=|status\s*:\s*'in'/);
  }
});

test("no se guarda resolvedBy ni motivo de rechazo (decisión de producto)", () => {
  for (const name of ["pedirSumarme", "aprobarSolicitudDeAlta", "rechazarSolicitudDeAlta"]) {
    const fn = extractFunction(demo, name);
    assert.doesNotMatch(fn, /resolvedBy|motivoRechazo/i);
  }
});

/* ═════════════════ 11. Copy unificado: "solicitud", sin "pedido" / "organizador" ═════════════════ */

test("copy: helper 'Escribí tu nombre…', empty 'No encontramos ese nombre.' y sin restos del copy viejo", () => {
  assert.match(demo, /id="player-picker-help">Escribí tu nombre\. Si no aparece, solicitá sumarte al grupo\.</);
  assert.doesNotMatch(demo, /Pedile a un organizador|Seguro estuviste|Pedir sumarme|Pedimos sumarte/);
  assert.doesNotMatch(demo, /No hay pedidos pendientes|Ese pedido ya|Tu pedido para|el pedido de/);
});

test("copy: confirmaciones y toasts del flujo usan 'solicitud'", () => {
  const menu = extractFunction(demo, "renderRecurrentPlayerMenu");
  assert.match(menu, /Enviamos tu solicitud para sumarte como/);
  assert.match(menu, /Ya hay una solicitud pendiente para/);
  assert.match(menu, /No pudimos enviar la solicitud\./);
  assert.doesNotMatch(menu, /pedido/i);
  assert.match(demo, /No hay solicitudes pendientes\./);
  assert.match(demo, /¿Rechazar la solicitud de "\$\{nombre\}"\?/);
  assert.match(demo, /Esa solicitud ya se resolvió\./);
});

test("el CTA sólo se pinta con nombre escrito y sin coincidencias (no hay botón permanente)", () => {
  const menu = extractFunction(demo, "renderRecurrentPlayerMenu");
  assert.match(menu, /const puedeSolicitar = filtered\.length===0 && input\.value\.trim\(\)\.length>0;/);
  // el botón se genera dentro de renderRecurrentPlayerMenu y en ningún otro lado
  assert.match(menu, /<button type="button" class="join-request-btn" data-join-request>Solicitar sumarme<\/button>/);
  assert.doesNotMatch(demo.replace(menu, ""), /<button[^>]*data-join-request/);
  const markup = demo.slice(demo.indexOf("<body>"), demo.indexOf("<script>", demo.indexOf("<body>")));
  assert.doesNotMatch(markup, /data-join-request|Solicitar sumarme/);
});

/* ═════════════════ 12. Baja del roster: sacarDelRoster ═════════════════ */

const rosterServer = (over) => serverOf(
  [{ id: "sol-x", nombre: "Ya Aprobado", estado: "aprobada", ownerId: "device-z", createdAt: "2026-09-01T00:00:00.000Z", resolvedAt: "2026-09-01T00:05:00.000Z" }],
  {
    habitualPlayers: ["Ale", "Félix BV"],
    responses: [
      { responseId: "r-ale", isGuest: false, habitualName: "Ale", name: "Ale", paid: true, status: "in" },
      { responseId: "r-felix", isGuest: false, habitualName: "Félix BV", name: "Félix", paid: false, status: "in" },
      { responseId: "g-ale", isGuest: true, invitedBy: "Ale", name: "Ale", paid: false, status: "in" },
      { responseId: "g-felix", isGuest: true, invitedBy: "Félix", name: "Félix BV", paid: true, status: "in" },
    ],
    ...over,
  },
);

test("sacarDelRoster: quita el habitual y su response regular actual (nombre normalizado)", async () => {
  const w = makeWorld(rosterServer());
  assert.equal(await w.sacar("  félix bv "), true);
  assert.deepEqual(w.server().habitualPlayers, ["Ale"]);
  assert.deepEqual(w.server().responses.map((r) => r.responseId), ["r-ale", "g-ale", "g-felix"]);
  assert.equal(w.writes.length, 1, "una única escritura");
});

test("sacarDelRoster: preserva invitados homónimos (aunque el invitado se llame igual que el habitual)", async () => {
  const w = makeWorld(rosterServer());
  await w.sacar("Félix BV");
  const ids = w.server().responses.map((r) => r.responseId);
  assert.ok(ids.includes("g-felix"), "el invitado 'Félix BV' de otro anfitrión sigue");
  assert.ok(ids.includes("g-ale"));
});

test("sacarDelRoster: preserva matchInfo, history, cards, players, sedes, formations, frequentAliases y solicitudesAlta", async () => {
  const antes = rosterServer();
  const w = makeWorld(antes);
  await w.sacar("Ale");
  const post = w.server();
  for (const k of ["matchInfo", "history", "cards", "players", "sedes", "formations", "frequentAliases", "solicitudesAlta"]) {
    assert.deepEqual(post[k], antes[k], `${k} no cambia`);
  }
  assert.deepEqual(post.habitualPlayers, ["Félix BV"]);
});

test("sacarDelRoster: nombre ausente o vacío devuelve false y no escribe", async () => {
  const w = makeWorld(rosterServer());
  assert.equal(await w.sacar("Nadie"), false);
  assert.equal(await w.sacar(""), false);
  assert.equal(await w.sacar("   "), false);
  assert.equal(w.writes.length, 0);
  assert.deepEqual(w.server().habitualPlayers, ["Ale", "Félix BV"]);
});

test("sacarDelRoster: idempotente — el segundo intento (doble toque / otro dispositivo) no escribe ni saca a otro", async () => {
  const w = makeWorld(rosterServer());
  assert.equal(await w.sacar("Ale"), true);
  assert.equal(await w.sacar("Ale"), false);
  assert.equal(w.writes.length, 1);
  assert.deepEqual(w.server().habitualPlayers, ["Félix BV"], "Félix BV no se toca");
  assert.ok(w.server().responses.some((r) => r.responseId === "r-felix"));
});

test("sacarDelRoster: una response con el mismo nombre visible pero OTRA identidad habitual se preserva", async () => {
  const w = makeWorld(rosterServer({
    responses: [
      { responseId: "r-otro", isGuest: false, habitualName: "Félix BV", name: "Ale", paid: false, status: "in" },
      { responseId: "r-ale", isGuest: false, habitualName: "Ale", name: "Ale", paid: false, status: "in" },
    ],
  }));
  await w.sacar("Ale");
  assert.deepEqual(w.server().responses.map((r) => r.responseId), ["r-otro"], "sale sólo la de identidad Ale");
});

test("sacarDelRoster: una response legacy sin habitualName se identifica por su name", async () => {
  const w = makeWorld(rosterServer({
    responses: [{ responseId: "r-legacy", isGuest: false, name: "ale", paid: false, status: "in" }],
  }));
  await w.sacar("Ale");
  assert.deepEqual(w.server().responses, []);
});

test("sacarDelRoster: sin response actual igual saca al habitual", async () => {
  const w = makeWorld(rosterServer({ responses: [] }));
  assert.equal(await w.sacar("Ale"), true);
  assert.deepEqual(w.server().habitualPlayers, ["Félix BV"]);
});

test("sacarDelRoster: es la única vía de cliente (junto a aprobar) que toca habitualPlayers y no usa guardarCambioEnResponses", () => {
  const fn = extractFunction(demo, "sacarDelRoster");
  assert.match(fn, /persistFocalizado\(/);
  assert.doesNotMatch(fn, /guardarCambioEnResponses|savePlayerRegistration|localAvailabilityResponses|state\./);
  assert.doesNotMatch(fn, /\.paid\s*=|\.cards|\.history|\.players|solicitudesAlta/);
});

/* ═════════════════ 13. Gestión de jugadores: dos accesos compactos + dos modales ═════════════════ */

const organizerMarkup = demo.slice(
  demo.indexOf('<div class="organizer-view" id="main-view-organizer">'),
  demo.indexOf('<div class="modal-overlay"'),
);

test("Organizador muestra dos accesos compactos de igual jerarquía, no las listas abiertas", () => {
  assert.match(organizerMarkup, /id="open-join-requests"/);
  assert.match(organizerMarkup, /id="open-roster-manager"/);
  assert.match(organizerMarkup, /Gestión de jugadores/);
  assert.doesNotMatch(organizerMarkup, /id="join-requests-list"|id="roster-manage-list"|id="join-requests-empty"|id="roster-manage-empty"/);
  const a = organizerMarkup.match(/<button[^>]*id="open-join-requests"[^>]*>/)[0];
  const b = organizerMarkup.match(/<button[^>]*id="open-roster-manager"[^>]*>/)[0];
  const clase = (t) => t.match(/class="([^"]+)"/)[1];
  assert.equal(clase(a), clase(b), "misma clase = misma jerarquía");
});

test("cada acceso tiene su propio modal, con lista, vacío y botón Cerrar", () => {
  const modal = (id) => {
    const ini = demo.indexOf(`<div class="modal-overlay" id="${id}">`);
    assert.ok(ini > -1, `existe ${id}`);
    return demo.slice(ini, demo.indexOf("</div>\r\n</div>", ini));
  };
  const sol = modal("manage-join-requests-overlay");
  assert.match(sol, /Solicitudes pendientes/);
  assert.match(sol, /id="join-requests-empty"/);
  assert.match(sol, /id="join-requests-list"/);
  assert.match(sol, /id="manage-join-requests-close"/);
  const ros = modal("manage-roster-overlay");
  assert.match(ros, /Roster actual/);
  assert.match(ros, /id="roster-manage-empty"/);
  assert.match(ros, /id="roster-manage-list"/);
  assert.match(ros, /id="manage-roster-close"/);
  assert.doesNotMatch(sol, /roster-manage/);
  assert.doesNotMatch(ros, /id="join-requests-list"/);
});

test("los dos modales pausan el sondeo (están en anyModalOpen)", () => {
  const fn = extractFunction(demo, "refreshFromServer");
  assert.match(fn, /'manage-join-requests-overlay'/);
  assert.match(fn, /'manage-roster-overlay'/);
});

test("cada acceso abre SU modal y Cerrar lo cierra", () => {
  assert.match(demo, /getElementById\('open-join-requests'\)\.onclick = \(\)=>\{\s*renderSolicitudesAlta\(\);\s*document\.getElementById\('manage-join-requests-overlay'\)\.classList\.add\('open'\);/);
  assert.match(demo, /getElementById\('open-roster-manager'\)\.onclick = \(\)=>\{\s*renderRosterManageList\(\);\s*document\.getElementById\('manage-roster-overlay'\)\.classList\.add\('open'\);/);
  assert.match(demo, /getElementById\('manage-join-requests-close'\)\.onclick = \(\)=>\{\s*document\.getElementById\('manage-join-requests-overlay'\)\.classList\.remove\('open'\);/);
  assert.match(demo, /getElementById\('manage-roster-close'\)\.onclick = \(\)=>\{\s*document\.getElementById\('manage-roster-overlay'\)\.classList\.remove\('open'\);/);
});

function makeRosterContext(estado) {
  const els = {
    "open-join-requests": { textContent: "" },
    "open-roster-manager": { textContent: "" },
    "roster-manage-empty": { hidden: false },
    "roster-manage-list": { hidden: true, innerHTML: "" },
  };
  const ctx = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    String, Array,
    escapeHtml: (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  });
  vm.runInContext(
    `let state = ${JSON.stringify(estado)};
     ${extractFunction(demo, "renderRosterManageList")}
     ${extractFunction(demo, "renderGestionRoster")}
     globalThis.__gestion = renderGestionRoster;
     globalThis.__lista = renderRosterManageList;`,
    ctx,
  );
  return { els, ctx };
}

test("renderGestionRoster: los accesos muestran los conteos (pendientes / integrantes)", () => {
  const { els, ctx } = makeRosterContext({
    habitualPlayers: ["Ale", "Fran", "Nacho"],
    solicitudesAlta: [
      { id: "a", nombre: "X", estado: "pendiente" },
      { id: "b", nombre: "Y", estado: "aprobada" },
      { id: "c", nombre: "Z", estado: "rechazada" },
      { id: "d", nombre: "W", estado: "pendiente" },
    ],
  });
  ctx.__gestion();
  assert.equal(els["open-join-requests"].textContent, "Solicitudes (2)");
  assert.equal(els["open-roster-manager"].textContent, "Roster (3)");
});

test("renderGestionRoster: sin datos muestra (0) y no falla con keys ausentes", () => {
  const { els, ctx } = makeRosterContext({});
  ctx.__gestion();
  assert.equal(els["open-join-requests"].textContent, "Solicitudes (0)");
  assert.equal(els["open-roster-manager"].textContent, "Roster (0)");
});

test("renderRosterManageList: una fila por habitual con data-sacar-del-roster escapado", () => {
  const { els, ctx } = makeRosterContext({ habitualPlayers: ["Ale", 'Ana "La <b>Larga"'], solicitudesAlta: [] });
  ctx.__lista();
  const { hidden, innerHTML } = els["roster-manage-list"];
  assert.equal(hidden, false);
  assert.equal(els["roster-manage-empty"].hidden, true);
  assert.equal((innerHTML.match(/data-sacar-del-roster=/g) || []).length, 2);
  assert.match(innerHTML, /data-sacar-del-roster="Ale"/);
  assert.match(innerHTML, /Ana &quot;La &lt;b&gt;Larga/);
  assert.doesNotMatch(innerHTML, /<b>Larga/);
  assert.match(innerHTML, />Sacar del roster</);
});

test("renderRosterManageList: roster vacío explica el vacío y esconde la lista", () => {
  const { els, ctx } = makeRosterContext({ habitualPlayers: [] });
  ctx.__lista();
  assert.equal(els["roster-manage-empty"].hidden, false);
  assert.equal(els["roster-manage-list"].hidden, true);
  assert.equal(els["roster-manage-list"].innerHTML, "");
  assert.match(demo, /id="roster-manage-empty">Todavía no hay jugadores en el roster\./);
});

test("el handler de Sacar del roster confirma con el copy exacto y delega en sacarDelRoster", () => {
  const i = demo.indexOf("getElementById('roster-manage-list').addEventListener('click'");
  assert.ok(i > -1, "delegación desde el <ul> estático");
  const h = demo.slice(i, demo.indexOf("\n});", i));
  assert.match(h, /`¿Sacar a "\$\{nombre\}" del roster\? También se eliminará su respuesta al partido actual\. El historial de fechas anteriores no cambia\.`/);
  assert.match(h, /if\(!window\.confirm\(pregunta\)\) return;/);
  assert.ok(h.indexOf("window.confirm") < h.indexOf("await sacarDelRoster("), "confirma antes de escribir");
  assert.match(h, /boton\.disabled = true;/);
  assert.match(h, /showToast\(/);
  assert.match(h, /renderGestionRoster\(\);/);
});

test("renderLocalOrganizer renderiza la gestión de jugadores en cada sondeo", () => {
  assert.match(extractFunction(demo, "renderLocalOrganizer"), /renderGestionRoster\(\);/);
});

/* ═════════════════ 14. Identidad local al sacar del roster ═════════════════ */

function makeLocalIdentityWorld({ currentLocalResponseName = "" } = {}) {
  const removed = [];
  const input = { value: "algo escrito" };
  let nameModeCalls = 0;
  const ctx = vm.createContext({
    document: { getElementById: (id) => (id === "my-player-name" ? input : null) },
    localStorage: { removeItem: (k) => removed.push(k) },
    String,
    console: { error() {}, warn() {}, log() {} },
    setRegisteredPlayerNameMode: (allow) => { nameModeCalls += allow === true ? 1 : 100; },
  });
  vm.runInContext(
    `const LOCAL_CURRENT_PLAYER_KEY = 'asp_current_player_demo_v1';
     let currentLocalResponseName = ${JSON.stringify(currentLocalResponseName)};
     ${extractFunction(demo, "limpiarIdentidadRetirada")}
     globalThis.__limpiar = limpiarIdentidadRetirada;
     globalThis.__nombre = () => currentLocalResponseName;`,
    ctx,
  );
  return {
    limpiar: (n, propia) => ctx.__limpiar(n, propia),
    currentName: () => ctx.__nombre(),
    removed,
    input,
    modeCalls: () => nameModeCalls,
  };
}

test("limpiarIdentidadRetirada: limpia sólo la identidad retirada de este dispositivo", () => {
  const w = makeLocalIdentityWorld({ currentLocalResponseName: "Félix BV" });
  assert.equal(w.limpiar("  félix bv "), true);
  assert.equal(w.currentName(), "");
  assert.deepEqual(w.removed, ["asp_current_player_demo_v1"]);
  assert.equal(w.modeCalls(), 1, "vuelve al selector de identidad");
  assert.equal(w.input.value, "", "limpia el input");
});

test("limpiarIdentidadRetirada: otra persona no toca nada (sin storage, sin cambio de modo)", () => {
  const w = makeLocalIdentityWorld({ currentLocalResponseName: "Ale" });
  assert.equal(w.limpiar("Félix BV"), false);
  assert.equal(w.currentName(), "Ale");
  assert.deepEqual(w.removed, []);
  assert.equal(w.modeCalls(), 0);
  assert.equal(w.input.value, "algo escrito");
});

test("limpiarIdentidadRetirada: con casaca renombrada usa la identidad base capturada antes de la baja", () => {
  const w = makeLocalIdentityWorld({ currentLocalResponseName: "Tito" });
  assert.equal(w.limpiar("Pablo de Achaval", "Pablo de Achaval"), true);
  assert.equal(w.currentName(), "");
  // y una casaca que casualmente se llama igual que la identidad retirada NO alcanza
  const otro = makeLocalIdentityWorld({ currentLocalResponseName: "Ale" });
  assert.equal(otro.limpiar("Ale", "Fran Forrester"), false);
  assert.deepEqual(otro.removed, []);
});

test("el handler de baja limpia la identidad local sólo después de que el writer devuelve true", () => {
  const i = demo.indexOf("getElementById('roster-manage-list').addEventListener('click'");
  const h = demo.slice(i, demo.indexOf("\n});", i));
  const propia = h.indexOf("responseDelJugadorActual()");
  const escribe = h.indexOf("await sacarDelRoster(");
  const falla = h.indexOf("if(!ok){");
  const limpia = h.indexOf("limpiarIdentidadRetirada(nombre, identidadPropia)");
  assert.ok(propia > -1 && propia < escribe, "captura la identidad propia ANTES de escribir (la response va a desaparecer)");
  assert.ok(limpia > falla && falla > escribe, "sólo tras el chequeo de éxito");
});
