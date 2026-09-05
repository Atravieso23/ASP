// Split (tercer tiempo) — PR 6: copiar resumen para WhatsApp. Sólo formatea texto a
// partir de armarResumenSplit() (PR 5): sin writers, sin persistencia, sin Supabase.
// El botón reusa el mismo patrón de clipboard con fallback ya usado por "Copiar
// alias" y "Faltan responder" (Copiar para WhatsApp).
//
// mensajeResumenSplit() es pura (no toca DOM ni Supabase), así que se extrae y corre
// en node:vm igual que split-balances.test.mjs — sin Supabase de mentira, no hay
// ninguna escritura que reproducir.
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
  "formatMoney",
  "normalizeSplit",
  "repartirExacto",
  "validarGasto",
  "calcularBalances",
  "liquidarMinimo",
  "esGastoValidoParaCalculo",
  "armarResumenSplit",
  "mensajeResumenSplit",
];

function mensajeWorld() {
  const context = vm.createContext({
    Math, Number, Array, Object, Set, Map, String, JSON, Boolean,
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(NEEDED.map((n) => extractFunction(demo, n)).join("\n"), context);
  return {
    mensaje: (split) => vm.runInContext(`mensajeResumenSplit(${JSON.stringify(split)})`, context),
  };
}

const W = mensajeWorld();

const p = (id, name) => ({ id, name, source: "manual", responseId: null });

/* ---------- vacío cuando no hay nada que decir ---------- */

test("sin participantes y sin gastos: mensaje vacío", () => {
  assert.equal(W.mensaje({ participants: [], expenses: [] }), "");
});

test("con participantes pero sin gastos válidos: mensaje vacío", () => {
  assert.equal(W.mensaje({ participants: [p("p1", "Tito"), p("p2", "Fede")], expenses: [] }), "");
});

test("con sólo gastos malformados: mensaje vacío (igual que sin gastos)", () => {
  const r = W.mensaje({ participants: [p("p1", "Tito")], expenses: [null, { payers: [] }] });
  assert.equal(r, "");
});

/* ---------- formato exacto: con pagos sugeridos ---------- */

test("con deuda real: formato exacto con total y pagos sugeridos", () => {
  const split = {
    participants: [p("p1", "Tito"), p("p2", "Fede"), p("p3", "Nacho")],
    expenses: [{ id: "e1", label: "Cervezas", amount: 24000, payers: [{ participantId: "p1", amount: 24000 }], consumers: ["p1", "p2", "p3"] }],
  };
  const esperado = [
    "Split del tercer tiempo ⚽",
    "",
    "Gastos cargados: $24.000",
    "",
    "Pagos sugeridos para saldar:",
    "- Fede le pasa $8.000 a Tito",
    "- Nacho le pasa $8.000 a Tito",
    "",
    "Son sugerencias calculadas con los gastos cargados, no la única forma de saldar.",
  ].join("\n");
  assert.equal(W.mensaje(split), esperado);
});

/* ---------- formato exacto: todo parejo (reusa el copy de PR 5, no inventa uno nuevo) ---------- */

test("todo parejo: formato exacto con el mismo copy de empty state que la UI de PR 5", () => {
  const split = {
    participants: [p("p1", "Tito"), p("p2", "Fede")],
    expenses: [{ id: "e1", label: "Café solo", amount: 2000, payers: [{ participantId: "p1", amount: 2000 }], consumers: ["p1"] }],
  };
  const esperado = [
    "Split del tercer tiempo ⚽",
    "",
    "Gastos cargados: $2.000",
    "",
    "Con los gastos cargados, no hay pagos sugeridos: ya está parejo.",
  ].join("\n");
  assert.equal(W.mensaje(split), esperado);
});

/* ---------- total: sólo suma gastos válidos, ignora los malformados ---------- */

test("el total ignora gastos malformados mezclados con válidos", () => {
  const split = {
    participants: [p("p1", "Tito"), p("p2", "Fede")],
    expenses: [
      { id: "e1", label: "Cervezas", amount: 10000, payers: [{ participantId: "p1", amount: 10000 }], consumers: ["p1", "p2"] },
      { id: "e2", payers: [], consumers: [], amount: 99999 }, // malformado: sin payers/consumers
      null,
    ],
  };
  const mensaje = W.mensaje(split);
  assert.match(mensaje, /Gastos cargados: \$10\.000/);
  assert.doesNotMatch(mensaje, /99\.999|109\.999/);
});

/* ---------- no incluye lo que se decidió dejar afuera (balances por persona, detalle por gasto) ---------- */

test("no incluye balances por persona ni detalle gasto por gasto", () => {
  const split = {
    participants: [p("p1", "Tito"), p("p2", "Fede")],
    expenses: [{ id: "e1", label: "Cervezas muy especificas", amount: 10000, payers: [{ participantId: "p1", amount: 10000 }], consumers: ["p1", "p2"] }],
  };
  const mensaje = W.mensaje(split);
  assert.doesNotMatch(mensaje, /recibe|debe|a mano/);
  assert.doesNotMatch(mensaje, /Cervezas muy especificas/);
});

/* ---------- copy honesto ---------- */

test("no afirma mínimo garantizado / saldado / pagado confirmado / deuda confirmada", () => {
  const split = {
    participants: [p("p1", "Tito"), p("p2", "Fede")],
    expenses: [{ id: "e1", label: "Cervezas", amount: 10000, payers: [{ participantId: "p1", amount: 10000 }], consumers: ["p1", "p2"] }],
  };
  const mensaje = W.mensaje(split);
  assert.doesNotMatch(mensaje, /mínimo garantizado/i);
  assert.doesNotMatch(mensaje, /\bsaldado\b/i);
  assert.doesNotMatch(mensaje, /pagado confirmado/i);
  assert.doesNotMatch(mensaje, /deuda confirmada/i);
});

/* ---------- estáticos: UI, patrón de clipboard, ausencia de escritura ---------- */

test("botón 'Copiar resumen' vive dentro del modal de gastos, después del aviso fijo y antes de Cerrar", () => {
  const start = demo.indexOf('<div class="modal-overlay" id="manage-split-expenses-overlay">');
  const end = demo.indexOf('<div class="modal-overlay" id="finalize-overlay">', start);
  const modal = demo.slice(start, end);
  const avisoIdx = modal.indexOf("Son sugerencias calculadas con los gastos cargados");
  const btnIdx = modal.indexOf('id="copy-split-resumen-btn"');
  const cerrarIdx = modal.indexOf('id="manage-split-expenses-close"');
  assert.ok(avisoIdx > -1 && btnIdx > avisoIdx, "el botón debe ir después del aviso fijo");
  assert.ok(cerrarIdx > btnIdx, "el botón debe ir antes de Cerrar");
  assert.match(modal, /<button type="button" class="link-btn" id="copy-split-resumen-btn" hidden>Copiar resumen<\/button>/);
});

test("el handler reusa el patrón de clipboard con fallback ya existente (mismo mecanismo que copy-alias-btn)", () => {
  const handlerStart = demo.indexOf("document.getElementById('copy-split-resumen-btn').onclick");
  const handlerEnd = demo.indexOf("};", handlerStart) + 2;
  const handler = demo.slice(handlerStart, handlerEnd);
  assert.match(handler, /navigator\.clipboard\.writeText\(mensaje\)/);
  assert.match(handler, /document\.execCommand\('copy'\)/);
  assert.match(handler, /showToast\('Copiado para WhatsApp'\)/);
  assert.match(handler, /showToast\('No se pudo copiar\. ' \+ mensaje\)/);
  // Guard de vacío antes de cualquier intento de copiar.
  assert.match(handler, /if\(!mensaje\) return;/);
});

test("renderSplitResumen oculta el botón sin gastos válidos y lo muestra si hay gastos (aunque no haya pagos sugeridos)", () => {
  const fn = extractFunction(demo, "renderSplitResumen");
  assert.match(fn, /if\(!resultado\.hayGastosValidos\)\{[\s\S]*?copyBtn\.hidden = true;/);
  assert.match(fn, /copyBtn\.hidden = false;\s*\n\}/);
});

test("mensajeResumenSplit es pura: no llama a persistFocalizado/saveState/clipboard/DOM", () => {
  const fn = extractFunction(demo, "mensajeResumenSplit");
  assert.doesNotMatch(fn, /persistFocalizado|saveState|state\.split\s*=|fresh\.split\s*=|document\.|navigator\.clipboard/);
});

test("sin writers nuevos ni Supabase: el copiar es sólo lectura + clipboard local", () => {
  assert.doesNotMatch(demo, /function\s+(guardarResumenSplit|confirmarPagoSplit|marcarPagadoSplit)\s*\(/);
  const handlerStart = demo.indexOf("document.getElementById('copy-split-resumen-btn').onclick");
  const handlerEnd = demo.indexOf("};", handlerStart) + 2;
  const handler = demo.slice(handlerStart, handlerEnd);
  assert.doesNotMatch(handler, /supabaseClient|persistFocalizado|saveState/);
});

test("no abre WhatsApp ni usa Web Share API (fuera de scope aprobado)", () => {
  const handlerStart = demo.indexOf("document.getElementById('copy-split-resumen-btn').onclick");
  const handlerEnd = demo.indexOf("};", handlerStart) + 2;
  const handler = demo.slice(handlerStart, handlerEnd);
  assert.doesNotMatch(handler, /wa\.me|whatsapp:\/\/|navigator\.share/i);
});
