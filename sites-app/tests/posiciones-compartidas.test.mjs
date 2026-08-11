// D2 — un dueño para `players.pos` y `state.formations`.
//
// Decisión de producto: lo que el organizador elige a propósito —arrastrar una
// ficha, elegir una formación— es intención explícita y estado COMPARTIDO del
// partido. Se persiste y los demás dispositivos tienen que poder verlo, así que
// el servidor manda sobre los dos campos. Lo que calculan proyectarPosiciones()
// y el default de formacionEfectiva() es sólo dibujo: no se persiste y no se
// convierte en intención por render ni por sondeo (eso lo cierra D1 /
// render-puro).
//
// Los dos van juntos por necesidad, no por comodidad: un cambio de formación
// reacomoda a su equipo, así que adoptar las posiciones nuevas conservando la
// formación vieja dibuja las fichas contra slots que no eligió nadie.
//
// Lo que faltaba después de D1 era la otra mitad de la política:
//
//   - los writers de `pos` —arrastre, formación, cambio de equipo— seguían
//     usando persist(), que serializa la copia local: viajaban matchInfo,
//     history, sedes y frequentAliases viejos, y encima mutaban el estado
//     global antes de saber si el servidor aceptaba;
//   - la LECTURA hacía local-wins sobre players y sobre formations:
//     mergePlayers conserva el objeto local entero y las claves locales de
//     formations se superponían a las frescas, así que ni una `pos` ni una
//     formación remota confirmadas llegaban nunca por sondeo. Ese es el
//     escenario histórico: B arrastra, A tenía estado viejo, A hace cualquier
//     otra cosa y la posición de B se pierde.
//
// Acá se prueba el código REAL de demo.html en un node:vm con un Supabase de
// mentira, igual que sedes-focalizadas y historial-partido-focalizado. El
// arrastre en sí depende del DOM (pointerdown/pointerup), así que su escritura
// vive en una función nombrada y sin DOM que se prueba directo; del handler se
// afirma sólo que la usa y que no muta antes de guardar.
//
// Fuera de D2 a propósito: Editar partido / cambio de tipo (sigue en persist()),
// CAS/rev, reintentos y el mapeo inteligente de posiciones entre tipos de cancha.
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

function extractDecl(source, name) {
  const oneLine = source.match(new RegExp(`^const\\s+${name}\\s*=\\s*.+;$`, "m"));
  if (oneLine) return oneLine[0];
  const multi = source.match(new RegExp(`^const\\s+${name}\\s*=\\s*\\{[\\s\\S]*?^\\};`, "m"));
  assert.ok(multi, `no encontré la declaración ${name} en demo.html`);
  return multi[0];
}

/* ---------- Stub de DOM: lo mínimo que usan el sondeo y el selector ---------- */

function fakeElement(id = "") {
  const el = {
    id,
    style: {},
    dataset: {},
    value: "",
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(child) { return child; },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    closest() { return null; },
  };
  return el;
}

function fakeDocument() {
  const porId = new Map();
  return {
    activeElement: null,
    getElementById(id) {
      if (!porId.has(id)) porId.set(id, fakeElement(id));
      return porId.get(id);
    },
    createElement() { return fakeElement(); },
  };
}

const NEEDED = [
  // fetchServerState delega la lectura cruda: sin esto no resuelve el nombre.
  "leerEstadoDelServidor",
  "fetchServerState",
  "saveState",
  "updateKnownSets",
  "mergeKeepingDeletions",
  "mergePlayers",
  "mergeSedesArr",
  "adoptarPosicionesCompartidas",
  "syncLocalAvailabilityWithPlayers",
  "reconciliarPlayers",
  "responseBelongsToCurrentDevice",
  "persistFocalizado",
  "getFormationOptions",
  "formacionEfectiva",
  // Sólo para la mutación que lo mete en el sondeo: el default no se materializa nunca.
  "ensureFormationDefaults",
  "guardarPosicionArrastrada",
  "cambiarFormacion",
  "cambiarEquipoDeJugador",
  "refreshFromServer",
];

const DISPOSITIVO_A = "device-a";

const PLAYER = (name, extra = {}) => ({
  name, status: "in", team: "negro", paid: false,
  pos: null, number: null, isCaptain: false, ...extra,
});

const RESPONSE = (name, extra = {}) => ({
  responseId: `r-${name.toLowerCase()}`, ownerId: `o-${name}`, ownerIds: [`o-${name}`],
  name, status: "in", from: "16:00", to: "20:00",
  paid: false, team: "negro", isGuest: false, updatedAt: "2026-08-08T12:00:00.000Z", ...extra,
});

// F5: cinco por equipo, opciones ['1-2-1','2-2','1-1-2'].
const BASE_ROW = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "Cancha", type: "F5", priceTotal: "200000", alias: "a.b" },
  players: [
    PLAYER("Ana"), PLAYER("Beto"),
    PLAYER("Caro", { team: "blanco" }), PLAYER("Dani", { team: "blanco" }),
  ],
  history: [{ finalizedAt: "2026-07-04T22:00:00.000Z", matchInfo: { date: "2026-07-04" }, players: [], responses: [], formations: {} }],
  sedes: [{ name: "Cancha", address: "Av. Siempreviva 742" }],
  formations: { negro: "1-2-1", blanco: "1-2-1" },
  responses: [
    RESPONSE("Ana", { ownerId: DISPOSITIVO_A, ownerIds: [DISPOSITIVO_A] }),
    RESPONSE("Beto"),
    RESPONSE("Caro", { team: "blanco" }),
    RESPONSE("Dani", { team: "blanco" }),
  ],
  frequentAliases: ["alias.viejo"],
});

