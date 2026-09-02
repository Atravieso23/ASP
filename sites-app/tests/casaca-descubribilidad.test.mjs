// PR #47 — descubribilidad de "Nombre en la casaca": un preview VIVO
// "En la lista te ven como {nombre}" bajo el campo, que refleja el valor ACTUAL del
// input (aún sin guardar). Sólo lectura: no persiste, no toca name/habitualName, no
// toca el handler de "Guardar cambios" (única persistencia). Fuera del modo
// identificado queda oculto.
//
// PR #48 — el preview sólo aparece cuando APORTA DIFERENCIA: si el nombre visible
// coincide con la identidad base (o el input vacío cae a ella) se oculta, para no
// repetir el heading. label / helper / copy del preview quedan verbatim.
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

/* ---------- 1. markup + ubicación ---------- */

test("1. #casaca-preview vive en .recurrent-player-field, con el nombre en un <b> aparte", () => {
  assert.equal(demo.split('id="casaca-preview"').length - 1, 1, "un único preview");
  const field = demo.slice(
    demo.indexOf('<div class="my-status-field recurrent-player-field">'),
    demo.indexOf("</div>", demo.indexOf('id="player-name-feedback"')),
  );
  assert.match(field, /<p class="casaca-preview" id="casaca-preview" hidden>En la lista te ven como <b id="casaca-preview-name"><\/b><\/p>/);
  // Entre el input y el helper; no rompe el orden de la card.
  assert.ok(field.indexOf('id="my-player-name"') < field.indexOf('id="casaca-preview"'));
  assert.ok(field.indexOf('id="casaca-preview"') < field.indexOf('id="player-picker-help"'));
  assert.ok(
    demo.indexOf('id="my-player-name-label"') < demo.indexOf('id="casaca-preview"') &&
    demo.indexOf('id="casaca-preview"') < demo.indexOf('class="my-status-choice"'),
    "el preview queda entre el label del campo y los botones de Estado",
  );
});

test("2. no está dentro del ticket ni toca #proximo-partido / .squad-status", () => {
  assert.ok(demo.indexOf('id="casaca-preview"') < demo.indexOf('<div class="ticket">'));
  const ticket = demo.slice(demo.indexOf('<div class="ticket">'), demo.indexOf('class="section teams-section"'));
  assert.doesNotMatch(ticket, /casaca-preview/);
});

/* ---------- 3. comportamiento de renderCasacaPreview ---------- */

function runPreview({ identified, changing = false, inputValue = "", propia = null }) {
  const wrap = { hidden: "PREV", textContent: "" };
  const nameEl = { textContent: "PREV" };
  const input = { value: inputValue };
  const els = { "casaca-preview": wrap, "casaca-preview-name": nameEl, "my-player-name": input };
  const ctx = vm.createContext({
    document: { getElementById: (id) => (id in els ? els[id] : null) },
    responseDelJugadorActual: () => (identified ? (propia || { name: "Pablito", habitualName: "Pablo de Achaval" }) : undefined),
    changingRegisteredPlayer: changing,
    Boolean, String,
  });
  vm.runInContext(extractFunction(demo, "renderCasacaPreview") + "\nrenderCasacaPreview();", ctx);
  return { hidden: wrap.hidden, name: nameEl.textContent };
}

test("3. carga identificado con name != habitualName: preview = lo que trae el input", () => {
  const out = runPreview({ identified: true, inputValue: "Pablito" });
  assert.equal(out.hidden, false);
  assert.equal(out.name, "Pablito");
});

test("4. PR #48: input vacío -> cae a habitualName -> oculto (no hay diferencia)", () => {
  const out = runPreview({ identified: true, inputValue: "" });
  assert.equal(out.hidden, true);
  assert.equal(out.name, "");
});

test("4b. PR #48: name == habitualName al cargar (input = identidad base) -> oculto", () => {
  const out = runPreview({ identified: true, inputValue: "Pablo de Achaval", propia: { name: "Pablo de Achaval", habitualName: "Pablo de Achaval" } });
  assert.equal(out.hidden, true);
  assert.equal(out.name, "");
});

