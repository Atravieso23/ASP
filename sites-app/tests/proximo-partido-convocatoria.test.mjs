// PR #46 — línea de convocatoria en el bloque "Próximo partido": "9 confirmados ·
// 1 en duda · apuntamos a 14", arriba de todo, sin scroll (feedback real de uso).
// Reusa inList/dudaList/cap ya calculados en render() — sin llamadas nuevas a
// getResponsePlayers. El ticket y su .squad-status NO se tocan (el detalle sigue
// ahí). Sin "9/14" ni "de 14" ni "faltan N" ni "cupo": no es un marcador ni un techo.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar ${name}`);
}

const renderSrc = extractFunction(demo, "render");

/* ---------- 1. markup: nodo dentro de #proximo-partido, después de -sub ---------- */

test("1. #proximo-partido-squad existe dentro del bloque, después de -sub", () => {
  assert.equal(demo.split('id="proximo-partido-squad"').length - 1, 1, "un único nodo");
  const block = demo.slice(
    demo.indexOf('<section class="proximo-partido"'),
    demo.indexOf("</section>", demo.indexOf('<section class="proximo-partido"')) + 10,
  );
  assert.match(block, /<p class="proximo-partido-squad" id="proximo-partido-squad"><\/p>/);
  assert.ok(
    block.indexOf('id="proximo-partido-sub"') < block.indexOf('id="proximo-partido-squad"'),
    "el nodo de convocatoria va después de -sub",
  );
});

test("2. NO está dentro del ticket", () => {
  assert.ok(
    demo.indexOf('id="proximo-partido-squad"') < demo.indexOf('<div class="ticket">'),
    "el nodo quedó dentro/después del ticket",
  );
});

/* ---------- 3. el ticket y su .squad-status siguen intactos ---------- */

test("3. .squad-status del ticket sin cambios (confirmed-count / doubt-note / capacity-target)", () => {
  const ticket = demo.slice(demo.indexOf('<div class="ticket">'), demo.indexOf('class="section teams-section"'));
  assert.match(ticket, /class="squad-status-line" id="capacity-note"><b id="confirmed-count">0<\/b> confirmados/);
  assert.match(ticket, /id="doubt-note" hidden> · <b id="doubt-count">0<\/b> en duda/);
  assert.match(ticket, /<p class="squad-status-target" id="capacity-target"><\/p>/);
  assert.doesNotMatch(ticket, /proximo-partido/);
});

/* ---------- 4. render() puebla reusando los valores ya calculados ---------- */

test("4. render() puebla #proximo-partido-squad con inList/dudaList/cap/mi.type", () => {
  assert.match(renderSrc, /getElementById\('proximo-partido-squad'\)/);
  assert.match(renderSrc, /inList\.length === 1 \? 'confirmado' : 'confirmados'/);
  assert.match(renderSrc, /dudaList\.length > 0.*en duda/s);
  assert.match(renderSrc, /mi\.type.*apuntamos a \$\{cap\}/s);
  assert.match(renderSrc, /inList\.length === 0 && dudaList\.length === 0/);
});

test("5. no agrega llamadas a getResponsePlayers para este bloque", () => {
  // Siguen siendo exactamente las 3 de siempre ('in','duda','out'), una cada una.
  assert.equal((renderSrc.match(/getResponsePlayers\('duda'\)/g) || []).length, 1);
  assert.equal((renderSrc.match(/getResponsePlayers\('in'\)/g) || []).length, 1);
  assert.equal((renderSrc.match(/getResponsePlayers\('out'\)/g) || []).length, 1);
  // El bloque de convocatoria no vuelve a filtrar responses ni llama getResponsePlayers.
  const bloque = renderSrc.slice(
    renderSrc.indexOf("const squadEl = document.getElementById('proximo-partido-squad');"),
    renderSrc.indexOf("const negroListEl"),
  );
  assert.ok(bloque.length > 0, "no encontré el bloque de convocatoria en render()");
  assert.doesNotMatch(bloque, /getResponsePlayers|localAvailabilityResponses|\.filter\(/);
});

test("6. no usa formato de marcador / techo / lista de espera", () => {
  const bloque = renderSrc.slice(
    renderSrc.indexOf("const squadEl = document.getElementById('proximo-partido-squad');"),
    renderSrc.indexOf("const negroListEl"),
  );
  assert.doesNotMatch(bloque, /\/|`\$\{[^}]*\} de \$\{|faltan|cupo/i);
});

/* ---------- 7. comportamiento real del bloque (snippet de render()) ---------- */

function runSquad({ inCount, dudaCount, type }) {
  const bloque = renderSrc.slice(
    renderSrc.indexOf("const squadEl = document.getElementById('proximo-partido-squad');"),
    renderSrc.indexOf("const negroListEl"),
  );
  const node = { textContent: "PREV" };
  const cap = type ? { F5: 10, F7: 14, F8: 16, F9: 18, F11: 22 }[type] : 10;
  const ctx = vm.createContext({
    document: { getElementById: (id) => (id === "proximo-partido-squad" ? node : null) },
    inList: { length: inCount },
    dudaList: { length: dudaCount },
    mi: { type },
    cap,
    String,
  });
  vm.runInContext(bloque, ctx);
  return node.textContent;
}

test("7. confirmados + duda + type -> '9 confirmados · 1 en duda · apuntamos a 14'", () => {
  assert.equal(runSquad({ inCount: 9, dudaCount: 1, type: "F7" }), "9 confirmados · 1 en duda · apuntamos a 14");
});

test("8. sin duda -> no aparece 'en duda'", () => {
  assert.equal(runSquad({ inCount: 9, dudaCount: 0, type: "F7" }), "9 confirmados · apuntamos a 14");
});

test("9. sin type -> no aparece 'apuntamos a'", () => {
  assert.equal(runSquad({ inCount: 9, dudaCount: 1, type: "" }), "9 confirmados · 1 en duda");
});

test("10. 0 confirmados y 0 duda -> línea vacía (:empty la oculta)", () => {
  assert.equal(runSquad({ inCount: 0, dudaCount: 0, type: "F7" }), "");
});

test("11. 1 confirmado -> singular", () => {
  assert.equal(runSquad({ inCount: 1, dudaCount: 0, type: "F8" }), "1 confirmado · apuntamos a 16");
});

test("12. 0 confirmados pero 2 en duda -> igual muestra", () => {
  assert.equal(runSquad({ inCount: 0, dudaCount: 2, type: "F7" }), "0 confirmados · 2 en duda · apuntamos a 14");
});

/* ---------- 8. la línea no depende de matchInfo.time ---------- */

test("13. el bloque de convocatoria no mira matchInfo.time ni matchInfo.date", () => {
  const bloque = renderSrc.slice(
    renderSrc.indexOf("const squadEl = document.getElementById('proximo-partido-squad');"),
    renderSrc.indexOf("const negroListEl"),
  );
  assert.doesNotMatch(bloque, /mi\.time|mi\.date/);
});

/* ---------- 9. CSS aislado, sin fondo de card ---------- */

test("14. CSS: .proximo-partido-squad es compacto, muted, sin fondo, con :empty", () => {
  const css = demo.slice(demo.indexOf(".proximo-partido-squad{"), demo.indexOf("/* MI ESTADO"));
  assert.match(css, /\.proximo-partido-squad\{[^}]*font-size:12px[^}]*color:var\(--muted\)/);
  assert.doesNotMatch(css, /\.proximo-partido-squad\{[^}]*(background|border:)/);
  assert.match(demo, /\.proximo-partido-squad:empty\{display:none;\}/);
});
