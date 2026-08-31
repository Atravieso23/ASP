// PR #21 — Chip ⚽❤️ con texto visible.
//
// La auditoría UX detectó que el chip de "todo el día" no se entendía en mobile: el texto
// "Todo fulvo" vivía sólo en un <span class="sr-only"> + title, invisible en teléfono.
// Ahora el chip muestra "Libre" visible junto a "⚽❤️". El checkbox (#my-status-full-day),
// el handler (setFullDayAvailability) y la semántica 09:00–22:00 no cambian. En pantallas
// angostas el chip baja a fila propia sin la banda vacía (margin-left:auto -> 0 a ≤360px).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function sliceBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `no ubiqué el inicio de ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `no ubiqué el final de ${label}`);
  return source.slice(start, end + endMarker.length);
}

function extractFunction(name) {
  const start = demo.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré ${name}`);
  const open = demo.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < demo.length; i++) {
    if (demo[i] === "{") depth++;
    else if (demo[i] === "}" && --depth === 0) return demo.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar ${name}`);
}

const chip = sliceBetween(demo, '<label class="my-status-fullday"', "</label>", "el chip de día libre");

/* ---------- 1–4. markup del chip ---------- */

test("1. el chip tiene texto visible 'Libre'", () => {
  assert.match(chip, /<span class="my-status-fullday-text">Libre<\/span>/);
  // "Libre" NO está aria-hidden: es el nombre accesible del control.
  assert.doesNotMatch(chip, /aria-hidden="true"[^>]*>[^<]*Libre/);
});

test("2. el chip conserva los emojis ⚽❤️ (con aria-hidden)", () => {
  assert.match(chip, /<span aria-hidden="true">⚽❤️<\/span>/);
});

test("3. #my-status-full-day sigue existiendo como checkbox", () => {
  assert.match(chip, /<input type="checkbox" id="my-status-full-day">/);
});

test("4. el label sigue asociado al checkbox por for=", () => {
  assert.match(demo, /<label class="my-status-fullday" for="my-status-full-day" title="Todo fulvo">/);
});

test("copy final del chip: '⚽❤️' + 'Libre', title 'Todo fulvo', sin sr-only redundante, nunca 'Todo el día'", () => {
  assert.match(
    demo,
    /<label class="my-status-fullday" for="my-status-full-day" title="Todo fulvo">\s*<input type="checkbox" id="my-status-full-day">\s*<span aria-hidden="true">⚽❤️<\/span>\s*<span class="my-status-fullday-text">Libre<\/span>\s*<\/label>/,
  );
  assert.doesNotMatch(chip, /class="sr-only"/);
  assert.doesNotMatch(demo, /Todo el día/);
});

/* ---------- 5–7. el handler y la semántica de horarios no cambian ---------- */

test("5. setFullDayAvailability no cambia (misma firma, semántica 09:00–22:00 y restore)", () => {
  const fn = extractFunction("setFullDayAvailability");
  assert.match(fn, /const on = mockFullDay\.checked;/);
  assert.match(fn, /mockTimes\.classList\.toggle\('is-full-day', on\);/);
  assert.match(fn, /mockFrom\.disabled = on;\s*mockTo\.disabled = on;/);
  assert.match(fn, /mockPreviousTimes = \{ from: mockFrom\.value, to: mockTo\.value \};/);
  assert.match(fn, /mockFrom\.value = mockHourOptions\[0\];/);
  assert.match(fn, /mockTo\.value = mockHourOptions\[mockHourOptions\.length-1\];/);
  assert.match(fn, /\} else if\(mockPreviousTimes\)\{/);
  // El chip no toca lógica nueva: sin referencias al wrapper ni a clases nuevas.
  assert.doesNotMatch(fn, /my-status-fullday-text|my-status-availability/);
  // Sigue conectado igual.
  assert.match(demo, /document\.getElementById\('my-status-full-day'\)\.onclick = setFullDayAvailability;/);
});

