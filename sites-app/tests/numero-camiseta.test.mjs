// Número de camiseta (Opción A) — campo propio del partido actual.
//
// Contrato:
//   - vive en `response.number` (entero 1–99 o null); su writer es marcarMiNumero,
//     cubierto en responses-escrituras.test.mjs;
//   - `players[].number` se DERIVA de `response.number` en syncLocalAvailabilityWithPlayers,
//     igual que status/paid/team — por eso sobrevive al re-armado del player (rename de casaca);
//   - se renderiza donde ya se renderizaba (`buildTeamListRow`, chip de cancha);
//   - NO toca identidad/dedupe/selector/"Faltan responder"/pagos/tarjetas/WhatsApp.
//
// Se ejecuta el código REAL de demo.html en un node:vm. Sin red, sin navegador.
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

function ctx(names) {
  const context = vm.createContext({
    Set, Map, Array, Object, JSON, Number, String, Boolean, Math, RegExp,
    document: undefined,
  });
  vm.runInContext(names.map((n) => extractFunction(demo, n)).join("\n"), context);
  return context;
}

const RESP = (over = {}) => ({
  responseId: over.responseId || "r1",
  name: over.name || "Ana",
  status: "in",
  from: "16:00",
  to: "20:00",
  paid: false,
  team: "negro",
  isGuest: false,
  ...over,
});

/* ---------- 1. parseNumeroCamiseta (pura) ---------- */

const parse = (c, raw) => JSON.parse(vm.runInContext(`JSON.stringify(parseNumeroCamiseta(${raw}))`, c));

test("parseNumeroCamiseta: vacío / null / undefined => { ok:true, value:null }", () => {
  const c = ctx(["parseNumeroCamiseta"]);
  for (const raw of ['""', "null", "undefined", '"   "']) {
    assert.deepEqual(parse(c, raw), { ok: true, value: null }, `${raw}`);
  }
});

test("parseNumeroCamiseta: 1..99 (string o número, con espacios) => value entero", () => {
  const c = ctx(["parseNumeroCamiseta"]);
  assert.deepEqual(parse(c, '"1"'), { ok: true, value: 1 });
  assert.deepEqual(parse(c, "99"), { ok: true, value: 99 });
  assert.deepEqual(parse(c, '"  7 "'), { ok: true, value: 7 });
  assert.deepEqual(parse(c, '"07"'), { ok: true, value: 7 });
});

test("parseNumeroCamiseta: fuera de rango / no entero / basura => { ok:false }", () => {
  const c = ctx(["parseNumeroCamiseta"]);
  for (const raw of ['"0"', '"100"', '"-3"', '"7.5"', '"abc"', '"12x"', '"1 2"']) {
    assert.equal(parse(c, raw).ok, false, `${raw}`);
  }
});

/* ---------- 2. derivación response.number -> players[].number ---------- */

function derivar(responses, playersPrevios = []) {
  const c = ctx(["syncLocalAvailabilityWithPlayers"]);
  const target = { players: playersPrevios };
  return JSON.parse(vm.runInContext(
    `(() => {
      const t = ${JSON.stringify(target)};
      syncLocalAvailabilityWithPlayers(t, ${JSON.stringify(responses)});
      return JSON.stringify(t.players);
    })()`,
    c,
  ));
}

test("deriva response.number hacia players[].number", () => {
  const players = derivar([RESP({ name: "Ana", number: 10 }), RESP({ responseId: "r2", name: "Beto" })]);
  assert.equal(players.find((p) => p.name === "Ana").number, 10);
  assert.equal(players.find((p) => p.name === "Beto").number, null, "sin number en la response => null");
});

test("number no entero en la response => players[].number null", () => {
  const players = derivar([RESP({ name: "Ana", number: "10" }), RESP({ responseId: "r2", name: "Beto", number: 7.5 })]);
  assert.equal(players.find((p) => p.name === "Ana").number, null);
  assert.equal(players.find((p) => p.name === "Beto").number, null);
});

