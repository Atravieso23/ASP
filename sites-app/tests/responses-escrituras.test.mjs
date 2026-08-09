// PR-3 — una acción que cambia UNA response no puede escribir el blob local entero.
//
// Última excepción que quedaba después de PR-1 (persist() no pisa responses) y PR-2
// (Equipos con overlay focalizado): los pagos, los invitados y las bajas guardaban
// serializando la copia local completa, así que además de borrar responses ajenas
// escribían matchInfo, history, sedes, formations, frequentAliases y las posiciones
// locales de todos.
//
// Mismo mecanismo que persist-responses.test.mjs: se ejecuta el código REAL de
// demo.html en un node:vm con un Supabase de mentira. Las funciones bajo prueba no
// tocan el DOM a propósito, justamente para poder correrlas acá.
//
// No se afirma nada sobre el texto del archivo: cualquier implementación que preserve
// estas invariantes pasa.
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

// Los motivos de fallo y la cola son declaraciones, no funciones: se extraen del
// archivo real para que el test no las repita a mano y un rename se note.
function extractDeclaration(source, name) {
  const match = source.match(new RegExp(`^(?:const|let)\\s+${name}\\s*=\\s*.+;$`, "m"));
  assert.ok(match, `no encontré la declaración ${name} en demo.html`);
  return match[0];
}

const NEEDED = [
  "fetchServerState",
  "saveState",
  "updateKnownSets",
  "syncLocalAvailabilityWithPlayers",
  "chooseBalancedTeam",
  "responseBelongsToCurrentDevice",
  "guardarCambioEnResponses",
  "ejecutarCambioEnResponses",
  "marcarMiPago",
  "marcarPagoDeInvitado",
  "agregarInvitado",
  "eliminarInvitado",
  "eliminarJugador",
  "savePlayerRegistration",
];

const DEVICE = "device-propio";

