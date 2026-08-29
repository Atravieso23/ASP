// La lista base de identidades del grupo vive en scripts/seed-habitual-players.mjs.
// No se edita desde la app: agregar o sacar habituales es esa operación controlada.
// Este test fija exactamente qué 14 identidades se van a sembrar y bloquea que
// vuelva la lista anterior (apodos y personas que salieron de la base).
//
// El script NO se importa: al cargarse corre main() y golpea Supabase. Se lee como
// texto y se parsea el literal HABITUAL_PLAYERS, igual que el resto de la suite
// trabaja sobre el texto de demo.html.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  const norm = lista.map((n) => n.trim().toLocaleLowerCase("es"));
  assert.equal(new Set(norm).size, norm.length, "no puede haber dos entradas para la misma persona");
});

test("el seed sigue tocando sólo la key habitualPlayers del blob", () => {
  // Preserva el resto por spread; no arma responses ni pagos.
  assert.match(seed, /const nextBlob = \{ \.\.\.blob, habitualPlayers: HABITUAL_PLAYERS \};/);
  assert.ok(!/responses:/.test(seed), "el seed no debe construir responses");
});

test("actualizar una lista ya sembrada exige --force", () => {
  assert.match(seed, /if \(actual\.length > 0 && !force\)/);
});
