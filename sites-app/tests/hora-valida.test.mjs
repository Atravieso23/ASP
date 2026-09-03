// PR #57 — el quick glance pasa a "Próximo partido" (Estado B) sólo cuando hay
// una HORA REAL, no cualquier texto en el campo Hora. `isHoraValida(t)` es la
// función pura que decide: HH:MM 00:00–23:59, con o sin cero inicial, trim
// defensivo. El campo Hora sigue siendo texto libre; guardarPartido no se toca;
// el ticket sigue mostrando el texto crudo.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name}`);
  let i = source.indexOf("(", start);
  let paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === "(") paren++;
    else if (source[i] === ")" && --paren === 0) { i++; break; }
  }
  const open = source.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === "{") depth++;
    else if (source[j] === "}" && --depth === 0) return source.slice(start, j + 1);
  }
  throw new Error(`no pude cerrar ${name}`);
}

const isHoraValidaSrc = extractFunction(demo, "isHoraValida");
const renderSrc = extractFunction(demo, "renderProximoPartido");

function isHoraValida(t) {
  const ctx = vm.createContext({ String });
  return vm.runInContext(`${isHoraValidaSrc}\nisHoraValida(${JSON.stringify(t ?? null)});`, ctx);
}

/* ============ isHoraValida — unit ============ */

test("1. acepta HH:MM válidos (con y sin cero inicial, y con espacios)", () => {
  for (const t of ["20:00", "09:00", "9:00", "23:59", "00:00", "0:00", " 20:00 ", "19:45"]) {
    assert.equal(isHoraValida(t), true, `debería aceptar "${t}"`);
  }
});

test("2. rechaza formatos fuera de rango o no-horarios", () => {
  for (const t of ["24:00", "20:60", "25:00", "20:99", "20hs", "20.00", "20,00", "8 y media", "a coordinar", "2030", "20", "8pm"]) {
    assert.equal(isHoraValida(t), false, `debería rechazar "${t}"`);
  }
});

test("3. rechaza vacío / null / undefined", () => {
  assert.equal(isHoraValida(""), false);
  assert.equal(isHoraValida("   "), false);
  assert.equal(isHoraValida(null), false);
  assert.equal(isHoraValida(undefined), false);
});

/* ============ quick glance: Estado B sólo con fecha + hora válida ============ */

function runGlance(matchInfo) {
  const classes = new Set();
  const nodes = {
    "proximo-partido": { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } },
    "proximo-partido-eyebrow": { textContent: "" },
    "proximo-partido-main": { textContent: "" },
    "proximo-partido-sub": { textContent: "" },
    "proximo-partido-hint": { textContent: "" },
  };
  const ctx = vm.createContext({
    document: { getElementById: (id) => nodes[id] || null },
    state: { matchInfo },
    faltanConfirmar: () => [],
    formatDateDisplay: (iso) => (iso ? "Domingo, 6 de septiembre" : ""),
    daysUntilLabel: () => "faltan 3 días",
    Boolean, String, Array,
  });
  vm.runInContext(`${isHoraValidaSrc}\n${renderSrc}\nrenderProximoPartido();`, ctx);
  return {
    eyebrow: nodes["proximo-partido-eyebrow"].textContent,
    main: nodes["proximo-partido-main"].textContent,
    sub: nodes["proximo-partido-sub"].textContent,
    hint: nodes["proximo-partido-hint"].textContent,
    armado: classes.has("proximo-partido--armado"),
  };
}

test("4. fecha + '20:00' -> Estado B (eyebrow 'Próximo partido', main 'fecha · 20:00')", () => {
  const out = runGlance({ date: "2026-09-06", time: "20:00", loc: "La Terraza F7" });
  assert.equal(out.eyebrow, "Próximo partido");
  assert.equal(out.armado, false);
  assert.match(out.main, /Domingo, 6 de septiembre · 20:00/);
});

test("5. fecha + '9:00' -> Estado B", () => {
  const out = runGlance({ date: "2026-09-06", time: "9:00" });
  assert.equal(out.eyebrow, "Próximo partido");
  assert.match(out.main, /· 9:00$/);
});

