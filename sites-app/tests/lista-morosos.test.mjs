// PR #18 — "Lista de morosos": módulo VISUAL read-only del estado de tarjetas/birras.
// No agrega escrituras, no toca computeCards ni el writer. Estos tests extraen
// morososDeCards / marcasDeMoroso / renderListaMorosos de demo.html y los corren en un
// node:vm con un document de mentira. Sin red, sin navegador, sin Supabase.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name} en demo.html`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar la función ${name}`);
}

// Mundo mínimo: document falso + state inyectable. renderListaMorosos usa escapeHtml,
// que también se extrae de demo.html (no se re-implementa).
function render(cards) {
  const lista = { hidden: false, innerHTML: "" };
  const vacio = { hidden: false };
  const elements = { "lista-morosos-list": lista, "lista-morosos-empty": vacio };
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] || null },
    state: { cards },
    Number, Object, Array, String, console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(
    [
      extractFunction(demo, "escapeHtml"),
      extractFunction(demo, "morososDeCards"),
      extractFunction(demo, "marcasDeMoroso"),
      extractFunction(demo, "renderListaMorosos"),
    ].join("\n") + "\nglobalThis.__render = renderListaMorosos;",
    context,
  );
  context.__render();
  return { lista, vacio };
}

const CARDS = (byPlayer) => ({ byPlayer, evaluated: {}, log: [] });

/* ---------- estado vacío ---------- */

test("1+2. cards vacío: el módulo muestra 'Sin tarjetas por ahora 👍' y no lista a nadie", () => {
  const { lista, vacio } = render(CARDS({}));
  assert.equal(vacio.hidden, false);
  assert.equal(lista.hidden, true);
  assert.equal(lista.innerHTML, "");
  assert.match(demo, /id="lista-morosos-empty"[^>]*>Sin tarjetas por ahora 👍</);
});

test("1b. el módulo NO tiene atributo hidden en el HTML: se muestra siempre", () => {
  assert.match(demo, /<section class="lista-morosos" id="lista-morosos-block"(?![^>]*\bhidden\b)[^>]*>/);
});

test("2b. cards ausente / roto no crashea y cae al estado vacío", () => {
  for (const bad of [undefined, null, {}, { byPlayer: null }, { byPlayer: "x" }]) {
    const { lista, vacio } = render(bad);
    assert.equal(vacio.hidden, false);
    assert.equal(lista.hidden, true);
  }
});

/* ---------- reglas siempre visibles ---------- */

test("3. las reglas están en el HTML estático (se ven haya o no tarjetas)", () => {
  assert.match(demo, /Si no figurás pago antes del inicio del partido, sumás 🟨\./);
  assert.match(demo, /Cada 2 amarillas, debés una birra para la banda 🍺\./);
  // Y viven en el módulo, no dentro de la lista dinámica.
  assert.match(demo, /<p class="lista-morosos-rules">[\s\S]*?sumás 🟨[\s\S]*?birra para la banda 🍺[\s\S]*?<\/p>/);
});

test("3b. PR #43: las reglas abren con la línea que separa la deuda de hoy de la sanción acumulada", () => {
  assert.match(demo, /Esto no es la cuota de hoy: son las tarjetas que se arrastran\./);
  // Va primero, antes de las dos reglas que ya estaban (que quedan intactas).
  assert.match(
    demo,
    /<p class="lista-morosos-rules">[\s\S]*?Esto no es la cuota de hoy: son las tarjetas que se arrastran\.[\s\S]*?Si no figurás pago antes del inicio del partido, sumás 🟨\.[\s\S]*?Cada 2 amarillas, debés una birra para la banda 🍺\.[\s\S]*?<\/p>/,
  );
});

/* ---------- lo que NO es ---------- */

test("4. no aparece 'Fair Play' en ningún lado", () => {
  assert.doesNotMatch(demo, /fair\s*play/i);
});

test("5. no aparece 'Birras para la banda: X' (contador agregado)", () => {
  assert.doesNotMatch(demo, /Birras para la banda\s*:/i);
});

test("11. el <section> estático no trae ningún <button>: 'Saldar birra' lo inyecta el JS", () => {
  const bloque = demo.slice(
    demo.indexOf('<section class="lista-morosos"'),
    demo.indexOf("</section>", demo.indexOf('<section class="lista-morosos"')),
  );
  assert.doesNotMatch(bloque, /<button/i);
});

/* ---------- botón "Saldar birra" (PR #19) ---------- */

test("11a. jugador con beers>0: renderListaMorosos agrega el botón 'Saldar birra'", () => {
  const { lista } = render(CARDS({ "Fran Forrester": { yellows: 0, reds: 1, beers: 1 } }));
  assert.match(lista.innerHTML, /<button type="button" class="lm-saldar" data-saldar-birra="Fran Forrester" aria-label="Saldar birra de Fran Forrester">Saldar birra<\/button>/);
});

