// D1 — render() no puede modificar ningún campo persistible de `state`.
//
// Antes, dibujar la cancha escribía: `state.formations` (defaults del tipo),
// `players[].pos` (normalización, colisiones y relleno automático) e
// `isFormationExtra`. Como el sondeo protege esos campos del remoto y persist()
// serializa la copia local, cada render fabricaba intención que después se
// publicaba como si fuera del organizador.
//
// Ahora la formación por defecto y las posiciones automáticas son una PROYECCIÓN
// visual: se calculan para dibujar y no se escriben. Lo que queda en `state` es
// sólo lo que alguien eligió a propósito.
//
// El código bajo prueba es el REAL de demo.html. renderFormationView sí toca el
// DOM, así que hay un stub mínimo acá abajo: no hay jsdom ni dependencia nueva.
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
  assert.ok(multi, `no encontré la declaración ${name}`);
  return multi[0];
}

/* ---------- Stub de DOM: lo mínimo que usa renderFormationView ---------- */

function fakeElement(id = "") {
  const el = {
    id,
    style: {},
    dataset: {},
    hijos: [],
    innerHTML: "",
    textContent: "",
    value: "",
    tabIndex: 0,
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(child) { el.hijos.push(child); return child; },
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
    porId,
  };
}

const NEEDED = [
  "getFormationOptions",
  "computeSlots",
  "formacionEfectiva",
  "pitchDistance",
  "findOpenPitchPosition",
  "findOpenSidelinePosition",
  "proyectarPosiciones",
  "shortNameForChip",
  "escapeHtml",
  "attachDragHandlers",
  "switchPlayerTeamFromPitch",
  "renderFormationView",
  "leerEstadoDelServidor",
  "fetchServerState",
  "saveState",
  "updateKnownSets",
  "mergeKeepingDeletions",
  "mergePlayers",
  "mergeSedesArr",
  "syncLocalAvailabilityWithPlayers",
  "persist",
  "cambiarFormacion",
];

function makeWorld({ row, activeElementId = null, failWrite = false } = {}) {
  const db = { row: structuredClone(row), writes: 0, reads: 0, rejectedWrites: 0 };
  const document = fakeDocument();
  if (activeElementId) document.activeElement = document.getElementById(activeElementId);

  const supabaseClient = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          db.reads++;
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

  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    structuredClone,
    Set, Map, Array, Object, JSON, Date, Boolean, Number, String, Promise, Math, Error, Infinity,
    document,
    supabaseClient,
    performance: { now: () => 0 },
    ROW_ID: 1,
    db,
  });

  vm.runInContext(
    `
    ${extractDecl(demo, "FORMATIONS")}
    ${extractDecl(demo, "TEAM_LABELS")}
    let state = null;
    let saving = false;
    let localAvailabilityResponses = [];
    let knownPlayerNames = new Set();
    let knownSedeNames = new Set();
    let posicionesDibujadas = { negro:new Map(), blanco:new Map() };
    function render(){ renderFormationView(state.players.filter(p=>p.status==='in')); }
    function showToast(){}
    function saveLocalFormationState(){}
    ${NEEDED.map((n) => extractFunction(demo, n)).join("\n")}
    `,
    context,
  );

  vm.runInContext(
    `
    state = ${JSON.stringify(row)};
    localAvailabilityResponses = state.responses;
    updateKnownSets(state);
    `,
    context,
  );

  return {
    db,
    document,
    run: (code) => vm.runInContext(code, context),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context)),
    // Dibuja la cancha con los jugadores `in`, que es lo que hace render().
    dibujar: () => vm.runInContext(`renderFormationView(state.players.filter(p=>p.status==='in'))`, context),
    snapshot: () => JSON.parse(vm.runInContext(`JSON.stringify(state)`, context)),
  };
}

const PLAYER = (name, extra = {}) => ({
  name, status: "in", team: "negro", paid: false,
  pos: null, number: null, isCaptain: false, ...extra,
});

const RESPONSE = (name, extra = {}) => ({
  responseId: `r-${name}`, ownerId: `o-${name}`, ownerIds: [`o-${name}`],
  name, status: "in", paid: false, team: "negro", isGuest: false, ...extra,
});

// F5: cinco por equipo, formación por defecto '1-2-1'.
const ROW = (players) => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "21:00", loc: "Cancha", type: "F5", priceTotal: "200000", alias: "a.b" },
  players,
  history: [],
  sedes: [{ name: "Cancha", address: "" }],
  formations: {},
  responses: players.map((p) => RESPONSE(p.name, { team: p.team, status: p.status })),
  frequentAliases: [],
});

/* ---------- 1 y 2: render no toca el estado persistido ---------- */