// `local` deja armar el clásico "este dispositivo tiene estado viejo": la copia
// local y la fila del servidor arrancan distintas.
function makeWorld({ row, local, failRead = false, failWrite = false } = {}) {
  const servidor = row || BASE_ROW();
  const db = { row: structuredClone(servidor), writes: 0, reads: 0, rejectedWrites: 0 };
  const copiaLocal = local || structuredClone(servidor);
  const document = fakeDocument();

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

  const toasts = [];
  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    structuredClone,
    Set, Map, Array, Object, JSON, Date, Boolean, Number, String, Promise, Math, Error, Infinity,
    document,
    supabaseClient,
    ROW_ID: 1,
    toasts,
    db,
  });

  vm.runInContext(
    `
    ${extractDecl(demo, "FORMATIONS")}
    ${extractDecl(demo, "FORMACION_ERROR_GUARDADO")}
    ${extractDecl(demo, "FORMACION_ERROR_TIPO")}
    let state = null;
    let saving = false;
    let localAvailabilityResponses = [];
    let currentLocalResponseName = '';
    let recurrentPlayers = [];
    let knownPlayerNames = new Set();
    let knownSedeNames = new Set();
    let currentSessionUserId = ${JSON.stringify(DISPOSITIVO_A)};
    let renders = 0;
    function render(){ renders++; }
    function renderLocalOrganizer(){}
    function renderGuestManager(){}
    function saveLocalFormationState(){}
    function showToast(mensaje){ toasts.push(mensaje); }
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

  return {
    db,
    toasts,
    document,
    run: (code) => vm.runInContext(code, context),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context)),
    snapshot: () => JSON.parse(vm.runInContext("JSON.stringify(state)", context)),
  };
}

const enServidor = (w, nombre) => w.db.row.players.find((p) => p.name === nombre);
const enLocal = (w, nombre) => w.json("state.players").find((p) => p.name === nombre);

const arrastrar = (nombre, pos, team = "negro", intercambio = null) =>
  `guardarPosicionArrastrada(${JSON.stringify(team)}, ${JSON.stringify(nombre)}, ${JSON.stringify(pos)}, ${JSON.stringify(intercambio)})`;

/* ═════════════════ 1. El arrastre escribe intención compartida ═════════════════ */

test("el arrastre guarda la posición sobre el estado fresco", async () => {
  const w = makeWorld();

  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.equal(ok, true);
  assert.equal(w.db.writes, 1, "exactamente una escritura por arrastre");
  assert.deepEqual(enServidor(w, "Ana").pos, { x: 30, y: 70 });
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 30, y: 70 },
    "la copia local tiene que quedar en lo mismo que el servidor");
});

test("arrastrar no materializa las posiciones automáticas de los demás", async () => {
  const w = makeWorld();

  await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  const conPos = w.db.row.players.filter((p) => p.pos).map((p) => p.name);
  assert.deepEqual(conPos, ["Ana"],
    "se publicaron posiciones que nadie arrastró");
});

test("arrastrar a un jugador no pisa la posición del otro", async () => {
  const row = BASE_ROW();
  row.players.find((p) => p.name === "Beto").pos = { x: 80, y: 20 };
  const w = makeWorld({ row });

  await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.deepEqual(enServidor(w, "Ana").pos, { x: 30, y: 70 });
  assert.deepEqual(enServidor(w, "Beto").pos, { x: 80, y: 20 },
    "la posición del otro jugador se perdió");
});

test("el intercambio mueve a los dos y a nadie más", async () => {
  const row = BASE_ROW();
  row.players.find((p) => p.name === "Beto").pos = { x: 50, y: 50 };
  const w = makeWorld({ row });

  // Ana estaba dibujada en {20,20} y se la suelta encima de Beto.
  const ok = await w.run(arrastrar("Ana", { x: 50, y: 50 }, "negro", { name: "Beto", pos: { x: 20, y: 20 } }));

  assert.equal(ok, true);
  assert.equal(w.db.writes, 1, "un intercambio sigue siendo una sola escritura");
  assert.deepEqual(enServidor(w, "Ana").pos, { x: 50, y: 50 });
  assert.deepEqual(enServidor(w, "Beto").pos, { x: 20, y: 20 },
    "el desplazado no heredó el lugar del arrastrado");
  assert.equal(enServidor(w, "Caro").pos, null);
});

test("un arrastre nunca revierte matchInfo, history, sedes, aliases ni responses ajenas", async () => {
  // Este dispositivo quedó con estado viejo de todo.
  const viejo = BASE_ROW();
  const w = makeWorld({ local: viejo });
  // Y mientras tanto el resto del grupo cambió cada una de esas cosas.
  w.db.row.matchInfo.time = "21:00";
  w.db.row.history.push({ finalizedAt: "2026-08-01T22:00:00.000Z", matchInfo: {}, players: [], responses: [], formations: {} });
  w.db.row.sedes.push({ name: "Polideportivo", address: "Calle 8" });
  w.db.row.frequentAliases.unshift("alias.nuevo");
  w.db.row.responses.find((r) => r.name === "Beto").paid = true;
  w.db.row.responses.push(RESPONSE("Kevin", { team: "blanco" }));
  w.db.row.players.push(PLAYER("Kevin", { team: "blanco" }));

  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.equal(ok, true);
  assert.equal(w.db.row.matchInfo.time, "21:00", "el arrastre revirtió matchInfo");
  assert.equal(w.db.row.history.length, 2, "el arrastre revirtió el historial");
  assert.equal(w.db.row.sedes.length, 2, "el arrastre revirtió las canchas");
  assert.deepEqual(w.db.row.frequentAliases, ["alias.nuevo", "alias.viejo"],
    "el arrastre revirtió los alias frecuentes");
  assert.equal(w.db.row.responses.find((r) => r.name === "Beto").paid, true,
    "el arrastre revirtió un pago ajeno");
  assert.ok(w.db.row.responses.some((r) => r.name === "Kevin"), "el arrastre borró un alta ajena");
});

test("un guardado rechazado no deja la posición en ningún lado, ni siquiera volviendo de null", async () => {
  const w = makeWorld({ failWrite: true });
  const antesLocal = w.snapshot();
  const antesServidor = structuredClone(w.db.row);

  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.equal(ok, false, "no puede decir que guardó");
  assert.equal(enLocal(w, "Ana").pos, null,
    "la posición rechazada quedó sólo en este teléfono");
  assert.deepEqual(w.snapshot(), antesLocal, "el estado local no quedó exacto");
  assert.deepEqual(w.db.row, antesServidor);
  assert.equal(w.json("saving"), false);
});

test("un guardado rechazado tampoco pisa la posición previa", async () => {
  const row = BASE_ROW();
  row.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ row, failWrite: true });

  await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.deepEqual(enLocal(w, "Ana").pos, { x: 10, y: 10 },
    "el rollback tiene que volver a la posición persistida");
});

test("sin lectura fresca el arrastre no escribe nada", async () => {
  const w = makeWorld({ failRead: true });
  const antesLocal = w.snapshot();

  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0);
  assert.equal(w.db.rejectedWrites, 0, "ni siquiera intentó escribir");
  assert.deepEqual(w.snapshot(), antesLocal);
  assert.equal(w.json("saving"), false);
});

test("si el jugador ya no está en el estado fresco, el arrastre falla cerrado", async () => {
  const w = makeWorld();
  // Otro dispositivo borró la respuesta de Ana y con ella su jugador.
  w.db.row.players = w.db.row.players.filter((p) => p.name !== "Ana");
  w.db.row.responses = w.db.row.responses.filter((r) => r.name !== "Ana");
  const antes = structuredClone(w.db.row);

  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.equal(ok, false, "no resucita a un jugador borrado");
  assert.equal(w.db.writes, 0);
  assert.deepEqual(w.db.row, antes);
});

test("si el jugador cambió de equipo en otro dispositivo, el arrastre falla cerrado", async () => {
  const w = makeWorld();
  // Una posición pertenece al equipo en el que se la arrastró: si allá ya no está,
  // escribirla la pondría en una cancha que el organizador nunca miró.
  w.db.row.players.find((p) => p.name === "Ana").team = "blanco";
  w.db.row.responses.find((r) => r.name === "Ana").team = "blanco";

  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }, "negro"));

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0);
  assert.equal(enServidor(w, "Ana").pos, null);
});

test("si el jugador dejó de estar confirmado, el arrastre falla cerrado", async () => {
  const w = makeWorld();
  // Con el equipo intacto a propósito: la condición que tiene que cortar acá es el
  // status. Si sólo se mirara el equipo, un blob todavía sin derivar dejaría escribir
  // la posición de alguien que ya no juega.
  w.db.row.players.find((p) => p.name === "Ana").status = "duda";
  w.db.row.responses.find((r) => r.name === "Ana").status = "duda";

  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0);
});

test("si el intercambiado ya no está, no se escribe medio intercambio", async () => {
  const w = makeWorld();
  w.db.row.players = w.db.row.players.filter((p) => p.name !== "Beto");
  w.db.row.responses = w.db.row.responses.filter((r) => r.name !== "Beto");

  const ok = await w.run(arrastrar("Ana", { x: 50, y: 50 }, "negro", { name: "Beto", pos: { x: 20, y: 20 } }));

  assert.equal(ok, false, "dejar a los dos encimados no es lo que pidió el organizador");
  assert.equal(w.db.writes, 0);
  assert.equal(enServidor(w, "Ana").pos, null);
});

test("si el desplazado se fue a otro equipo, tampoco se escribe medio intercambio", async () => {
  const w = makeWorld();
  w.db.row.players.find((p) => p.name === "Beto").team = "blanco";
  w.db.row.responses.find((r) => r.name === "Beto").team = "blanco";

  const ok = await w.run(arrastrar("Ana", { x: 50, y: 50 }, "negro", { name: "Beto", pos: { x: 20, y: 20 } }));

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0);
});

test("un arrastre no borra de la pantalla a un jugador que el blob todavía no tiene", async () => {
  // Su response está en el servidor pero su entrada en `players` no llegó al blob: este
  // dispositivo ya lo derivó y lo está dibujando. Adoptar fresh.players a secas lo haría
  // desaparecer de la cancha hasta el próximo sondeo.
  const w = makeWorld();
  w.db.row.responses.push(RESPONSE("Kevin"));

  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.equal(ok, true);
  assert.ok(w.json("state.players").some((p) => p.name === "Kevin"),
    "el jugador derivado de una response se perdió de la copia local");
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 30, y: 70 });
});

test("el handler de arrastre delega en el writer focalizado y no muta antes de guardar", () => {
  const drag = extractFunction(demo, "attachDragHandlers");
  assert.match(drag, /guardarPosicionArrastrada\(/,
    "el arrastre no usa el writer focalizado");
  assert.ok(!/await persist\(\)/.test(drag),
    "el arrastre sigue serializando la copia local con persist()");
  // Cualquier asignación a `.pos`, no sólo la de la variable que se llamaba `p`: lo que
  // no puede pasar es que el handler toque una posición antes de que el servidor
  // confirme, se llegue a ella como se llegue.
  assert.ok(!/\.pos\s*=[^=]/.test(drag),
    "el arrastre sigue mutando el estado global antes de saber si el servidor aceptó");
});

/* ═════════════════ 2. El sondeo hace converger la posición ═════════════════ */

test("una posición arrastrada en otro dispositivo llega por el sondeo", async () => {
  const w = makeWorld();
  // B arrastró a Ana. Este dispositivo todavía no lo sabe.
  w.db.row.players.find((p) => p.name === "Ana").pos = { x: 44, y: 66 };

  await w.run("refreshFromServer()");

  assert.deepEqual(enLocal(w, "Ana").pos, { x: 44, y: 66 },
    "la posición remota confirmada no converge: players gana localmente");
});

test("el sondeo no protege una posición local vieja contra la remota", async () => {
  const local = BASE_ROW();
  local.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ local });
  w.db.row.players.find((p) => p.name === "Ana").pos = { x: 44, y: 66 };

  await w.run("refreshFromServer()");

  assert.deepEqual(enLocal(w, "Ana").pos, { x: 44, y: 66 },
    "la posición local vieja le ganó a la remota confirmada");
});

test("el sondeo adopta también que una posición remota fue borrada", async () => {
  const local = BASE_ROW();
  local.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ local });
  // Otro dispositivo cambió la formación del negro: reseteó las posiciones.
  w.db.row.players.forEach((p) => { if (p.team === "negro") p.pos = null; });
  w.db.row.formations.negro = "2-2";

  await w.run("refreshFromServer()");

  assert.equal(enLocal(w, "Ana").pos, null,
    "el reseteo remoto de posiciones no llegó");
});

test("el sondeo sigue derivando status, paid y team desde responses", async () => {
  const w = makeWorld();
  w.db.row.responses.find((r) => r.name === "Beto").paid = true;
  w.db.row.responses.find((r) => r.name === "Caro").status = "duda";

  await w.run("refreshFromServer()");

  assert.equal(enLocal(w, "Beto").paid, true);
  assert.equal(enLocal(w, "Caro").status, "duda");
  assert.equal(enLocal(w, "Caro").team, null, "quien no está `in` no puede quedarse con equipo");
  assert.equal(enLocal(w, "Caro").pos, null);
});

test("un cambio remoto de equipo con posición nueva converge entero", async () => {
  const local = BASE_ROW();
  local.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ local });
  // Otro dispositivo pasó a Ana al blanco y la arrastró ahí.
  w.db.row.responses.find((r) => r.name === "Ana").team = "blanco";
  w.db.row.players.find((p) => p.name === "Ana").team = "blanco";
  w.db.row.players.find((p) => p.name === "Ana").pos = { x: 70, y: 30 };

  await w.run("refreshFromServer()");

  assert.equal(enLocal(w, "Ana").team, "blanco", "responses sigue siendo la autoridad del equipo");
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 70, y: 30 },
    "la derivación anuló la posición remota comparando contra el equipo local viejo");
});

test("el sondeo conserva lo que no es estado compartido del jugador", async () => {
  const local = BASE_ROW();
  const ana = local.players.find((p) => p.name === "Ana");
  ana.isCaptain = true;
  ana.number = 10;
  const w = makeWorld({ local });
  w.db.row.players.find((p) => p.name === "Ana").pos = { x: 44, y: 66 };

  await w.run("refreshFromServer()");

  assert.equal(enLocal(w, "Ana").isCaptain, true, "adoptar `pos` no puede arrastrarse el resto");
  assert.equal(enLocal(w, "Ana").number, 10);
});

test("adoptar la posición compartida no resucita lo que el merge descartó", () => {
  // La reconciliación de `pos` se apoya en mergeKeepingDeletions y no lo reemplaza:
  // un jugador que ya conocíamos y borramos a propósito no vuelve por adoptar su
  // posición. (El ciclo completo del sondeo lo vuelve a crear si su response sigue
  // viva, pero eso es la derivación desde responses, que es otra política.)
  const w = makeWorld();

  const resultado = w.json(`(function(){
    const fresh = [
      {name:'Ana', team:'negro', status:'in', pos:{x:44,y:66}},
      {name:'Dani', team:'blanco', status:'in', pos:{x:10,y:10}}
    ];
    const local = [{name:'Ana', team:'negro', status:'in', pos:null, isCaptain:true, number:9}];
    knownPlayerNames = new Set(['ana','dani']);
    return adoptarPosicionesCompartidas(mergePlayers(fresh, local), fresh);
  })()`);

  assert.deepEqual(resultado.map((p) => p.name), ["Ana"], "el borrado local se resucitó");
  assert.deepEqual(resultado[0].pos, { x: 44, y: 66 }, "no adoptó la posición remota");
  assert.equal(resultado[0].isCaptain, true);
  assert.equal(resultado[0].number, 9);
});

test("con el blob desincronizado, la posición remota igual sobrevive", async () => {
  // El persist() de Editar partido todavía hace local-wins sobre players, así que el
  // servidor puede quedar con players.team distinto de responses.team. Si la adopción
  // corriera antes de derivar, la derivación anularía la posición recién adoptada al
  // comparar contra un equipo viejo. Por eso `pos` se adopta al final.
  const local = BASE_ROW();
  const w = makeWorld({ local });
  const ana = w.db.row.players.find((p) => p.name === "Ana");
  ana.team = "blanco";
  ana.pos = { x: 44, y: 66 };

  await w.run("refreshFromServer()");

  assert.equal(enLocal(w, "Ana").team, "negro", "responses sigue siendo la autoridad del equipo");
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 44, y: 66 },
    "la derivación se comió la posición remota");
});

test("una posición borrada en el servidor viaja como null y no como ausencia", async () => {
  const local = BASE_ROW();
  local.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ local });
  delete w.db.row.players.find((p) => p.name === "Ana").pos;

  await w.run("refreshFromServer()");

  const ana = enLocal(w, "Ana");
  assert.ok("pos" in ana, "el jugador viaja sin la clave: un undefined desaparece al serializar");
  assert.equal(ana.pos, null);
});

test("el sondeo no toca nada mientras hay una escritura en curso", async () => {
  const w = makeWorld();
  w.db.row.players.find((p) => p.name === "Ana").pos = { x: 44, y: 66 };
  const antes = w.snapshot();

  w.run("saving = true");
  await w.run("refreshFromServer()");

  assert.deepEqual(w.snapshot(), antes,
    "el sondeo se coló en el medio de una escritura");
  assert.equal(w.db.reads, 0, "ni siquiera leyó");
});

test("cada writer de D2 bloquea el sondeo desde antes de leer y hasta el final", async () => {
  // El guard tiene que estar puesto cuando el servidor recibe la escritura: si se
  // levantara antes, el sondeo publicaría una lectura anterior a lo que se guardó.
  for (const accion of [
    arrastrar("Ana", { x: 30, y: 70 }),
    `cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`,
    `cambiarEquipoDeJugador('Ana','blanco')`,
  ]) {
    const w = makeWorld();
    // Se muestrea en los dos extremos: el guard tiene que estar puesto ya en la lectura
    // —si no, el sondeo se cuela entre leer y escribir— y seguir puesto en la escritura.
    w.run("savingDurante = []");
    w.run(`(function(){
      const leer = fetchServerState, guardar = saveState;
      fetchServerState = async function(){ savingDurante.push(saving); return leer(); };
      saveState = async function(s){ savingDurante.push(saving); return guardar(s); };
    })()`);

    await w.run(accion);

    assert.deepEqual(w.json("savingDurante"), [true, true],
      `${accion.slice(0, 24)}…: el sondeo no estaba bloqueado de punta a punta`);
    assert.equal(w.json("saving"), false, "el guard quedó trabado y congela el sondeo");
  }
});

/* ═════════════ 2 bis. La formación converge junto con la posición ═════════════ */

test("una formación elegida en otro dispositivo llega por el sondeo", async () => {
  const w = makeWorld();
  w.db.row.formations.negro = "2-2";

  await w.run("refreshFromServer()");

  assert.equal(w.json("state.formations.negro"), "2-2",
    "la formación remota no converge");
  assert.equal(w.run("formacionEfectiva('negro')"), "2-2");
});

test("una formación local vieja no le gana a la fresca", async () => {
  // Este dispositivo eligió '1-1-2' hace rato; otro eligió '2-2' después.
  const local = BASE_ROW();
  local.formations.negro = "1-1-2";
  const w = makeWorld({ local });
  w.db.row.formations.negro = "2-2";

  await w.run("refreshFromServer()");

  assert.equal(w.json("state.formations.negro"), "2-2",
    "la formación local explícita le ganó a la remota confirmada");
});

test("formación y posiciones convergen coherentes en el mismo refresh", async () => {
  // Esto es lo que quedaba roto: A cambia la formación del negro, que reacomoda a su
  // equipo. Si B adopta las posiciones reseteadas pero conserva su formación vieja,
  // dibuja las fichas contra slots que no son los de nadie.
  const local = BASE_ROW();
  local.formations.negro = "1-2-1";
  local.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  local.players.find((p) => p.name === "Beto").pos = { x: 20, y: 20 };
  const w = makeWorld({ local });
  w.db.row.formations.negro = "2-2";
  w.db.row.players.forEach((p) => { if (p.team === "negro") p.pos = null; });

  await w.run("refreshFromServer()");

  assert.equal(w.json("state.formations.negro"), "2-2");
  assert.equal(enLocal(w, "Ana").pos, null);
  assert.equal(enLocal(w, "Beto").pos, null);
  assert.equal(w.json("state.formations.blanco"), "1-2-1", "se tocó el otro equipo");
});

test("con formations vacío en el servidor la local explícita tampoco sobrevive", async () => {
  const local = BASE_ROW();
  local.formations = { negro: "1-1-2", blanco: "2-2" };
  const w = makeWorld({ local });
  w.db.row.formations = {};

  await w.run("refreshFromServer()");

  assert.deepEqual(w.json("state.formations"), {},
    "una formación local sin respaldo en el servidor siguió siendo autoridad");
  // Y el default se ve sin escribirse, que es lo que fijó D1.
  assert.equal(w.run("formacionEfectiva('negro')"), "1-2-1");
  assert.deepEqual(w.json("state.formations"), {},
    "calcular la formación efectiva materializó el default");
});

test("el sondeo de formación no materializa defaults ni posiciones automáticas", async () => {
  const w = makeWorld();
  w.db.row.formations = { negro: "2-2" };
  w.db.row.players.forEach((p) => { p.pos = null; });

  await w.run("refreshFromServer()");

  assert.deepEqual(w.json("state.formations"), { negro: "2-2" },
    "el sondeo completó la formación del otro equipo");
  assert.deepEqual(w.json("state.players").filter((p) => p.pos), [],
    "el sondeo fabricó posiciones que nadie arrastró");
});

test("un cambio de formación rechazado deja las formaciones locales exactas", async () => {
  const local = BASE_ROW();
  local.formations.negro = "1-1-2";
  const w = makeWorld({ local, failWrite: true });
  const antes = w.snapshot();

  await w.run(`cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`);

  assert.deepEqual(w.snapshot(), antes, "el estado local no quedó exacto");
  assert.equal(w.json("state.formations.negro"), "1-1-2");
});

test("el sondeo sigue adoptando entero lo que ya era del servidor", async () => {
  // El contrapeso del test de abajo: la autoridad de fresh no se amplió, pero tampoco
  // se recortó. matchInfo, history y frequentAliases ya ganaban remoto antes de D2.
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.matchInfo.time = "21:00";
  w.db.row.history.push({ finalizedAt: "2026-08-01T22:00:00.000Z", matchInfo: {}, players: [], responses: [], formations: {} });
  w.db.row.frequentAliases.unshift("alias.nuevo");

  await w.run("refreshFromServer()");

  assert.equal(w.json("state.matchInfo.time"), "21:00");
  assert.equal(w.json("state.history").length, 2);
  assert.deepEqual(w.json("state.frequentAliases"), ["alias.nuevo", "alias.viejo"]);
});

test("el sondeo no amplía la autoridad de fresh a otros campos del jugador", async () => {
  // El mismo refresh que adopta pos y formations no puede llevarse puesto nada más.
  const local = BASE_ROW();
  const ana = local.players.find((p) => p.name === "Ana");
  ana.isCaptain = true;
  ana.number = 7;
  const w = makeWorld({ local });
  w.db.row.formations.negro = "2-2";
  const remota = w.db.row.players.find((p) => p.name === "Ana");
  remota.isCaptain = false;
  remota.number = 99;
  remota.pos = { x: 44, y: 66 };
  w.db.row.responses.find((r) => r.name === "Ana").paid = true;

  await w.run("refreshFromServer()");

  assert.equal(enLocal(w, "Ana").isCaptain, true, "isCaptain no es de esta política");
  assert.equal(enLocal(w, "Ana").number, 7, "number no es de esta política");
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 44, y: 66 });
  assert.equal(enLocal(w, "Ana").paid, true, "paid se sigue derivando de responses");
  assert.equal(enLocal(w, "Ana").team, "negro");
});

/* ═════════════ 3. Caso histórico: B arrastra, A hace otra cosa ═════════════ */

test("B arrastra, A tenía estado viejo y hace otra acción: B no pierde su posición", async () => {
  // A abrió la app hace rato: su copia local no tiene la posición de B.
  const viejo = BASE_ROW();
  const w = makeWorld({ local: viejo });
  // B arrastra a Beto y guarda.
  w.db.row.players.find((p) => p.name === "Beto").pos = { x: 88, y: 12 };

  // A hace una acción no relacionada de D2: arrastra a Ana.
  const ok = await w.run(arrastrar("Ana", { x: 30, y: 70 }));

  assert.equal(ok, true);
  assert.deepEqual(enServidor(w, "Beto").pos, { x: 88, y: 12 },
    "la acción de A borró del servidor la posición que B acababa de guardar");
  assert.deepEqual(enServidor(w, "Ana").pos, { x: 30, y: 70 });
});

test("B arrastra y A cambia una formación del otro equipo: B no pierde su posición", async () => {
  const viejo = BASE_ROW();
  const w = makeWorld({ local: viejo });
  w.db.row.players.find((p) => p.name === "Beto").pos = { x: 88, y: 12 };

  await w.run(`cambiarFormacion('blanco','2-2',document.getElementById('formation-select-blanco'))`);

  assert.deepEqual(enServidor(w, "Beto").pos, { x: 88, y: 12 },
    "cambiar la formación del blanco borró una posición del negro");
  assert.deepEqual(enLocal(w, "Beto").pos, { x: 88, y: 12 },
    "la copia local se quedó con el estado viejo en vez de reconciliar");
});

test("B arrastra y A cambia de equipo a otro jugador: B no pierde su posición", async () => {
  const viejo = BASE_ROW();
  const w = makeWorld({ local: viejo });
  w.db.row.players.find((p) => p.name === "Beto").pos = { x: 88, y: 12 };

  const ok = await w.run(`cambiarEquipoDeJugador('Caro','negro')`);

  assert.equal(ok, true);
  assert.deepEqual(enServidor(w, "Beto").pos, { x: 88, y: 12 },
    "el cambio de equipo de otro borró la posición que B guardó");
});

/* ═════════════════ 4. Cambio de formación ═════════════════ */

test("cambiar la formación guarda la elegida y reacomoda a su equipo", async () => {
  const row = BASE_ROW();
  row.players.forEach((p) => { p.pos = { x: 40, y: 40 }; });
  const w = makeWorld({ row });

  const rendersPrevios = w.json("renders");
  const ok = await w.run(`cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`);

  assert.equal(ok, true);
  assert.ok(w.json("renders") > rendersPrevios, "la cancha no se redibujó con la formación nueva");
  assert.equal(w.db.writes, 1, "el cambio de formación es una sola escritura");
  assert.equal(w.db.row.formations.negro, "2-2");
  assert.equal(enServidor(w, "Ana").pos, null, "no se reacomodó al equipo");
  assert.equal(enServidor(w, "Beto").pos, null);
  // La copia local tiene que terminar donde termina el servidor: si no, la cancha sigue
  // dibujando las posiciones viejas hasta el próximo sondeo.
  assert.equal(enLocal(w, "Ana").pos, null, "el reseteo no llegó a la copia local");
  assert.equal(w.json("state.formations.negro"), "2-2");
});

test("cambiar la formación no toca al otro equipo", async () => {
  const row = BASE_ROW();
  row.players.forEach((p) => { p.pos = { x: 40, y: 40 }; });
  const w = makeWorld({ row });

  await w.run(`cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`);

  assert.equal(w.db.row.formations.blanco, "1-2-1", "se pisó la formación del otro equipo");
  assert.deepEqual(enServidor(w, "Caro").pos, { x: 40, y: 40 },
    "se reseteó la posición de un jugador del otro equipo");
  assert.deepEqual(enServidor(w, "Dani").pos, { x: 40, y: 40 });
});

test("cambiar la formación preserva los campos frescos no relacionados", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.matchInfo.time = "21:00";
  w.db.row.frequentAliases.unshift("alias.nuevo");
  w.db.row.responses.find((r) => r.name === "Beto").paid = true;
  w.db.row.sedes.push({ name: "Polideportivo", address: "Calle 8" });

  await w.run(`cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`);

  assert.equal(w.db.row.matchInfo.time, "21:00");
  assert.deepEqual(w.db.row.frequentAliases, ["alias.nuevo", "alias.viejo"]);
  assert.equal(w.db.row.responses.find((r) => r.name === "Beto").paid, true);
  assert.equal(w.db.row.sedes.length, 2);
});

test("una formación rechazada no queda escrita ni borra las posiciones locales", async () => {
  const row = BASE_ROW();
  row.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ row, failWrite: true });
  const antesLocal = w.snapshot();

  const ok = await w.run(`cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`);

  assert.equal(ok, false, "no puede decir que guardó");
  assert.deepEqual(w.snapshot(), antesLocal, "el estado local no quedó exacto");
  assert.equal(w.json("state.formations.negro"), "1-2-1");
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 10, y: 10 });
  assert.deepEqual(w.toasts, [w.run("FORMACION_ERROR_GUARDADO")],
    "el organizador tiene que enterarse, y con el aviso de reintentar");
  // El <select> tiene el foco después de cambiarlo, así que el render no lo repuebla:
  // hay que devolverlo a mano o queda mostrando una formación que nadie guardó.
  assert.equal(w.document.getElementById("formation-select-negro").value,
    w.run("formacionEfectiva('negro')"),
    "el selector quedó contradiciendo a la cancha");
});

test("sin lectura fresca la formación no escribe nada", async () => {
  const w = makeWorld({ failRead: true });
  const antesLocal = w.snapshot();

  await w.run(`cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`);

  assert.equal(w.db.writes, 0);
  assert.equal(w.db.rejectedWrites, 0);
  assert.deepEqual(w.snapshot(), antesLocal);
  assert.equal(w.json("saving"), false);
});

test("si el tipo de cancha cambió en otro dispositivo, la formación falla cerrado", async () => {
  const w = makeWorld();
  // F11 no ofrece '2-2': escribirla dejaría una formación imposible de dibujar.
  w.db.row.matchInfo.type = "F11";
  const antes = structuredClone(w.db.row);

  await w.run(`cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`);

  assert.equal(w.db.writes, 0, "se guardó una formación que no existe para el tipo actual");
  assert.deepEqual(w.db.row, antes);
  // Reintentar no arregla nada acá: el aviso no puede ser el de conexión.
  assert.deepEqual(w.toasts, [w.run("FORMACION_ERROR_TIPO")]);
  assert.notEqual(w.run("FORMACION_ERROR_TIPO"), w.run("FORMACION_ERROR_GUARDADO"));
});

/* ═════════════════ 5. Cambio de equipo ═════════════════ */

test("cambiar de equipo escribe sobre fresco y deriva players.team", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.matchInfo.time = "21:00";
  w.db.row.frequentAliases.unshift("alias.nuevo");

  const ok = await w.run(`cambiarEquipoDeJugador('Ana','blanco')`);

  assert.equal(ok, true);
  assert.equal(w.db.writes, 1);
  assert.equal(w.db.row.responses.find((r) => r.name === "Ana").team, "blanco");
  assert.equal(enServidor(w, "Ana").team, "blanco", "players.team no se derivó en lo que se guardó");
  assert.equal(w.db.row.matchInfo.time, "21:00", "revirtió matchInfo");
  assert.deepEqual(w.db.row.frequentAliases, ["alias.nuevo", "alias.viejo"]);
  assert.equal(enLocal(w, "Ana").team, "blanco");
});

test("cambiar de equipo invalida la posición del equipo que se dejó", async () => {
  const row = BASE_ROW();
  row.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ row });

  await w.run(`cambiarEquipoDeJugador('Ana','blanco')`);

  assert.equal(enServidor(w, "Ana").pos, null,
    "una posición pertenece al equipo en el que se la dibujó");
  assert.equal(enLocal(w, "Ana").pos, null);
});

test("sacar a alguien de todo equipo le quita la cinta y la posición", async () => {
  const row = BASE_ROW();
  const ana = row.players.find((p) => p.name === "Ana");
  ana.isCaptain = true;
  ana.pos = { x: 10, y: 10 };
  const w = makeWorld({ row });

  const ok = await w.run(`cambiarEquipoDeJugador('Ana',null)`);

  assert.equal(ok, true);
  assert.equal(enServidor(w, "Ana").team, null);
  assert.equal(enServidor(w, "Ana").isCaptain, false, "se quedó con la cinta sin equipo");
  assert.equal(enServidor(w, "Ana").pos, null);
  assert.equal(enLocal(w, "Ana").pos, null);
  // `isCaptain` no entra en la política de D2: es legado —nadie la pone en true desde
  // que el registro se hace por responses— y sigue ganando localmente, así que la copia
  // de este dispositivo la conserva hasta la próxima lectura completa. No se ve: sin
  // equipo el jugador no tiene ficha, que es lo único que dibuja la estrella.
});

test("un cambio de equipo rechazado deja el estado local exacto", async () => {
  const row = BASE_ROW();
  row.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ row, failWrite: true });
  const antesLocal = w.snapshot();

  const ok = await w.run(`cambiarEquipoDeJugador('Ana','blanco')`);

  assert.equal(ok, false);
  assert.deepEqual(w.snapshot(), antesLocal, "el rollback no quedó exacto");
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 10, y: 10 });
  assert.equal(w.toasts.length, 1);
});

test("el cambio de equipo direcciona por responseId y no por nombre", async () => {
  const w = makeWorld();
  // Otro dispositivo corrigió cómo se escribe el nombre. La response es la misma: por
  // nombre no se la encuentra, y buscar por nombre además podría caer en otra.
  w.db.row.responses.find((r) => r.name === "Ana").name = "Ana Gómez";
  w.db.row.players.find((p) => p.name === "Ana").name = "Ana Gómez";

  const ok = await w.run(`cambiarEquipoDeJugador('Ana','blanco')`);

  assert.equal(ok, true);
  assert.equal(w.db.row.responses.find((r) => r.responseId === "r-ana").team, "blanco",
    "el cambio no cayó en la response que le pertenece");
});

test("un cambio de equipo sin objetivo en fresco falla cerrado", async () => {
  const w = makeWorld();
  w.db.row.responses = w.db.row.responses.filter((r) => r.name !== "Ana");
  const antes = structuredClone(w.db.row);

  const ok = await w.run(`cambiarEquipoDeJugador('Ana','blanco')`);

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0);
  assert.deepEqual(w.db.row, antes);
});

test("sin lectura fresca el cambio de equipo no escribe nada", async () => {
  const w = makeWorld({ failRead: true });
  const antesLocal = w.snapshot();

  const ok = await w.run(`cambiarEquipoDeJugador('Ana','blanco')`);

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0);
  assert.equal(w.db.rejectedWrites, 0);
  assert.deepEqual(w.snapshot(), antesLocal);
  assert.equal(w.json("saving"), false);
});

/* ═════════ 6. El contrato de persistFocalizado para los dos tipos de llamador ═════════ */

test("sin adoptarPlayers la copia local conserva sus players, como historial y canchas", async () => {
  // El otro lado del contrato: cargar un resultado en el historial o corregir una
  // cancha no puede mover las fichas de la cancha. La reconciliación es sólo para los
  // dueños de players.
  const local = BASE_ROW();
  local.players.find((p) => p.name === "Ana").pos = { x: 10, y: 10 };
  const w = makeWorld({ local });
  w.db.row.players.find((p) => p.name === "Ana").pos = { x: 44, y: 66 };

  const ok = await w.run(`persistFocalizado(function(fresh){ fresh.matchInfo.time = '21:00'; return true; })`);

  assert.equal(ok, true);
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 10, y: 10 },
    "una acción que no es dueña de players le movió las fichas a la cancha");
  assert.equal(w.json("state.matchInfo.time"), "21:00");
});

/* ═════════════════ 7. persist() ya no es dueño de `pos` ═════════════════ */

test("ningún writer de D2 llama a persist()", () => {
  ["guardarPosicionArrastrada", "cambiarFormacion", "cambiarEquipoDeJugador"].forEach((nombre) => {
    const fuente = extractFunction(demo, nombre);
    assert.ok(!/(?:await|return)\s+persist\(/.test(fuente),
      `${nombre} sigue serializando la copia local con persist()`);
  });
});
