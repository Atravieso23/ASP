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
//   node scripts/seed-habitual-players.mjs                    # dry-run: muestra qué haría
//   node scripts/seed-habitual-players.mjs --apply            # siembra si la lista está vacía
//   node scripts/seed-habitual-players.mjs --apply --force    # reemplaza una lista ya existente
//
// Producción ya tiene una lista anterior sembrada: para pasar a la lista base de 14
// hay que correrlo con --apply --force (una vez, tras el deploy).
//
// Garantías:
//   - preserva TODO el resto del blob (responses, history, matchInfo, sedes, etc.);
//   - NO toca responses ni pagos: sólo la key habitualPlayers;
//   - si el servidor ya tiene habitualPlayers no vacío, ABORTA salvo --force
//     (evita pisar una lista ya gestionada);
//   - una sola escritura PATCH sobre la fila id=1.

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

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

async function main() {
  // 1. Lectura (read-only) del blob actual.
  const readRes = await fetch(
    `${SUPABASE_URL}/rest/v1/match_data?id=eq.${ROW_ID}&select=data`,
    { headers },
  );
  if (!readRes.ok) throw new Error(`Lectura falló: HTTP ${readRes.status} ${await readRes.text()}`);
  const rows = await readRes.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("No existe la fila id=1: nada que sembrar.");
  const blob = rows[0].data;
  if (!blob || typeof blob !== "object") throw new Error("La columna data está vacía o no es un objeto.");

  const actual = Array.isArray(blob.habitualPlayers) ? blob.habitualPlayers : [];
  console.log("habitualPlayers actual en el servidor:", JSON.stringify(actual));
  console.log("habitualPlayers a escribir (14):      ", JSON.stringify(HABITUAL_PLAYERS));

  if (actual.length > 0 && !force) {
    console.log("\nABORTA: el servidor ya tiene habitualPlayers no vacío. Usá --force sólo si querés reemplazarla.");
    process.exit(1);
  }

  // 2. Nuevo blob: sólo cambia habitualPlayers; todo lo demás intacto.
  const nextBlob = { ...blob, habitualPlayers: HABITUAL_PLAYERS };
  const otras = Object.keys(blob).filter((k) => k !== "habitualPlayers");
  console.log(`\nSe preservan sin tocar ${otras.length} keys: ${otras.join(", ")}`);
  console.log(`responses actuales: ${Array.isArray(blob.responses) ? blob.responses.length : "?"} | history: ${Array.isArray(blob.history) ? blob.history.length : "?"}`);

  if (!apply) {
    console.log("\nDRY-RUN: no se escribió nada. Volvé a correr con --apply para sembrar.");
    return;
  }

  // 3. Escritura única (PATCH sobre id=1).
  const writeRes = await fetch(`${SUPABASE_URL}/rest/v1/match_data?id=eq.${ROW_ID}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ data: nextBlob, updated_at: new Date().toISOString() }),
  });
  if (!writeRes.ok) throw new Error(`Escritura falló: HTTP ${writeRes.status} ${await writeRes.text()}`);
  console.log("\nSEMBRADO OK: habitualPlayers actualizado. Verificá en la app que el selector muestre las 14 identidades base.");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