test("dibujar la cancha no modifica ningún campo de state", () => {
  const w = makeWorld({ row: ROW([
    PLAYER("Ana"), PLAYER("Beto", { pos: { x: 30, y: 40 } }),
    PLAYER("Caro", { team: "blanco" }), PLAYER("Dani", { team: "blanco", pos: { x: 70, y: 20 } }),
  ]) });

  const antes = w.snapshot();
  w.dibujar();
  assert.deepEqual(w.snapshot(), antes, "el render escribió en state");
});

test("dibujar la cancha no inventa formaciones en state", () => {
  const w = makeWorld({ row: ROW([PLAYER("Ana"), PLAYER("Caro", { team: "blanco" })]) });

  w.dibujar();
  assert.deepEqual(w.json("state.formations"), {},
    "el render escribió la formación por defecto en state");
});

test("una formación inválida para el tipo actual no se corrige en state", () => {
  const row = ROW([PLAYER("Ana")]);
  row.formations = { negro: "3-2-2", blanco: "3-2-2" }; // de F8, no existen en F5
  const w = makeWorld({ row });

  w.dibujar();
  assert.deepEqual(w.json("state.formations"), { negro: "3-2-2", blanco: "3-2-2" },
    "el render normalizó la formación dentro de state");
  assert.equal(w.run("formacionEfectiva('negro')"), "1-2-1",
    "la proyección debería caer en el default del tipo actual");
});

/* ---------- 3, 4, 5: la posición persistida no se toca ---------- */

test("un jugador sin posición se dibuja sin que se le escriba pos", () => {
  const w = makeWorld({ row: ROW([PLAYER("Ana")]) });

  const proyeccion = w.json(`proyectarPosiciones(state.players, '1-2-1')`);
  assert.ok(proyeccion[0].pos, "la proyección no le dio posición para dibujar");
  assert.equal(w.json("state.players[0].pos"), null, "le escribió pos al jugador");
});

test("una posición persistida válida se respeta y no se reescribe", () => {
  const w = makeWorld({ row: ROW([PLAYER("Ana", { pos: { x: 33, y: 77 } })]) });

  const proyeccion = w.json(`proyectarPosiciones(state.players, '1-2-1')`);
  assert.deepEqual(proyeccion[0].pos, { x: 33, y: 77 }, "la proyección movió una posición válida");
  assert.deepEqual(w.json("state.players[0].pos"), { x: 33, y: 77 }, "reescribió la posición persistida");
});

test("una posición fuera de rango se normaliza para la vista pero no en state", () => {
  const w = makeWorld({ row: ROW([PLAYER("Ana", { pos: { x: 200, y: -50 } })]) });

  const proyeccion = w.json(`proyectarPosiciones(state.players, '1-2-1')`);
  assert.deepEqual(proyeccion[0].pos, { x: 94, y: 6 }, "la proyección no clampeó a 6..94");
  assert.deepEqual(w.json("state.players[0].pos"), { x: 200, y: -50 },
    "la normalización visual se escribió en state");
});

test("dos jugadores encimados se separan en la vista sin anular su pos persistida", () => {
  const w = makeWorld({ row: ROW([
    PLAYER("Ana", { pos: { x: 50, y: 50 } }),
    PLAYER("Beto", { pos: { x: 51, y: 50 } }),
  ]) });

  const proyeccion = w.json(`proyectarPosiciones(state.players, '1-2-1')`);
  const [a, b] = proyeccion.map((item) => item.pos);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 14, "la proyección los dejó encimados");
  assert.deepEqual(w.json("state.players[0].pos"), { x: 50, y: 50 });
  assert.deepEqual(w.json("state.players[1].pos"), { x: 51, y: 50 },
    "la colisión anuló una posición persistida");
});

/* ---------- 6: isFormationExtra deja de existir como dato ---------- */

test("quién es suplente sale de la proyección y no se escribe en el jugador", () => {
  // Seis jugadores para cinco lugares en F5: el sexto es extra.
  const nombres = ["Ana", "Beto", "Caro", "Dani", "Eze", "Fede"];
  const w = makeWorld({ row: ROW(nombres.map((n) => PLAYER(n))) });

  const proyeccion = w.json(`proyectarPosiciones(state.players, '1-2-1')`);
  assert.equal(proyeccion.filter((item) => item.esExtra).length, 1, "no marcó al suplente");
  assert.equal(proyeccion.filter((item) => !item.esExtra).length, 5, "los titulares no son los slots");

  w.dibujar();
  const conCampo = w.json("state.players.filter(p=>'isFormationExtra' in p).length");
  assert.equal(conCampo, 0, "el render escribió isFormationExtra en los jugadores");
});