test("11b. jugador con beers:0 (sólo amarilla): sin botón", () => {
  const { lista } = render(CARDS({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }));
  assert.doesNotMatch(lista.innerHTML, /lm-saldar|Saldar birra/);
});

test("11c. estado vacío: sin botón (la lista queda en blanco)", () => {
  const { lista } = render(CARDS({}));
  assert.equal(lista.innerHTML, "");
});

test("11d. el botón es type=button y su aria-label nombra al jugador", () => {
  const { lista } = render(CARDS({ "Ale": { yellows: 1, reds: 2, beers: 2 } }));
  const btn = lista.innerHTML.match(/<button[^>]*class="lm-saldar"[^>]*>/)[0];
  assert.match(btn, /type="button"/);
  assert.match(btn, /aria-label="Saldar birra de Ale"/);
});

test("11e. sólo los que deben birra tienen botón; el de sólo amarilla no", () => {
  const { lista } = render(CARDS({
    "Zoe Zapata": { yellows: 0, reds: 0, beers: 1 },
    "Ana Aguirre": { yellows: 1, reds: 0, beers: 0 },
  }));
  const botones = [...lista.innerHTML.matchAll(/data-saldar-birra="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(botones, ["Zoe Zapata"]);
});

test("11f. el nombre en data-* y aria-label va escapado", () => {
  const { lista } = render(CARDS({ 'Fran "Pipa" <b>': { yellows: 0, reds: 0, beers: 1 } }));
  assert.match(lista.innerHTML, /data-saldar-birra="Fran &quot;Pipa&quot; &lt;b&gt;"/);
  assert.doesNotMatch(lista.innerHTML, /data-saldar-birra="Fran "Pipa"/);
});

test("16. tras saldar la última birra y sin amarillas, el jugador deja de listarse", () => {
  const { lista, vacio } = render(CARDS({ "Fran Forrester": { yellows: 0, reds: 1, beers: 0 } }));
  assert.equal(vacio.hidden, false);
  assert.equal(lista.hidden, true);
});

test("17. tras saldar la birra pero con una amarilla pendiente, queda 🟨 sin botón", () => {
  const { lista } = render(CARDS({ "Fran Forrester": { yellows: 1, reds: 1, beers: 0 } }));
  assert.match(lista.innerHTML, /Fran Forrester<\/span><span class="lm-marks">🟨<\/span><\/li>/);
  assert.doesNotMatch(lista.innerHTML, /lm-saldar/);
});

/* ---------- render con datos ---------- */

test("6. jugador con yellows:1, beers:0 -> muestra 🟨 y no birra", () => {
  const { lista, vacio } = render(CARDS({ "Fran Forrester": { yellows: 1, reds: 0, beers: 0 } }));
  assert.equal(vacio.hidden, true);
  assert.equal(lista.hidden, false);
  assert.match(lista.innerHTML, /Fran Forrester<\/span><span class="lm-marks">🟨<\/span>/);
  assert.doesNotMatch(lista.innerHTML, /birra/);
});

test("7. jugador con beers:1 -> '🍺 debe 1 birra'", () => {
  const { lista } = render(CARDS({ "Fran Forrester": { yellows: 0, reds: 1, beers: 1 } }));
  assert.match(lista.innerHTML, /Fran Forrester<\/span><span class="lm-marks">🍺 debe 1 birra<\/span>/);
});

test("8. jugador con beers:2 -> '🍺 debe 2 birras' (plural)", () => {
  const { lista } = render(CARDS({ "Ale": { yellows: 0, reds: 2, beers: 2 } }));
  assert.match(lista.innerHTML, /🍺 debe 2 birras/);
});

test("9. jugador con beers y yellows -> muestra ambas cosas, birra primero", () => {
  const { lista } = render(CARDS({ "Fran Forrester": { yellows: 1, reds: 1, beers: 1 } }));
  assert.match(lista.innerHTML, /Fran Forrester<\/span><span class="lm-marks">🍺 debe 1 birra · 🟨<\/span>/);
});

test("10. jugador con yellows:0 y beers:0 no aparece en la lista", () => {
  const { lista, vacio } = render(CARDS({
    "Ale": { yellows: 0, reds: 3, beers: 0 },        // sólo reds -> no lista
    "Fran Forrester": { yellows: 1, reds: 0, beers: 0 },
  }));
  assert.equal(vacio.hidden, true);
  assert.doesNotMatch(lista.innerHTML, /Ale/);
  assert.match(lista.innerHTML, /Fran Forrester/);
});

test("10b. si TODOS tienen yellows:0 y beers:0 -> estado vacío", () => {
  const { lista, vacio } = render(CARDS({ "Ale": { yellows: 0, reds: 5, beers: 0 } }));
  assert.equal(vacio.hidden, false);
  assert.equal(lista.hidden, true);
});

/* ---------- orden ---------- */

test("orden: birras primero, después amarillas; alfabético dentro de cada grupo", () => {
  const { lista } = render(CARDS({
    "Pablo de Achaval": { yellows: 1, reds: 0, beers: 0 },
    "Nacho Duncan": { yellows: 1, reds: 0, beers: 0 },
    "Fran Forrester": { yellows: 0, reds: 1, beers: 1 },
    "Ale": { yellows: 1, reds: 1, beers: 2 },
  }));
  const orden = [...lista.innerHTML.matchAll(/class="lm-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(orden, ["Ale", "Fran Forrester", "Nacho Duncan", "Pablo de Achaval"]);
});

test("orden: el grupo manda sobre el alfabético (un 🍺 con nombre 'Z' va antes que un 🟨 'A')", () => {
  const { lista } = render(CARDS({
    "Ana Aguirre": { yellows: 1, reds: 0, beers: 0 },   // sólo amarilla, nombre temprano
    "Zoe Zapata": { yellows: 0, reds: 1, beers: 1 },    // debe birra, nombre tardío
  }));
  const orden = [...lista.innerHTML.matchAll(/class="lm-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(orden, ["Zoe Zapata", "Ana Aguirre"], "birras primero aunque alfabéticamente vayan después");
});

test("reds nunca se muestra: sin 🟥 ni 'roja' en el render", () => {
  const { lista } = render(CARDS({
    "Ale": { yellows: 1, reds: 4, beers: 1 },
    "Fran Forrester": { yellows: 0, reds: 9, beers: 3 },
  }));
  assert.doesNotMatch(lista.innerHTML, /🟥|roja|red/i);
  // reds no viaja en las filas que arma morososDeCards.
  assert.doesNotMatch(extractFunction(demo, "morososDeCards"), /reds/);
  assert.doesNotMatch(extractFunction(demo, "marcasDeMoroso"), /🟥|reds/);
});

/* ---------- read-only / sin efectos ---------- */

test("12+13. las funciones de render siguen puras; el único writer nuevo es saldarBirra", () => {
  for (const fn of ["morososDeCards", "marcasDeMoroso", "renderListaMorosos"]) {
    const src = extractFunction(demo, fn);
    // Sin nada que persista: sin el writer focalizado, sin saveState, sin el cálculo.
    assert.doesNotMatch(src, /persistFocalizado|saveState|computeCards|evaluarTarjetasSiCorresponde|supabase|\.upsert\(|normalizeCards/);
    // Sin asignaciones a cards / byPlayer / a los contadores (== y === no cuentan).
    assert.doesNotMatch(src, /\.cards\s*=(?!=)|byPlayer\[[^\]]+\]\s*=(?!=)|\.yellows\s*=(?!=)|\.beers\s*=(?!=)|\.reds\s*=(?!=)/);
  }
  // computeCards sigue con exactamente 1 caller (el writer de PR #17): definición + uso.
  assert.equal([...demo.matchAll(/computeCards\s*\(/g)].length, 2);
  // evaluarTarjetasSiCorresponde: definición + los 2 triggers de PR #17, sin cambios.
  assert.equal([...demo.matchAll(/evaluarTarjetasSiCorresponde\(\)/g)].length, 3);
  assert.match(extractFunction(demo, "init"), /evaluarTarjetasSiCorresponde\(\);/);
  assert.match(extractFunction(demo, "refreshFromServer"), /evaluarTarjetasSiCorresponde\(\);/);
  // El writer no adquiere dependencia de la UI nueva.
  assert.doesNotMatch(extractFunction(demo, "evaluarTarjetasSiCorresponde"), /lista-morosos|renderListaMorosos|morososDeCards/);
  // saldarBirra es el único writer nuevo: baja beers vía persistFocalizado y NO llama a
  // computeCards ni al writer automático.
  const saldar = extractFunction(demo, "saldarBirra");
  assert.match(saldar, /persistFocalizado/);
  assert.match(saldar, /rec\.beers = Math\.max\(0, beers - 1\)/);
  assert.doesNotMatch(saldar, /computeCards|evaluarTarjetasSiCorresponde|\.yellows\s*=(?!=)|\.reds\s*=(?!=)|\.responses\s*=(?!=)|\.paid\s*=(?!=)/);
  // Ningún otro persistFocalizado nuevo: el saldado no toca a computeCards ni al auto-eval.
  assert.doesNotMatch(extractFunction(demo, "computeCards"), /saldarBirra/);
});

test("13b. render() llama a renderListaMorosos después de renderFaltaConfirmar", () => {
  assert.match(demo, /renderFaltaConfirmar\(\);\s*renderListaMorosos\(\);/);
});

test("morososDeCards no muta el objeto cards que recibe", () => {
  const byPlayer = { "Ale": { yellows: 1, reds: 0, beers: 0 } };
  const snap = JSON.stringify(byPlayer);
  render(CARDS(byPlayer));
  assert.equal(JSON.stringify(byPlayer), snap);
});

/* ---------- layout / mobile ---------- */

test("14. CSS: el módulo es compacto y el nombre puede envolver (sin scroll horizontal)", () => {
  // El item es flex con wrap y el nombre encoge (min-width:0 / overflow-wrap).
  assert.match(demo, /\.lista-morosos-item\{[^}]*flex-wrap:wrap[^}]*\}/);
  assert.match(demo, /\.lista-morosos-item \.lm-name\{[^}]*min-width:0[^}]*overflow-wrap:anywhere[^}]*\}/);
  // La lista no fuerza ancho: es un grid simple sin min-content ni nowrap en el contenedor.
  assert.match(demo, /\.lista-morosos-list\{[^}]*list-style:none[^}]*\}/);
  // El módulo tiene el mismo margen inferior compacto que "Falta confirmar".
  assert.match(demo, /\.lista-morosos\{[^}]*margin:0 0 16px[^}]*\}/);
});

