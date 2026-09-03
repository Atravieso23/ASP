// PR #54 — "Faltan responder": el bloque de conciencia grupal (entre #my-status-card
// y .ticket) pasa de "Faltan confirmar" a "Faltan responder", esconde el chip
// numérico y capa la lista visible a 4 nombres ("… y N más"). El mensaje de
// WhatsApp sigue listando a todos. Sólo lectura: no toca estado/Supabase/writers.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function sliceBetween(source, startMark, endMark) {
  const a = source.indexOf(startMark);
  const b = source.indexOf(endMark, a);
  assert.ok(a !== -1 && b !== -1, `no encontré el rango ${startMark} … ${endMark}`);
  return source.slice(a, b);
}

const src = sliceBetween(demo, "function faltanConfirmar(estado", "\nfunction loadRecurrentPlayers(");

function run({ habitualPlayers, responses }) {
  const mkClassList = () => {
    const set = new Set();
    return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  };
  const block = { hidden: false, classList: mkClassList() };
  const sub = { textContent: "" };
  const namesEl = { textContent: "", hidden: false };
  const copyBtn = { hidden: false };
  const countEl = { textContent: "", hidden: false };
  const elements = {
    "falta-confirmar-block": block,
    "falta-confirmar-sub": sub,
    "falta-confirmar-names": namesEl,
    "falta-confirmar-copy": copyBtn,
    "falta-confirmar-count": countEl,
  };
  const ctx = vm.createContext({
    document: { getElementById: (id) => elements[id] || null },
    state: { habitualPlayers },
    localAvailabilityResponses: responses,
    Set, Array, Object, String,
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(
    `${src}\nglobalThis.__r = renderFaltaConfirmar;\nglobalThis.__msg = mensajeFaltaConfirmar;`,
    ctx,
  );
  ctx.__r();
  return { block, sub, namesEl, copyBtn, countEl, mensaje: ctx.__msg() };
}

const N = (name, extra = {}) => ({ name, isGuest: false, status: "in", ...extra });

/* ============ markup / título / chip ============ */

test("1. título del bloque = 'Faltan responder', y ya no 'Faltan confirmar'", () => {
  assert.match(demo, /<h2 class="falta-confirmar-title" id="falta-confirmar-title">Faltan responder<\/h2>/);
  assert.doesNotMatch(demo, /falta-confirmar-title[^>]*>Faltan confirmar</);
});

test("2. ubicación intacta: entre #my-status-card y .ticket, con botón WhatsApp", () => {
  assert.match(demo, /<\/section>\s*<section class="falta-confirmar"[\s\S]*?<\/section>\s*<div class="ticket">/);
  assert.match(demo, /id="falta-confirmar-copy"[^>]*>Copiar para WhatsApp</);
  assert.match(demo, /renderHistory\(\);\s*renderFaltaConfirmar\(\);/);
});

test("3. el chip numérico nunca se muestra (markup presente, siempre hidden)", () => {
  assert.match(demo, /<span class="falta-confirmar-count" id="falta-confirmar-count"[^>]*hidden><\/span>/);
  assert.match(demo, /\.falta-confirmar-count\[hidden\]\s*\{\s*display\s*:\s*none\s*;?\s*\}/);
  const fn = sliceBetween(demo, "function renderFaltaConfirmar()", "\nfunction morososDeCards(");
  // el render nunca hace visible el chip
  assert.doesNotMatch(fn, /countEl\.hidden\s*=\s*false/);
  assert.doesNotMatch(fn, /countEl\.textContent\s*=/);
});

/* ============ comportamiento: lista capada ============ */

test("4. lista corta (<= 4): muestra todos los nombres", () => {
  const out = run({
    habitualPlayers: ["Ana", "Beto", "Caro", "Dani", "Emi"],
    responses: [N("Emi")],
  });
  assert.equal(out.namesEl.textContent, "Ana, Beto, Caro, Dani");
  assert.doesNotMatch(out.namesEl.textContent, /más/);
});

test("4b. exactamente 4: muestra los 4, sin 'y N más'", () => {
  const out = run({
    habitualPlayers: ["Ana", "Beto", "Caro", "Dani", "Emi"],
    responses: [N("Ana"), N("Beto")],
  });
  // faltan Caro, Dani, Emi -> 3, todos
  assert.equal(out.namesEl.textContent, "Caro, Dani, Emi");
  const out4 = run({
    habitualPlayers: ["Ana", "Beto", "Caro", "Dani"],
    responses: [],
  });
  assert.equal(out4.namesEl.textContent, "Ana, Beto, Caro, Dani");
  assert.doesNotMatch(out4.namesEl.textContent, /más/);
});

test("5. lista larga (> 4): primeros 4 + 'y N más'", () => {
  const out = run({
    habitualPlayers: ["Ana", "Beto", "Caro", "Dani", "Emi", "Fede", "Gonza"],
    responses: [],
  });
  // faltanConfirmar ordena alfabético
  assert.equal(out.namesEl.textContent, "Ana, Beto, Caro, Dani y 3 más");
});

test("6. lista larga: NO renderiza todos los nombres en pantalla", () => {
  const nombres = ["Ana", "Beto", "Caro", "Dani", "Emi", "Fede", "Gonza", "Hugo"];
  const out = run({ habitualPlayers: nombres, responses: [] });
  const visibles = nombres.filter((n) => out.namesEl.textContent.includes(n));
  assert.equal(visibles.length, 4, `debería mostrar sólo 4, muestra ${visibles.length}`);
  assert.match(out.namesEl.textContent, /y 4 más$/);
  assert.ok(!out.namesEl.textContent.includes("Emi") && !out.namesEl.textContent.includes("Hugo"));
});

/* ============ estado ok ============ */

test("7. sin faltantes: 'Están todos ✅', sin nombres ni botón ni chip", () => {
  const out = run({
    habitualPlayers: ["Ana", "Beto"],
    responses: [N("Ana"), N("Beto")],
  });
  assert.equal(out.sub.textContent, "Están todos ✅");
  assert.equal(out.namesEl.hidden, true);
  assert.equal(out.copyBtn.hidden, true);
  assert.equal(out.countEl.hidden, true);
  assert.equal(out.block.classList.contains("falta-confirmar--ok"), true);
});

/* ============ botón WhatsApp + mensaje ============ */

test("8. botón WhatsApp visible cuando faltan, oculto cuando no faltan", () => {
  assert.equal(run({ habitualPlayers: ["Ana", "Beto"], responses: [N("Ana")] }).copyBtn.hidden, false);
  assert.equal(run({ habitualPlayers: ["Ana"], responses: [N("Ana")] }).copyBtn.hidden, true);
});

test("9. mensajeFaltaConfirmar() sigue funcionando y lista a TODOS (aunque la UI cape a 4)", () => {
  const out = run({
    habitualPlayers: ["Ana", "Beto", "Caro", "Dani", "Emi", "Fede", "Gonza"],
    responses: [],
  });
  assert.match(out.mensaje, /^Faltan responder: /);
  for (const n of ["Ana", "Beto", "Caro", "Dani", "Emi", "Fede", "Gonza"]) {
    assert.ok(out.mensaje.includes(n), `el mensaje de WhatsApp debe incluir a ${n}`);
  }
  // vacío si no falta nadie
  assert.equal(run({ habitualPlayers: ["Ana"], responses: [N("Ana")] }).mensaje, "");
});

/* ============ semántica de faltanConfirmar (regresión) ============ */

test("10. invitados no cuentan como respuesta", () => {
  const out = run({
    habitualPlayers: ["Ana", "Beto"],
    responses: [{ name: "Ana", isGuest: true, invitedBy: "Beto" }],
  });
  assert.equal(out.namesEl.textContent, "Ana, Beto");
});

test("11. habitual con 'out' ya NO falta (respondió)", () => {
  const out = run({
    habitualPlayers: ["Ana", "Beto"],
    responses: [N("Ana", { status: "out" })],
  });
  assert.equal(out.namesEl.textContent, "Beto");
});

test("12. habitual con 'duda' ya NO falta (respondió)", () => {
  const out = run({
    habitualPlayers: ["Ana", "Beto"],
    responses: [N("Ana", { status: "duda" })],
  });
  assert.equal(out.namesEl.textContent, "Beto");
});

/* ============ copy prohibido / sólo lectura ============ */

test("13. copy prohibido ausente del bloque y su render", () => {
  const fn = sliceBetween(demo, "function renderFaltaConfirmar()", "\nfunction morososDeCards(");
  const block = sliceBetween(demo, '<section class="falta-confirmar"', "</section>");
  for (const p of [/\bfaltan \d/i, /\bfaltan \$\{/i, /cupo/i, /apúrense/i, /vagos/i, /\bya\b.*\bfirmen/i]) {
    assert.doesNotMatch(fn, p);
    assert.doesNotMatch(block, p);
  }
  // salida en runtime tampoco
  const out = run({ habitualPlayers: ["Ana", "Beto", "Caro"], responses: [] });
  assert.doesNotMatch(out.namesEl.textContent + " " + out.sub.textContent, /faltan \d|cupo/i);
});

test("14. renderFaltaConfirmar es sólo lectura: sin Supabase, sin writers, sin escribir estado", () => {
  const fn = sliceBetween(demo, "function renderFaltaConfirmar()", "\nfunction morososDeCards(");
  assert.doesNotMatch(fn, /supabase|fetch\(|upsert|localStorage|savePlayerRegistration|guardarCambio|saveState|persist/i);
  assert.doesNotMatch(fn, /state\.\w+\s*=[^=]|matchInfo/);
});
