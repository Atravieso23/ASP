// Sembrado / actualización controlada de habitualPlayers en el blob de match_data.
//
// NO se corre solo. NO forma parte del build ni de los tests. Es una escritura manual
// a producción que se hace DESPUÉS de que el código de identidad base esté desplegado.
// Por defecto es dry-run: no escribe nada hasta pasar --apply.
//
// La lista es la IDENTIDAD BASE del grupo: nombre real/corto, una entrada por persona.
// No se edita desde la app; agregar o sacar habituales es esta operación controlada.
//
// Uso:
//   node scripts/seed-habitual-players.mjs                       # dry-run del reseed clásico
//   node scripts/seed-habitual-players.mjs --apply               # reseed si la lista está vacía
//   node scripts/seed-habitual-players.mjs --apply --force       # reemplaza una lista existente
//   node scripts/seed-habitual-players.mjs --add "Nombre"        # dry-run: agrega 1 sobre la lista fresca
//   node scripts/seed-habitual-players.mjs --add "Nombre" --apply
//   node scripts/seed-habitual-players.mjs --remove "Nombre"     # dry-run: saca 1 de la lista fresca
//   node scripts/seed-habitual-players.mjs --remove "Nombre" --apply
//
// Modos:
//   - reseed (sin --add/--remove): escribe la constante HABITUAL_PLAYERS entera.
//     Aborta si el server ya tiene lista no vacía salvo --force.
//   - --add / --remove: cambio QUIRÚRGICO sobre la lista que está HOY en el server.
//     No usan la constante, no piden --force, hacen 1 sola operación de ± un nombre.
//
// Garantías (todos los modos):
//   - preserva TODO el resto del blob (responses, history, matchInfo, sedes, etc.);
//   - NO toca responses ni pagos: sólo la key habitualPlayers;
//   - dry-run por defecto: nada se escribe sin --apply;
//   - una sola escritura PATCH sobre la fila id=1.

import { fileURLToPath } from "node:url";

const SUPABASE_URL = "https://bfmdozufgvjektqgbpli.supabase.co";
// Misma anon key que ya usa demo.html (pública, RLS-gated).
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmbWRvenVmZ3ZqZWt0cWdicGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NjQ2ODMsImV4cCI6MjEwMDQ0MDY4M30.Urgf9k51cE6tSCBYE0e7cyjK6ZNwxtf0ffpLCfoD5d8";
const ROW_ID = 1;

