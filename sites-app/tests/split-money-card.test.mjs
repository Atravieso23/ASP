// Split (tercer tiempo) — PR 2: card read-only estática en Vista Organizador.
//
// La card en sí sigue sin leer ni escribir nada: es únicamente markup+CSS que
// anuncia el lugar futuro del módulo con copy honesto. Por eso estos tests son
// regex sobre el HTML crudo, sin node:vm ni DOM: no hay ningún handler que
// ejercitar sobre la card misma.
//
// PR 3A introdujo `state.split`/`normalizeSplit()` (shape defensivo, sin UI ni
// writers todavía) — el guard "PR 2 no toca state.split" que vivía acá quedó
// obsoleto por diseño y se retiró. Esas invariantes ahora se cubren en
// split-shape-reset.test.mjs.
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
  // PR 4: participantes y gastos ya son editables — sin balances todavía.
  assert.match(
    card,
    /<p class="split-money-note">Podés armar quién participa y cargar gastos\. Los balances por persona todavía no se calculan acá\.<\/p>/,
  );
  assert.match(card, /<p class="split-money-participants-summary" id="split-money-participants-summary">/);
  assert.match(card, /<button type="button" class="link-btn" id="open-manage-split-btn">Gestionar participantes<\/button>/);
  assert.match(card, /<button type="button" class="link-btn" id="open-manage-split-expenses-btn">Cargar gastos<\/button>/);
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