/* ---------- 7: la vista Jugador no fabrica nada ---------- */

test("dibujar sin jugadores en cancha no inventa posiciones ni formaciones", () => {
  // Es lo que pasa en la vista Jugador: render() corre igual, la cancha no se ve.
  const w = makeWorld({ row: ROW([PLAYER("Ana", { status: "out", team: null })]) });

  const antes = w.snapshot();
  w.dibujar();
  assert.deepEqual(w.snapshot(), antes, "render inventó estado con la cancha vacía");
  assert.equal(w.json("state.players[0].pos"), null);
  assert.deepEqual(w.json("state.formations"), {});
});

/* ---------- 8: repetir el ciclo no acumula cambios ---------- */

test("muchos ciclos de render no acumulan cambios en state", () => {
  const w = makeWorld({ row: ROW([
    PLAYER("Ana"), PLAYER("Beto", { pos: { x: 20, y: 20 } }), PLAYER("Caro"),
    PLAYER("Dani", { team: "blanco" }), PLAYER("Eze", { team: "blanco" }),
  ]) });

  w.dibujar();
  const trasPrimero = w.snapshot();
  for (let i = 0; i < 10; i++) w.dibujar();
  assert.deepEqual(w.snapshot(), trasPrimero, "el render acumuló cambios entre ciclos");
});

/* ---------- 9: la fuga de stale intent queda cortada ---------- */

test("cambiar sólo la hora no publica posiciones ni formaciones fabricadas", async () => {
  const w = makeWorld({ row: ROW([
    PLAYER("Ana"), PLAYER("Beto"), PLAYER("Caro", { team: "blanco" }),
  ]) });

  // El dispositivo abre la app y dibuja: antes, acá ya se fabricaba todo.
  w.dibujar();
  // Y ahora sólo cambia la hora del partido.
  w.run(`state.matchInfo.time = '17:00';`);
  assert.equal(await w.run("persist()"), true);

  assert.equal(w.db.row.matchInfo.time, "17:00", "no guardó lo único que el usuario quiso");
  assert.deepEqual(w.db.row.formations, {}, "publicó formaciones que nadie eligió");
  const conPos = w.db.row.players.filter((p) => p.pos);
  assert.deepEqual(conPos, [], "publicó posiciones que nadie arrastró");
  const conExtra = w.db.row.players.filter((p) => "isFormationExtra" in p);
  assert.deepEqual(conExtra, [], "publicó isFormationExtra, que es sólo de pantalla");
});

test("una posición realmente arrastrada sí sigue viajando al servidor", async () => {
  const w = makeWorld({ row: ROW([PLAYER("Ana", { pos: { x: 33, y: 77 } }), PLAYER("Beto")]) });

  w.dibujar();
  assert.equal(await w.run("persist()"), true);

  const ana = w.db.row.players.find((p) => p.name === "Ana");
  const beto = w.db.row.players.find((p) => p.name === "Beto");
  assert.deepEqual(ana.pos, { x: 33, y: 77 }, "se perdió una posición real");
  assert.equal(beto.pos, null, "se fabricó una posición para quien no tenía");
});

/* ---------- 13: el imán no depende de que state tenga la formación ---------- */

test("el imán del arrastre usa la formación efectiva sin escribirla", () => {
  const w = makeWorld({ row: ROW([PLAYER("Ana")]) });

  assert.equal(w.run("formacionEfectiva('negro')"), "1-2-1");
  assert.equal(w.json("computeSlots(formacionEfectiva('negro')).length"), 5,
    "la formación efectiva no produce los slots del tipo actual");
  assert.deepEqual(w.json("state.formations"), {}, "calcular la formación efectiva escribió en state");

  // Sin esto, el imán quedaría leyendo state.formations[team], que ahora puede
  // estar vacío: computeSlots(undefined) revienta al partir el string.
  const drag = extractFunction(demo, "attachDragHandlers");
  assert.match(drag, /computeSlots\(formacionEfectiva\(team\)\)/,
    "el imán no usa la formación efectiva");
  assert.ok(!/state\.formations\[team\]/.test(drag),
    "el imán sigue dependiendo de que el default esté escrito en state");
});

test("el imán no revienta cuando nadie eligió formación", () => {
  const w = makeWorld({ row: ROW([PLAYER("Ana")]) });
  // Reproduce lo que hace el imán en pointerup con state.formations vacío.
  assert.doesNotThrow(() => w.json("computeSlots(formacionEfectiva('negro'))"));
  assert.throws(() => w.json("computeSlots(state.formations['negro'])"),
    "leer la formación directo de state debería seguir siendo inseguro");
});

