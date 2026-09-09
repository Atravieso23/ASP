// PR 1a — Base visual "Cancha clara": paleta clara y cálida, una familia de superficies,
// escala tipográfica con pisos (14px contenido / 12px ayudas), controles táctiles 44px,
// menos emoji decorativo. Sin tocar estructura, orden, contenido, render ni writers.
//
// Asserts sobre el TEXTO del <style> y del markup de demo.html (regex), como el resto
// de la suite. No valida contraste real ni layout — eso es el smoke a 320/375.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
const style = demo.slice(demo.indexOf("<style>"), demo.indexOf("</style>"));
const root = style.slice(style.indexOf(":root{"), style.indexOf("}", style.indexOf(":root{")) + 1);

function cssRule(selector) {
  const i = style.indexOf(selector + "{");
  assert.notEqual(i, -1, `no encontré la regla ${selector}`);
  return style.slice(i, style.indexOf("}", i) + 1);
}

/* ---------- 1. paleta clara y cálida en :root ---------- */

test("0. el comentario de :root está balanceado (no cierra antes de tiempo con un */ suelto)", () => {
  // un */ dentro del comentario lo cerraría y rompería las declaraciones siguientes en
  // silencio (los tests de regex no lo notan, pero el CSS no aplica).
  const abre = root.indexOf("/*");
  const cierra = root.indexOf("*/");
  assert.ok(abre > -1 && cierra > abre, "hay un comentario en :root");
  const primerDecl = root.indexOf("--page-bg:");
  assert.ok(cierra < primerDecl, "el comentario cierra antes de la primera declaración");
  // y no hay un segundo */ suelto entre el cierre y --page-bg
  assert.equal(root.slice(cierra + 2, primerDecl).indexOf("*/"), -1);
});

