// PR #23 — El control para cambiar de jugador deja de ser el símbolo críptico "⇄" y
// pasa a decir "Cambiar jugador".
//
// Cambio de markup + CSS únicamente: el <button id="change-player-btn"> conserva id,
// class, aria-label, title, el atributo hidden y su onclick. La regla `.change-player-btn`
// pasa de un cuadrado 36×36 de ícono a un botón de texto compacto (min-height 40px,
// nowrap, font 11px). Cero cambios de JS.
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

/* ---------- 1–2. copy visible ---------- */

test("1. el símbolo '⇄' ya no es el contenido visible del control", () => {
  assert.doesNotMatch(demo, /class="change-player-btn"[^>]*>⇄</);
  assert.doesNotMatch(demo, /id="change-player-btn"[^>]*>⇄</);
});

test("2. el control muestra el texto 'Cambiar jugador'", () => {
  assert.match(
    demo,
    /<button type="button" class="change-player-btn" id="change-player-btn" aria-label="Cambiar jugador" title="Cambiar jugador" hidden>Cambiar jugador<\/button>/,
  );
});

test("2b. a11y: nombre accesible 'Cambiar jugador' (texto visible + aria-label + title alineados)", () => {
  const btn = sliceBetween(demo, '<button type="button" class="change-player-btn"', "</button>", "el botón de cambiar jugador");
  assert.match(btn, /aria-label="Cambiar jugador"/);
  assert.match(btn, /title="Cambiar jugador"/);
  assert.match(btn, />Cambiar jugador</);
});

/* ---------- 3. la lógica no cambia ---------- */

test("3. mismo id, class, hidden y onclick; el handler sigue llamando setRegisteredPlayerNameMode(true)", () => {
  assert.match(demo, /<button type="button" class="change-player-btn" id="change-player-btn"[^>]*\bhidden\b/);
  assert.match(demo, /document\.getElementById\('change-player-btn'\)\.onclick = \(\)=>\{/);
  assert.match(demo, /changeButton\.hidden = !ownResponse \|\| changingRegisteredPlayer;/);
  const handler = sliceBetween(demo, "document.getElementById('change-player-btn').onclick", "guestManagerToggle.onclick", "el handler de cambiar jugador");
  assert.match(handler, /if\(tieneCambiosSinGuardar\(\) && !window\.confirm\(/);
  assert.match(handler, /setRegisteredPlayerNameMode\(true\);/);
  assert.match(handler, /input\.value = '';/);
  assert.match(handler, /renderRecurrentPlayerMenu\(\);/);
});

test("3b. vm: al tocar el control se entra en modo 'cambiar jugador' y se limpia el campo", () => {
  const assignment = sliceBetween(demo, "document.getElementById('change-player-btn').onclick", "\n};", "el handler de cambiar jugador");
  const input = { value: "prellenado", focus() {} };
  const btn = {};
  const st = { changingMode: null, menuRendered: false };
  const els = { "change-player-btn": btn, "my-player-name": input };
  const ctx = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    window: { confirm: () => true },
    tieneCambiosSinGuardar: () => false,
    setRegisteredPlayerNameMode: (v) => { st.changingMode = v; },
    renderRecurrentPlayerMenu: () => { st.menuRendered = true; },
  });
  vm.runInContext(assignment, ctx); // ejecuta `document.getElementById('change-player-btn').onclick = ()=>{...};`
  btn.onclick();
  assert.equal(st.changingMode, true, "pide modo cambiar jugador");
  assert.equal(input.value, "", "vacía el campo para una búsqueda limpia");
  assert.equal(st.menuRendered, true, "abre el menú del selector");
});

/* ---------- 4–5. no rompe selector ni casaca ---------- */

test("4+5. el selector de identidad y 'Nombre en la casaca' siguen igual", () => {
  // Sólo cambian las ramas del cambio de jugador que YA existían.
  assert.match(demo, /if\(propiaResponse && !changingRegisteredPlayer\)\{ hideRecurrentPlayerMenu\(\); return; \}/);
  assert.match(demo, /label\.textContent = changingRegisteredPlayer \? 'Cambiar jugador' : 'Tu nombre';/);
  assert.match(demo, /label\.textContent = 'Nombre en la casaca';/);
  // El menú de habituales sólo se puebla sin identificar o al cambiar identidad — sin tocar.
  assert.match(demo, /const editandoMiEstado = Boolean\(existingResponse\) && !changingRegisteredPlayer;/);
});

/* ---------- 6–9. no toca otras zonas ---------- */

test("6+7+8+9. no cambia disponibilidad / chip full-day / pagos / invitados / morosos / tarjetas / saldarBirra", () => {
  // Disponibilidad y chip intactos (PR #20/#21/#22).
  assert.match(demo, /\.my-status-availability\[hidden\]\{display:none;\}/);
  assert.match(demo, /<span class="my-status-fullday-text">Siempre para la pelota<\/span>/);
  assert.match(demo, /\.my-status-times\.is-full-day \.my-status-time-pair\{display:none;\}/);
  assert.match(demo, /mockAvailabilityBlock\.hidden = mockAvailability === 'out';/);
  // Estado sin tocar; Pago = checkbox único (PR #38), presente igual.
  assert.match(demo, /data-value="out" aria-pressed="false">Soy baja</);
  assert.match(demo, /<input type="checkbox" id="my-status-paid-check">/);
  // Las funciones de esas zonas no mencionan el botón nuevo.
  for (const name of ["syncPagoControls", "renderGuestManager", "renderListaMorosos", "computeCards", "evaluarTarjetasSiCorresponde", "saldarBirra", "setFullDayAvailability"]) {
    const start = demo.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
    assert.notEqual(start, -1, `no encontré ${name}`);
    const open = demo.indexOf("{", start);
    let depth = 0, src = "";
    for (let i = open; i < demo.length; i++) {
      if (demo[i] === "{") depth++;
      else if (demo[i] === "}" && --depth === 0) { src = demo.slice(start, i + 1); break; }
    }
    assert.doesNotMatch(src, /change-player-btn|change-player-btn::after/, `${name} no debería mencionar el control de cambiar jugador`);
  }
});

/* ---------- 10–11. mobile / layout ---------- */

test("10+11. CSS: botón de texto compacto, nowrap, sin forzar ancho; la fila no fuerza scroll", () => {
  const rule = sliceBetween(demo, ".change-player-btn{", "}", "la regla del botón");
  assert.match(rule, /flex:none/);
  assert.match(rule, /min-height:40px/);
  assert.match(rule, /white-space:nowrap/);
  assert.match(rule, /font:700 11px 'Inter'/);
  assert.doesNotMatch(rule, /width\s*:/); // sin width fijo
  // El hack ::after del ícono ya no existe.
  assert.doesNotMatch(demo, /\.change-player-btn::after/);
  // La fila de identidad deja encoger el nombre (min-width:0 / word-break) → no desborda.
  assert.match(demo, /\.my-status-identity\{[^}]*min-width:0[^}]*word-break:break-word[^}]*\}/);
  assert.match(demo, /\.my-status-identity-row\{[^}]*display:flex[^}]*\}/);
});
