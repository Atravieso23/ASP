// PR #55 — editor de partido, campo Hora: markup-only. #m-time sigue siendo
// texto libre, pero suma un <datalist id="horas-tipicas"> (15:00–23:00), un
// helper que aclara que dejarla vacía es válido, y una línea al pie del modal
// que dice de dónde sale el bloque "Próximo partido". Sin JS, sin tocar
// guardarPartido / el handler #m-save / el schema de matchInfo. Nunca insinúa
// "reserva" / "confirmado" / "cupo".
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

const modal = demo.slice(
  demo.indexOf('<div class="modal-overlay" id="modal-overlay">'),
  demo.indexOf('<div class="modal-overlay" id="manage-sedes-overlay">'),
);
assert.ok(modal.length > 0 && modal.includes('id="m-save"'), "no ubiqué el modal de editar partido");

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

/* ============ campo Hora ============ */

test("1. #m-time sigue siendo type=text y suma list=horas-tipicas", () => {
  const input = modal.match(/<input[^>]*id="m-time"[^>]*>/)[0];
  assert.match(input, /type="text"/);
  assert.doesNotMatch(input, /type="time"/);
  assert.match(input, /list="horas-tipicas"/);
});

test("2. #m-time tiene el placeholder nuevo", () => {
  const input = modal.match(/<input[^>]*id="m-time"[^>]*>/)[0];
  assert.match(input, /placeholder="Ej: 20:00 \(o dejala vacía\)"/);
  assert.doesNotMatch(input, /placeholder="18:00"/);
});

test("3. <datalist id=horas-tipicas> existe con 15:00 … 23:00 (una opción por hora)", () => {
  const dl = modal.match(/<datalist id="horas-tipicas">[\s\S]*?<\/datalist>/);
  assert.ok(dl, "falta el datalist");
  const horas = [...dl[0].matchAll(/<option value="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(horas, ["15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"]);
  // el datalist es único y el input lo referencia una sola vez
  assert.equal(demo.split('id="horas-tipicas"').length - 1, 1, "un solo <datalist id=horas-tipicas>");
  assert.equal(demo.split('list="horas-tipicas"').length - 1, 1, "un solo input con list=horas-tipicas");
});

test("4. helper de Hora con el copy exacto, como .field-note", () => {
  const field = modal.slice(modal.indexOf("<label>Hora</label>"), modal.indexOf("<label>Cancha"));
  assert.match(field, /<p class="field-note">Si todavía no está, dejala vacía — el partido se muestra igual\.<\/p>/);
});

/* ============ línea de contexto del modal ============ */

test("5. línea de contexto al pie del modal, antes de las acciones, con copy exacto", () => {
  assert.match(
    modal,
    /<p class="field-note" id="m-context-note"[^>]*>Lo que cargues acá aparece arriba, en “Próximo partido”\.<\/p>/,
  );
  assert.ok(
    modal.indexOf('id="m-context-note"') < modal.indexOf('class="modal-actions"'),
    "la línea de contexto va antes de los botones",
  );
  assert.ok(
    modal.indexOf('id="m-context-note"') > modal.indexOf('id="m-alias"'),
    "va al pie, después del último campo",
  );
});

/* ============ copy prohibido ============ */

test("6. el modal no insinúa reserva / confirmación / cupo", () => {
  for (const p of [/\breserv/i, /confirmad[oa]/i, /hora confirmada/i, /cancha confirmada/i, /\bcupo\b/i]) {
    assert.doesNotMatch(modal, p, `el modal no debe contener ${p}`);
  }
});

/* ============ regresión: nada de JS cambió ============ */

test("7. guardarPartido sigue escribiendo EXACTAMENTE los 7 campos de matchInfo", () => {
  const fn = extractFunction(demo, "guardarPartido");
  const bloque = fn.slice(fn.indexOf("fresh.matchInfo = {"), fn.indexOf("};", fn.indexOf("fresh.matchInfo = {")) + 2);
  const claves = [...bloque.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(claves, ["teamName", "date", "time", "loc", "type", "priceTotal", "alias"]);
});

test("8. el handler #m-save no toca el estado global (delega en guardarPartido)", () => {
  const save = demo.slice(
    demo.indexOf("document.getElementById('m-save').onclick = async ()=>{"),
    demo.indexOf("\n};", demo.indexOf("document.getElementById('m-save').onclick = async ()=>{")),
  );
  assert.ok(save.length > 0, "no ubiqué el handler #m-save");
  assert.match(save, /guardarPartido\(/);
  assert.ok(!/\bstate\b/.test(save), "el handler toca el estado global directo");
  assert.match(save, /time: document\.getElementById\('m-time'\)\.value\.trim\(\)/);
});

test("9. el handler #edit-match-btn sigue cargando #m-time desde mi.time (sin cambios)", () => {
  const open = demo.slice(
    demo.indexOf("document.getElementById('edit-match-btn').onclick = ()=>{"),
    demo.indexOf("overlay.classList.add('open');"),
  );
  assert.match(open, /document\.getElementById\('m-time'\)\.value = mi\.time\|\|'';/);
});

/* ============ nada más del modal se movió ============ */

test("10. los otros campos del modal quedan igual (date type=date, loc/type selects, price/alias)", () => {
  assert.match(modal, /<input type="date" id="m-date">/);
  assert.match(modal, /<select id="m-loc"><\/select>/);
  assert.match(modal, /<select id="m-type">/);
  assert.match(modal, /<input type="text" id="m-price" placeholder="50000">/);
  assert.match(modal, /id="m-alias" list="frequent-aliases"/);
  assert.match(modal, /<h2>Editar partido<\/h2>/);
});
