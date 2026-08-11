// D3 — Editar partido escribe sólo su intención sobre el estado fresco.
//
// Era el último caller de persist(), que serializa la copia local: adopta del
// servidor players, sedes y responses, pero matchInfo, history y frequentAliases
// viajan como estaban en este teléfono. Y el modal frena el sondeo mientras está
// abierto, así que esa copia puede tener minutos de atraso justo cuando se guarda.
// Alcanzaba con corregir la hora para borrar la fecha que otro acababa de
// finalizar, el alias que otro acababa de guardar o el resultado que otro acababa
// de cargar.
//
// Ahora es una escritura focalizada y save-first: parte de `fresh`, le superpone
// lo que el formulario expresa y no toca nada del estado global hasta que el
// servidor confirmó. Un guardado rechazado no tiene nada que revertir.
//
// Semántica del cambio de tipo de cancha, ya decidida: descarta las posiciones
// anteriores y las formaciones elegidas, y la reconstrucción visual queda a cargo
// de la proyección. Se persiste `formations:{}` y NO los defaults del tipo nuevo:
// se comparó el render real con las dos opciones —cinco tipos de cancha, el tipo
// vacío y uno inválido, más archivar y restaurar— y la vista es idéntica, porque
// formacionEfectiva() ya proyecta opts[0] cuando no hay elegida. Persistir el
// default sólo lo volvería indistinguible de la elección de alguien, que es
// justo lo que D1 sacó del render y D2 volvió estado compartido.
//
// El cambio de tipo se decide contra `fresh.matchInfo.type` y no contra la copia
// local: si otro dispositivo cambió el tipo mientras el modal estaba abierto,
// guardar el formulario lo revierte, y quedarse con las posiciones del tipo que
// se va dejaría posiciones de una cancha con el tipo de otra.
//
// Se ejecuta el código REAL de demo.html en un node:vm con un Supabase de
// mentira, igual que sedes-focalizadas y posiciones-compartidas. La lectura del
// formulario vive en el handler (DOM); la escritura, en una función nombrada que
// recibe lo tipeado y se prueba directo.
//
// Fuera de D3 a propósito: CAS/rev, reintentos, la carrera del sondeo,
// colaDeResponses y el borrado de persist(), que queda sin callers pero se saca
// en su propia limpieza.
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
  "reconciliarPlayers",
  "syncLocalAvailabilityWithPlayers",
  "persistFocalizado",
  "sedeKey",
  "getFormationOptions",
  "formacionEfectiva",
  "guardarPartido",
];

const PLAYER = (name, extra = {}) => ({
  name, status: "in", team: "negro", paid: false,
  pos: { x: 30, y: 30 }, number: null, isCaptain: false, ...extra,
});

const RESPONSE = (name, extra = {}) => ({
  responseId: `r-${name.toLowerCase()}`, ownerId: `o-${name}`, ownerIds: [`o-${name}`],
  name, status: "in", from: "16:00", to: "20:00",
  paid: false, team: "negro", isGuest: false, updatedAt: "2026-08-08T12:00:00.000Z", ...extra,
});

const BASE_ROW = () => ({
  matchInfo: { teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "Cancha", type: "F8", priceTotal: "190000", alias: "alias.actual" },
  players: [PLAYER("Ana"), PLAYER("Beto", { team: "blanco", pos: { x: 60, y: 60 } })],
  history: [{ finalizedAt: "2026-07-04T22:00:00.000Z", matchInfo: { date: "2026-07-04" }, players: [], responses: [], formations: {} }],
  sedes: [{ name: "Cancha", address: "Av. Siempreviva 742" }],
  formations: { negro: "3-2-2", blanco: "3-2-2" },
  responses: [RESPONSE("Ana"), RESPONSE("Beto", { team: "blanco" })],
  frequentAliases: ["alias.actual", "alias.viejo"],
});

// Lo que el formulario expresa. Los defaults son "no cambia nada respecto de BASE_ROW".
const FORM = (extra = {}) => ({
  teamName: "ASP", date: "2026-08-15", time: "16:00", loc: "Cancha", sedeNueva: null,
  type: "F8", priceTotal: "190000", alias: "alias.actual", ...extra,
});

