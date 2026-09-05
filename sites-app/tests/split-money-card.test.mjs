// Split (tercer tiempo) — PR 2: card read-only estática en Vista Organizador.
//
// Esta card NO tiene state.split, NO tiene normalizeSplit, NO lee ni escribe nada:
// es únicamente markup+CSS que anuncia el lugar futuro del módulo con copy honesto.
// Por eso los tests son regex sobre el HTML crudo, sin node:vm ni DOM: no hay
// ninguna función ni handler que ejercitar todavía.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function sliceBetween(demo, startMarker, endMarker, label) {
  const start = demo.indexOf(startMarker);
  assert.ok(start > -1, `no ubiqué ${label}`);
  const end = demo.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `no ubiqué el final de ${label}`);
  return demo.slice(start, end);
}

const FORBIDDEN_WORDS = [
  "pagado",
  "saldada",
  "mínimo garantizado",
  "historial",
  "finalizado",
  "confirmado",
];

test("la card Split existe una sola vez, con el copy aprobado exacto", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  const occurrences = demo.split('class="organizer-card split-money-card"').length - 1;
  assert.equal(occurrences, 1, "la card Split debe existir exactamente una vez");

  const card = sliceBetween(
    demo,
    '<section class="organizer-card split-money-card"',
    "</section>",
    "la card Split",
  );

  assert.match(card, /<h2 class="organizer-card-title" id="split-money-title">Split<\/h2>/);
  assert.match(card, /<p class="split-money-subtitle">Cuenta del tercer tiempo<\/p>/);
  assert.match(
    card,
    /<p class="split-money-empty" id="split-money-empty">Todavía no hay gastos cargados\.<\/p>/,
  );
  assert.match(
    card,
    /<p class="split-money-note">En esta versión el Split todavía no se edita desde la app\.<\/p>/,
  );
});

test("la card Split no usa la clase bare \"split\" (colisiona con el layout de equipos)", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const card = sliceBetween(
    demo,
    '<section class="organizer-card split-money-card"',
    "</section>",
    "la card Split",
  );

  const classTokens = [...card.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  assert.ok(
    !classTokens.includes("split"),
    'ningún elemento de la card debe tener la clase bare "split"',
  );
});

test("la card Split no sobrepromete: sin copy de pago/estado confirmado", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const card = sliceBetween(
    demo,
    '<section class="organizer-card split-money-card"',
    "</section>",
    "la card Split",
  );

  const cardLower = card.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    assert.ok(
      !cardLower.includes(word.toLowerCase()),
      `la card Split no debe contener "${word}"`,
    );
  }
});

test("la card Split vive en Vista Organizador, entre Formaciones y Cerrar/Reiniciar", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  const organizerViewStart = demo.indexOf('id="main-view-organizer"');
  const formationsTitleIdx = demo.indexOf('id="team-formations-title"');
  const splitCardIdx = demo.indexOf('class="organizer-card split-money-card"');
  const actionsTitleIdx = demo.indexOf('id="organizer-actions-title"');

  assert.ok(organizerViewStart > -1, "no encontré la Vista Organizador");
  assert.ok(formationsTitleIdx > organizerViewStart, "Formaciones debe estar dentro de Vista Organizador");
  assert.ok(splitCardIdx > formationsTitleIdx, "Split debe ir después de Formaciones de equipos");
  assert.ok(actionsTitleIdx > splitCardIdx, "Split debe ir antes de Cerrar o reiniciar la fecha");
});

test("Split no toca state.split, normalizeSplit ni la lectura/escritura de Supabase", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  // Sólo el código real (dentro de <script>), no los comentarios HTML que describen
  // el scope del PR (esos sí mencionan "state.split" en prosa, a propósito).
  const script = sliceBetween(demo, "<script>", "</script>", "el bloque de script principal");

  assert.doesNotMatch(script, /\bstate\.split\b/, "no debe existir state.split todavía (fuera de scope del PR 2)");
  assert.doesNotMatch(script, /function\s+normalizeSplit\s*\(/, "no debe existir normalizeSplit todavía (fuera de scope del PR 2)");
});
