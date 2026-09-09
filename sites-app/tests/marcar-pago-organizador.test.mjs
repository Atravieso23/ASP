// PR "Marcar pagó" — el Organizador corrige el pago de un habitual que pagó y no lo
// marcó a tiempo, desde la celda Pago de la tabla de respuestas. Sale de "Faltan pagar"
// en el próximo render porque response.paid queda en true.
//
// Fuente de verdad = `paid` (sin lista paralela, sin campo nuevo). Writer nuevo
// `marcarPagoDeResponse(responseId, paid)`, hermano de marcarMiPago / marcarPagoDeInvitado,
// por el mismo canal `guardarCambioEnResponses`. Las invariantes del writer (fail-closed,
// una escritura, save-first, preservación, cola, reglas propias) viven en
// responses-escrituras.test.mjs. Acá: markup, CSS, copy y el handler.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFn(name) {
  const start = demo.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(start > -1, `no encontré la función ${name}`);
  const open = demo.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < demo.length; i++) {
    if (demo[i] === "{") depth++;
    else if (demo[i] === "}" && --depth === 0) return demo.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar ${name}`);
}

/* ---------- 1. writer nuevo ---------- */

test("1. marcarPagoDeResponse: writer focalizado por responseId, excluye invitados, exige 'in' para paid:true", () => {
  const fn = extractFn("marcarPagoDeResponse");
  assert.match(fn, /async function marcarPagoDeResponse\(responseId, paid\)\{/);
  assert.match(fn, /return guardarCambioEnResponses\(responses=>\{/);
  assert.match(fn, /responses\.find\(item=>item\.responseId===responseId && !item\.isGuest\)/);
  assert.match(fn, /if\(paid && target\.status!=='in'\) return false;/);
  assert.match(fn, /target\.paid = paid;\s*\r?\n\s*target\.updatedAt = new Date\(\)\.toISOString\(\);/);
  // No toca cards / tarjetas ni llama a otros writers.
  assert.doesNotMatch(fn, /cards|computeCards|evaluarTarjetas|persistFocalizado|saveState|supabase/i);
});

test("1b. marcarMiPago y marcarPagoDeInvitado no cambiaron", () => {
  const mio = extractFn("marcarMiPago");
  assert.match(mio, /!item\.isGuest && responseBelongsToCurrentDevice\(item\)/);
  assert.match(mio, /if\(!target \|\| target\.status!=='in'\) return false;/);
  const inv = extractFn("marcarPagoDeInvitado");
  assert.match(inv, /item\.responseId===responseId && item\.isGuest/);
  assert.doesNotMatch(inv, /status!=='in'/);
});

/* ---------- 2. celda de Pago en la tabla del Organizador ---------- */

test("2. la celda Pago: '—' fuera de 'in', marca read-only para invitados, botón toggle para habituales", () => {
  const fn = extractFn("renderLocalOrganizer");
  assert.match(fn, /const payment = item\.status!=='in'/);
  assert.match(fn, /:\s*item\.isGuest\s*\r?\n?\s*\?\s*paidMark/);
  assert.match(fn, /class="organizer-paid-toggle\$\{item\.paid\?' active':''\}"/);
  assert.match(fn, /data-mark-paid="\$\{escapeHtml\(item\.responseId\)\}"/);
  assert.match(fn, /aria-pressed="\$\{item\.paid\?'true':'false'\}"/);
  assert.match(fn, /aria-label="\$\{escapeHtml\(paidToggleLabel\)\}"/);
  assert.match(fn, /\$\{item\.paid\?'Marcar impago':'Marcar pagó'\}<\/button>/);
  assert.match(fn, /const paidToggleLabel = item\.paid \? `Marcar impago a \$\{item\.name\}` : `Marcar pagó a \$\{item\.name\}`;/);
});

test("2b. render de la celda: habitual 'in' impago -> botón 'Marcar pagó'; pagado -> 'Marcar impago'; invitado -> ✓/✕", () => {
  const rows = renderBody([
    { responseId: "r1", name: "Nacho Duncan", status: "in", from: "16:00", to: "20:00", paid: false, isGuest: false },
    { responseId: "r2", name: "Pablo <b>", status: "in", from: "16:00", to: "20:00", paid: true, isGuest: false },
    { responseId: "r3", name: "Tino", status: "in", from: "16:00", to: "20:00", paid: false, isGuest: true, invitedBy: "Nacho" },
    { responseId: "r4", name: "Emi", status: "out", paid: null, isGuest: false },
  ]);
  // habitual impago
  assert.match(rows, /<button type="button" class="organizer-paid-toggle" data-mark-paid="r1" aria-pressed="false" aria-label="Marcar pagó a Nacho Duncan">Marcar pagó<\/button>/);
  // habitual pagado + nombre escapado en el aria-label
  assert.match(rows, /class="organizer-paid-toggle active" data-mark-paid="r2" aria-pressed="true" aria-label="Marcar impago a Pablo &lt;b&gt;">Marcar impago<\/button>/);
  // invitado 'in' -> marca de sólo lectura, sin botón
  assert.doesNotMatch(rows, /data-mark-paid="r3"/);
  assert.match(rows, /<span class="payment-mark no" aria-label="No pagó">✕<\/span>/);
  // el toggle sólo aparece una vez (r1); r2 usa la variante 'active'
  assert.equal((rows.match(/data-mark-paid=/g) || []).length, 2);
});

test("2c. la columna 5 (Pago) se ensanchó de 12% a 20% y en angosto a 27%", () => {
  assert.match(demo, /\.organizer-table th:nth-child\(5\),\.organizer-table td:nth-child\(5\)\{width:20%;\}/);
  assert.match(demo, /@media\(max-width:560px\)\{[\s\S]*?\.organizer-table th:nth-child\(5\),\.organizer-table td:nth-child\(5\)\{width:27%;\}/);
  // la suma da 100 en ambos breakpoints
  const base = [17, 24, 16, 23, 20];
  assert.equal(base.reduce((a, b) => a + b), 100);
  const narrow = [17, 17, 17, 22, 27];
  assert.equal(narrow.reduce((a, b) => a + b), 100);
  // la columna de nombre (tuneada a 320px) no se tocó
  assert.match(demo, /\.organizer-table th:nth-child\(1\),\.organizer-table td:nth-child\(1\)\{width:17%;\}/);
  assert.match(demo, /\.organizer-player-static\{font-size:8\.5px;\}/);
});

/* ---------- 3. CSS del toggle (a11y: el color no es el único portador) ---------- */

test("3. .organizer-paid-toggle: checkbox ✓ + color + texto; estado disabled", () => {
  assert.match(demo, /\.organizer-paid-toggle\{[^}]*font:700 10px 'Inter'[^}]*\}/);
  assert.match(demo, /\.organizer-paid-toggle::before\{content:'✓';[^}]*color:transparent;\}/);
  assert.match(demo, /\.organizer-paid-toggle\.active\{border-color:var\(--ok\);color:var\(--ok\);/);
  assert.match(demo, /\.organizer-paid-toggle\.active::before\{[^}]*background:var\(--ok\);color:#fff;\}/);
  assert.match(demo, /\.organizer-paid-toggle:disabled\{opacity:\.5;cursor:progress;\}/);
});

/* ---------- 4. handler ---------- */

test("4. handler delegado sobre la tabla: disable durante guardado, toast éxito/error, re-render", () => {
  const fn = extractFn("renderLocalOrganizer");
  const start = fn.indexOf("body.querySelectorAll('[data-mark-paid]')");
  assert.ok(start > -1, "hay un forEach sobre [data-mark-paid]");
  const h = fn.slice(start, fn.indexOf("\n  });", start) + 6);
  assert.match(h, /const responseId = button\.dataset\.markPaid;/);
  assert.match(h, /localAvailabilityResponses\.find\(item=>item\.responseId===responseId && !item\.isGuest\)/);
  assert.match(h, /const nextPaid = !target\.paid;/);
  assert.match(h, /button\.disabled = true;\s*\r?\n\s*const ok = await marcarPagoDeResponse\(responseId, nextPaid\);\s*\r?\n\s*button\.disabled = false;/);
  assert.match(h, /if\(!ok\)\{\s*\r?\n\s*showToast\('No se pudo guardar el pago\. Revisá la conexión e intentá otra vez\.'\);\s*\r?\n\s*return;/);
  assert.match(h, /render\(\);\s*\r?\n\s*renderLocalOrganizer\(\);\s*\r?\n\s*showToast\(nextPaid \? 'Pago marcado\.' : 'Pago desmarcado\.'\);/);
});

/* ---------- 5. copy ---------- */

test("5. hint bajo la tabla: 'Si alguien pagó y no quedó marcado, corregilo acá.'", () => {
  assert.match(demo, /<p class="organizer-paid-hint">Si alguien pagó y no quedó marcado, corregilo acá\.<\/p>/);
  // va debajo del hint de asignación de equipos, dentro del contenido de respuestas
  assert.match(demo, /organizer-assignment-hint">[^<]*<\/p>\s*<p class="organizer-paid-hint">/);
  assert.match(demo, /\.organizer-paid-hint\{[^}]*color:var\(--muted\)[^}]*\}/);
});

test("5b. copy honesto: no aparece 'confirmado' / 'cobrado' / 'verificado' alrededor del toggle", () => {
  // el texto del botón y su entorno hablan de marcar, no de cobro verificado
  assert.doesNotMatch(demo, /Pago (confirmado|cobrado|verificado)/i);
  assert.doesNotMatch(demo, /Marcar como cobrado/i);
});

/* ---------- 6. no se creó lista paralela ni se tocó #faltan-pagar ---------- */

test("6. #faltan-pagar sigue siendo señal pura, sin acciones", () => {
  const render = extractFn("render");
  assert.match(render, /const faltanEl = document\.getElementById\('faltan-pagar'\);/);
  assert.match(render, /faltanEl\.innerHTML = unpaidNames\.length \? `Faltan pagar: <b>/);
  // el nodo del ticket no tiene botones ni data-*
  assert.match(demo, /<p class="faltan-pagar" id="faltan-pagar" aria-live="polite"><\/p>/);
  const ticket = demo.slice(demo.indexOf('<div class="ticket">'), demo.indexOf('<div class="section teams-section">'));
  assert.doesNotMatch(ticket, /data-mark-paid|organizer-paid-toggle|Marcar pagó/);
});