// `local` arma el clásico "este dispositivo tiene el modal abierto hace rato":
// la copia local y la fila del servidor arrancan distintas.
function makeWorld({ local, failRead = false, failWrite = false } = {}) {
  const servidor = BASE_ROW();
  const db = { row: structuredClone(servidor), writes: 0, reads: 0, rejectedWrites: 0 };
  const copiaLocal = local || structuredClone(servidor);

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

  const context = vm.createContext({
    console: { error() {}, warn() {}, log() {} },
    structuredClone,
    Set, Map, Array, Object, JSON, Date, Boolean, Number, String, Promise, Math, Error, Infinity,
    supabaseClient,
    ROW_ID: 1,
    db,
  });

  vm.runInContext(
    `
    ${extractDecl(demo, "FORMATIONS")}
    let state = null;
    let saving = false;
    let localAvailabilityResponses = [];
    let knownPlayerNames = new Set();
    let knownSedeNames = new Set();
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
    run: (code) => vm.runInContext(code, context),
    json: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context)),
    snapshot: () => JSON.parse(vm.runInContext("JSON.stringify(state)", context)),
    guardar: (extra) => vm.runInContext(`guardarPartido(${JSON.stringify(FORM(extra))})`, context),
  };
}

const enServidor = (w, nombre) => w.db.row.players.find((p) => p.name === nombre);
const enLocal = (w, nombre) => w.json("state.players").find((p) => p.name === nombre);

/* ═══════════ 1. No puede pisar lo que el formulario no expresa ═══════════ */

test("editar el partido no borra la fecha que otro dispositivo acaba de finalizar", async () => {
  // El modal frena el sondeo, así que la copia local se quedó sin la fecha nueva.
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.history.push({
    finalizedAt: "2026-08-08T22:00:00.000Z",
    matchInfo: { date: "2026-08-08" }, players: [], responses: [], formations: {},
  });

  const { ok } = await w.guardar({ time: "21:00" });

  assert.equal(ok, true);
  assert.equal(w.db.writes, 1, "una sola escritura por guardado");
  assert.equal(w.db.row.history.length, 2, "se borró la fecha que otro finalizó");
  assert.equal(w.db.row.matchInfo.time, "21:00");
});

test("editar el partido no revierte un resultado cargado en el historial", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.history[0].score = { negro: 3, blanco: 1 };
  w.db.row.history[0].goals = { Ana: 2 };

  const { ok } = await w.guardar({ priceTotal: "200000" });

  assert.equal(ok, true);
  assert.deepEqual(w.db.row.history[0].score, { negro: 3, blanco: 1 },
    "el marcador fresco no sobrevivió");
  assert.deepEqual(w.db.row.history[0].goals, { Ana: 2 });
});

test("editar el partido no borra un alias que otro dispositivo agregó", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.frequentAliases.unshift("alias.de.otro");

  const { ok } = await w.guardar({ time: "21:00" });

  assert.equal(ok, true);
  assert.ok(w.db.row.frequentAliases.includes("alias.de.otro"),
    "el alias ajeno se perdió");
});

test("editar el partido no revierte las canchas frescas", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.sedes[0].address = "Dirección corregida";
  w.db.row.sedes.push({ name: "Polideportivo", address: "Calle 8" });

  const { ok } = await w.guardar({ time: "21:00" });

  assert.equal(ok, true);
  assert.equal(w.db.row.sedes.length, 2, "se perdió la cancha que otro agregó");
  assert.equal(w.db.row.sedes[0].address, "Dirección corregida",
    "se revirtió la dirección que otro corrigió");
});

test("editar el partido no revierte responses ajenas", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.responses.find((r) => r.name === "Ana").paid = true;
  w.db.row.responses.push(RESPONSE("Kevin", { team: "blanco" }));

  const { ok } = await w.guardar({ time: "21:00" });

  assert.equal(ok, true);
  assert.equal(w.db.row.responses.find((r) => r.name === "Ana").paid, true);
  assert.ok(w.db.row.responses.some((r) => r.name === "Kevin"), "se borró un alta ajena");
});

/* ═══════════ 2. matchInfo expresa exactamente el formulario ═══════════ */

test("el formulario escribe los siete campos de matchInfo", async () => {
  const w = makeWorld();

  await w.guardar({
    teamName: "Los Pibes", date: "2026-09-01", time: "20:30",
    loc: "Cancha", type: "F8", priceTotal: "240000", alias: "nuevo.alias",
  });

  assert.deepEqual(w.db.row.matchInfo, {
    teamName: "Los Pibes", date: "2026-09-01", time: "20:30",
    loc: "Cancha", type: "F8", priceTotal: "240000", alias: "nuevo.alias",
  });
});

/* ═══════════ 3. Alias: se suma a los frescos, no los reemplaza ═══════════ */

test("el alias nuevo encabeza los frescos sin borrarlos", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.frequentAliases = ["alias.de.otro", "alias.actual"];

  await w.guardar({ alias: "alias.nuevo" });

  assert.deepEqual(w.db.row.frequentAliases,
    ["alias.nuevo", "alias.de.otro", "alias.actual"],
    "el alias nuevo tiene que sumarse arriba de los frescos");
});

test("reusar un alias que ya estaba no lo duplica: lo sube", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.frequentAliases = ["alias.de.otro", "ALIAS.ACTUAL"];

  await w.guardar({ alias: "alias.actual" });

  assert.deepEqual(w.db.row.frequentAliases, ["alias.actual", "alias.de.otro"],
    "la comparación tiene que ser insensible a mayúsculas, como siempre");
});

test("la lista de alias frecuentes no crece sin límite", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.frequentAliases = Array.from({ length: 10 }, (_, i) => `alias.${i}`);

  await w.guardar({ alias: "alias.nuevo" });

  assert.equal(w.db.row.frequentAliases.length, 10);
  assert.equal(w.db.row.frequentAliases[0], "alias.nuevo");
});

test("guardar sin alias no toca los alias frescos", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.frequentAliases = ["alias.de.otro"];

  await w.guardar({ alias: "" });

  assert.deepEqual(w.db.row.frequentAliases, ["alias.de.otro"]);
  assert.equal(w.db.row.matchInfo.alias, "");
});

/* ═══════════ 4. Alta opcional de cancha, revalidada contra fresh ═══════════ */

test("la cancha nueva se suma a las frescas y queda elegida", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.sedes.push({ name: "Polideportivo", address: "Calle 8" });

  await w.guardar({ loc: "Club Nuevo", sedeNueva: "Club Nuevo" });

  assert.deepEqual(w.db.row.sedes.map((s) => s.name),
    ["Cancha", "Polideportivo", "Club Nuevo"],
    "el alta tiene que superponerse sobre las frescas");
  assert.equal(w.db.row.matchInfo.loc, "Club Nuevo");
});

test("una cancha que ya existe en fresco no se duplica", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  // Otro dispositivo la agregó mientras el modal estaba abierto: el chequeo local
  // no la ve, así que la revalidación tiene que ser contra el estado fresco.
  w.db.row.sedes.push({ name: "Club Nuevo", address: "Calle 9" });

  await w.guardar({ loc: "Club Nuevo", sedeNueva: "Club Nuevo" });

  assert.equal(w.db.row.sedes.filter((s) => s.name === "Club Nuevo").length, 1,
    "se duplicó una cancha que ya existía en el servidor");
  assert.equal(w.db.row.sedes.find((s) => s.name === "Club Nuevo").address, "Calle 9",
    "se pisó la dirección que ya tenía");
  assert.equal(w.db.row.matchInfo.loc, "Club Nuevo");
});

test("el duplicado de cancha se normaliza igual que el merge", async () => {
  const w = makeWorld({ local: BASE_ROW() });

  await w.guardar({ loc: "  CANCHA  ".trim(), sedeNueva: "CANCHA" });

  assert.equal(w.db.row.sedes.length, 1, "'CANCHA' y 'Cancha' son la misma cancha");
});

/* ═══════════ 5. Cambio de tipo de cancha ═══════════ */

test("cambiar el tipo descarta posiciones y formaciones", async () => {
  const w = makeWorld();

  const { ok, cambioDeTipo } = await w.guardar({ type: "F5" });

  assert.equal(ok, true);
  assert.equal(cambioDeTipo, true);
  assert.equal(w.db.row.matchInfo.type, "F5");
  assert.deepEqual(w.db.row.formations, {},
    "las formaciones del tipo anterior tienen que descartarse");
  assert.equal(enServidor(w, "Ana").pos, null);
  assert.equal(enServidor(w, "Beto").pos, null);
  // Y la copia local termina donde termina el servidor: si no, la cancha sigue
  // dibujando las fichas del tipo viejo hasta el próximo sondeo.
  assert.deepEqual(w.json("state.formations"), {},
    "el descarte de formaciones no llegó a la copia local");
  assert.equal(enLocal(w, "Ana").pos, null, "el descarte de posiciones no llegó a la copia local");
  assert.equal(enLocal(w, "Beto").pos, null);
  assert.equal(w.json("state.matchInfo.type"), "F5");
});

test("cambiar el tipo no materializa los defaults del tipo nuevo", async () => {
  const w = makeWorld();

  await w.guardar({ type: "F5" });

  assert.deepEqual(w.db.row.formations, {},
    "un default no es la decisión de nadie: lo proyecta formacionEfectiva");
  // Y lo proyectado es exactamente lo que antes se materializaba.
  w.run(`state.matchInfo.type = 'F5'; state.formations = {};`);
  assert.equal(w.run("formacionEfectiva('negro')"), "1-2-1");
  assert.deepEqual(w.json("state.formations"), {},
    "proyectar el default lo escribió en el estado");
});

test("cambiar el tipo no toca nada ajeno", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.history.push({ finalizedAt: "2026-08-08T22:00:00.000Z", matchInfo: {}, players: [], responses: [], formations: {} });
  w.db.row.frequentAliases.unshift("alias.de.otro");
  w.db.row.responses.find((r) => r.name === "Ana").paid = true;
  w.db.row.sedes.push({ name: "Polideportivo", address: "Calle 8" });

  await w.guardar({ type: "F5" });

  assert.equal(w.db.row.history.length, 2);
  assert.ok(w.db.row.frequentAliases.includes("alias.de.otro"));
  assert.equal(w.db.row.responses.find((r) => r.name === "Ana").paid, true);
  assert.equal(w.db.row.sedes.length, 2);
});

test("el cambio de tipo se decide contra el tipo fresco, no contra la copia local", async () => {
  // Otro dispositivo pasó el partido a F5 mientras el modal estaba abierto en F8.
  // Guardar el formulario devuelve el partido a F8: es un cambio de tipo real y
  // las posiciones del tipo que se va no pueden sobrevivir.
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.matchInfo.type = "F5";
  w.db.row.formations = { negro: "2-2" };
  w.db.row.players.forEach((p) => { p.pos = { x: 15, y: 15 }; });

  const { cambioDeTipo } = await w.guardar({ type: "F8" });

  assert.equal(cambioDeTipo, true, "el tipo cambió respecto del partido, no de la copia local");
  assert.equal(w.db.row.matchInfo.type, "F8");
  assert.deepEqual(w.db.row.formations, {});
  assert.equal(enServidor(w, "Ana").pos, null,
    "quedaron posiciones de un tipo de cancha con el tipo de otra");
});

test("guardar sin cambiar el tipo no toca posiciones ni formaciones", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  // Estado compartido que otro dispositivo escribió mientras el modal estaba abierto.
  w.db.row.formations = { negro: "4-3-1", blanco: "3-2-2" };
  w.db.row.players.find((p) => p.name === "Ana").pos = { x: 88, y: 12 };

  const { ok, cambioDeTipo } = await w.guardar({ time: "21:00", priceTotal: "200000" });

  assert.equal(ok, true);
  assert.equal(cambioDeTipo, false);
  assert.deepEqual(w.db.row.formations, { negro: "4-3-1", blanco: "3-2-2" },
    "una edición sin cambio de tipo no es dueña de las formaciones");
  assert.deepEqual(enServidor(w, "Ana").pos, { x: 88, y: 12 },
    "una edición sin cambio de tipo no es dueña de las posiciones");
  assert.deepEqual(enServidor(w, "Beto").pos, { x: 60, y: 60 });
});

test("la copia local queda en lo mismo que el servidor", async () => {
  const w = makeWorld({ local: BASE_ROW() });
  w.db.row.players.find((p) => p.name === "Ana").pos = { x: 88, y: 12 };
  w.db.row.formations = { negro: "4-3-1" };

  await w.guardar({ time: "21:00" });

  assert.equal(w.json("state.matchInfo.time"), "21:00");
  assert.deepEqual(enLocal(w, "Ana").pos, { x: 88, y: 12 },
    "la copia local se quedó con la posición vieja");
  assert.deepEqual(w.json("state.formations"), { negro: "4-3-1" });
});

/* ═══════════ 6. Fallos ═══════════ */

test("un guardado rechazado deja el estado global intacto", async () => {
  const w = makeWorld({ failWrite: true });
  const antesLocal = w.snapshot();
  const antesServidor = structuredClone(w.db.row);

  const { ok } = await w.guardar({ time: "21:00", type: "F5", alias: "alias.nuevo", loc: "Club Nuevo", sedeNueva: "Club Nuevo" });

  assert.equal(ok, false, "no puede decir que guardó");
  assert.deepEqual(w.snapshot(), antesLocal, "el estado local no quedó exacto");
  assert.deepEqual(w.db.row, antesServidor);
  assert.equal(w.json("saving"), false);
});

test("sin lectura fresca no se escribe nada", async () => {
  const w = makeWorld({ failRead: true });
  const antesLocal = w.snapshot();

  const { ok } = await w.guardar({ time: "21:00" });

  assert.equal(ok, false);
  assert.equal(w.db.writes, 0);
  assert.equal(w.db.rejectedWrites, 0, "ni siquiera intentó escribir");
  assert.deepEqual(w.snapshot(), antesLocal);
  assert.equal(w.json("saving"), false);
});

test("el sondeo queda bloqueado desde antes de leer y hasta el final", async () => {
  const w = makeWorld();
  w.run("savingDurante = []");
  w.run(`(function(){
    const leer = fetchServerState, guardar = saveState;
    fetchServerState = async function(){ savingDurante.push(saving); return leer(); };
    saveState = async function(s){ savingDurante.push(saving); return guardar(s); };
  })()`);

  await w.guardar({ time: "21:00" });

  assert.deepEqual(w.json("savingDurante"), [true, true],
    "el sondeo se puede colar entre la lectura y la escritura");
  assert.equal(w.json("saving"), false, "el guard quedó trabado y congela el sondeo");
});

/* ═══════════ 7. El handler y el último caller de persist() ═══════════ */

test("el handler de editar partido delega y no muta antes de guardar", () => {
  const save = demo.slice(
    demo.indexOf("document.getElementById('m-save').onclick = async ()=>{"),
    demo.indexOf("\n};", demo.indexOf("document.getElementById('m-save').onclick = async ()=>{")),
  );
  assert.ok(save.length > 0, "no ubiqué el handler de editar partido");

  assert.match(save, /guardarPartido\(/, "el handler no usa el writer focalizado");
  assert.ok(!/await persist\(\)/.test(save),
    "el handler sigue serializando la copia local con persist()");
  // El handler no puede ni nombrar el estado global: lee el formulario y delega. Es más
  // fuerte que enumerar campos, que deja pasar cualquier mutación por otra vía.
  assert.ok(!/\bstate\b/.test(save),
    "el handler toca el estado global en vez de delegar la escritura");
  assert.ok(!/\.pos\s*=[^=]/.test(save),
    "el handler sigue anulando posiciones antes de guardar");

  // El modal se cierra recién con el guardado confirmado: después de la rama de error,
  // no sólo después de la llamada. Y al fallar nadie reescribe el formulario, así que
  // lo tipeado sigue ahí para reintentar.
  const cierre = save.indexOf("overlay.classList.remove('open');");
  const salidaDelFallo = save.indexOf("return;", save.indexOf("if(!ok){"));
  assert.ok(cierre > -1, "el handler no cierra el modal en ninguna parte");
  assert.ok(cierre > salidaDelFallo,
    "el modal se cierra antes de saber si el guardado funcionó");
  assert.match(save, /matchError\.hidden = false;/, "no avisa cuando falla");

  // El estado local del cambio de tipo se guarda sólo si el tipo cambió y sólo con el ok.
  assert.match(save, /if\(cambioDeTipo\) saveLocalFormationState\(\);/);

  // Elegir "agregar cancha nueva" y dejar el nombre vacío no puede dejar el marcador
  // del <select> como si fuera el nombre de la cancha.
  assert.match(save, /if\(nueva\)\{ sedeNueva = nueva; loc = nueva; \} else \{ loc = ''; \}/);
});

test("no queda ningún caller de persist()", () => {
  // Se cuentan llamadas ejecutables: la definición y las menciones en comentarios no.
  // Con o sin argumento: persist() recibe un overlay opcional, así que mirar sólo
  // `persist()` dejaría pasar un `persist(algo)`. `persistFocalizado(` no matchea
  // porque después de "persist" tiene que venir el paréntesis.
  const sinComentarios = demo.replace(/^\s*\/\/.*$/gm, "");
  const llamadas = (sinComentarios.match(/(?<!function )\bpersist\s*\(/g) || []);
  assert.deepEqual(llamadas, [],
    "Editar partido era el último caller de persist()");
});
