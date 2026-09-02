// PR #40 — #faltan-pagar (lista colectiva de morosos) sale del bloque personal de Pago de
// "Mi estado" y pasa a vivir dentro del ticket, debajo de .money-summary.
//
// Movimiento de markup únicamente: el nodo conserva id / class / aria-live. El JS de
// render() que lo calcula y lo pinta NO cambia (mismo getElementById, misma lógica, mismo
// estado .all-paid, misma regla :empty). El bloque #my-status-payment queda 100% personal.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function fn(name) {
  const start = demo.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.ok(start > -1, `no encontré ${name}`);
  const open = demo.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < demo.length; i++) {
    if (demo[i] === "{") depth++;
    else if (demo[i] === "}" && --depth === 0) return demo.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar ${name}`);
}

/* ---------- 1. ubicación nueva ---------- */

test("1. #faltan-pagar salió del bloque de pago y vive en el ticket, debajo de .money-summary", () => {
  assert.equal(demo.split('id="faltan-pagar"').length - 1, 1, "un único nodo");

  const payment = demo.slice(
    demo.indexOf('<div class="my-status-payment" id="my-status-payment" hidden>'),
    demo.indexOf("</div>", demo.indexOf('<div class="my-status-payment"')) + 6,
  );
  assert.doesNotMatch(payment, /faltan-pagar/, "ya no está en #my-status-payment");

  const card = demo.slice(demo.indexOf('id="my-status-card"'), demo.indexOf('<div class="ticket">'));
  assert.doesNotMatch(card, /faltan-pagar/, "ya no está en el card de Mi estado");

  // Dentro del ticket, después de .money-summary y antes de que cierre el ticket.
  const ticket = demo.indexOf('<div class="ticket">');
  const teams = demo.indexOf('<div class="section teams-section">');
  const ticketMarkup = demo.slice(ticket, teams);
  assert.match(
    ticketMarkup,
    /class="money-summary"[\s\S]*id="edit-match-btn"[\s\S]*<\/div>\s*(?:<!--[\s\S]*?-->\s*)?<p class="faltan-pagar" id="faltan-pagar" aria-live="polite"><\/p>\s*<\/div>/,
  );
});

/* ---------- 2. el nodo conserva sus atributos ---------- */

test("2. el nodo conserva id, class y aria-live", () => {
  assert.match(demo, /<p class="faltan-pagar" id="faltan-pagar" aria-live="polite"><\/p>/);
});

/* ---------- 3. #my-status-payment queda 100% personal ---------- */

test("3. el bloque de pago mantiene sólo el control personal", () => {
  const payment = demo.slice(
    demo.indexOf('<div class="my-status-payment" id="my-status-payment" hidden>'),
    demo.indexOf("</div>", demo.indexOf('<div class="my-status-payment"')) + 6,
  );
  assert.match(payment, /<span class="my-status-label">Pago<\/span>/);
  assert.match(payment, /<input type="checkbox" id="my-status-paid-check">\s*<span>Ya pagué<\/span>/);
  assert.match(payment, /<p class="my-status-paid-help">Si no lo marcás, quedás pendiente\.<\/p>/);
});

/* ---------- 4. render() sigue encontrando el nodo y calculando igual ---------- */

test("4. render() sigue apuntando a #faltan-pagar y su lógica no cambió", () => {
  const r = fn("render");
  assert.match(r, /const faltanEl = document\.getElementById\('faltan-pagar'\);/);
  assert.match(r, /faltanEl\.classList\.toggle\('all-paid', unpaidNames\.length===0 && inList\.length>0\);/);
  assert.match(
    r,
    /faltanEl\.innerHTML = unpaidNames\.length \? `Faltan pagar: <b>\$\{escapeHtml\(unpaidNames\.join\(', '\)\)\}<\/b>` : \(inList\.length \? 'Ya pagaron todos ✓' : ''\);/,
  );
  assert.match(r, /const unpaidNames = inList\.filter\(p=>!p\.paid\)/);
});

/* ---------- 5. CSS del nodo intacto (estado vacío + all-paid) ---------- */

test("5. las reglas .faltan-pagar (:empty y .all-paid) siguen igual", () => {
  assert.match(demo, /\.faltan-pagar:empty\{display:none;\}/);
  assert.match(demo, /\.faltan-pagar\.all-paid\{color:#76B99A;/);
  assert.match(demo, /\.faltan-pagar b\{color:#C76C5E;/);
});