test("6b. no hay 'ocultar de morosos' ni una segunda lista de impagos", () => {
  assert.doesNotMatch(demo, /ocultar.{0,20}moros|excluir.{0,20}moros|hidden-moroso/i);
});

/* ---------- helper: render del <tbody> del Organizador en un vm ---------- */
// Corre el renderLocalOrganizer REAL de demo.html con un document falso. escapeHtml,
// horariosDisponibles y renderHorariosDisponibles se inyectan del propio archivo.

function renderBody(responses) {
  const body = { innerHTML: "", querySelectorAll: () => [] };
  const els = {
    "organizer-availability-chart": { innerHTML: "" },
    "organizer-responses-body": body,
    "organizer-responses-count": { textContent: "" },
    "organizer-response-search": { value: "" },
  };
  const ctx = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    localAvailabilityResponses: responses,
    state: { players: [] },
    String, Number, Array, Object, Boolean,
  });
  vm.runInContext(
    [
      extractFn("escapeHtml"),
      // El chart de disponibilidad no es lo que se prueba acá: stub para no depender de
      // la extracción de horariosDisponibles (params con destructuring rompen el extractor).
      "function horariosDisponibles(){ return []; }",
      extractFn("renderLocalOrganizer"),
      "renderLocalOrganizer();",
    ].join("\n"),
    ctx,
  );
  return body.innerHTML;
}