// Lista base de identidades, EXACTAMENTE como la confirmó el grupo. 14 habituales.
// Cada entrada es la identidad base (nombre real/corto); el nombre visible que cada
// jugador puede editar después NO vive acá, vive en response.name.
// No se infieren nombres de WhatsApp ni de history: esta lista es la fuente.
// Cambios vs. la lista anterior: Roca -> "Agustín Travieso" (es la misma persona);
// Negro, Achita, Chursi, Mumi Posse y Tomy Duncan salen de la lista base.
const HABITUAL_PLAYERS = [
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

// Misma normalización que la app (agregarInvitado, faltanConfirmar): trim + minúsculas 'es'.
export function norm(valor) {
  return String(valor == null ? "" : valor).trim().toLocaleLowerCase("es");
}

// Parsea argv (sin node ni la ruta del script). Devuelve { mode, name, apply, force }.
// Lanza si --add y --remove vienen juntos o si falta el nombre.
export function parseArgs(args) {
  const apply = args.includes("--apply");
  const force = args.includes("--force");
  const hasAdd = args.includes("--add");
  const hasRemove = args.includes("--remove");
  if (hasAdd && hasRemove) {
    throw new Error("--add y --remove son mutuamente excluyentes.");
  }
  if (!hasAdd && !hasRemove) {
    return { mode: "reseed", name: null, apply, force };
  }
  const mode = hasAdd ? "add" : "remove";
  const flag = hasAdd ? "--add" : "--remove";
  const name = args[args.indexOf(flag) + 1];
  if (!name || name.startsWith("--")) {
    throw new Error(`Falta el nombre: node scripts/seed-habitual-players.mjs ${flag} "Nombre"`);
  }
  return { mode, name, apply, force };
}

// Agrega un nombre al final de la lista fresca. Rechaza el duplicado normalizado.
// Devuelve { lista } o { error }.
export function aplicarAdd(listaActual, nombre) {
  const actual = Array.isArray(listaActual) ? listaActual : [];
  const objetivo = norm(nombre);
  if (!objetivo) return { error: "El nombre está vacío." };
  if (actual.some((h) => norm(h) === objetivo)) {
    return { error: `"${String(nombre).trim()}" ya está en habitualPlayers (comparación normalizada). 0 cambios.` };
  }
  return { lista: [...actual, String(nombre).trim()] };
}

// Saca un nombre de la lista fresca por comparación normalizada. Rechaza si no está.
// Devuelve { lista } o { error }.
export function aplicarRemove(listaActual, nombre) {
  const actual = Array.isArray(listaActual) ? listaActual : [];
  const objetivo = norm(nombre);
  if (!objetivo) return { error: "El nombre está vacío." };
  if (!actual.some((h) => norm(h) === objetivo)) {
    return { error: `"${String(nombre).trim()}" no está en habitualPlayers: nada que remover. 0 cambios.` };
  }
  return { lista: actual.filter((h) => norm(h) !== objetivo) };
}

// Responses no-invitadas cuyo name o habitualName matchea (normalizado) al nombre dado.
// Sólo para AVISAR en --remove: nunca se tocan.
export function responsesHomonimas(blob, nombre) {
  const objetivo = norm(nombre);
  const lista = blob && Array.isArray(blob.responses) ? blob.responses : [];
  return lista
    .filter((r) => r && !r.isGuest && (norm(r.name) === objetivo || norm(r.habitualName) === objetivo))
    .map((r) => ({ responseId: r.responseId, name: r.name }));
}

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

async function leerBlob() {
  const readRes = await fetch(
    `${SUPABASE_URL}/rest/v1/match_data?id=eq.${ROW_ID}&select=data`,
    { headers },
  );
  if (!readRes.ok) throw new Error(`Lectura falló: HTTP ${readRes.status} ${await readRes.text()}`);
  const rows = await readRes.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("No existe la fila id=1: nada que hacer.");
  const blob = rows[0].data;
  if (!blob || typeof blob !== "object") throw new Error("La columna data está vacía o no es un objeto.");
  return blob;
}

async function main() {
  const { mode, name, apply, force } = parseArgs(process.argv.slice(2));

  // 1. Lectura (read-only) del blob actual.
  const blob = await leerBlob();
  const actual = Array.isArray(blob.habitualPlayers) ? blob.habitualPlayers : [];
  console.log("modo:", mode);
  console.log("habitualPlayers actual en el servidor:", JSON.stringify(actual));

  // 2. Calcular la lista nueva según el modo.
  let nuevaLista;
  if (mode === "reseed") {
    console.log("habitualPlayers a escribir (constante):", JSON.stringify(HABITUAL_PLAYERS));
    if (actual.length > 0 && !force) {
      console.log("\nABORTA: el servidor ya tiene habitualPlayers no vacío.");
      console.log("Para un cambio de UN nombre usá --add \"Nombre\" o --remove \"Nombre\".");
      console.log("Para reemplazar la lista entera con la constante, agregá --force.");
      process.exit(1);
    }
    nuevaLista = HABITUAL_PLAYERS;
  } else if (mode === "add") {
    const { lista, error } = aplicarAdd(actual, name);
    if (error) {
      console.log(`\nABORTA: ${error}`);
      process.exit(1);
    }
    nuevaLista = lista;
    console.log(`\ndiff:  + ${JSON.stringify(String(name).trim())}`);
    console.log("habitualPlayers a escribir:            ", JSON.stringify(nuevaLista));
  } else {
    const { lista, error } = aplicarRemove(actual, name);
    if (error) {
      console.log(`\nABORTA: ${error}`);
      process.exit(1);
    }
    nuevaLista = lista;
    console.log(`\ndiff:  - ${JSON.stringify(String(name).trim())}`);
    console.log("habitualPlayers a escribir:            ", JSON.stringify(nuevaLista));
    const homonimas = responsesHomonimas(blob, name);
    if (homonimas.length > 0) {
      console.log(`\nADVERTENCIA: ${homonimas.length} response(s) no-invitada con ese nombre siguen en el blob y NO se tocan:`);
      for (const h of homonimas) {
        console.log(`  responseId=${h.responseId ?? "?"}  name=${JSON.stringify(h.name)}`);
      }
      console.log("Sacar el habitual las deja como historial: no vuelven a aparecer en el selector ni en 'Faltan responder'.");
    }
  }

  // 3. Nuevo blob: sólo cambia habitualPlayers; todo lo demás intacto.
  const nextBlob = { ...blob, habitualPlayers: nuevaLista };
  const otras = Object.keys(blob).filter((k) => k !== "habitualPlayers");
  console.log(`\nSe preservan sin tocar ${otras.length} keys: ${otras.join(", ")}`);
  console.log(`responses actuales: ${Array.isArray(blob.responses) ? blob.responses.length : "?"} | history: ${Array.isArray(blob.history) ? blob.history.length : "?"}`);

  if (!apply) {
    console.log("\nDRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar el cambio.");
    return;
  }

  // 4. Escritura única (PATCH sobre id=1).
  const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/match_data?id=eq.${ROW_ID}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ data: nextBlob, updated_at: new Date().toISOString() }),
  });
  if (!writeRes.ok) throw new Error(`Escritura falló: HTTP ${writeRes.status} ${await writeRes.text()}`);
  console.log("\nOK: habitualPlayers actualizado. Verificá en la app: selector '¿Quién sos?', 'Faltan responder', y que ninguna response haya cambiado.");
}

// El módulo se puede importar (tests) sin disparar la escritura: main() sólo corre
// cuando el script es el entrypoint real.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