test("6. fecha + 'a coordinar' -> Estado A (no es una hora real)", () => {
  const out = runGlance({ date: "2026-09-06", time: "a coordinar", loc: "La Terraza F7" });
  assert.equal(out.eyebrow, "Así viene el partido");
  assert.equal(out.armado, true);
  assert.equal(out.main, "");
  // la fecha parcial se ofrece como pista neutra
  assert.match(out.hint, /Domingo, 6 de septiembre · hora a definir/);
});

test("7. fecha + '20hs' -> Estado A", () => {
  assert.equal(runGlance({ date: "2026-09-06", time: "20hs" }).eyebrow, "Así viene el partido");
});

test("8. fecha + '20.00' -> Estado A", () => {
  assert.equal(runGlance({ date: "2026-09-06", time: "20.00" }).eyebrow, "Así viene el partido");
});

test("9. hora válida sin fecha -> Estado A (falta la fecha)", () => {
  const out = runGlance({ date: "", time: "20:00" });
  assert.equal(out.eyebrow, "Así viene el partido");
  assert.equal(out.armado, true);
});

test("10. el ticket/scoreboard NO usa isHoraValida: muestra el texto crudo", () => {
  // setSb('sb-time', mi.time) sin filtro; renderProximoPartido no toca sb-time.
  const render = extractFunction(demo, "render");
  assert.match(render, /setSb\('sb-time', mi\.time\)/);
  assert.doesNotMatch(renderSrc, /sb-time/);
});

/* ============ horarios: ocultos sólo con hora válida ============ */

test("11. call site: renderHorariosDisponibles recibe isHoraValida(matchInfo.time)", () => {
  const render = extractFunction(demo, "render");
  assert.match(render, /renderHorariosDisponibles\(isHoraValida\(state\.matchInfo && state\.matchInfo\.time\)\);/);
  // combinado: '20:00' -> true (oculta); 'a coordinar' / '20hs' / '' -> false (muestra)
  assert.equal(isHoraValida("20:00"), true);
  assert.equal(isHoraValida("a coordinar"), false);
  assert.equal(isHoraValida("20hs"), false);
  assert.equal(isHoraValida(""), false);
});

/* ============ regresiones ============ */

test("12. el campo Hora sigue siendo texto libre con datalist (editor intacto)", () => {
  const input = demo.match(/<input[^>]*id="m-time"[^>]*>/)[0];
  assert.match(input, /type="text"/);
  assert.match(input, /list="horas-tipicas"/);
  assert.match(demo, /<datalist id="horas-tipicas">/);
});

test("13. guardarPartido sigue escribiendo EXACTAMENTE los 7 campos de matchInfo", () => {
  const fn = extractFunction(demo, "guardarPartido");
  const bloque = fn.slice(fn.indexOf("fresh.matchInfo = {"), fn.indexOf("};", fn.indexOf("fresh.matchInfo = {")) + 2);
  const claves = [...bloque.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(claves, ["teamName", "date", "time", "loc", "type", "priceTotal", "alias"]);
  // isHoraValida no aparece en el writer
  assert.doesNotMatch(fn, /isHoraValida/);
});

test("14. isHoraValida es pura: sólo un test de regex, sin DOM / writers / Supabase", () => {
  assert.doesNotMatch(isHoraValidaSrc, /document|innerHTML|supabase|fetch\(|saveState|persist|matchInfo\s*=/i);
});

test("15. copy prohibido ausente del código y la salida de renderProximoPartido", () => {
  // sólo el código ejecutable, sin comentarios (que sí mencionan lo prohibido para explicarlo)
  const codigo = renderSrc.replace(/\/\/[^\n]*/g, "");
  for (const p of [/reservad/i, /\breserva\b/i, /confirmad[oa]/i, /\bcupo\b/i]) {
    assert.doesNotMatch(codigo, p);
  }
  for (const out of [
    runGlance({ date: "2026-09-06", time: "20:00" }),
    runGlance({ date: "2026-09-06", time: "a coordinar" }),
  ]) {
    const txt = [out.eyebrow, out.main, out.sub, out.hint].join(" ");
    for (const p of [/reservad/i, /confirmad[oa]/i, /\bcupo\b/i]) assert.doesNotMatch(txt, p);
  }
});