test("4c. PR #48: comparación con trim en los dos lados", () => {
  assert.equal(runPreview({ identified: true, inputValue: "  Pablo de Achaval  ", propia: { habitualName: "Pablo de Achaval" } }).hidden, true);
  assert.equal(runPreview({ identified: true, inputValue: "Pablo de Achaval", propia: { habitualName: "  Pablo de Achaval  " } }).hidden, true);
});

test("5. live: editar el input a algo != habitualName -> visible con el texto escrito", () => {
  const out = runPreview({ identified: true, inputValue: "Fran" });
  assert.equal(out.hidden, false);
  assert.equal(out.name, "Fran");
  // espacios recortados
  assert.equal(runPreview({ identified: true, inputValue: "  Fran  " }).name, "Fran");
});

test("5b. PR #48: live toggle -> distinto de habitualName visible, igual oculto", () => {
  const propia = { name: "Pablito", habitualName: "Pablo de Achaval" };
  assert.equal(runPreview({ identified: true, inputValue: "Pablón", propia }).hidden, false, "distinto -> visible");
  assert.equal(runPreview({ identified: true, inputValue: "Pablo de Achaval", propia }).hidden, true, "vuelve a la identidad base -> oculto");
});

test("6. PR #48: vaciar el input vuelve al fallback (habitualName) -> oculto", () => {
  const out = runPreview({ identified: true, inputValue: "", propia: { name: "Pablito", habitualName: "Pablo de Achaval" } });
  assert.equal(out.hidden, true);
  assert.equal(out.name, "");
});

test("7. legacy sin habitualName + input vacío -> oculto (no hay nada que mostrar)", () => {
  const out = runPreview({ identified: true, inputValue: "", propia: { name: "Frankie" } });
  assert.equal(out.hidden, true);
  assert.equal(out.name, "");
});

test("7b. PR #48: legacy sin habitualName + input NO vacío -> visible (no hay identidad base contra qué comparar)", () => {
  const out = runPreview({ identified: true, inputValue: "Frankie", propia: { name: "Frankie" } });
  assert.equal(out.hidden, false);
  assert.equal(out.name, "Frankie");
});

test("8. ambos faltan -> oculto", () => {
  const out = runPreview({ identified: true, inputValue: "", propia: {} });
  assert.equal(out.hidden, true);
});

test("9. Registro (sin response propia) -> oculto", () => {
  assert.equal(runPreview({ identified: false }).hidden, true);
});

test("10. 'Cambiar jugador' activo -> oculto (aunque haya response propia)", () => {
  assert.equal(runPreview({ identified: true, changing: true, inputValue: "" }).hidden, true);
});

test("11. elementos ausentes (harness parcial) -> no crashea", () => {
  const ctx = vm.createContext({
    document: { getElementById: () => null },
    responseDelJugadorActual: () => ({ name: "x" }),
    changingRegisteredPlayer: false,
    Boolean, String,
  });
  assert.doesNotThrow(() => vm.runInContext(extractFunction(demo, "renderCasacaPreview") + "\nrenderCasacaPreview();", ctx));
});

/* ---------- 4. wiring: renderIdentityHeader + listener input ---------- */

test("12. renderIdentityHeader llama a renderCasacaPreview al final", () => {
  const fn = extractFunction(demo, "renderIdentityHeader");
  assert.match(fn, /if\(row\) row\.hidden = false;\s*renderCasacaPreview\(\);\s*}$/);
});

test("13. el preview sigue al input en vivo, sin tocar el cableado del dirty indicator", () => {
  const wiring = demo.slice(
    demo.indexOf("const myStatusCard = document.getElementById('my-status-card');"),
    demo.indexOf("mockFrom.addEventListener('change', syncMockToOptions);"),
  );
  // Las líneas de refreshDirtyIndicator NO cambian (PR previo las fija verbatim).
  assert.match(wiring, /myStatusCard\.addEventListener\('change', refreshDirtyIndicator\)/);
  assert.match(wiring, /myStatusCard\.addEventListener\('input', refreshDirtyIndicator\)/);
  // Listener aparte para el preview.
  assert.match(wiring, /myStatusCard\.addEventListener\('input', renderCasacaPreview\)/);
});

