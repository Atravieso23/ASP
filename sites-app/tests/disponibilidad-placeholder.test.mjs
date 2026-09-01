// PR #33 — Disponibilidad horaria con placeholders "Desde" / "Hasta".
//
// Los selects de horario ya no arrancan en 16:00 / 20:00: muestran un placeholder
// disabled hasta que el jugador elige. Guardar con estado Estoy/Duda exige from y to
// (o el chip "Siempre para la pelota ⚽❤️"). "Desde"/"Hasta" nunca se persisten.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function sliceBetween(startMarker, endMarker, label) {
  const start = demo.indexOf(startMarker);
  assert.ok(start > -1, `no ubiqué ${label}`);
  const end = demo.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `no ubiqué el final de ${label}`);
  return demo.slice(start, end);
}

function extractFn(name) {
  const start = demo.search(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.ok(start > -1, `no encontré ${name}`);
  const open = demo.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < demo.length; i++) {
    if (demo[i] === "{") depth++;
    else if (demo[i] === "}" && --depth === 0) return demo.slice(start, i + 1);
  }
  throw new Error(`no cerré ${name}`);
}

const confirmHandler = () =>
  sliceBetween(
    "document.getElementById('my-status-confirm').onclick = async ()=>{",
    "document.getElementById('change-player-btn').onclick",
    "el handler de guardar Mi estado",
  );

/* ---------- 1. markup: placeholders disabled, sin default 16:00/20:00 ---------- */

test("1. #my-status-from arranca en el placeholder 'Desde' (value='' selected disabled)", () => {
  const sel = sliceBetween('<select id="my-status-from"', "</select>", "el select Desde");
  assert.match(sel, /^<select id="my-status-from"[^>]*>\s*<option value="" selected disabled>Desde<\/option>/);
  assert.doesNotMatch(sel, /<option value="16:00" selected>/);
});

test("1b. #my-status-to arranca en el placeholder 'Hasta' (value='' selected disabled)", () => {
  const sel = sliceBetween('<select id="my-status-to"', "</select>", "el select Hasta");
  assert.match(sel, /^<select id="my-status-to"[^>]*>\s*<option value="" selected disabled>Hasta<\/option>/);
  assert.doesNotMatch(sel, /<option value="20:00" selected>/);
});

/* ---------- 2. resetMyStatusCard deja from/to vacíos ---------- */

test("2. resetMyStatusCard deja los selects en el placeholder, no en 16:00/20:00", () => {
  const fn = extractFn("resetMyStatusCard");
  assert.match(fn, /mockFrom\.value = '';\s*syncMockToOptions\(\);/);
  assert.doesNotMatch(fn, /mockFrom\.value = '16:00'/);
  assert.doesNotMatch(fn, /mockTo\.value = '20:00'/);
});

/* ---------- 3. syncMockToOptions: placeholder siempre; horas sólo con 'Desde' ---------- */

function runSync(fromValue) {
  const helpers = sliceBetween("const mockHourOptions =", "function restoreCurrentLocalResponse", "los helpers de disponibilidad");
  const hours = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];
  const makeSelect = (initial, options = []) => {
    let values = options, value = initial, html = "";
    return {
      disabled: false,
      get value() { return value; },
      set value(v) { value = values.includes(v) || v === "" ? v : ""; },
      get innerHTML() { return html; },
      set innerHTML(markup) {
        html = markup;
        values = [...markup.matchAll(/value="([^"]+)"/g)].map(([, v]) => v);
        value = values.includes(value) ? value : "";
      },
    };
  };
  const mockFrom = makeSelect(fromValue, hours);
  const mockTo = makeSelect("", hours);
  const ctx = vm.createContext({ mockFrom, mockTo });
  new vm.Script(`${helpers}\nglobalThis.syncMockToOptions = syncMockToOptions;`).runInContext(ctx);
  ctx.syncMockToOptions();
  return { mockTo };
}

test("3. con from='' el select 'Hasta' queda sólo con el placeholder", () => {
  const { mockTo } = runSync("");
  assert.match(mockTo.innerHTML, /^<option value="" disabled>Hasta<\/option>$/);
  assert.equal(mockTo.value, "");
});

test("3b. con from='16:00' el select 'Hasta' muestra placeholder + sólo horas posteriores", () => {
  const { mockTo } = runSync("16:00");
  const opciones = [...mockTo.innerHTML.matchAll(/<option value="([^"]*)"[^>]*>([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.equal(opciones[0], "", "el primer option sigue siendo el placeholder");
  assert.deepEqual(opciones.slice(1), ["17:00","18:00","19:00","20:00","21:00","22:00"]);
  assert.equal(mockTo.value, "", "sin 'Hasta' elegido queda en el placeholder");
});

/* ---------- 4. guardado: Estoy/Duda sin horario bloquea ---------- */