// `failWrites` rechaza sólo las primeras N escrituras, para separar la 1ª de la 2ª.
// `db.ops` guarda el orden real de lecturas y escrituras: es lo que demuestra que la
// segunda operación no empezó a leer antes de que la primera terminara de escribir.
function makeWorld({ row, failRead = false, failWrite = false, failWrites = 0 } = {}) {
  const fila = row || BASE_ROW();
  const db = { row: structuredClone(fila), writes: 0, reads: 0, rejectedWrites: 0, ops: [] };
  let porRechazar = failWrites;

  const supabaseClient = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          db.reads++;
          db.ops.push("lectura");
          if (failRead) return Promise.resolve({ data: null, error: { message: "lectura rechazada" } });
          return Promise.resolve({ data: { data: structuredClone(db.row) }, error: null });
        },
        upsert(payload) {
          if (failWrite || porRechazar > 0) {
            if (porRechazar > 0) porRechazar--;
            db.rejectedWrites++;
            db.ops.push("escritura rechazada");
            return Promise.resolve({ error: { message: "guardado rechazado" } });
          }
          db.writes++;
          db.ops.push("escritura");
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
    let currentSessionUserId = ${JSON.stringify(DEVICE)};
    ${extractDeclaration(demo, "INVITADO_DUPLICADO")}
    ${extractDeclaration(demo, "INVITADO_SIN_ANFITRION")}
    ${extractDeclaration(demo, "colaDeResponses")}
    ${NEEDED.map((n) => extractFunction(demo, n)).join("\n")}
    `,
    context,
  );

  // Estado inicial del cliente, como lo dejaría init().
  vm.runInContext(
    `
    state = ${JSON.stringify(fila)};
    localAvailabilityResponses = state.responses;
    updateKnownSets(state);
    `,
    context,
  );

  return {
    db,
    run: (code) => vm.runInContext(code, context),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context)),
  };
}

const RESPONSE = (id, name, extra = {}) => ({
  responseId: id, ownerId: `owner-${id}`, ownerIds: [`owner-${id}`],
  name, status: "in", from: "16:00", to: "20:00",
  paid: false, team: "negro", isGuest: false, invitedBy: null,
  updatedAt: "2026-08-08T12:00:00.000Z", ...extra,
});

// El team del player tiene que coincidir con el de su response: si no, la derivación
// anula la posición —con razón— y el fixture mediría otra cosa.
const PLAYER = (name, pos, team = "negro") => ({
  name, status: "in", team, paid: false, pos, number: null, isCaptain: false,
});

const BASE_ROW = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "Cancha", type: "F8", priceTotal: "96000", alias: "a.b" },
  responses: [
    RESPONSE("r-propia", "Felix", { ownerId: DEVICE, ownerIds: [DEVICE] }),
    RESPONSE("r-invitado", "Tino", { ownerId: DEVICE, ownerIds: [DEVICE], isGuest: true, invitedBy: "Felix", team: "blanco" }),
    RESPONSE("r-ariel", "Ariel"),
    RESPONSE("r-bruno", "Bruno", { team: "blanco" }),
    // Sólo para la baja de jugador: si se borrara a alguien que además recibe los
    // cambios remotos, el test no distinguiría la baja del pisado.
    RESPONSE("r-camilo", "Camilo"),
  ],
  players: [
    PLAYER("Felix", { x: 20, y: 20 }),
    PLAYER("Tino", { x: 30, y: 30 }, "blanco"),
    PLAYER("Ariel", { x: 40, y: 40 }),
    PLAYER("Bruno", { x: 50, y: 50 }, "blanco"),
    PLAYER("Camilo", { x: 60, y: 60 }),
  ],
  history: [],
  sedes: [{ name: "Cancha", address: "Calle 1" }],
  formations: { negro: "3-2-2", blanco: "3-2-2" },
  frequentAliases: ["a.b"],
});

const resp = (row, id) => (row.responses || []).find((r) => r.responseId === id);
const jugador = (row, name) => (row.players || []).find((p) => p.name === name);

// Las seis acciones bajo prueba, cada una con la forma de invocarla y el efecto que
// debe haber dejado en la fila. Sirve para correr las invariantes comunes sobre todas
// sin repetir el cuerpo del test seis veces.
const ACCIONES = [
  {
    nombre: "mi pago",
    llamar: "marcarMiPago(true)",
    verificar: (row) => assert.equal(resp(row, "r-propia").paid, true),
  },
  {
    nombre: "pago de invitado",
    llamar: `marcarPagoDeInvitado("r-invitado", true)`,
    verificar: (row) => assert.equal(resp(row, "r-invitado").paid, true),
  },
  {
    nombre: "agregar invitado",
    llamar: `agregarInvitado("Ruso").then(r => r.ok)`,
    verificar: (row) => assert.ok(row.responses.some((r) => r.name === "Ruso")),
  },
  {
    nombre: "eliminar invitado",
    llamar: `eliminarInvitado("r-invitado")`,
    verificar: (row) => assert.ok(!resp(row, "r-invitado")),
  },
  {
    nombre: "eliminar jugador",
    llamar: `eliminarJugador("r-camilo")`,
    verificar: (row) => assert.ok(!resp(row, "r-camilo")),
  },
  {
    nombre: "alta de disponibilidad",
    llamar: `savePlayerRegistration({
      responseId: "r-propia", ownerId: ${JSON.stringify(DEVICE)}, ownerIds: [${JSON.stringify(DEVICE)}],
      name: "Felix", status: "duda", from: "17:00", to: "21:00", paid: null, team: null,
      updatedAt: "2026-08-09T12:00:00.000Z"
    }).then(r => r.ok)`,
    verificar: (row) => assert.equal(resp(row, "r-propia").status, "duda"),
  },
];

// ── Fail-closed: sin lectura fresca no se escribe nada ──
for (const accion of ACCIONES) {
  test(`${accion.nombre}: sin lectura fresca no escribe y deja el servidor intacto`, async () => {
    const w = makeWorld({ failRead: true });
    const antes = structuredClone(w.db.row);
    const localesAntes = w.json("localAvailabilityResponses");

    const ok = await w.run(accion.llamar);

    assert.equal(ok, false, "la acción debe avisar que no se guardó");
    assert.equal(w.db.writes, 0, "no debe escribir sin saber contra qué escribe");
    assert.equal(w.db.rejectedWrites, 0, "ni siquiera debe intentar la escritura");
    assert.deepEqual(w.db.row, antes, "el servidor queda intacto");
    assert.deepEqual(w.json("localAvailabilityResponses"), localesAntes,
      "el estado local tampoco se toca");
    assert.equal(w.json("saving"), false, "saving vuelve a false");
  });

  test(`${accion.nombre}: una sola escritura`, async () => {
    const w = makeWorld();
    const ok = await w.run(accion.llamar);
    assert.equal(ok, true);
    assert.equal(w.db.writes, 1, "cada acción es exactamente una escritura");
    accion.verificar(w.db.row);
  });

  // ── Save-first: un guardado rechazado no puede publicarse localmente ──
  test(`${accion.nombre}: un guardado rechazado no modifica el estado local`, async () => {
    const w = makeWorld({ failWrite: true });
    const localesAntes = w.json("localAvailabilityResponses");
    const conocidosAntes = w.json("[...knownPlayerNames]");

    const ok = await w.run(accion.llamar);

    assert.equal(ok, false);
    assert.equal(w.db.rejectedWrites, 1);
    assert.deepEqual(w.json("localAvailabilityResponses"), localesAntes,
      "el cambio no puede quedar en pantalla si el servidor lo rechazó");
    assert.deepEqual(w.json("state.responses"), localesAntes,
      "state.responses tampoco puede adelantarse al servidor");
    assert.deepEqual(w.json("[...knownPlayerNames]"), conocidosAntes,
      "un guardado rechazado no registra nombres como ya conocidos");
    assert.equal(w.json("saving"), false);
  });
}

// ── Preservación: nada de lo que la acción no toca puede cambiar ──
// Cada cambio remoto ocurre DESPUÉS del último sondeo de este cliente: es el otro
// teléfono escribiendo mientras acá se toca un botón.
const REMOTOS = [
  {
    nombre: "un pago ajeno",
    aplicar: (row) => { resp(row, "r-ariel").paid = true; },
    esperar: (row) => assert.equal(resp(row, "r-ariel").paid, true),
  },
  {
    nombre: "un cambio de equipo ajeno",
    aplicar: (row) => { resp(row, "r-bruno").team = "negro"; },
    esperar: (row) => assert.equal(resp(row, "r-bruno").team, "negro"),
  },
  {
    nombre: "un claim ajeno",
    aplicar: (row) => { resp(row, "r-bruno").ownerIds.push("device-B"); },
    esperar: (row) => assert.ok(resp(row, "r-bruno").ownerIds.includes("device-B")),
  },
  {
    nombre: "un alta ajena",
    aplicar: (row) => { row.responses.push(RESPONSE("r-kevin", "Kevin")); },
    esperar: (row) => assert.ok(resp(row, "r-kevin"), "el alta remota no puede desaparecer"),
  },
  {
    nombre: "un borrado ajeno",
    aplicar: (row) => { row.responses = row.responses.filter((r) => r.responseId !== "r-bruno"); },
    esperar: (row) => assert.ok(!resp(row, "r-bruno"), "un borrado remoto no puede resucitar"),
  },
  {
    nombre: "una posición arrastrada en otro teléfono",
    aplicar: (row) => { jugador(row, "Bruno").pos = { x: 80, y: 40 }; },
    esperar: (row) => assert.deepEqual(jugador(row, "Bruno").pos, { x: 80, y: 40 },
      "un pago no tiene derecho a mover a nadie de la cancha"),
  },
  {
    nombre: "una edición de partido",
    aplicar: (row) => { row.matchInfo.priceTotal = "120000"; },
    esperar: (row) => assert.equal(row.matchInfo.priceTotal, "120000"),
  },
  {
    nombre: "una formación elegida",
    aplicar: (row) => { row.formations.negro = "4-2-1"; },
    esperar: (row) => assert.equal(row.formations.negro, "4-2-1"),
  },
  {
    nombre: "una cancha nueva",
    aplicar: (row) => { row.sedes.push({ name: "Cancha nueva", address: "Otra 456" }); },
    esperar: (row) => assert.ok(row.sedes.some((s) => s.name === "Cancha nueva")),
  },
  {
    nombre: "un alias frecuente",
    aplicar: (row) => { row.frequentAliases.push("alias.remoto"); },
    esperar: (row) => assert.ok(row.frequentAliases.includes("alias.remoto")),
  },
  {
    nombre: "una fecha finalizada",
    aplicar: (row) => { row.history.push({ finalizedAt: "2026-08-01T00:00:00.000Z" }); },
    esperar: (row) => assert.equal(row.history.length, 1),
  },
];

for (const accion of ACCIONES) {
  for (const remoto of REMOTOS) {
    test(`${accion.nombre} conserva ${remoto.nombre} hecho en otro dispositivo`, async () => {
      const w = makeWorld();
      // Sin sondear: este cliente sigue con su copia vieja, como en la vida real.
      remoto.aplicar(w.db.row);

      const ok = await w.run(accion.llamar);

      assert.equal(ok, true, "la acción propia tiene que entrar igual");
      accion.verificar(w.db.row);
      remoto.esperar(w.db.row);
    });
  }
}

// ── Objetivo ausente: si otro dispositivo lo borró, no se lo resucita ──
const OBJETIVOS = [
  { nombre: "mi pago", llamar: "marcarMiPago(true)", borrar: "r-propia" },
  { nombre: "pago de invitado", llamar: `marcarPagoDeInvitado("r-invitado", true)`, borrar: "r-invitado" },
  { nombre: "eliminar invitado", llamar: `eliminarInvitado("r-invitado")`, borrar: "r-invitado" },
  { nombre: "eliminar jugador", llamar: `eliminarJugador("r-camilo")`, borrar: "r-camilo" },
  { nombre: "agregar invitado", llamar: `agregarInvitado("Ruso").then(r => r.ok)`, borrar: "r-propia" },
];

for (const objetivo of OBJETIVOS) {
  test(`${objetivo.nombre}: si la response objetivo ya no está, no escribe`, async () => {
    const w = makeWorld();
    w.db.row.responses = w.db.row.responses.filter((r) => r.responseId !== objetivo.borrar);
    const antes = structuredClone(w.db.row);

    const ok = await w.run(objetivo.llamar);

    assert.equal(ok, false);
    assert.equal(w.db.writes, 0, "no se escribe sobre un objetivo que ya no existe");
    assert.deepEqual(w.db.row, antes);
  });
}

// ── Reglas propias de agregar invitado ──
test("agregar invitado revalida el duplicado contra el servidor", async () => {
  const w = makeWorld();
  // Otro teléfono agregó el mismo nombre después de nuestro último sondeo: el chequeo
  // local no lo ve.
  w.db.row.responses.push(RESPONSE("r-otro-ruso", "Ruso", { isGuest: true }));
  const antes = structuredClone(w.db.row);

  const resultado = await w.run(`agregarInvitado("Ruso")`);

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "duplicado", "el aviso tiene que distinguirse del de conexión");
  assert.equal(w.db.writes, 0);
  assert.deepEqual(w.db.row, antes);
});

test("agregar invitado balancea contra las responses del servidor", async () => {
  const w = makeWorld();
  // Con la copia local hay 2 en negro (Felix, Ariel) y 1 en blanco (Tino/Bruno son
  // blanco: 2). Remotamente entran dos más en blanco, así que el balanceo correcto
  // manda al invitado nuevo al negro.
  w.db.row.responses.push(RESPONSE("r-x", "Xavi", { team: "blanco" }));
  w.db.row.responses.push(RESPONSE("r-y", "Yago", { team: "blanco" }));

  await w.run(`agregarInvitado("Ruso")`);

  const nuevo = w.db.row.responses.find((r) => r.name === "Ruso");
  assert.equal(nuevo.team, "negro", "el balanceo no puede calcularse sobre una foto vieja");
});

test("agregar invitado cuelga al invitado del anfitrión fresco", async () => {
  const w = makeWorld();
  await w.run(`agregarInvitado("Ruso")`);
  const nuevo = w.db.row.responses.find((r) => r.name === "Ruso");
  assert.equal(nuevo.invitedBy, "Felix");
  assert.equal(nuevo.isGuest, true);
  assert.ok(nuevo.responseId, "todo invitado nace con responseId");
});

// ── Derivación desacoplada: los players salen de las responses frescas ──
test("los players derivados salen de los del servidor, no de los locales", async () => {
  const w = makeWorld();
  // Este cliente movió a Bruno en pantalla sin guardar; el servidor tiene otra cosa.
  w.run(`state.players.find(p => p.name === "Bruno").pos = {x:11, y:11};`);
  w.db.row.players.find((p) => p.name === "Bruno").pos = { x: 77, y: 77 };

  await w.run("marcarMiPago(true)");

  assert.deepEqual(jugador(w.db.row, "Bruno").pos, { x: 77, y: 77 },
    "la posición local sin guardar no puede viajar en una escritura de pago");
});

test("los players derivados reflejan status, paid y team de las responses", async () => {
  const w = makeWorld();
  w.db.row.responses.find((r) => r.responseId === "r-ariel").team = "blanco";

  await w.run("marcarMiPago(true)");

  assert.equal(jugador(w.db.row, "Felix").paid, true, "paid se deriva de la response");
  assert.equal(jugador(w.db.row, "Ariel").team, "blanco", "team se deriva de la response");
});

test("eliminar una response elimina su player derivado", async () => {
  const w = makeWorld();
  await w.run(`eliminarJugador("r-ariel")`);
  assert.ok(!jugador(w.db.row, "Ariel"), "no puede quedar un player sin response que lo respalde");
});

test("agregar un invitado crea su player derivado", async () => {
  const w = makeWorld();
  await w.run(`agregarInvitado("Ruso")`);
  assert.ok(jugador(w.db.row, "Ruso"), "el invitado nuevo tiene que aparecer en la cancha");
});

// ── La cola: dos acciones disparadas juntas en el MISMO dispositivo ──
// Sin serializar, las dos leen el mismo estado y la segunda pisa a la primera, con las
// dos avisando éxito. Es la misma pérdida que el PR arregla entre teléfonos, pero
// dentro de uno solo: cada control se deshabilita a sí mismo y nada más.
test("dos acciones simultáneas preservan ambos cambios", async () => {
  const w = makeWorld();

  const [a, b] = await Promise.all([
    w.run("marcarMiPago(true)"),
    w.run(`marcarPagoDeInvitado("r-invitado", true)`),
  ]);

  assert.equal(a, true);
  assert.equal(b, true);
  assert.equal(resp(w.db.row, "r-propia").paid, true, "el primer pago no puede perderse");
  assert.equal(resp(w.db.row, "r-invitado").paid, true, "el segundo tampoco");
  assert.equal(w.db.writes, 2, "una escritura por acción, ni más ni menos");
});

test("la segunda operación no lee hasta que la primera terminó de escribir", async () => {
  const w = makeWorld();

  await Promise.all([
    w.run("marcarMiPago(true)"),
    w.run(`marcarPagoDeInvitado("r-invitado", true)`),
  ]);

  assert.deepEqual(w.db.ops, ["lectura", "escritura", "lectura", "escritura"],
    "intercaladas serían lectura, lectura, escritura, escritura: la segunda pisaría");
});

test("cada `true` corresponde a un cambio que quedó en el servidor", async () => {
  const w = makeWorld();

  const resultados = await Promise.all([
    w.run("marcarMiPago(true)"),
    w.run(`marcarPagoDeInvitado("r-invitado", true)`),
    w.run(`eliminarJugador("r-camilo")`),
  ]);

  assert.deepEqual(resultados, [true, true, true]);
  assert.equal(resp(w.db.row, "r-propia").paid, true);
  assert.equal(resp(w.db.row, "r-invitado").paid, true);
  assert.ok(!resp(w.db.row, "r-camilo"));
});

test("una operación rechazada no envenena la cola", async () => {
  // Sólo la primera escritura se rechaza.
  const w = makeWorld({ failWrites: 1 });

  const [a, b] = await Promise.all([
    w.run("marcarMiPago(true)"),
    w.run(`marcarPagoDeInvitado("r-invitado", true)`),
  ]);

  assert.equal(a, false, "la primera falló");
  assert.equal(b, true, "la segunda tiene que haber arrancado igual y guardado");
  assert.equal(resp(w.db.row, "r-propia").paid, false, "lo rechazado no quedó");
  assert.equal(resp(w.db.row, "r-invitado").paid, true);
  assert.deepEqual(w.db.ops, ["lectura", "escritura rechazada", "lectura", "escritura"],
    "la segunda hace su propia lectura fresca después del fallo");

  // Y la cola sigue usable para una tercera.
  const c = await w.run("marcarMiPago(true)");
  assert.equal(c, true);
  assert.equal(resp(w.db.row, "r-propia").paid, true);
});

test("un overlay que lanza tampoco envenena la cola", async () => {
  const w = makeWorld();

  await assert.rejects(w.run(`guardarCambioEnResponses(() => { throw new Error("boom"); })`));

  const ok = await w.run("marcarMiPago(true)");
  assert.equal(ok, true, "la siguiente operación tiene que poder arrancar");
  assert.equal(resp(w.db.row, "r-propia").paid, true);
  assert.equal(w.json("saving"), false, "y saving no puede quedar trabado");
});

test("saving cubre cada operación real de la cola", async () => {
  const w = makeWorld();
  // Se muestrea dentro del overlay de la segunda, que corre después de que la primera
  // publicó: si la bandera no cubriera cada operación, acá se vería false.
  w.run("globalThis.savingEnElOverlay = null;");

  await Promise.all([
    w.run("marcarMiPago(true)"),
    w.run(`guardarCambioEnResponses(responses => {
      globalThis.savingEnElOverlay = saving;
      const t = responses.find(r => r.responseId === "r-invitado");
      if (!t) return false;
      t.paid = true;
      return true;
    })`),
  ]);

  assert.equal(w.json("globalThis.savingEnElOverlay"), true);
  assert.equal(w.json("saving"), false, "y vuelve a false al terminar todo");
});

// ── syncLocalAvailabilityWithPlayers sin argumentos sigue operando sobre state ──
test("la derivación sin argumentos sigue trabajando sobre el estado global", async () => {
  const w = makeWorld();
  w.run(`localAvailabilityResponses = localAvailabilityResponses.filter(r => r.name !== "Ariel");
         syncLocalAvailabilityWithPlayers();`);
  assert.ok(!w.json("state.players").some((p) => p.name === "Ariel"),
    "el comportamiento por defecto no cambia");
});
