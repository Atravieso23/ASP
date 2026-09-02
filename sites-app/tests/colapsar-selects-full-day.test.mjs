// PR #22 — Colapsar los selects cuando "todo el día" está activo + copy del chip.
//
// La auditoría UX detectó que con "todo el día" activo los selects quedaban
// disabled/dimmed ocupando una fila entera sin servir. Ahora:
//  - el chip dice "Siempre para la pelota ⚽❤️" (texto visible + accesible; emojis al
//    final y aria-hidden);
//  - con #my-status-full-day.checked, `.my-status-times.is-full-day .my-status-time-pair`
//    pasa a `display:none` (los nodos siguen en el DOM);
//  - sin `margin-left:auto` en el chip (y sin la media query de PR #21): fluye a la
//    izquierda, en su propia fila si no entra.
// setFullDayAvailability NO se tocó: sigue seteando from/to 09:00–22:00 y restaurando.
// Convive con PR #20: en status 'out' se oculta todo #my-status-availability.
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

/* ---------- 1–4. copy y markup del chip ---------- */

test("1. el chip muestra texto visible 'Siempre para la pelota ⚽❤️'", () => {
  assert.match(chip, /<span class="my-status-fullday-text">Siempre para la pelota<\/span>/);
  assert.match(chip, /<span aria-hidden="true">⚽❤️<\/span>/);
  // "Siempre para la pelota" NO está aria-hidden: es el nombre accesible del control.
  assert.doesNotMatch(chip, /aria-hidden="true"[^>]*>[^<]*Siempre para la pelota/);
  // Emojis al final, después del texto.
  assert.ok(
    chip.indexOf("Siempre para la pelota") < chip.indexOf("⚽❤️"),
    "los emojis van después del texto",
  );
});

test("2. el chip ya no dice 'Libre'", () => {
  assert.doesNotMatch(chip, /Libre/);
});

test("3. #my-status-full-day sigue existiendo como checkbox", () => {
  assert.match(chip, /<input type="checkbox" id="my-status-full-day">/);
});

test("4. el label sigue asociado al checkbox por for=", () => {
  assert.match(demo, /<label class="my-status-fullday" for="my-status-full-day" title="Todo fulvo">/);
});

test("copy final exacto del chip", () => {
  assert.match(
    demo,
    /<label class="my-status-fullday" for="my-status-full-day" title="Todo fulvo">\s*<input type="checkbox" id="my-status-full-day">\s*<span class="my-status-fullday-text">Siempre para la pelota<\/span>\s*<span aria-hidden="true">⚽❤️<\/span>\s*<\/label>/,
  );
  assert.doesNotMatch(demo, /Todo el día/);
  assert.doesNotMatch(demo, /fulbo/i);
});

/* ---------- 5–6. colapsar / restaurar los selects ---------- */

test("5+6. CSS: con is-full-day los pares de horario se ocultan (display:none), no dimmed", () => {
  assert.match(demo, /\.my-status-times\.is-full-day \.my-status-time-pair\{display:none;\}/);
  assert.doesNotMatch(demo, /\.my-status-times\.is-full-day \.my-status-time-pair\{opacity:\.5;\}/);
  // Los nodos siguen en el DOM (no se removieron): los ids y el markup de los pares están.
  assert.match(demo, /<div class="my-status-time-pair">\s*<label class="sr-only" for="my-status-from">/);
  assert.match(demo, /<div class="my-status-time-pair">\s*<label class="sr-only" for="my-status-to">/);
});

test("5b. sin margin-left:auto en el chip ni la media query de PR #21", () => {
  const base = sliceBetween(demo, ".my-status-fullday{", "}", "la regla base del chip");
  assert.doesNotMatch(base, /margin-left/);
  assert.doesNotMatch(demo, /@media\(max-width:360px\)/);
});

/* ---------- comportamiento del handler en vm ---------- */

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
  return { ctx, mockFrom, mockTo, mockTimes };
}

test("5c. activar todo el día: is-full-day + from/to 09:00/22:00", () => {
  const { ctx, mockFrom, mockTo, mockTimes } = runFullDay();
  ctx.mockFullDay.checked = true;
  ctx.setFullDayAvailability();
  assert.equal(mockFrom.value, "09:00");
  assert.equal(mockTo.value, "22:00");
  assert.ok(mockTimes.classList.contains("is-full-day"), "marca is-full-day -> el CSS oculta los pares");
});

test("6b. desactivar todo el día: restaura 16:00/20:00 y quita is-full-day (selects vuelven)", () => {
  const { ctx, mockFrom, mockTo, mockTimes } = runFullDay();
  ctx.mockFullDay.checked = true;
  ctx.setFullDayAvailability();
  ctx.mockFullDay.checked = false;
  ctx.setFullDayAvailability();
  assert.equal(mockFrom.value, "16:00");
  assert.equal(mockTo.value, "20:00");
  assert.ok(!mockTimes.classList.contains("is-full-day"));
});