test("4. el guard de horario vacío corta antes de construir la response y muestra el copy exacto", () => {
  const h = confirmHandler();
  assert.match(
    h,
    /if\(mockAvailability !== 'out' && \(!from \|\| !to\)\)\{\s*document\.getElementById\(from \? 'my-status-to' : 'my-status-from'\)\.focus\(\);\s*showSaveFeedback\('error','Elegí desde y hasta qué hora podés jugar\.'\);\s*return;\s*\}/,
  );
  const guard = h.indexOf("mockAvailability !== 'out' && (!from || !to)");
  const build = h.indexOf("crypto.randomUUID()");
  const save = h.indexOf("savePlayerRegistration(response)");
  assert.ok(guard > -1 && build > guard && save > guard, "el guard corta antes de armar/guardar la response");
  // Aplica a in y a duda por igual (mockAvailability !== 'out').
  assert.doesNotMatch(h, /mockAvailability === 'in' && \(!from \|\| !to\)/);
});

test("4b. sin fallback: from/to salen del select tal cual (sin '|| 16:00' / '|| 20:00')", () => {
  const h = confirmHandler();
  assert.match(h, /const from = document\.getElementById\('my-status-from'\)\.value;/);
  assert.match(h, /const to = document\.getElementById\('my-status-to'\)\.value;/);
  assert.doesNotMatch(h, /getElementById\('my-status-from'\)\.value \|\| '16:00'/);
  assert.doesNotMatch(h, /getElementById\('my-status-to'\)\.value \|\| '20:00'/);
});

/* ---------- 5. to <= from sigue bloqueando ---------- */

test("5. la validación 'Hasta posterior a Desde' sigue vigente, después del guard de vacío", () => {
  const h = confirmHandler();
  assert.match(h, /if\(mockAvailability !== 'out' && to <= from\)\{[\s\S]*?El horario “Hasta” debe ser posterior a “Desde”\./);
  assert.ok(
    h.indexOf("(!from || !to)") < h.indexOf("to <= from"),
    "el guard de vacío va antes que el de orden",
  );
});

/* ---------- 6. response existente con horas reales sigue restaurando ---------- */

test("6. restoreCurrentLocalResponse repuebla los selects con las horas guardadas", () => {
  const fn = extractFn("restoreCurrentLocalResponse");
  assert.match(fn, /if\(response\.from && response\.to\)\{/);
  assert.match(fn, /mockFrom\.value = response\.from;\s*syncMockToOptions\(\);\s*mockTo\.value = response\.to;/);
});

/* ---------- 7 + 8. full-day ---------- */

function runFullDay(fromInit, toInit) {
  const helpers = sliceBetween("const mockHourOptions =", "function restoreCurrentLocalResponse", "los helpers de disponibilidad");
  const hours = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];
  const makeSelect = (initial, options = []) => {
    let values = options, value = initial;
    return {
      disabled: false,
      get value() { return value; },
      set value(v) { value = values.includes(v) || v === "" ? v : ""; },
      set innerHTML(markup) {
        values = [...markup.matchAll(/value="([^"]+)"/g)].map(([, v]) => v);
        value = values.includes(value) ? value : "";
      },
    };
  };
  const mockFrom = makeSelect(fromInit, hours);
  const mockTo = makeSelect(toInit, hours);
  const mockFullDay = { checked: false };
  const classes = new Set();
  const mockTimes = { classList: { toggle: (n, f) => (f ? classes.add(n) : classes.delete(n)), contains: (n) => classes.has(n) } };
  const ctx = vm.createContext({ mockFrom, mockTo, mockFullDay, mockTimes });
  new vm.Script(`${helpers}\nglobalThis.setFullDayAvailability = setFullDayAvailability;`).runInContext(ctx);
  return { ctx, mockFrom, mockTo, mockTimes };
}

test("7. 'Siempre para la pelota' activo fuerza 09:00 / 22:00 (arrancando vacío)", () => {
  const { ctx, mockFrom, mockTo, mockTimes } = runFullDay("", "");
  ctx.mockFullDay.checked = true;
  ctx.setFullDayAvailability();
  assert.equal(mockFrom.value, "09:00");
  assert.equal(mockTo.value, "22:00");
  assert.ok(mockTimes.classList.contains("is-full-day"));
});

test("8. desactivar full-day tras haber arrancado vacío vuelve a vacío (y exige elegir al guardar)", () => {
  const { ctx, mockFrom, mockTo } = runFullDay("", "");
  ctx.mockFullDay.checked = true;
  ctx.setFullDayAvailability();
  ctx.mockFullDay.checked = false;
  ctx.setFullDayAvailability();
  assert.equal(mockFrom.value, "", "from vuelve al placeholder");
  assert.equal(mockTo.value, "", "to vuelve al placeholder");
  // Y el guard del handler cortaría este estado.
  assert.match(confirmHandler(), /if\(mockAvailability !== 'out' && \(!from \|\| !to\)\)\{/);
});

test("8b. desactivar full-day tras haber elegido horas reales restaura esas horas", () => {
  const { ctx, mockFrom, mockTo } = runFullDay("16:00", "20:00");
  ctx.mockFullDay.checked = true;
  ctx.setFullDayAvailability();
  ctx.mockFullDay.checked = false;
  ctx.setFullDayAvailability();
  assert.equal(mockFrom.value, "16:00");
  assert.equal(mockTo.value, "20:00");
});