test("el número sobrevive al rename de casaca porque vive en la response", () => {
  // El player viejo ('Ana') queda sin response y se descarta; nace 'Anita' con el number
  // que la response conserva.
  const players = derivar(
    [RESP({ responseId: "r1", name: "Anita", number: 10 })],
    [{ name: "Ana", status: "in", team: "negro", paid: false, number: 10, isCaptain: false }],
  );
  assert.deepEqual(players.map((p) => p.name), ["Anita"]);
  assert.equal(players[0].number, 10, "el número viajó con la response, no se perdió en el re-armado");
});

test("cambiar el número en la response se refleja en el player existente", () => {
  const players = derivar(
    [RESP({ responseId: "r1", name: "Ana", number: 23 })],
    [{ name: "Ana", status: "in", team: "negro", paid: false, number: 10, isCaptain: false }],
  );
  assert.equal(players[0].number, 23);
});

/* ---------- 3. render (buildTeamListRow) ---------- */

function fakeDoc() {
  const make = () => {
    const el = { className: "", textContent: "", _html: "", children: [] };
    Object.defineProperty(el, "innerHTML", { get() { return el._html; }, set(v) { el._html = v; } });
    el.appendChild = (c) => { el.children.push(c); return c; };
    return el;
  };
  return { createElement: make };
}

function fila(player) {
  const c = vm.createContext({ Set, Map, Array, Object, JSON, String, document: fakeDoc() });
  vm.runInContext(extractFunction(demo, "escapeHtml") + "\n" + extractFunction(demo, "buildTeamListRow"), c);
  return JSON.parse(vm.runInContext(
    `JSON.stringify(buildTeamListRow(${JSON.stringify(player)}).children.map(x => ({ cls: x.className, txt: x.textContent })))`,
    c,
  ));
}

test("buildTeamListRow: con number renderiza '#N'", () => {
  const spans = fila({ name: "Ana", number: 10, isCaptain: false });
  const num = spans.find((s) => s.cls === "split-number");
  assert.equal(num.txt, "#10");
});

test("buildTeamListRow: sin number el chip queda vacío", () => {
  for (const p of [{ name: "Ana", isCaptain: false }, { name: "Ana", number: null, isCaptain: false }]) {
    const num = fila(p).find((s) => s.cls === "split-number");
    assert.equal(num.txt, "");
  }
});

/* ---------- 4. no-impacto: identidad / dedupe / selector / faltan responder / tarjetas ---------- */

test("las funciones de identidad/dedupe/tarjetas no leen `.number`", () => {
  // computeCards usa la palabra "number" en un `typeof now === 'number'`; lo que importa
  // es que ninguna acceda a la propiedad `.number` de una response/player.
  for (const fn of ["faltanConfirmar", "mensajeFaltaConfirmar", "deriveSelectorNames", "computeCards", "savePlayerRegistration"]) {
    assert.doesNotMatch(extractFunction(demo, fn), /\.number\b/, `${fn} no debe leer .number`);
  }
});

test("faltanConfirmar / mensajeFaltaConfirmar: agregar `number` no cambia el resultado", () => {
  const c = ctx(["faltanConfirmar", "mensajeFaltaConfirmar"]);
  const estado = { habitualPlayers: ["Ana", "Beto", "Caro"] };
  const sinNum = [RESP({ name: "Ana" })];
  const conNum = [RESP({ name: "Ana", number: 10 })];
  const run = (resps) => ({
    faltan: vm.runInContext(`JSON.stringify(faltanConfirmar(${JSON.stringify(estado)}, ${JSON.stringify(resps)}))`, c),
    msg: vm.runInContext(`mensajeFaltaConfirmar(${JSON.stringify(estado)}, ${JSON.stringify(resps)})`, c),
  });
  assert.deepEqual(run(conNum), run(sinNum));
});

test("mensajeFaltaConfirmar nunca incluye el número en el texto de WhatsApp", () => {
  const c = ctx(["faltanConfirmar", "mensajeFaltaConfirmar"]);
  const estado = { habitualPlayers: ["Ana", "Beto"] };
  const resps = [RESP({ name: "Ana", number: 10 })];
  const msg = vm.runInContext(`mensajeFaltaConfirmar(${JSON.stringify(estado)}, ${JSON.stringify(resps)})`, c);
  assert.doesNotMatch(msg, /10|#/, "el mensaje lista nombres, no números");
});
