// PR #38 — Pago en "Mi estado" = un único checkbox "Ya pagué".
//
// Feedback (Félix): "Debo / Ya pagué" se leía como selector bipolar, y "Debo" ya existe
// conceptualmente en Lista de morosos / "Faltan pagar". Modelo correcto: sin marcar =
// pendiente por defecto; marcado = paid:true. Helper que aclara el default.
//
// `paid` sigue siendo boolean. marcarMiPago(paid) NO cambia. El armado de la response en
// el CTA principal NO cambia (el pago nunca fue parte de ese flujo: es un writer focalizado
// que sólo aparece con una response propia "Estoy" ya guardada).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

/* ---------- 1. markup ---------- */

test("1. el bloque de pago es un checkbox único 'Ya pagué' + helper, sin botones data-value", () => {
  const payment = demo.slice(
    demo.indexOf('<div class="my-status-payment" id="my-status-payment" hidden>'),
    demo.indexOf('</div>', demo.indexOf('<div class="my-status-payment"')) + 6,
  );
  // checkbox real, id y label pedidos
  assert.match(payment, /<label class="my-status-paid-check" for="my-status-paid-check">/);
  assert.match(payment, /<input type="checkbox" id="my-status-paid-check">/);
  assert.match(payment, /<span>Ya pagué<\/span>/);
  // helper del default
  assert.match(payment, /<p class="my-status-paid-help">Si no lo marcás, quedás pendiente\.<\/p>/);
  // el nodo que render() necesita sigue dentro del bloque
  assert.match(payment, /<p class="faltan-pagar" id="faltan-pagar" aria-live="polite"><\/p>/);
  // ya no hay botones bipolares
  assert.doesNotMatch(payment, /data-value=/);
  assert.doesNotMatch(payment, /role="group"/);
  assert.doesNotMatch(payment, />Debo</);
  // "Debo" no reaparece en ningún lado de la card de Mi estado
  const card = demo.slice(demo.indexOf('id="my-status-card"'), demo.indexOf('<div class="ticket">'));
  assert.doesNotMatch(card, />Debo</);
});

test("1b. el bloque de pago conserva su lugar y visibilidad por CSS", () => {
  assert.match(demo, /<div class="my-status-payment" id="my-status-payment" hidden>/);
  assert.match(demo, /\.my-status-payment\[hidden\]\{display:none;\}/);
  // orden en la card: … disponibilidad → pago → invitados → CTA
  const card = demo.slice(demo.indexOf('id="my-status-card"'), demo.indexOf('<div class="ticket">'));
  assert.ok(
    card.indexOf('my-status-times') < card.indexOf('my-status-payment') &&
    card.indexOf('my-status-payment') < card.indexOf('guest-manager-bar') &&
    card.indexOf('guest-manager-bar') < card.indexOf('id="my-status-confirm"'),
    "pago entre disponibilidad e invitados/CTA",
  );
});

/* ---------- 2. syncPagoControls ---------- */

test("2. syncPagoControls: visibilidad intacta + setea .checked + renderIdentityHeader al final", () => {
  const fn = extractFn("syncPagoControls");
  // regla de visibilidad sin cambios
  assert.match(fn, /mockPayment\.hidden = !\(mockAvailability === 'in' && saved && saved\.status === 'in'\);/);
  // el estado del tick sale de saved.paid === true
  assert.match(fn, /const paid = saved \? saved\.paid === true : false;/);
  assert.match(fn, /mockPaidCheck\.checked = paid;/);
  // sigue refrescando la ceja de identidad al final
  assert.match(fn, /renderIdentityHeader\(\);\s*\}$/);
  // ya no togglea clases sobre botones
  assert.doesNotMatch(fn, /\.my-status-paid button|classList\.toggle\('active'/);
});

/* ---------- 3. handler del checkbox ---------- */

test("3. el handler del checkbox llama marcarMiPago con el estado del checkbox", () => {
  const start = demo.indexOf("mockPaidCheck.onchange = async ()=>{");
  assert.ok(start > -1, "hay un onchange en el checkbox de pago");
  const end = demo.indexOf("\n};", start) + 3;
  const h = demo.slice(start, end);
  // guard: sólo con response propia "in"
  assert.match(h, /if\(!response \|\| response\.status!=='in'\)\{ syncPagoControls\(\); return; \}/);
  // llama al writer focalizado con el valor del checkbox
  assert.match(h, /const nextPaid = mockPaidCheck\.checked;/);
  assert.match(h, /const ok = await marcarMiPago\(nextPaid\);/);
  // en falla revierte el tick al valor real (no queda pintado hasta el sondeo)
  assert.match(h, /if\(!ok\)\{\s*mockPaidCheck\.checked = !nextPaid;/);
  assert.match(h, /No se pudo guardar el pago\. Revisá la conexión e intentá otra vez\./);
  // éxito: repinta desde la lista fresca
  assert.match(h, /render\(\);\s*renderLocalOrganizer\(\);\s*\/\/[\s\S]*?syncPagoControls\(\);/);
  // ya no hay forEach sobre los botones de pago
  assert.doesNotMatch(demo, /querySelectorAll\('\.my-status-paid button'\)/);
});

/* ---------- 4. resetMyStatusCard ---------- */

test("4. resetMyStatusCard deja el checkbox de pago sin marcar", () => {
  const fn = extractFn("resetMyStatusCard");
  assert.match(fn, /mockPaidCheck\.checked = false;/);
  assert.doesNotMatch(fn, /\.my-status-paid button/);
});

/* ---------- 5. marcarMiPago sin cambios ---------- */

test("5. marcarMiPago(paid) conserva firma y semántica (writer focalizado, por responseId)", () => {
  const fn = extractFn("marcarMiPago");
  assert.match(fn, /async function marcarMiPago\(paid\)\{/);
  assert.match(fn, /const propia = localAvailabilityResponses\.find\(item=>\s*!item\.isGuest && responseBelongsToCurrentDevice\(item\)/);
  assert.match(fn, /if\(!propia\) return false;/);
  assert.match(fn, /const target = responses\.find\(item=>item\.responseId===responseId\);/);
  assert.match(fn, /if\(!target \|\| target\.status!=='in'\) return false;/);
  assert.match(fn, /target\.paid = paid;\s*target\.updatedAt = new Date\(\)\.toISOString\(\);/);
});

/* ---------- 6. downstream sin cambios ---------- */

test("6. los consumidores de paid siguen usando `=== true` / truthy", () => {
  // derivación a player.paid
  assert.match(demo, /player\.paid = response\.status === 'in' && response\.paid === true/);
  // Tarjetas
  assert.match(extractFn("computeCards"), /if\(r\.paid === true\) continue;/);
  // recaudación / faltan pagar
  const render = extractFn("render");
  assert.match(render, /inList\.filter\(p=>p\.paid\)\.length/);
  assert.match(render, /inList\.filter\(p=>!p\.paid\)/);
  // armado de la response en el CTA principal intacto (el pago nunca fue parte de ese flujo)
  assert.match(demo, /paid:mockAvailability==='in' \? \(existingResponse\?\.paid === true\)/);
  // Organizador
  assert.match(extractFn("renderLocalOrganizer"), /item\.status!=='in' \? '—' : \(item\.paid/);
});
