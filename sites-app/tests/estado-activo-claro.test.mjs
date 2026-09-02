// PR #39 — El estado activo de "Estoy / En duda / Soy baja" tiene que leerse claro.
//
// Feedback (Félix): no sabía en qué estado estaba. El segmented control diferenciaba
// activo↔inactivo SÓLO por color de fondo, sin 2ª señal. Fix visual-only (solo CSS):
//   - "✓ " decorativo en el activo (::before),
//   - halo/box-shadow adicional en el activo,
//   - inactivos como chips outline livianos (background:transparent).
// NO se toca markup, copy, data-value, aria-pressed, el handler ni mockAvailability.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function cssRule(selector) {
  const i = demo.indexOf(selector + "{");
  assert.ok(i > -1, `no encontré la regla CSS para "${selector}"`);
  const end = demo.indexOf("}", i);
  return demo.slice(i, end + 1);
}

/* ---------- 1. segunda señal + refuerzo del activo ---------- */

test("1a. el botón activo tiene un ::before con '✓'", () => {
  const rule = cssRule(".my-status-choice button.active::before");
  assert.match(rule, /content:\s*'✓ ?';?/);
});

test("1b. el activo suma un refuerzo visual además del color (box-shadow / halo)", () => {
  const base = cssRule(".my-status-choice button.active");
  assert.match(base, /box-shadow:[^;]*rgba\(63,174,122/, "halo verde para 'Estoy'");
  // y también en las variantes por estado
  assert.match(cssRule('.my-status-choice button[data-value="duda"].active'), /box-shadow:[^;]*rgba\(224,163,62/);
  assert.match(cssRule('.my-status-choice button[data-value="out"].active'), /box-shadow:[^;]*rgba\(228,99,75/);
});

test("1c. los tres estados activos siguen diferenciados por color", () => {
  assert.match(cssRule(".my-status-choice button.active"), /background:var\(--ok\)/);
  assert.match(cssRule('.my-status-choice button[data-value="duda"].active'), /background:var\(--duda\)/);
  assert.match(cssRule('.my-status-choice button[data-value="out"].active'), /background:var\(--danger\)/);
});

test("1d. los inactivos son más livianos (outline sobre la card), no rellenos", () => {
  const btn = cssRule(".my-status-choice button");
  assert.match(btn, /background:transparent/);
  assert.match(btn, /border:1px solid var\(--card-border\)/, "sigue teniendo borde (no parece disabled)");
  assert.doesNotMatch(btn, /background:var\(--bg-bottom\)/);
});

test("1e. área táctil: min-height:40px se mantiene", () => {
  assert.match(cssRule(".my-status-choice button"), /min-height:40px/);
});

/* ---------- 2. markup / a11y intactos ---------- */

test("2. el markup del control no cambió (data-value, copy, aria-pressed, role)", () => {
  assert.match(demo, /<div class="my-status-choice" role="group" aria-label="Estado">/);
  assert.match(demo, /<button type="button" class="active" data-value="in" aria-pressed="true">Estoy<\/button>/);
  assert.match(demo, /<button type="button" data-value="duda" aria-pressed="false">En duda<\/button>/);
  assert.match(demo, /<button type="button" data-value="out" aria-pressed="false">Soy baja<\/button>/);
  // el "✓" vive en CSS, NO en el markup (no ensucia el nombre accesible)
  const choice = demo.slice(
    demo.indexOf('<div class="my-status-choice"'),
    demo.indexOf("</div>", demo.indexOf('<div class="my-status-choice"')),
  );
  assert.doesNotMatch(choice, /✓/);
});

/* ---------- 3. handler / lógica sin tocar ---------- */

test("3. el handler de estado y mockAvailability siguen igual (visual-only)", () => {
  assert.match(demo, /document\.querySelectorAll\('\.my-status-choice button'\)\.forEach\(btn=>\{/);
  assert.match(demo, /mockAvailability = btn\.dataset\.value;/);
  assert.match(demo, /mockAvailabilityBlock\.hidden = mockAvailability === 'out';/);
  assert.match(demo, /option\.setAttribute\('aria-pressed', selected \? 'true' : 'false'\);/);
});
