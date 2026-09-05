// Split (tercer tiempo) — PR 5: balances y pagos sugeridos, read-only. Primer caller
// real de calcularBalances()/liquidarMinimo() (PR 1, puras y sin usar hasta ahora).
// Sin writers nuevos, sin persistencia nueva, sin keys nuevas en state.split: sólo
// deriva y muestra lo que ya hay.
//
// armarResumenSplit() es pura (no toca DOM ni Supabase), así que se extrae y corre en
// node:vm igual que el resto del motor puro en split.test.mjs — sin Supabase de
// mentira: acá no hace falta, no hay ninguna escritura que reproducir.
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

const NEEDED = [
  "normalizeSplit",
  "repartirExacto",
  "validarGasto",
  "calcularBalances",
  "liquidarMinimo",
  "esGastoValidoParaCalculo",
  "armarResumenSplit",
];

function resumenWorld() {
  const context = vm.createContext({
    Math, Number, Array, Object, Set, Map, String, JSON, Boolean,
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(NEEDED.map((n) => extractFunction(demo, n)).join("\n"), context);
  return {
    armar: (split) =>
      JSON.parse(vm.runInContext(`JSON.stringify(armarResumenSplit(${JSON.stringify(split)}))`, context)),
  };
}

const W = resumenWorld();

const p = (id, name) => ({ id, name, source: "manual", responseId: null });

/* ---------- casos base ---------- */

test("sin participantes y sin gastos no crashea: sin gastos válidos, balances y pagos vacíos", () => {
  const r = W.armar({ participants: [], expenses: [] });
  assert.deepEqual(r, { hayGastosValidos: false, balances: [], pagos: [] });
});

test("con participantes pero sin gastos: hayGastosValidos en false (dispara el empty state de la UI)", () => {
  const r = W.armar({ participants: [p("p1", "Tito"), p("p2", "Fede")], expenses: [] });
  assert.equal(r.hayGastosValidos, false);
  // calcularBalances siembra a todos en 0 sin importar los gastos; el render ignora
  // `balances` cuando hayGastosValidos es false, así que esto no afecta la UI.
  assert.deepEqual(r.balances, [
    { id: "p1", name: "Tito", balance: 0 },
    { id: "p2", name: "Fede", balance: 0 },
  ]);
});

/* ---------- deuda simple ---------- */

test("un gasto con deuda real: balance recibe/debe correcto + un pago sugerido", () => {
  const split = {
    participants: [p("p1", "Tito"), p("p2", "Fede")],
    expenses: [{ id: "e1", label: "Cervezas", amount: 10000, payers: [{ participantId: "p1", amount: 10000 }], consumers: ["p1", "p2"] }],
  };
  const r = W.armar(split);
  assert.equal(r.hayGastosValidos, true);
  assert.deepEqual(r.balances, [
    { id: "p1", name: "Tito", balance: 5000 },
    { id: "p2", name: "Fede", balance: -5000 },
  ]);
  assert.deepEqual(r.pagos, [{ de: "p2", deName: "Fede", a: "p1", aName: "Tito", monto: 5000 }]);
});

/* ---------- todo parejo ---------- */

test("gasto donde el pagador es el único consumidor: todos 'a mano', sin pagos sugeridos", () => {
  const split = {
    participants: [p("p1", "Tito"), p("p2", "Fede")],
    expenses: [{ id: "e1", label: "Café solo", amount: 2000, payers: [{ participantId: "p1", amount: 2000 }], consumers: ["p1"] }],
  };
  const r = W.armar(split);
  assert.equal(r.hayGastosValidos, true);
  assert.deepEqual(r.balances, [
    { id: "p1", name: "Tito", balance: 0 },
    { id: "p2", name: "Fede", balance: 0 },
  ]);
  assert.deepEqual(r.pagos, []);
});

/* ---------- orden ---------- */

test("el orden de balances es el orden de participants, un huérfano cae al final", () => {
  const split = {
    participants: [p("p3", "Nacho"), p("p1", "Tito"), p("p2", "Fede")],
    expenses: [
      { id: "e1", label: "Cervezas", amount: 9000, payers: [{ participantId: "p1", amount: 9000 }], consumers: ["p1", "p2", "p3"] },
      // p9 ya no es participante (dato viejo/editado a mano): no debe crashear ni
      // descartarse en silencio, pero tampoco puede colarse antes que los reales.
      { id: "e2", label: "Hielo", amount: 900, payers: [{ participantId: "p9", amount: 900 }], consumers: ["p9"] },
    ],
  };
  const r = W.armar(split);
  assert.deepEqual(r.balances.map((b) => b.id), ["p3", "p1", "p2", "p9"]);
  assert.equal(r.balances.find((b) => b.id === "p9").name, "alguien que ya no está");
});

test("el orden de pagos sugeridos es el que produce liquidarMinimo, sin reordenar", () => {
  // 3 deudores de distinto monto y 1 acreedor grande: liquidarMinimo ataca del deudor
  // más grande al más chico contra el acreedor más grande primero.
  const split = {
    participants: [p("a", "Ana"), p("b", "Bea"), p("c", "Caro"), p("d", "Dani")],
    expenses: [{
      id: "e1", label: "Asado", amount: 12000,
      payers: [{ participantId: "d", amount: 12000 }],
      consumers: ["a", "b", "c", "d"],
    }],
  };
  const r = W.armar(split);
  // Cada uno de a/b/c debe 3000 a d (el reparto exacto de 12000/4 = 3000 c/u).
  assert.deepEqual(r.pagos.map((pg) => `${pg.de}->${pg.a}:${pg.monto}`), ["a->d:3000", "b->d:3000", "c->d:3000"]);
});

/* ---------- defensividad: gastos malformados ---------- */

test("un gasto malformado en medio se ignora sin crashear, el resto se calcula igual", () => {
  const base = { participants: [p("p1", "Tito"), p("p2", "Fede")] };
  const gastoBueno = { id: "e1", label: "Cervezas", amount: 10000, payers: [{ participantId: "p1", amount: 10000 }], consumers: ["p1", "p2"] };
  const casosMalos = [
    null,
    undefined,
    {},
    { ...gastoBueno, payers: "no-es-array" },
    { ...gastoBueno, payers: [] },
    { ...gastoBueno, consumers: "no-es-array" },
    { ...gastoBueno, consumers: [] },
    { ...gastoBueno, amount: "10000" },
    { ...gastoBueno, amount: 10.5 },
  ];
  for (const malo of casosMalos) {
    const r = W.armar({ ...base, expenses: [malo, gastoBueno] });
    assert.equal(r.hayGastosValidos, true, `caso malo ${JSON.stringify(malo)}: no debería tirar hayGastosValidos en false`);
    assert.deepEqual(r.balances, [
      { id: "p1", name: "Tito", balance: 5000 },
      { id: "p2", name: "Fede", balance: -5000 },
    ], `caso malo ${JSON.stringify(malo)}: el gasto bueno debe calcularse igual`);
  }
});

test("todos los gastos malformados: se comporta como si no hubiera gastos válidos", () => {
  const r = W.armar({
    participants: [p("p1", "Tito")],
    expenses: [null, { payers: [] }, { consumers: [] }],
  });
  assert.equal(r.hayGastosValidos, false);
});

/* ---------- estáticos: sin efectos secundarios, UI, copy ---------- */

test("armarResumenSplit es pura: no es async, no llama a persistFocalizado/saveState/fresh.split", () => {
  const fn = extractFunction(demo, "armarResumenSplit");
  assert.doesNotMatch(demo.slice(demo.indexOf("function armarResumenSplit") - 20, demo.indexOf("function armarResumenSplit")), /async\s*$/);
  assert.doesNotMatch(fn, /persistFocalizado|saveState|fresh\.split\s*=|state\.split\s*=/);
});

test("normalizeSplit sigue con el mismo shape (sin keys nuevas)", () => {
  assert.match(extractFunction(demo, "normalizeSplit"), /participants: Array\.isArray\(s\.participants\) \? s\.participants : \[\]/);
  assert.match(extractFunction(demo, "normalizeSplit"), /expenses: Array\.isArray\(s\.expenses\) \? s\.expenses : \[\]/);
  // Nada de un tercer campo (ej. "resumen" o "balances" persistido).
  const cuerpo = extractFunction(demo, "normalizeSplit");
  const claves = [...cuerpo.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(claves.sort(), ["expenses", "participants"]);
});

test("calcularBalances y liquidarMinimo ya tienen un caller real además de su definición", () => {
  assert.ok([...demo.matchAll(/\bcalcularBalances\s*\(/g)].length >= 2, "debe haber definición + al menos un caller");
  assert.ok([...demo.matchAll(/\bliquidarMinimo\s*\(/g)].length >= 2, "debe haber definición + al menos un caller");
});

test("UI: secciones 'Resumen' y 'Pagos sugeridos para saldar' + aviso fijo, dentro del modal de gastos", () => {
  const start = demo.indexOf('<div class="modal-overlay" id="manage-split-expenses-overlay">');
  const end = demo.indexOf('<div class="modal-overlay" id="finalize-overlay">', start);
  const modal = demo.slice(start, end);
  assert.match(modal, /<p class="manage-section-title">Resumen<\/p>/);
  assert.match(modal, /<ul class="manage-list" id="split-balances-list">/);
  assert.match(modal, /<p class="manage-section-title">Pagos sugeridos para saldar<\/p>/);
  assert.match(modal, /<ul class="manage-list" id="split-suggested-payments-list">/);
  assert.match(modal, /id="split-payments-note">Son sugerencias calculadas con los gastos cargados, no la única forma de saldar\.<\/p>/);
});

test("el subtítulo viejo ('todavía no calcula quién le debe a quién') ya no aparece", () => {
  assert.doesNotMatch(demo, /todavía no calcula quién le debe a quién/);
});

test("copy nuevo no afirma mínimo garantizado / saldada / pagado confirmado / deuda confirmada", () => {
  const start = demo.indexOf('<div class="modal-overlay" id="manage-split-expenses-overlay">');
  const end = demo.indexOf('<div class="modal-overlay" id="finalize-overlay">', start);
  // Se descartan los comentarios HTML: el propio código explica en prosa, a
  // propósito, por qué estas frases están prohibidas -- eso no es copy real.
  const modal = demo.slice(start, end).replace(/<!--[\s\S]*?-->/g, "");
  const renderFn = extractFunction(demo, "renderSplitResumen");
  const bloque = modal + "\n" + renderFn;
  assert.doesNotMatch(bloque, /mínimo garantizado/i);
  assert.doesNotMatch(bloque, /\bsaldada\b/i);
  assert.doesNotMatch(bloque, /pagado confirmado/i);
  assert.doesNotMatch(bloque, /deuda confirmada/i);
});

test("Finalizar y Limpiar siguen reseteando split explícito (no se tocó en este PR)", () => {
  const finInicio = demo.indexOf("finalizeConfirmBtn.onclick");
  const finFin = demo.indexOf("const clearOverlay");
  const finalizarHandler = demo.slice(finInicio, finFin);
  assert.match(finalizarHandler, /split:\s*\{\s*participants:\s*\[\],\s*expenses:\s*\[\]\s*\}/);

  const limpiarInicio = demo.indexOf("clearConfirmBtn.onclick");
  const limpiarHandler = demo.slice(limpiarInicio, limpiarInicio + 1600);
  assert.match(limpiarHandler, /\{\s*\.\.\.fresh,\s*responses:\s*\[\][\s\S]*split:\s*\{\s*participants:\s*\[\],\s*expenses:\s*\[\]\s*\}/);
});

test("sin writers nuevos: armarResumenSplit/renderSplitResumen no definen ninguna función async nueva de escritura", () => {
  assert.doesNotMatch(
    demo,
    /function\s+(agregarBalanceSplit|editarBalanceSplit|confirmarPagoSplit|guardarResumenSplit)\s*\(/,
  );
});