/* ---------- 5. no cambia la semántica: persistencia manual, identidad intacta ---------- */

test("14. renderCasacaPreview no persiste: sin saveState / persist / savePlayerRegistration / Supabase", () => {
  const fn = extractFunction(demo, "renderCasacaPreview");
  assert.doesNotMatch(fn, /saveState|savePlayerRegistration|persist|supabase|upsert|localStorage/i);
  // Sólo lee: no asigna a name/habitualName ni a state.
  assert.doesNotMatch(fn, /\.(name|habitualName)\s*=|state\.\w+\s*=/);
});

test("15. el handler de 'Guardar cambios' no cambió: editandoMiEstado + habitualName preservado", () => {
  const handler = demo.slice(
    demo.indexOf("document.getElementById('my-status-confirm').onclick = async ()=>{"),
    demo.indexOf("document.getElementById('change-player-btn').onclick"),
  );
  assert.match(handler, /const editandoMiEstado = Boolean\(existingResponse\) && !changingRegisteredPlayer;/);
  assert.match(handler, /const habitualName = editandoMiEstado \? existingResponse\.habitualName : habitualExacto;/);
  assert.doesNotMatch(handler, /renderCasacaPreview/);
  // El preview no es persistencia: "Guardar cambios" sigue siendo la única.
  assert.match(handler, /await savePlayerRegistration\(response\)/);
});

test("16. tieneCambiosSinGuardar no cambió (editar el input marca 'Cambios sin guardar' como hoy)", () => {
  const fn = extractFunction(demo, "tieneCambiosSinGuardar");
  assert.match(fn, /const escrito = document\.getElementById\('my-player-name'\)\.value\.trim\(\);/);
  assert.match(fn, /const objetivo = escrito \|\| saved\.habitualName \|\| saved\.name;/);
  assert.match(fn, /return objetivo\.toLocaleLowerCase\('es'\) !== saved\.name\.toLocaleLowerCase\('es'\);/);
  assert.doesNotMatch(fn, /casaca-preview|renderCasacaPreview/);
});

/* ---------- 6. copy: label / helper verbatim, preview sin texto extra ---------- */

test("17. label 'Nombre en la casaca' y helper de casaca siguen verbatim", () => {
  assert.match(demo, /label\.textContent = 'Nombre en la casaca';/);
  assert.match(demo, /help\.textContent = 'Así te ve el grupo en la lista\. Editarlo no cambia tu jugador\.';/);
  assert.match(demo, /<label for="my-player-name" id="my-player-name-label">Tu nombre<\/label>/);
});

test("18. el preview dice exactamente 'En la lista te ven como {nombre}', sin '(sin guardar)' ni extras", () => {
  const p = demo.slice(demo.indexOf('<p class="casaca-preview"'), demo.indexOf("</p>", demo.indexOf('<p class="casaca-preview"')) + 4);
  assert.match(p, /^<p class="casaca-preview" id="casaca-preview" hidden>En la lista te ven como <b id="casaca-preview-name"><\/b><\/p>$/);
  assert.doesNotMatch(p, /sin guardar|pendiente|guardá|no guardado/i);
});

/* ---------- 7. CSS aislado ---------- */

test("19. CSS .casaca-preview: compacto, con :empty implícito por [hidden], número resaltado", () => {
  const css = demo.slice(demo.indexOf(".casaca-preview{"), demo.indexOf(".player-name-feedback{"));
  assert.match(css, /\.casaca-preview\{[^}]*font-size:11\.5px/);
  assert.match(css, /\.casaca-preview\[hidden\]\{display:none;\}/);
  assert.match(css, /\.casaca-preview b\{color:var\(--celeste-deep\)/);
  assert.doesNotMatch(css, /\.casaca-preview\{[^}]*(background|border:)/);
});