test("1. :root define la paleta Cancha clara: fondo claro, texto oscuro, verde profundo", () => {
  // fondo de página claro (byte alto en el primer canal), no el navy oscuro viejo.
  const pageBg = root.match(/--page-bg:\s*(#[0-9A-Fa-f]{6})/)[1];
  assert.ok(parseInt(pageBg.slice(1, 3), 16) > 0xD0, `--page-bg debe ser claro, es ${pageBg}`);
  const surface = root.match(/--surface:\s*(#[0-9A-Fa-f]{6})/)[1];
  assert.ok(parseInt(surface.slice(1, 3), 16) > 0xD0, `--surface debe ser claro, es ${surface}`);
  // texto principal oscuro
  const text = root.match(/--text:\s*(#[0-9A-Fa-f]{6})/)[1];
  assert.ok(parseInt(text.slice(1, 3), 16) < 0x60, `--text debe ser oscuro, es ${text}`);
  // color principal verde (canal G domina sobre R y B)
  const primary = root.match(/--primary:\s*(#[0-9A-Fa-f]{6})/)[1];
  const [r, g, b] = [1, 3, 5].map((o) => parseInt(primary.slice(o, o + 2), 16));
  assert.ok(g > r && g > b, `--primary debe ser verde, es ${primary}`);
  assert.match(root, /--active-soft:/);
});

test("2. los nombres legacy son alias de la paleta nueva (no se reescribieron ~200 usos)", () => {
  assert.match(root, /--navy:var\(--text\)/);
  assert.match(root, /--white:var\(--surface\)/);
  assert.match(root, /--card-border:var\(--border\)/);
  assert.match(root, /--bg-bottom:var\(--surface-2\)/);
  assert.match(root, /--celeste:var\(--primary\)/);
  assert.match(root, /--celeste-deep:var\(--primary-deep\)/);
});

test("3. el body ya no arma un tema oscuro (sin gradientes ni glow blanco)", () => {
  const i = style.search(/\n\s*body\{/);
  const body = style.slice(i, style.indexOf("}", i) + 1);
  assert.match(body, /background:var\(--page-bg\)/);
  assert.match(body, /color:var\(--text\)/);
  assert.doesNotMatch(body, /radial-gradient|linear-gradient/);
  // el glow blanco del tema oscuro no queda en ningún lado del <style>
  assert.doesNotMatch(style, /rgba\(255,255,255,0\.5\)/);
});

/* ---------- 2. escala tipográfica y de superficie ---------- */

test("4. :root define la escala compartida (radio único + pisos 14/12 + tap 44)", () => {
  assert.match(root, /--radius:14px/);
  assert.match(root, /--radius-control:/);
  assert.match(root, /--fs-body:14px/);
  assert.match(root, /--fs-help:12px/);
  assert.match(root, /--tap:44px/);
});

test("5. los bloques comparten radio (--radius) y superficie (--surface)", () => {
  for (const sel of [".my-status-card", ".falta-confirmar", ".lista-morosos", ".ticket", ".main-view-switch"]) {
    const rule = cssRule(sel);
    assert.match(rule, /border-radius:var\(--radius\)/, `${sel} usa --radius`);
    assert.match(rule, /background:var\(--surface\)/, `${sel} usa --surface`);
  }
});

/* ---------- 3. legibilidad: labels sin uppercase dominante, pisos 12/14 ---------- */

test("6. los labels de Mi estado son legibles: sin uppercase, font-size >= --fs-label", () => {
  const label = cssRule(".my-status-field label, .my-status-label");
  assert.match(label, /text-transform:none/);
  assert.match(label, /font-size:var\(--fs-label\)/);
  assert.doesNotMatch(label, /letter-spacing:\.1em/);
});

test("7. las ayudas del recorrido personal usan el piso --fs-help (>=12px), no 10.5/11", () => {
  for (const sel of [".player-picker-help", ".my-status-number-help", ".my-status-paid-help", ".casaca-preview"]) {
    assert.match(cssRule(sel), /font-size:var\(--fs-help\)/, `${sel} usa --fs-help`);
  }
  // ya no quedan tamaños sub-12 hardcodeados en esas reglas
  for (const bad of [/\.player-picker-help\{[^}]*10\.5px/, /\.my-status-paid-help\{[^}]*:\s*11px/]) {
    assert.doesNotMatch(style, bad);
  }
});

test("8. las listas de nombres del recorrido son contenido (>=14px)", () => {
  assert.match(cssRule(".falta-confirmar-names"), /font:600 var\(--fs-body\)/);
  assert.match(cssRule(".lista-morosos-item"), /font:600 var\(--fs-body\)/);
});

/* ---------- 4. controles táctiles 44x44 ---------- */

test("9. los controles del recorrido llegan al piso táctil --tap (44px)", () => {
  for (const sel of [
    ".my-status-choice button",
    ".my-status-confirm",
    ".my-status-time-pair select",
    ".my-status-fullday",
    ".my-status-paid-check",
    ".change-player-btn",
    ".guest-manager-toggle",
    ".falta-confirmar-copy",
    ".tab-btn",
    ".main-view-btn",
    ".edit-btn",
  ]) {
    assert.match(cssRule(sel), /min-height:var\(--tap\)/, `${sel} tiene min-height:var(--tap)`);
  }
});

test("10. 'Cómo llegar' / 'Copiar alias' amplían el área tocable a 44px", () => {
  // el botón visible es chico pero el ::after lo lleva a 44 (26 + 2*9)
  assert.match(cssRule(".copy-alias-btn"), /width:26px; height:26px/);
  assert.match(style, /\.copy-alias-btn::after\{content:'';\s*position:absolute;\s*inset:-9px;\}/);
});

/* ---------- 5. menos emoji decorativo ---------- */

test("11. las pestañas ya no llevan emoji decorativo", () => {
  assert.match(demo, /id="tab-btn-partido">Partido<\/button>/);
  assert.match(demo, /id="tab-btn-historial">Historial<\/button>/);
  assert.doesNotMatch(demo, /⚽ Partido|🕘 Historial/);
});

test("12. se preservan los emojis que expresan estado o momento de grupo", () => {
  // chip de día libre (estado expresivo), señal de WhatsApp (tono de grupo),
  // 🟨/🍺 (símbolos con significado), empty state con tono.
  assert.match(demo, /Siempre para la pelota<\/span>\s*<span aria-hidden="true">⚽❤️<\/span>/);
  assert.match(demo, /Tiren una señal, por favor 🙏/);
  assert.match(demo, /sumás 🟨/);
  assert.match(demo, /birra para la banda 🍺/);
});

/* ---------- 6. no se tocó estructura / orden / writers ---------- */

test("13. el orden de bloques del tab Partido no cambió", () => {
  const idx = (s) => demo.indexOf(s);
  assert.ok(
    idx('id="proximo-partido"') < idx('id="my-status-card"') &&
    idx('id="my-status-card"') < idx('id="falta-confirmar-block"') &&
    idx('id="falta-confirmar-block"') < idx('<div class="ticket">') &&
    idx('<div class="ticket">') < idx('class="section teams-section"') &&
    idx('class="section teams-section"') < idx('id="lista-morosos-block"'),
    "proximo -> mi estado -> faltan responder -> ticket -> equipos -> morosos",
  );
});

test("14. este PR no toca render(), writers ni persistencia (sólo <style> + 2 textos de tab)", () => {
  // el markup de Mi estado y sus handlers no cambian: el default 'in' y los selects siguen igual.
  assert.match(demo, /<button type="button" class="active" data-value="in" aria-pressed="true">Estoy<\/button>/);
  assert.match(demo, /<option value="" selected disabled>Desde<\/option>/);
  assert.match(demo, /function render\(\)\{/);
  assert.match(demo, /async function marcarMiPago\(paid\)\{/);
});
