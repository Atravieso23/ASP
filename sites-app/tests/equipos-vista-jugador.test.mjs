// PR #50 — Equipos en la vista Jugador: la nómina de cada equipo se lee en columna
// (una línea por jugador) y el "VS" se saca SÓLO de esta vista. Objetivo de producto:
// escanear de un vistazo quién juega en cada equipo. El Organizador (canchas /
// formaciones) no se toca: conserva su markup y su "VS".
//
// Sólo se afirma sobre el TEXTO del archivo (markup + CSS). La lógica de equipos
// (`render`, `buildTeamListRow`, `syncLocalAvailabilityWithPlayers`, asignación
// Negro/Blanco) se cubre en equipos-team-derivado.test.mjs y no cambia acá.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

// El bloque de equipos de la vista Jugador: desde el id del contenedor hasta el hint
// (que sigue viviendo dentro de #teams-view-lista).
const HINT = "Los equipos se asignan desde la vista Organizador";
function bloqueJugador() {
  const start = demo.indexOf('id="teams-view-lista"');
  assert.ok(start > -1, "no ubiqué #teams-view-lista");
  const end = demo.indexOf(HINT, start);
  assert.ok(end > start, "no ubiqué el hint de la sección de equipos");
  return demo.slice(start, end);
}

/* ---------- 1. nombres en columna (CSS-only, scopeado a la vista Jugador) ---------- */

test("1. #teams-view-lista .split-col ul fuerza lista vertical", () => {
  assert.match(demo, /#teams-view-lista \.split-col ul\{[^}]*flex-direction:column[^}]*\}/);
  // no wrapea a varias columnas si la nómina crece.
  assert.match(demo, /#teams-view-lista \.split-col ul\{[^}]*flex-wrap:nowrap[^}]*\}/);
});

test("2. la regla base .split-col ul queda intacta (el Organizador no la hereda distinta)", () => {
  // El override es una regla nueva y más específica; la base sigue como estaba.
  assert.match(demo, /\.split-col ul\{list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; justify-content:center; gap:4px 14px;\}/);
});

/* ---------- 2. "VS" fuera de la vista Jugador ---------- */

test("3. en la vista Jugador no hay 'VS'", () => {
  const jugador = bloqueJugador();
  assert.doesNotMatch(jugador, /teams-vs/);
  assert.doesNotMatch(jugador, />VS</);
});

test("4. el 'VS' del Organizador / Formaciones sigue existiendo", () => {
  assert.match(demo, /class="teams-vs"[^>]*>VS<\/div>/);
  // Vive dentro del bloque de formaciones del Organizador y en ningún otro lado del markup.
  const startFormations = demo.indexOf('<div class="organizer-formations">');
  assert.ok(startFormations > -1, "no ubiqué el bloque de formaciones");
  const orgFormations = demo.slice(startFormations, demo.indexOf('</section>', startFormations));
  assert.match(orgFormations, /class="teams-vs"[^>]*>VS<\/div>/);
  // Un único nodo teams-vs en todo el markup (antes había dos).
  assert.equal(demo.split('class="teams-vs"').length - 1, 1, "un único teams-vs en el markup");
});

test("5. la regla CSS .teams-vs se conserva (la usa el Organizador)", () => {
  assert.match(demo, /\.teams-vs\{[^}]*border-radius:50%[^}]*\}/);
});

/* ---------- 3. lo que NO cambia ---------- */

test("6. orden: Equipo Negro antes que Equipo Blanco en la vista Jugador", () => {
  const jugador = bloqueJugador();
  assert.ok(
    jugador.indexOf('split-col negro') > -1 &&
    jugador.indexOf('split-col negro') < jugador.indexOf('split-col blanco'),
    "negro va arriba de blanco",
  );
  assert.ok(jugador.indexOf('id="negro-team-label"') < jugador.indexOf('id="blanco-team-label"'));
  assert.match(jugador, /id="team-negro-list"/);
  assert.match(jugador, /id="team-blanco-list"/);
});

test("7. estados vacíos por equipo intactos (uno por equipo, en el render)", () => {
  assert.equal(
    demo.split("Sin jugadores todavía").length - 1,
    2,
    "el estado vacío se emite para negro y para blanco",
  );
});

test("8. buildTeamListRow sigue mostrando nombre, número y banda de capitán", () => {
  const start = demo.search(/function buildTeamListRow\s*\(/);
  assert.ok(start > -1, "no encontré buildTeamListRow");
  const fn = demo.slice(start, demo.indexOf("return li;", start) + "return li;".length);
  assert.match(fn, /nameSpan\.className = 'split-name';/);
  assert.match(fn, /numSpan\.className = 'split-number';/);
  assert.match(fn, /numSpan\.textContent = p\.number \? \('#'\+p\.number\) : '';/);
  assert.match(fn, /class="captain-band"/);
});

test("9. el hint 'Los equipos se asignan desde la vista Organizador' sigue en su lugar", () => {
  assert.match(demo, /<p class="hint">Los equipos se asignan desde la vista Organizador\.<\/p>/);
});
