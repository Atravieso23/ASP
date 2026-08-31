// PR #20 — Fix del label "Disponibilidad" huérfano en "Soy baja".
//
// Antes: al marcar "Soy baja" (status 'out') se ocultaba `.my-status-times` con
// `style.display='none'`, pero el <span> "Disponibilidad" y su fila quedaban visibles
// → parecía roto. Ahora label + selects + chip viven en un wrapper
// `#my-status-availability` que se oculta entero con `.hidden` cuando status === 'out'
// y vuelve con "Estoy" / "En duda". Sin cambios de datos ni de from/to/full-day.
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

/* ---------- estructura: el wrapper envuelve label + selects + chip ---------- */

test("HTML: label 'Disponibilidad' + selects + chip viven dentro de #my-status-availability", () => {
  assert.match(
    demo,
    /<div class="my-status-availability" id="my-status-availability">\s*<span class="my-status-label">Disponibilidad<\/span>\s*<div class="my-status-times" id="my-status-times">/,
  );
  // El wrapper cierra justo antes del bloque de pago: label + times adentro, nada más.
  assert.match(
    demo,
    /<span class="my-status-fullday-text">Libre<\/span>\s*<\/label>\s*<\/div>\s*<\/div>\s*<div class="my-status-payment" id="my-status-payment" hidden>/,
  );
  // Los ids y el checkbox de siempre siguen adentro del wrapper.
  const wrapper = sliceBetween(
    demo,
    '<div class="my-status-availability" id="my-status-availability">',
    '<div class="my-status-payment"',
    "el wrapper de disponibilidad",
  );
  assert.match(wrapper, /id="my-status-from"/);
  assert.match(wrapper, /id="my-status-to"/);
  assert.match(wrapper, /<input type="checkbox" id="my-status-full-day">/);
  assert.match(wrapper, /<span class="my-status-fullday-text">Libre<\/span>/);
  assert.match(wrapper, /title="Todo fulvo"/);
});

test("CSS: el wrapper sólo aporta la regla [hidden]; no fuerza ancho (320/375 sin scroll horizontal)", () => {
  assert.match(demo, /\.my-status-availability\[hidden\]\{display:none;\}/);
  // Ninguna otra regla para .my-status-availability: es un <div> plano, sin width /
  // min-width / overflow que pueda desbordar en mobile.
  const reglas = [...demo.matchAll(/\.my-status-availability(?:\[[^\]]*\])?\s*\{[^}]*\}/g)].map((m) => m[0]);
  assert.deepEqual(reglas, [".my-status-availability[hidden]{display:none;}"]);
});

/* ---------- comportamiento: cambiar de estado oculta/restaura el bloque ---------- */

function runChoiceHandler() {
  const handler = sliceBetween(
    demo,
    "document.querySelectorAll('.my-status-choice button').forEach(btn=>{",
    "\n});",
    "el handler de los botones de estado",
  );

  const availabilityBlock = { hidden: false };
  const noop = () => {};
  const makeBtn = (value) => ({
    dataset: { value },
    classList: { toggle: noop },
    setAttribute: noop,
  });
  const buttons = [makeBtn("in"), makeBtn("duda"), makeBtn("out")];

  const context = vm.createContext({
    document: {
      querySelectorAll: () => buttons,
    },
    mockAvailability: "in",
    mockAvailabilityBlock: availabilityBlock,
    syncPagoControls: noop,
  });
  vm.runInContext(handler, context);
  return { buttons, availabilityBlock };
}

test("1+4. 'Soy baja' oculta el bloque entero; volver a 'Estoy' lo restaura", () => {
  const { buttons, availabilityBlock } = runChoiceHandler();

  buttons[2].onclick(); // Soy baja
  assert.equal(availabilityBlock.hidden, true, "el bloque de disponibilidad debe ocultarse en 'Soy baja'");

  buttons[0].onclick(); // Estoy
  assert.equal(availabilityBlock.hidden, false, "el bloque debe volver al cambiar a 'Estoy'");
});

test("2+3. 'Estoy' y 'En duda' mantienen el bloque visible", () => {
  const { buttons, availabilityBlock } = runChoiceHandler();

  buttons[1].onclick(); // En duda
  assert.equal(availabilityBlock.hidden, false, "'En duda' conserva la disponibilidad");

  buttons[2].onclick(); // Soy baja (oculta)
  buttons[1].onclick(); // En duda otra vez (restaura)
  assert.equal(availabilityBlock.hidden, false, "out -> duda restaura la disponibilidad");
});

test("4b. restoreCurrentLocalResponse aplica el mismo criterio al reabrir la app", () => {
  assert.match(demo, /mockAvailabilityBlock\.hidden = response\.status === 'out';/);
});

test("resetMyStatusCard deja la disponibilidad visible (arranca en 'Estoy')", () => {
  const reset = sliceBetween(demo, "function resetMyStatusCard(){", "\n}", "resetMyStatusCard");
  assert.match(reset, /mockAvailabilityBlock\.hidden = false;/);
});

/* ---------- no se toca nada más ---------- */

test("5. ni el data model ni from/to/full-day cambian", () => {
  // Ningún rastro del viejo toggle por style.display.
  assert.doesNotMatch(demo, /mockTimes\.style\.display/);
  // El único uso de mockTimes que queda es la clase visual is-full-day.
  const usosMockTimes = [...demo.matchAll(/mockTimes\.[a-zA-Z]+/g)].map((m) => m[0]);
  assert.deepEqual(new Set(usosMockTimes), new Set(["mockTimes.classList"]));
  // "Soy baja" sigue preservando la franja guardada (PR A), sin vaciarla.
  assert.match(demo, /from:mockAvailability==='out' \? \(existingResponse \? existingResponse\.from : from\) : from/);
  assert.match(demo, /to:mockAvailability==='out' \? \(existingResponse \? existingResponse\.to : to\) : to/);
  // El helper de día completo no se tocó.
  assert.match(demo, /function setFullDayAvailability\(\)\{[\s\S]*?mockTimes\.classList\.toggle\('is-full-day', on\);/);
});

test("6+7+8. pago / invitados / selector / Lista de morosos / Tarjetas / Saldar birra intactos", () => {
  for (const fn of [
    "syncPagoControls",
    "marcarMiPago",
    "renderGuestManager",
    "renderRecurrentPlayerMenu",
    "renderListaMorosos",
    "morososDeCards",
    "saldarBirra",
    "computeCards",
    "evaluarTarjetasSiCorresponde",
  ]) {
    const start = demo.search(new RegExp(`(?:async\\s+)?function\\s+${fn}\\s*\\(`));
    assert.notEqual(start, -1, `no encontré ${fn}`);
    const open = demo.indexOf("{", start);
    let depth = 0;
    let src = "";
    for (let i = open; i < demo.length; i++) {
      if (demo[i] === "{") depth++;
      else if (demo[i] === "}" && --depth === 0) { src = demo.slice(start, i + 1); break; }
    }
    assert.doesNotMatch(src, /my-status-availability|mockAvailabilityBlock/, `${fn} no debería tocar el wrapper de disponibilidad`);
  }
});

test("el pago se sigue ocultando por su propia condición, no por el wrapper nuevo", () => {
  assert.match(demo, /mockPayment\.hidden = !\(mockAvailability === 'in' && saved && saved\.status === 'in'\)/);
});