/* ---------- 7–8. convivencia con PR #20 ---------- */

test("7. status 'out' / Soy baja: #my-status-availability entero sigue hidden", () => {
  assert.match(demo, /mockAvailabilityBlock\.hidden = mockAvailability === 'out';/);
  assert.match(demo, /mockAvailabilityBlock\.hidden = response\.status === 'out';/);
  assert.match(demo, /\.my-status-availability\[hidden\]\{display:none;\}/);
});

test("8. status in/duda: el chip y los selects viven dentro del wrapper de disponibilidad", () => {
  const wrapper = sliceBetween(demo, '<div class="my-status-availability" id="my-status-availability">', '<div class="my-status-payment"', "el wrapper de disponibilidad");
  assert.match(wrapper, /<span class="my-status-fullday-text">Siempre para la pelota<\/span>/);
  assert.match(wrapper, /id="my-status-from"/);
  assert.match(wrapper, /id="my-status-to"/);
  assert.match(wrapper, /<div class="my-status-times" id="my-status-times">/);
});

/* ---------- 9–13. lo que NO se toca ---------- */

test("9. setFullDayAvailability no cambió (semántica 09:00–22:00 + restore + toggle is-full-day)", () => {
  const fn = extractFunction("setFullDayAvailability");
  assert.match(fn, /const on = mockFullDay\.checked;/);
  assert.match(fn, /mockTimes\.classList\.toggle\('is-full-day', on\);/);
  assert.match(fn, /mockFrom\.disabled = on;\s*mockTo\.disabled = on;/);
  assert.match(fn, /mockPreviousTimes = \{ from: mockFrom\.value, to: mockTo\.value \};/);
  assert.match(fn, /mockFrom\.value = mockHourOptions\[0\];/);
  assert.match(fn, /mockTo\.value = mockHourOptions\[mockHourOptions\.length-1\];/);
  assert.match(fn, /\} else if\(mockPreviousTimes\)\{/);
  assert.match(demo, /document\.getElementById\('my-status-full-day'\)\.onclick = setFullDayAvailability;/);
});

test("10. data model: from/to/full-day sin cambios; el toggle sigue por style/clase, no por JS nuevo", () => {
  // "Soy baja" preserva la franja guardada (PR A); una baja nueva cae a un valor concreto
  // (PR #33: los selects arrancan vacíos, pero "out" no debe persistir "" — es inerte igual).
  assert.match(demo, /from:mockAvailability==='out' \? \(existingResponse \? existingResponse\.from : \(from \|\| '16:00'\)\) : from/);
  assert.match(demo, /to:mockAvailability==='out' \? \(existingResponse \? existingResponse\.to : \(to \|\| '20:00'\)\) : to/);
  // Los pares se ocultan sólo por CSS: ningún JS referencia `.my-status-time-pair`.
  assert.doesNotMatch(demo, /my-status-time-pair'\)/);
});

test("11+12+13. no afecta pagos / invitados / selector / Lista de morosos / Saldar birra / Tarjetas", () => {
  for (const fn of [
    "syncPagoControls", "marcarMiPago", "renderGuestManager", "renderRecurrentPlayerMenu",
    "renderListaMorosos", "morososDeCards", "saldarBirra", "computeCards", "evaluarTarjetasSiCorresponde",
    "renderIdentityHeader",
  ]) {
    assert.doesNotMatch(
      extractFunction(fn),
      /Siempre para la pelota|is-full-day \.my-status-time-pair/,
      `${fn} no debería tocar el chip / colapso de selects`,
    );
  }
  assert.match(demo, /data-value="out" aria-pressed="false">Soy baja</);
  assert.match(demo, /<input type="checkbox" id="my-status-paid-check">/);
  // No hay selector segmentado: la disponibilidad sigue con dos <select>, no botones.
  assert.match(demo, /<select id="my-status-from"/);
  assert.match(demo, /<select id="my-status-to"/);
});

/* ---------- 14–15. mobile ---------- */

test("14+15. CSS: el chip no fuerza ancho y el contenedor envuelve (320/375 sin scroll horizontal)", () => {
  const base = sliceBetween(demo, ".my-status-fullday{", "}", "la regla base del chip");
  assert.doesNotMatch(base, /(?<!-)\bwidth\s*:/);
  assert.match(base, /white-space:nowrap/);
  assert.match(demo, /\.my-status-times\{[^}]*flex-wrap:wrap[^}]*\}/);
});