function runFullDay() {
  const from = demo.indexOf("const mockHourOptions =");
  const to = demo.indexOf("function restoreCurrentLocalResponse", from);
  assert.ok(from >= 0 && to > from, "no ubiqué los helpers de disponibilidad");
  const helpers = demo.slice(from, to);
  const makeSelect = (initial, options = []) => {
    let values = options;
    let value = initial;
    return {
      disabled: false,
      get value() { return value; },
      set value(v) { value = values.includes(v) ? v : ""; },
      get optionValues() { return values; },
      set innerHTML(markup) {
        values = [...markup.matchAll(/value="([^"]+)"/g)].map(([, v]) => v);
        value = values.includes(value) ? value : "";
      },
    };
  };
  const hours = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];
  const mockFrom = makeSelect("16:00", hours);
  const mockTo = makeSelect("20:00", hours);
  const mockFullDay = { checked: false };
  const classes = new Set();
  const mockTimes = { classList: { toggle: (n, f) => (f ? classes.add(n) : classes.delete(n)), contains: (n) => classes.has(n) } };
  const ctx = vm.createContext({ mockFrom, mockTo, mockFullDay, mockTimes, document: { getElementById: (id) => (id === "my-status-full-day" ? mockFullDay : null) } });
  new vm.Script(`${helpers}\nglobalThis.setFullDayAvailability = setFullDayAvailability;`).runInContext(ctx);
  return { ctx, mockFrom, mockTo, mockFullDay, mockTimes };
}

test("6. al activar todo el día, from/to quedan 09:00 / 22:00 y los selects se deshabilitan", () => {
  const { ctx, mockFrom, mockTo } = runFullDay();
  ctx.mockFullDay.checked = true;
  ctx.setFullDayAvailability();
  assert.equal(mockFrom.value, "09:00");
  assert.equal(mockTo.value, "22:00");
  assert.equal(mockFrom.disabled, true);
  assert.equal(mockTo.disabled, true);
});

test("7. al desactivar, restaura la franja previa y rehabilita los selects", () => {
  const { ctx, mockFrom, mockTo } = runFullDay();
  ctx.mockFullDay.checked = true;
  ctx.setFullDayAvailability();
  ctx.mockFullDay.checked = false;
  ctx.setFullDayAvailability();
  assert.equal(mockFrom.value, "16:00");
  assert.equal(mockTo.value, "20:00");
  assert.equal(mockFrom.disabled, false);
  assert.equal(mockTo.disabled, false);
});

/* ---------- 8–9. convivencia con PR #20 (wrapper de disponibilidad) ---------- */

test("8. en status 'out' el bloque de disponibilidad entero (chip incluido) sigue oculto (PR #20)", () => {
  assert.match(demo, /mockAvailabilityBlock\.hidden = mockAvailability === 'out';/);
  assert.match(demo, /\.my-status-availability\[hidden\]\{display:none;\}/);
});

test("9. el chip vive dentro del wrapper #my-status-availability (visible con 'in'/'duda')", () => {
  const wrapper = sliceBetween(demo, '<div class="my-status-availability" id="my-status-availability">', '<div class="my-status-payment"', "el wrapper de disponibilidad");
  assert.match(wrapper, /<span class="my-status-fullday-text">Libre<\/span>/);
  assert.match(wrapper, /<div class="my-status-times" id="my-status-times">/);
  assert.match(wrapper, /id="my-status-from"/);
  assert.match(wrapper, /id="my-status-to"/);
});

/* ---------- 10–11. no toca otras zonas ---------- */

test("10+11. no afecta pagos / invitados / selector / Lista de morosos / Saldar birra / Tarjetas", () => {
  for (const fn of ["syncPagoControls", "marcarMiPago", "renderGuestManager", "renderRecurrentPlayerMenu", "renderListaMorosos", "saldarBirra", "computeCards", "evaluarTarjetasSiCorresponde", "renderIdentityHeader"]) {
    assert.doesNotMatch(extractFunction(fn), /my-status-fullday-text|max-width:360px/, `${fn} no debería mencionar el chip nuevo`);
  }
  // data-values de estado y pago intactos.
  assert.match(demo, /data-value="out" aria-pressed="false">Soy baja</);
  assert.match(demo, /data-value="no" aria-pressed="true">Debo</);
});

/* ---------- 12. mobile: sin scroll horizontal ---------- */

test("12. CSS: en ≤360px el chip baja a fila propia sin banda vacía; nunca fuerza ancho", () => {
  // margin-left:auto -> 0 en la media query: el chip arranca a la izquierda al envolver.
  assert.match(demo, /@media\(max-width:360px\)\{\s*\.my-status-fullday\{margin-left:0;\}\s*\}/);
  // La regla base del chip no tiene width/min-width: mantiene ancho natural, no desborda.
  const base = sliceBetween(demo, ".my-status-fullday{", "}", "la regla base del chip");
  assert.doesNotMatch(base, /(?<!-)\bwidth\s*:/);
  assert.match(base, /white-space:nowrap/);
  // El contenedor deja envolver.
  assert.match(demo, /\.my-status-times\{[^}]*flex-wrap:wrap[^}]*\}/);
});