test("23. CSS: el botón 'Saldar birra' no fuerza ancho (320/375px sin scroll horizontal)", () => {
  // El botón no encoge el texto pero el item envuelve (flex-wrap): a 320px el botón baja
  // de línea en vez de desbordar. Y el nombre largo sigue partiéndose.
  assert.match(demo, /\.lista-morosos-item \.lm-saldar\{[^}]*white-space:nowrap[^}]*\}/);
  assert.match(demo, /\.lista-morosos-item \.lm-saldar\{[^}]*flex:0 0 auto[^}]*\}/);
  assert.match(demo, /\.lista-morosos-item\{[^}]*flex-wrap:wrap[^}]*\}/);
  // Estado deshabilitado mientras persiste.
  assert.match(demo, /\.lista-morosos-item \.lm-saldar:disabled\{[^}]*\}/);
});

test("ubicación: el módulo va DEBAJO del bloque de equipos (jerarquía: jugador -> partido -> equipos -> morosos)", () => {
  const posTeams = demo.indexOf('<div class="section teams-section">');
  const posTeamsEnd = demo.indexOf('Los equipos se asignan desde la vista Organizador');
  const posMoros = demo.indexOf('id="lista-morosos-block"');
  const posTicket = demo.indexOf('<div class="ticket">');
  const posFalta = demo.indexOf('id="falta-confirmar-block"');
  const posTabHist = demo.indexOf('<div id="tab-historial"');
  const posUserView = demo.indexOf('<div id="main-view-user">');
  const posOrgView = demo.indexOf('<div class="organizer-view"');

  assert.ok(posTeams > -1 && posMoros > -1, "existen ambas secciones");
  // Después de todo el bloque de equipos (Equipo Negro vs Equipo Blanco).
  assert.ok(posMoros > posTeamsEnd, "el módulo va después de la sección de equipos");
  // Y ya NO entre 'Falta confirmar' y el ticket.
  assert.ok(posMoros > posTicket, "el módulo ya no está pegado a 'Falta confirmar' / el ticket");
  assert.ok(posFalta < posTicket && posTicket < posTeams, "orden previo intacto: Falta confirmar -> ticket -> equipos");
  // Sigue dentro de la vista de usuario, en la pestaña Partido (antes del Historial).
  assert.ok(posUserView < posMoros && posMoros < posTabHist && posMoros < posOrgView, "vive en la vista de usuario / pestaña Partido");
});

test("'Falta confirmar' quedó pegado al ticket otra vez (sin el módulo en el medio)", () => {
  assert.match(demo, /id="falta-confirmar-copy"[^>]*>Copiar para WhatsApp<\/button>\s*<\/section>\s*<div class="ticket">/);
});

test("orden visual completo: equipos -> Lista de morosos -> cierre de la pestaña Partido", () => {
  assert.match(
    demo,
    /<div class="section teams-section">[\s\S]*?<\/div>\s*<section class="lista-morosos" id="lista-morosos-block"[\s\S]*?<\/section>\s*<\/div>\s*<div id="tab-historial"/,
  );
});

test("no toca Mi estado, pagos, invitados, selector ni el organizador", () => {
  // El diff de PR #18 no menciona esas zonas: chequeo por función.
  for (const fn of ["renderIdentityHeader", "renderLocalOrganizer", "marcarMiPago", "renderGuestManager", "deriveSelectorNames"]) {
    assert.doesNotMatch(extractFunction(demo, fn), /lista-morosos|morososDeCards|renderListaMorosos/);
  }
});