test("una formación elegida a propósito le gana al default en la proyección", () => {
  const row = ROW([PLAYER("Ana")]);
  row.formations = { negro: "2-2", blanco: "1-2-1" };
  const w = makeWorld({ row });

  assert.equal(w.run("formacionEfectiva('negro')"), "2-2", "ignoró la formación elegida");
  w.dibujar();
  assert.deepEqual(w.json("state.formations"), { negro: "2-2", blanco: "1-2-1" });
});

test("un cambio de formación rechazado deja el selector y la cancha coherentes", async () => {
  // Nadie eligió formación nunca: lo que se ve es el default proyectado.
  const w = makeWorld({ row: ROW([PLAYER("Ana")]), failWrite: true });
  w.dibujar();
  const sel = w.document.getElementById("formation-select-negro");
  assert.equal(sel.value, "1-2-1", "el selector no arrancó mostrando el default");

  // El usuario elige otra y el guardado se rechaza. El <select> tiene el foco,
  // así que el render no lo repuebla: hay que devolverlo a mano.
  w.document.activeElement = sel;
  await w.run(`cambiarFormacion('negro','2-2',document.getElementById('formation-select-negro'))`);

  assert.equal(w.run("state.formations.negro"), undefined,
    "el rollback dejó escrita una formación que nadie eligió");
  assert.deepEqual(w.json("state.formations"), {},
    "el default se coló en el estado que se guarda");
  assert.equal(sel.value, "1-2-1",
    "el selector quedó en blanco mientras la cancha sigue dibujando el default");
  assert.equal(w.run("formacionEfectiva('negro')"), sel.value,
    "el selector y la cancha muestran formaciones distintas");
  assert.equal(w.db.rejectedWrites, 1);
});

/* ---------- 10, 11, 12: el arrastre sobre posiciones proyectadas ---------- */

test("el render deja disponible la posición dibujada de cada jugador", () => {
  const w = makeWorld({ row: ROW([
    PLAYER("Ana"), PLAYER("Beto", { pos: { x: 20, y: 20 } }),
  ]) });

  w.dibujar();
  const dibujadas = w.json(`[...posicionesDibujadas.negro.entries()]`);
  const porNombre = Object.fromEntries(dibujadas);
  assert.ok(porNombre.Ana, "sin posición dibujada, el arrastre de Ana no tiene con qué trabajar");
  assert.deepEqual(porNombre.Beto, { x: 20, y: 20 });
  assert.equal(w.json("state.players[0].pos"), null, "publicar la posición dibujada escribió en state");
});

test("el arrastre nunca lee pos.x de un jugador sin posición persistida", () => {
  const swap = extractFunction(demo, "attachDragHandlers");
  assert.ok(!/\{x:\s*p\.pos\.x,\s*y:\s*p\.pos\.y\}/.test(swap),
    "el intercambio sigue desreferenciando p.pos, que ahora puede ser null");
  assert.match(swap, /posicionesDibujadas/,
    "el intercambio no usa la posición dibujada");
});

test("el rollback de un arrastre rechazado vuelve a null, no a la posición dibujada", () => {
  const drag = extractFunction(demo, "attachDragHandlers");
  // El snapshot del rollback tiene que salir del dato persistido, no de la proyección.
  assert.match(drag, /const posPrevia = p\.pos;/,
    "el snapshot del rollback dejó de ser la posición persistida");
  assert.match(drag, /p\.pos = posPrevia;/,
    "el rollback dejó de restaurar la posición persistida");
  const asignacion = drag.indexOf("const posPrevia = p.pos;");
  const escritura = drag.indexOf("p.pos = {x, y};");
  assert.ok(asignacion < escritura, "el snapshot se toma después de escribir la nueva posición");
});

/* ---------- El render dejó de tener writers ---------- */

test("renderFormationView ya no llama a las funciones que escribían state", () => {
  const vista = extractFunction(demo, "renderFormationView");
  assert.ok(!/ensureFormationDefaults\(\)/.test(vista),
    "el render sigue normalizando las formaciones dentro de state");
  assert.ok(!/autoAssignPositions\(/.test(vista),
    "el render sigue asignando posiciones dentro de state");
});

test("proyectarPosiciones no le escribe nada a los jugadores que recibe", () => {
  const proyectar = extractFunction(demo, "proyectarPosiciones");
  assert.ok(!/player\.pos\s*=/.test(proyectar), "sigue escribiendo player.pos");
  assert.ok(!/p\.pos\s*=/.test(proyectar), "sigue escribiendo p.pos");
  assert.ok(!/isFormationExtra\s*=/.test(proyectar), "sigue escribiendo isFormationExtra");
});
