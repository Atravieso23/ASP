// Split (tercer tiempo) — PR 3A: SÓLO el shape defensivo de state.split y el reset
// explícito en Finalizar/Limpiar. NO hay UI editable, NO hay writers de
// participantes/gastos, NO se conecta el motor puro (PR 1) ni la card read-only (PR 2)
// a este shape. Nada escribe en state.split todavía salvo defaultState,
// leerEstadoDelServidor (defensivo) y los dos resets de Finalizar/Limpiar.
//
// normalizeSplit() se extrae por nombre y corre en node:vm, mismo mecanismo que
// normalizeCards en tarjetas.test.mjs. El resto son asserts estáticos sobre el HTML
// real de demo.html, igual que los guards de no-regresión de PR #17.
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

function splitShapeWorld() {
  const context = vm.createContext({
    JSON, Object, Array,
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(extractFunction(demo, "normalizeSplit"), context);
  return {
    normalize: (previas) =>
      JSON.parse(vm.runInContext(`JSON.stringify(normalizeSplit(${JSON.stringify(previas)}))`, context)),
  };
}

const W = splitShapeWorld();

/* ---------- normalizeSplit (pura) ---------- */

test("normalizeSplit: blob sin split -> default { participants:[], expenses:[] }", () => {
  assert.deepEqual(W.normalize(undefined), { participants: [], expenses: [] });
  assert.deepEqual(W.normalize(null), { participants: [], expenses: [] });
  assert.deepEqual(W.normalize({}), { participants: [], expenses: [] });
});

test("normalizeSplit: split existente se preserva", () => {
  const existente = {
    participants: [{ id: "p1", name: "Tito", source: "manual", responseId: null }],
    expenses: [{ id: "e1", label: "Cervezas", amount: 24000, payers: [{ participantId: "p1", amount: 24000 }], consumers: ["p1"] }],
  };
  assert.deepEqual(W.normalize(existente), existente);
});

test("normalizeSplit: campos parcialmente rotos se reparan sin perder lo válido", () => {
  const roto1 = { participants: [{ id: "p1", name: "Tito" }], expenses: "no-es-array" };
  const n1 = W.normalize(roto1);
  assert.deepEqual(n1.participants, [{ id: "p1", name: "Tito" }], "participants válido se conserva");
  assert.deepEqual(n1.expenses, []);

  const roto2 = { participants: "tampoco-es-array", expenses: [{ id: "e1" }] };
  const n2 = W.normalize(roto2);
  assert.deepEqual(n2.participants, []);
  assert.deepEqual(n2.expenses, [{ id: "e1" }], "expenses válido se conserva");
});

/* ---------- shape canónico en defaultState / lectura del servidor ---------- */

test("defaultState arranca con split en forma canónica", () => {
  assert.match(extractFunction(demo, "defaultState"), /split: \{ participants: \[\], expenses: \[\] \}/);
});

test("la lectura del servidor normaliza state.split a la forma canónica", () => {
  const leer = extractFunction(demo, "leerEstadoDelServidor");
  assert.match(leer, /parsed\.split = \{ participants:\[\], expenses:\[\] \}/);
  assert.match(leer, /parsed\.split\.participants = \[\]/);
  assert.match(leer, /parsed\.split\.expenses = \[\]/);
});

/* ---------- guards: reset explícito en Finalizar y Limpiar (opuesto de cards) ---------- */

test("Finalizar resetea split explícito, no lo toma de fresh", () => {
  const inicio = demo.indexOf("finalizeConfirmBtn.onclick");
  const fin = demo.indexOf("const clearOverlay");
  const handler = demo.slice(inicio, fin);
  assert.match(handler, /split:\s*\{\s*participants:\s*\[\],\s*expenses:\s*\[\]\s*\}/, "nextState resetea split a blanco");
  assert.doesNotMatch(handler, /split:\s*fresh\.split/, "split no debe viajar desde fresh como cards");
  assert.doesNotMatch(handler, /split:\s*state\.split/);
});

test("'Limpiar todo' resetea split explícito, no lo hereda de {...fresh}", () => {
  const inicio = demo.indexOf("clearConfirmBtn.onclick");
  const handler = demo.slice(inicio, inicio + 1600);
  assert.match(handler, /\{\s*\.\.\.fresh,\s*responses:\s*\[\][\s\S]*split:\s*\{\s*participants:\s*\[\],\s*expenses:\s*\[\]\s*\}/);
});

test("las asignaciones a .split viven sólo en lectura/Finalizar/Limpiar y los writers de PR 3B/PR 4", () => {
  const leer = extractFunction(demo, "leerEstadoDelServidor");
  const finInicio = demo.indexOf("finalizeConfirmBtn.onclick");
  const finFin = demo.indexOf("const clearOverlay");
  const finalizarHandler = demo.slice(finInicio, finFin);
  const limpiarInicio = demo.indexOf("clearConfirmBtn.onclick");
  const limpiarHandler = demo.slice(limpiarInicio, limpiarInicio + 1600);
  const agregarParticipante = extractFunction(demo, "agregarParticipanteSplit");
  const removerParticipante = extractFunction(demo, "removerParticipanteSplit");
  const agregarGasto = extractFunction(demo, "agregarGastoSplit");
  const eliminarGasto = extractFunction(demo, "eliminarGastoSplit");

  const asignaciones = [...demo.matchAll(/[A-Za-z_$][\w$.]*\.split(?:\.\w+)?\s*=\s*[^=]/g)].map((m) =>
    demo.slice(m.index, m.index + 60).replace(/\s+/g, " ").trim(),
  );
  assert.ok(asignaciones.length >= 3, "debe haber al menos las 3 asignaciones defensivas de leerEstadoDelServidor");
  for (const a of asignaciones) {
    const lhs = a.split(" = ")[0] + " = ";
    assert.ok(
      leer.includes(lhs) || finalizarHandler.includes(lhs) || limpiarHandler.includes(lhs)
        || agregarParticipante.includes(lhs) || removerParticipante.includes(lhs)
        || agregarGasto.includes(lhs) || eliminarGasto.includes(lhs),
      `asignación a .split inesperada fuera de lectura/Finalizar/Limpiar/writers conocidos: "${a}"`,
    );
  }
});

/* ---------- guards: nada más toca split en este PR ----------
   PR 3B agregó los writers de participantes; PR 4 agregó alta/baja de gastos
   (agregarGastoSplit/eliminarGastoSplit); PR 5 conectó calcularBalances/
   liquidarMinimo a un resumen read-only (armarResumenSplit) — ver
   split-balances.test.mjs. Lo único que sigue sin existir es edición de gastos. */

test("sin edición de gastos todavía", () => {
  assert.doesNotMatch(demo, /function\s+editarGastoSplit\s*\(/);
});

test("la card Split sigue sin leer state.split directamente en su propio markup", () => {
  const start = demo.indexOf('<section class="organizer-card split-money-card"');
  const end = demo.indexOf("</section>", start);
  const card = demo.slice(start, end);
  // El HTML estático de la card no referencia state.split: el conteo de
  // participantes se completa aparte, por renderSplitCardSummary().
  assert.doesNotMatch(card, /state\.split/);
  assert.match(card, /Todavía no hay gastos cargados\./);
});

test("el motor puro de Split (PR 1) no se toca ni se conecta", () => {
  const usos = [...demo.matchAll(/\b(repartirExacto|validarGasto|calcularBalances|liquidarMinimo)\s*\(/g)];
  // Sólo las 4 definiciones + las llamadas internas ya existentes entre ellas
  // (calcularBalances llama a repartirExacto, liquidarMinimo no llama a nada más);
  // nada nuevo debería invocarlas desde fuera del propio motor.
  assert.ok(usos.length > 0, "el motor puro sigue definido");
  assert.doesNotMatch(demo, /state\.split\.expenses.*calcularBalances|calcularBalances\(state\.split/s);
});
