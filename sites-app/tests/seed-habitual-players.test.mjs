// La lista base de identidades del grupo vive en scripts/seed-habitual-players.mjs.
// No se edita desde la app: agregar o sacar habituales es esa operación controlada.
//
// Dos capas de test:
//   1. sobre el TEXTO del script: fija las 14 identidades base y que el reseed
//      preserve el resto del blob (igual que el resto de la suite lee demo.html);
//   2. sobre los HELPERS PUROS importados: parseArgs / aplicarAdd / aplicarRemove /
//      responsesHomonimas. El módulo ahora se puede importar sin disparar main()
//      (guard por entrypoint), así que no golpea Supabase.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  aplicarAdd,
  aplicarRemove,
  norm,
  parseArgs,
  responsesHomonimas,
} from "../scripts/seed-habitual-players.mjs";

const seed = await readFile(new URL("../scripts/seed-habitual-players.mjs", import.meta.url), "utf8");

function extraerHabitualPlayers(source) {
  const m = source.match(/const HABITUAL_PLAYERS = \[([\s\S]*?)\];/);
  assert.ok(m, "no encontré el literal HABITUAL_PLAYERS en el script de seed");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const LISTA_BASE = [
  "Pablo de Achaval",
  "Agustín Travieso",
  "Segun Campos",
  "Francisco Sánchez Keenan",
  "Félix de Achaval",
  "Nacho Duncan",
  "Joaco el Deiker",
  "Fran Forrester",
  "Nahuel Gutiérrez",
  "Félix Beccar",
  "Agustín Mingolla",
  "Juampi Ramos",
  "Facu Santos",
  "Ale",
];

/* ---------- 1. sobre el texto del script ---------- */

test("el seed contiene exactamente las 14 identidades base, en orden", () => {
  assert.deepEqual(extraerHabitualPlayers(seed), LISTA_BASE);
});

test("el seed ya no tiene la lista vieja de 16 ni sus apodos", () => {
  const lista = extraerHabitualPlayers(seed);
  assert.equal(lista.length, 14, "son 14 identidades base, no 16");
  for (const fuera of ["Roca", "Negro", "Achita", "Chursi", "Mumi Posse", "Tomy Duncan", "Tommy Duncan"]) {
    assert.ok(!lista.includes(fuera), `${fuera} no debe seguir en la lista base`);
  }
});

test("cada identidad base es única (sin duplicados normalizados)", () => {
  const lista = extraerHabitualPlayers(seed);
  const norms = lista.map((n) => n.trim().toLocaleLowerCase("es"));
  assert.equal(new Set(norms).size, norms.length, "no puede haber dos entradas para la misma persona");
});

test("el nextBlob cambia sólo la key habitualPlayers del blob", () => {
  // Preserva el resto por spread; no arma responses ni pagos.
  assert.match(seed, /const nextBlob = \{ \.\.\.blob, habitualPlayers: nuevaLista \};/);
  assert.ok(!/responses:/.test(seed), "el seed no debe construir responses");
});

test("el reseed clásico sigue exigiendo --force para pisar una lista ya sembrada", () => {
  assert.match(seed, /if \(actual\.length > 0 && !force\)/);
});

/* ---------- 2. helpers puros ---------- */

test("importar el módulo no ejecuta main() (no golpea Supabase)", () => {
  // Si main() corriera al importar, este archivo ya habría fallado con un error de
  // red arriba. Llegar hasta acá con los helpers definidos es la prueba.
  assert.equal(typeof aplicarAdd, "function");
  assert.equal(typeof aplicarRemove, "function");
  assert.equal(typeof parseArgs, "function");
  assert.match(seed, /process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)/);
});

test("parseArgs: sin --add/--remove => modo reseed", () => {
  assert.deepEqual(parseArgs([]), { mode: "reseed", name: null, apply: false, force: false });
  assert.deepEqual(parseArgs(["--apply", "--force"]), { mode: "reseed", name: null, apply: true, force: true });
});

test("parseArgs: --add y --remove juntos es error", () => {
  assert.throws(() => parseArgs(["--add", "X", "--remove", "Y"]), /mutuamente excluyentes/);
});

test("parseArgs: --add/--remove exigen un nombre", () => {
  assert.throws(() => parseArgs(["--add"]), /Falta el nombre/);
  assert.throws(() => parseArgs(["--remove"]), /Falta el nombre/);
  assert.throws(() => parseArgs(["--add", "--apply"]), /Falta el nombre/);
});

test("parseArgs: --add \"Nombre\" --apply", () => {
  assert.deepEqual(parseArgs(["--add", "Tincho", "--apply"]), {
    mode: "add", name: "Tincho", apply: true, force: false,
  });
  assert.deepEqual(parseArgs(["--remove", "Tincho"]), {
    mode: "remove", name: "Tincho", apply: false, force: false,
  });
});

test("aplicarAdd: agrega al final de la lista fresca del server", () => {
  const { lista, error } = aplicarAdd(["Pablo", "Mingo"], "  Tincho  ");
  assert.equal(error, undefined);
  assert.deepEqual(lista, ["Pablo", "Mingo", "Tincho"], "va al final y trimmeado");
});

test("aplicarAdd: rechaza el duplicado normalizado, 0 cambios", () => {
  const r = aplicarAdd(["Pablo de Achaval", "Mingo"], "  pablo DE achaval ");
  assert.equal(r.lista, undefined, "no devuelve lista nueva");
  assert.match(r.error, /ya está en habitualPlayers/);
});

test("aplicarAdd: nombre vacío es error", () => {
  assert.match(aplicarAdd(["Pablo"], "   ").error, /vac[ií]o/);
});

test("aplicarRemove: saca por comparación normalizada", () => {
  const { lista, error } = aplicarRemove(["Pablo de Achaval", "Mingo", "Roca"], "MINGO");
  assert.equal(error, undefined);
  assert.deepEqual(lista, ["Pablo de Achaval", "Roca"]);
});

test("aplicarRemove: rechaza un nombre ausente, 0 cambios", () => {
  const r = aplicarRemove(["Pablo", "Mingo"], "Tincho");
  assert.equal(r.lista, undefined);
  assert.match(r.error, /no está en habitualPlayers/);
});

test("responsesHomonimas: detecta la response no-invitada con ese nombre o habitualName", () => {
  const blob = {
    responses: [
      { responseId: "r1", name: "Tito", habitualName: "Pablo de Achaval", isGuest: false },
      { responseId: "r2", name: "Pablo de Achaval", isGuest: true, invitedBy: "otro" },
      { responseId: "r3", name: "Mingo", habitualName: "Mingo", isGuest: false },
    ],
  };
  const hits = responsesHomonimas(blob, "  pablo de achaval ");
  assert.deepEqual(hits, [{ responseId: "r1", name: "Tito" }], "matchea r1 por habitualName; ignora el invitado r2");
});

test("responsesHomonimas: sin responses homónimas devuelve []", () => {
  assert.deepEqual(responsesHomonimas({ responses: [{ name: "X", isGuest: false }] }, "Tincho"), []);
  assert.deepEqual(responsesHomonimas({}, "Tincho"), []);
});

test("norm: trim + minúsculas locale 'es'", () => {
  assert.equal(norm("  Félix DE Achaval "), "félix de achaval");
  assert.equal(norm(null), "");
  assert.equal(norm(undefined), "");
});
