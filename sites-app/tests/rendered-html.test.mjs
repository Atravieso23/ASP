import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the ASP demo shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /ASP · Picado del sábado/i);
  assert.match(html, /src="\/demo\.html"/i);
});

test("connects the hosted app to Supabase using anonymous authentication", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /const DEMO_MODE = false/);
  assert.match(demo, /https:\/\/[a-z0-9-]+\.supabase\.co/i);
  assert.match(demo, /sb_publishable_[a-zA-Z0-9_-]+/);
  assert.match(demo, /auth\.signInAnonymously\(\)/);
  assert.doesNotMatch(demo, /sb_secret_|service_role/i);
});

test("reflects locally saved availability in the player lists", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /function syncLocalAvailabilityWithPlayers\(\)/);
  assert.match(demo, /playerStatus = response\.status/);
  assert.match(demo, /syncLocalAvailabilityWithPlayers\(\);\s*render\(\);\s*renderLocalOrganizer\(\);/);
  assert.match(demo, /restoreCurrentLocalResponse\(\);/);
});

test("shows editable formations only in the organizer view", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const userStart = demo.indexOf('id="main-view-user"');
  const organizerStart = demo.indexOf('id="main-view-organizer"');

  assert.ok(userStart >= 0 && organizerStart > userStart);
  assert.doesNotMatch(demo.slice(userStart, organizerStart), /id="pitch-(negro|blanco)"/);
  assert.match(demo.slice(organizerStart), /id="team-formations-title"[\s\S]*id="pitch-negro"[\s\S]*id="pitch-blanco"/);
  assert.match(demo, /const LOCAL_FORMATIONS_KEY = 'asp_formations_demo_v1'/);
  assert.match(demo, /autoAssignPositions\(teamPlayers, state\.formations\[team\]\)/);
  assert.doesNotMatch(demo, /reset-negro-btn|reset-blanco-btn|Reordenar según formación/);
  assert.doesNotMatch(demo, /view-formacion-btn|teams-view-formacion/);
});

test("assigns confirmed players to teams from the organizer responses", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.doesNotMatch(demo, /team-square|teamLetter/);
  assert.match(demo, /data-team-choice="negro"/);
  assert.match(demo, /data-team-choice="blanco"/);
  assert.match(demo, /player\.team = player\.team===selectedTeam \? null : selectedTeam/);
  assert.match(demo, /positions,\s*assignments/);
});

test("places new formation players in unoccupied positions", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /function pitchDistance\(a, b\)/);
  assert.match(demo, /function findOpenPitchPosition\(occupied\)/);
  assert.match(demo, /function findOpenSidelinePosition\(occupied, minimumDistance\)/);
  assert.match(demo, /occupied\.some\(other=>pitchDistance\(position, other\)<minimumDistance\)/);
  assert.match(demo, /slots\.find\(slot=>occupied\.every\(position=>pitchDistance\(slot, position\)>=minimumDistance\)\)/);
  assert.match(demo, /const starterSet = new Set\(rankedPlayers\.slice\(0,slots\.length\)/);
  assert.match(demo, /const extras = teamPlayers\.filter\(player=>!starterSet\.has\(player\)\)/);
  assert.match(demo, /player\.isFormationExtra = !starterSet\.has\(player\)/);
  assert.match(demo, /findOpenSidelinePosition\(occupied,extraMinimumDistance\)/);
  assert.match(demo, /p\.isFormationExtra \? ' extra' : ''/);
  assert.match(demo, /\.field-chip\.extra\{/);
});

test("moves a tapped formation chip to the other visible pitch", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /function switchPlayerTeamFromPitch\(name\)/);
  assert.match(demo, /player\.team = player\.team==='negro' \? 'blanco' : 'negro'/);
  assert.match(demo, /player\.pos = null/);
  assert.match(demo, /response\.team = player\.team/);
  assert.match(demo, /const pressedAt = performance\.now\(\)/);
  assert.match(demo, /const wasQuickClick = performance\.now\(\)-pressedAt <= 300/);
  assert.match(demo, /if\(wasQuickClick\) await switchPlayerTeamFromPitch\(name\)/);
  assert.match(demo, /chip\.setAttribute\('aria-label',`\$\{p\.name\}: pasar a/);
});

test("uses responses as the source for summaries and formations", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /const inList = getResponsePlayers\('in'\)/);
  assert.match(demo, /renderFormationView\(getResponsePlayers\('in'\)\)/);
  assert.match(demo, /id="count-in"[\s\S]*id="count-duda"[\s\S]*id="count-out"/);
});

test("offers En duda as a third availability state without counting it as confirmed", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /data-value="duda" aria-pressed="false">En duda</);
  assert.match(demo, /const dudaList = getResponsePlayers\('duda'\)/);

  // Un dudoso no ocupa lugar en el equipo ni figura como que pago.
  assert.match(demo, /team:mockAvailability==='in' \? /);
  assert.match(demo, /paid:mockAvailability==='in' \? /);
  assert.match(demo, /player\.paid = response\.status === 'in' && response\.paid === true/);

  // Pero si conserva su franja horaria: solo "No estoy" la descarta.
  assert.match(demo, /from:mockAvailability==='out' \? '' : from/);
});

test("clears local responses and keeps date actions in organizer", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const userStart = demo.indexOf('id="main-view-user"');
  const organizerStart = demo.indexOf('id="main-view-organizer"');

  assert.doesNotMatch(demo.slice(userStart, organizerStart), /id="finalize-btn"|id="clear-btn"/);
  assert.match(demo.slice(organizerStart), /id="finalize-btn"[\s\S]*id="clear-btn"/);
  assert.match(demo, /localStorage\.removeItem\(LOCAL_AVAILABILITY_KEY\)/);
  assert.match(demo, /localStorage\.removeItem\(LOCAL_FORMATIONS_KEY\)/);
  assert.match(demo, /clearLocalOrganizerState\(\);\s*state\.players = \[\]/);
  const clearHandler = demo.slice(demo.indexOf("document.getElementById('c-confirm').onclick"), demo.indexOf('/* ---------- ALIAS Y MAPA ---------- */'));
  assert.match(clearHandler, /state\.responses = \[\]/);
  assert.match(clearHandler, /await saveState\(state\)/);
  assert.doesNotMatch(clearHandler, /state\.matchInfo = blankMatchInfo\(\)/);
  assert.match(demo, /conserva los datos del partido y la cancha/);
});

test("remembers frequent payment aliases without clearing match information", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /list="frequent-aliases"/);
  assert.match(demo, /frequentAliases: \[\]/);
  assert.match(demo, /state\.frequentAliases\.unshift\(nextAlias\)/);
  assert.match(demo, /state\.frequentAliases = state\.frequentAliases\.slice\(0, 10\)/);
});

test("keeps player state derived from universal responses without reseeding demo profiles", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /players: \[\]/);
  assert.match(demo, /responses: \[\]/);
  assert.match(demo, /state\.responses = localAvailabilityResponses/);
  assert.match(demo, /asp_availability_local_backup_v1/);
  assert.doesNotMatch(demo, /localAvailabilityResponses\.length >= 18/);
  assert.match(demo, /state\.players = state\.players\.filter\(player=>responseNames\.has/);
  assert.match(demo, /response\.team = player\.team/);
});

test("puts the unpaid list below the payment controls", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const statusCard = demo.indexOf('id="my-status-card"');
  const paymentControls = demo.indexOf('class="my-status-payment"', statusCard);
  const shame = demo.indexOf('id="faltan-pagar"');
  const statusCardEnd = demo.indexOf('</section>', statusCard);
  const ticket = demo.indexOf('class="ticket"');

  assert.ok(statusCard >= 0 && paymentControls > statusCard && shame > paymentControls && statusCardEnd > shame && ticket > statusCardEnd);
  const teamsSection = demo.indexOf('class="section teams-section"');
  assert.ok(teamsSection > ticket);
  const ticketMarkup = demo.slice(ticket, teamsSection);
  assert.match(ticketMarkup, /class="ticket-heading-row"[\s\S]*id="team-name"[\s\S]*id="sb-type"/);
  assert.match(ticketMarkup, /class="money-summary"[\s\S]*id="paid-count"[\s\S]*id="total-collected"[\s\S]*id="edit-match-btn"/);
  assert.doesNotMatch(demo, /class="cash-section"/);
  assert.doesNotMatch(demo, /class="sb-label">Fútbol</);
});

test("centers key summaries and fits organizer responses without a scroll bar", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.doesNotMatch(demo, /class="section-title">Equipos/);
  assert.match(demo, /\.organizer-table-wrap\{overflow:visible;\}/);
  assert.match(demo, /table-layout:fixed;min-width:0/);
  assert.doesNotMatch(demo, /\.organizer-table-wrap\{overflow-x:auto;\}/);
  assert.match(demo, /\.organizer-card-title\{[^}]*text-align:center/);
  assert.doesNotMatch(demo, /\.faltan-pagar\{[^}]*border-left/);
});

test("keeps player responses collapsible in the organizer page", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /id="player-responses-title">Respuestas de jugadores<\/h2>[\s\S]*class="organizer-status-summary"/);
  assert.match(demo, /<details class="organizer-player-list-details">[\s\S]*<summary class="organizer-responses-summary">/);
  assert.match(demo, /<span>Listado de jugadores<\/span>/);
  assert.match(demo, /id="organizer-responses-count"/);
  assert.match(demo, /id="organizer-response-search"/);
  assert.match(demo, /visibleResponses = localAvailabilityResponses\.filter/);
  assert.match(demo, /organizerPlayerListDetails\.open = true/);
  assert.match(demo, /organizer-responses-count'\)\.textContent = localAvailabilityResponses\.length/);
  assert.doesNotMatch(demo, /organizer-mode-switch|organizer-panel-responses/);
});

test("reflows the ticket header on narrow screens", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /ticket-heading-row\{[\s\S]*flex-wrap:wrap/);
  assert.match(demo, /ticket-heading-row \.eyebrow\{[\s\S]*white-space:nowrap/);
  assert.match(demo, /ticket-type-badge\{[\s\S]*flex-shrink:0/);
});

test("rebuilds formations for every field type change", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  for(const type of ['F5','F7','F8','F9','F11']) assert.match(demo, new RegExp(`${type}: \\[`));
  assert.match(demo, /const previousFieldType = state\.matchInfo\.type/);
  assert.match(demo, /if\(previousFieldType!==nextFieldType\)\{[\s\S]*state\.formations = \{\}[\s\S]*player\.pos = null[\s\S]*ensureFormationDefaults\(\)/);
});

test("supports recurrent players and first-time registration", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /LOCAL_RECURRENT_PLAYERS_KEY/);
  assert.match(demo, /id="first-time-player-btn">Registrarme/);
  assert.match(demo, /id="recurrent-player-menu" role="listbox"/);
  assert.match(demo, /function renderRecurrentPlayerMenu\(\)/);
  assert.match(demo, /data-delete-recurrent-index/);
  assert.match(demo, /function setFirstTimeRegistration\(active,preserveValue=false\)/);
  assert.match(demo, /setFirstTimeRegistration\(!registeringFirstTime,true\)/);
  assert.match(demo, /Si no aparecés, tocá “Registrarme”/);
  assert.doesNotMatch(demo, />Primera vez<|tocá “Primera vez”/);
  assert.match(demo, /addRecurrentPlayer\(playerName\)/);
});

test("waits for Supabase before confirming registration and rejects remote duplicates", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /async function savePlayerRegistration\(response\)/);
  assert.match(demo, /const fresh = await fetchServerState\(\)/);
  assert.match(demo, /!responseBelongsToCurrentDevice\(item\)/);
  assert.match(demo, /document\.getElementById\('my-status-confirm'\)\.onclick = async/);
  assert.match(demo, /confirmButton\.textContent = 'Guardando…'/);
  assert.match(demo, /Respuesta guardada y sincronizada/);
  assert.match(demo, /No se pudo guardar en Supabase/);
  assert.match(demo, /id="player-name-feedback" role="alert" aria-live="assertive"/);
  assert.match(demo, /function showDuplicateNameFeedback\(name\)/);
  assert.match(demo, /'Nombre ya tomado\.'/);
  assert.match(demo, /agregá tu apellido o apodo para diferenciarte/);
  assert.doesNotMatch(demo, /“\$\{name\} A\.”|“\$\{name\} Chaval”/);
  assert.match(demo, /Modo registro activado/);
  assert.match(demo, /showPlayerNameFeedback\('error','No pudimos guardar tu respuesta/);
});

test("lets a trusted player reuse an existing profile on another device", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /<h2>Ya estoy registrado<\/h2>/);
  assert.match(demo, /Sí, usar este jugador/);
  assert.match(demo, /¿Sos \$\{selectedResponse\.name\}\?/);
  assert.match(demo, /function responseBelongsToCurrentDevice\(response\)/);
  assert.match(demo, /response\.ownerIds\|\|\[\]/);
  assert.match(demo, /addCurrentDeviceToResponse\(target\)/);
  assert.match(demo, /restoreCurrentLocalResponse\(\)/);
  assert.match(demo, /quedó vinculado a este dispositivo/);
});

test("manages per-date guests from the collapsed player status", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /¿A tu invitado le dio paja registrarse\?/);
  assert.match(demo, /Gestioná su asistencia y pago desde acá\./);
  assert.match(demo, /id="guest-manager-toggle"[^>]*>Gestionar invitados/);
  assert.match(demo, /manager\.hidden \? 'Gestionar invitados' : 'Cerrar gestión'/);
  assert.match(demo, /id="guest-manager"[^>]*hidden/);
  assert.match(demo, /function getCurrentPlayerGuests\(\)/);
  assert.match(demo, /item\.isGuest === true/);
  assert.match(demo, /invitedBy:owner\.name/);
  assert.match(demo, /class="guest-paid-check/);
  assert.match(demo, /data-guest-paid="\$\{guest\.responseId\}"/);
  assert.match(demo, /data-remove-guest/);
  assert.doesNotMatch(demo, /data-guest-status=/);
  assert.doesNotMatch(demo, /<details class="guest-item">/);
  assert.match(demo, /Invitado de \$\{escapeHtml\(item\.invitedBy/);
  assert.match(demo, /localStorage\.removeItem\(LOCAL_AVAILABILITY_KEY\)/);
});

test("keeps the user team summary compact", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /\.split\{display:grid; grid-template-columns:1fr; gap:8px;\}/);
  assert.match(demo, /\.split-col ul\{[^}]*flex-wrap:wrap;[^}]*justify-content:center/);
  assert.match(demo, /\.split-col\{[^}]*padding:10px 12px[^}]*border-radius:10px/);
  assert.match(demo, /class="teams-vs"[^>]*>VS<\/div>/);
  assert.doesNotMatch(demo, /@media\(min-width:680px\)\{\.organizer-formations\{grid-template-columns:1fr 1fr;/);
});

test("collapses my status into a mobile-first quick summary with reversible payment", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /function updateMyStatusSummary\(response\)/);
  assert.match(demo, /`\$\{response\.name\} · \$\{availability\}/);
  assert.match(demo, /class="my-status-summary-title">Mi estado/);
  assert.match(demo, /class="my-status-paid"/);
  assert.match(demo, /response\.paid = button\.dataset\.value === 'yes'/);
  assert.match(demo, /mockStatusCard\.classList\.toggle\('collapsed'\)/);
  assert.match(demo, /id="change-player-btn"[^>]*>¿Te equivocaste al registrarte\? Cambiar jugador/);
  assert.match(demo, /function setRegisteredPlayerNameMode\(allowChange=false\)/);
  assert.match(demo, /input\.readOnly = Boolean\(ownResponse && !changingRegisteredPlayer\)/);
  assert.match(demo, /Estás editando la respuesta de \$\{ownResponse\.name\}/);
  assert.match(demo, /Cambio de jugador activado/);
  assert.match(demo, /input\.select\(\)/);
});

test("defaults to F8 and assigns every confirmed player to a balanced team", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /type:'F8'/);
  assert.match(demo, /function chooseBalancedTeam\(excludeName=''\)/);
  assert.match(demo, /counts\.negro <= counts\.blanco \? 'negro' : 'blanco'/);
  assert.match(demo, /existingResponse\?\.team \|\| chooseBalancedTeam\(playerName\)/);
  assert.match(demo, /team:chooseBalancedTeam\(guestName\)/);
});

test("shows how many are confirmed against the field target in the ticket", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const ticket = demo.indexOf('class="ticket"');
  const teamsSection = demo.indexOf('class="section teams-section"');
  const ticketMarkup = demo.slice(ticket, teamsSection);

  // Jerarquía en la vista Jugador: mi estado, después día/hora/cancha, después el
  // estado colectivo, y al final la plata. El conteo tiene banda propia y no
  // vuelve a mezclarse con los pagos, pero no se pone antes de la hora: en
  // 375x667 la hora tiene que seguir viéndose sin scrollear.
  const squadStatus = ticketMarkup.indexOf('class="squad-status"');
  const scoreboard = ticketMarkup.indexOf('class="scoreboard"');
  const moneySummary = ticketMarkup.indexOf('class="money-summary"');
  assert.ok(squadStatus > -1, 'falta el bloque .squad-status dentro del ticket');
  assert.ok(scoreboard < squadStatus, '.squad-status va después del scoreboard');
  assert.ok(squadStatus < moneySummary, '.squad-status va antes del bloque de plata');
  assert.doesNotMatch(ticketMarkup, /class="cash-metric">Confirmados/);

  // "Apuntamos a 16" es secundario, en sentence case: no es un rótulo de sistema.
  // El \s* evita que el guard se evada escribiendo "selector {" con espacio.
  assert.doesNotMatch(demo, /\.squad-status-target\s*\{[^}]*text-transform:uppercase/);

  assert.match(ticketMarkup, /class="squad-status-line" id="capacity-note"><b id="confirmed-count">0<\/b> confirmados/);
  assert.match(ticketMarkup, /class="squad-status-target" id="capacity-target"/);
  assert.match(demo, /\.money-summary\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\) auto/);
  assert.match(demo, /getElementById\('confirmed-count'\)\.textContent = inList\.length/);

  // "de 16" se leía como denominador de un cupo, sobre todo al lado de
  // "Pagaron 8 de 13". "Apuntamos a" declara una meta y no un techo, y es el
  // mismo vocabulario que ya usaba el title de capacity-note.
  assert.match(demo, /getElementById\('capacity-target'\)\.textContent = mi\.type \? `Apuntamos a \$\{cap\}` : ''/);
  assert.doesNotMatch(demo, /textContent = mi\.type \? ` de \$\{cap\}`/);

  // El cupo es una referencia, no un límite: no se corta el anotado ni se
  // arma lista de espera, así que el cartel no debe prometerlo.
  assert.doesNotMatch(demo, /lista de espera|Cupo lleno|queda en lista/);
  assert.doesNotMatch(demo, /status = 'espera'/);
});

test("brings the doubtful count to the player home reusing the organizer list", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const ticket = demo.indexOf('class="ticket"');
  const teamsSection = demo.indexOf('class="section teams-section"');
  const ticketMarkup = demo.slice(ticket, teamsSection);

  // El viernes concentra las bajas: el jugador tiene que ver los dudosos sin
  // entrar a la vista Organizador.
  assert.match(ticketMarkup, /id="doubt-note" hidden> · <b id="doubt-count">0<\/b> en duda/);
  assert.match(demo, /getElementById\('doubt-count'\)\.textContent = dudaList\.length/);

  // Sin dudosos la línea queda "13 confirmados", sin un " · " colgando.
  assert.match(demo, /getElementById\('doubt-note'\)\.hidden = dudaList\.length === 0/);

  // hidden deja de funcionar si el CSS le asigna display al span, sea por la clase
  // o por el id. El \s* evita que el guard se evada escribiendo "selector {".
  for(const selector of ['\\.squad-doubt', '#doubt-note']){
    assert.doesNotMatch(demo, new RegExp(`${selector}\\s*\\{[^}]*display:`));
  }

  // Un solo cálculo para las dos vistas: el mismo dudaList alimenta la home
  // y el contador del organizador. El || [] hace que, si el patrón deja de
  // matchear, el test falle con este número y no con un TypeError.
  assert.equal((demo.match(/getResponsePlayers\('duda'\)/g) || []).length, 1);
  assert.match(demo, /getElementById\('count-duda'\)\.textContent = dudaList\.length/);
});

test("drops the legacy join section and the unused group roster", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.doesNotMatch(demo, /legacy-join-section|id="name-select"|new-player-wrap/);
  assert.doesNotMatch(demo, /manage-roster-overlay|manage-roster-btn|roster-manage-list|add-roster-btn/);
  assert.doesNotMatch(demo, /state\.roster|mergeRosterArr|knownRosterNames|renderNameSelect/);
  assert.doesNotMatch(demo, /Gestionar plantel del grupo/);
  // El registro se apoya en los jugadores recurrentes derivados de las respuestas.
  assert.match(demo, /recurrentPlayers = \[\.\.\.new Set\(localAvailabilityResponses/);
  // El campo huérfano se descarta al leer para que el próximo guardado lo saque del JSON.
  assert.match(demo, /delete parsed\.roster;/);
});

test("removes the list renderers that had no elements left in the DOM", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.doesNotMatch(demo, /renderConfirmedList|renderSimpleList|attachListEvents/);
  assert.doesNotMatch(demo, /id="list-in"|id="list-out"|getElementById\('list-'\+v\)/);
  assert.doesNotMatch(demo, /setStatusView|status-switch-btn|activeStatusView/);
  // El modal de pago sólo lo abría attachListEvents; se va con él.
  assert.doesNotMatch(demo, /pay-confirm-overlay|pay-confirm-ok|pay-confirm-cancel/);
  // Los pagos siguen manejándose desde "Mi estado" y desde los invitados.
  assert.match(demo, /class="my-status-paid"/);
  assert.match(demo, /data-guest-paid="\$\{guest\.responseId\}"/);
});

// Aísla el cuerpo del handler de "Deshacer esta finalización" y lo parte en sus
// tres tramos. Sin aislarlo, las aserciones matchean cualquier parte del archivo:
// refreshFromServer() tiene la misma secuencia de llamadas y hacía pasar el test
// aunque el handler estuviera vacío. Y sin partirlo por rama, una aserción de
// presencia pasa igual si la llamada se borra del camino de éxito pero sigue en
// el rollback, porque las dos ramas usan las mismas funciones.
function extractUndoHandler(demo){
  const start = demo.indexOf('undoBtn.onclick = async ()=>{');
  assert.ok(start > -1, 'no ubiqué el handler de deshacer');
  const end = demo.indexOf("showToast('Se deshizo la última finalización.');", start);
  assert.ok(end > start, 'no ubiqué el final del handler de deshacer');
  const undo = demo.slice(start, end);

  const branch = undo.indexOf('if(!ok){');
  assert.ok(branch > -1, 'el handler no comprueba el resultado del guardado');
  const afterBranch = undo.indexOf('return;', branch);
  assert.ok(afterBranch > branch, 'la rama de error no corta la ejecución');

  return {
    todo: undo,
    previo: undo.slice(0, branch),        // snapshot, restore y guardado
    rollback: undo.slice(branch, afterBranch),
    exito: undo.slice(afterBranch)        // lo que corre solo si guardó bien
  };
}

test("undoing a finalization restores the responses, not just the players", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const undo = extractUndoHandler(demo);

  // El snapshot del historial tiene que guardar las respuestas. Guardar sólo
  // players no alcanza: no llevan responseId, ownerId, ownerIds, from, to,
  // isGuest ni invitedBy, así que las respuestas no se pueden reconstruir.
  assert.match(demo, /state\.history\.push\(\{[\s\S]{0,400}?responses:/);

  // Y el undo tiene que reponerlas en memoria: render() y
  // syncLocalAvailabilityWithPlayers() derivan todo de localAvailabilityResponses,
  // así que restaurar state.players solo deja la fecha invisible, y el sondeo de
  // 4s después borra esos players por no tener respuesta que los respalde.
  assert.match(undo.previo, /localAvailabilityResponses = last\.responses/);
  assert.match(undo.previo, /responses: localAvailabilityResponses/);
  assert.match(undo.previo, /players: last\.players/);

  // La entrada se saca por finalizedAt y no por posición: si otro dispositivo
  // finalizó mientras mirábamos el historial, slice(0,-1) borraría la suya.
  assert.match(undo.previo, /history: fresh\.history\.filter\(item=>item\.finalizedAt !== last\.finalizedAt\)/);
  assert.doesNotMatch(undo.todo, /state\.history\.slice\(0, -1\)/);

  // finalize también limpia las formaciones elegidas (clearLocalOrganizerState
  // hace state.formations = {}), así que el snapshot las guarda y el undo las
  // devuelve. Sin esto volvían al default del tipo de cancha.
  assert.match(demo, /state\.history\.push\(\{[\s\S]{0,600}?formations:/);
  assert.match(undo.previo, /formations: \{\.\.\.last\.formations\}/);

  // El undo restauraba matchInfo campo por campo y sólo date y time, así que
  // cancha, tipo, precio y alias se perdían. Se restaura completo, y el spread
  // deja pasar campos que el snapshot no tenga.
  assert.doesNotMatch(undo.todo, /state\.matchInfo\.date = last\.matchInfo\.date/);
  assert.match(undo.previo, /matchInfo: \{\.\.\.fresh\.matchInfo, \.\.\.last\.matchInfo\}/);

  // Restaurar respuestas sin sincronizar deja a los players fuera de la vista, y
  // sin renderLocalOrganizer la tabla del organizador queda vacía. Se comprueba
  // sobre el tramo de éxito: el rollback llama a las mismas funciones, así que
  // mirar el handler completo no distinguiría una rama de la otra.
  assert.match(undo.exito, /syncLocalAvailabilityWithPlayers\(\);/);
  assert.match(undo.exito, /render\(\);/);
  assert.match(undo.exito, /renderLocalOrganizer\(\);/);
});

test("undoing a finalization rolls back and warns when saving fails", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const undo = extractUndoHandler(demo);

  // Mismo patrón que el borrado de jugadores e invitados: snapshot previo,
  // esperar el guardado, revertir y avisar si falló. persist() no sirve acá
  // porque no devuelve si el guardado funcionó, y sin eso el cartel de éxito
  // salía igual y el sondeo revertía todo a los 4 segundos.
  assert.match(undo.previo, /const previousState = state;/);
  assert.match(undo.previo, /const previousResponses = localAvailabilityResponses;/);
  assert.match(undo.previo, /const ok = await saveLocalAvailability\(\);/);
  assert.doesNotMatch(undo.todo, /await persist\(\)/);

  // El estado viejo no se muta: se reemplaza por uno nuevo, así que devolver la
  // referencia revierte todo de una, incluidas las formaciones.
  assert.match(undo.rollback, /state = previousState;/);
  assert.match(undo.rollback, /localAvailabilityResponses = previousResponses;/);
  assert.match(undo.rollback, /syncLocalAvailabilityWithPlayers\(\);/);
  assert.match(undo.rollback, /render\(\);/);

  // Y avisar del error en vez de cantar éxito.
  assert.match(undo.rollback, /No se pudo deshacer la finalización/);
  assert.doesNotMatch(undo.rollback, /Se deshizo la última finalización/);
});

test("undoing a finalization keeps unrelated remote fields from the server", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const undo = extractUndoHandler(demo);

  // El undo sólo tiene autoridad sobre el partido que archivó. Se parte del estado
  // fresco del servidor y se le superponen esos campos, así que sedes, alias
  // frecuentes y cualquier otro top-level conservan el valor remoto en vez de que
  // los pise la copia local vieja.
  assert.match(undo.previo, /const fresh = await fetchServerState\(\);/);
  assert.match(undo.previo, /state = \{\s*\.\.\.fresh,/);

  // Los cinco campos que el undo restaura, y nada más.
  for(const campo of ['responses', 'players', 'matchInfo', 'history', 'formations']){
    assert.match(undo.previo, new RegExp(`\\n\\s*${campo}: `), `falta superponer ${campo}`);
  }
  assert.doesNotMatch(undo.previo, /\n\s*sedes: /);
  assert.doesNotMatch(undo.previo, /\n\s*frequentAliases: /);

  // Si no se puede leer el servidor, falla cerrado: ni éxito ni estado a medias.
  // El guard va ANTES de tocar el estado local.
  const guard = undo.previo.indexOf('if(!fresh){');
  const mutacion = undo.previo.indexOf('localAvailabilityResponses = last.responses');
  assert.ok(guard > -1, 'el undo no comprueba que pudo leer el servidor');
  assert.ok(guard < mutacion, 'el guard del fetch tiene que ir antes de tocar el estado local');
  assert.match(undo.previo.slice(guard), /No se pudo deshacer la finalización/);
});

test("undoing a finalization aborts when the server history moved on", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const undo = extractUndoHandler(demo);

  // El botón se dibuja con el historial local, y el sondeo se saltea por completo
  // mientras el foco está dentro de .history-details, que es donde viven los inputs
  // de resultado y goleadores. Así que el estado local puede quedar viejo y ofrecer
  // deshacer una fecha que en el servidor ya no es la última.
  assert.match(undo.previo, /const ultimaFresca = fresh\.history\[fresh\.history\.length-1\];/);
  assert.match(undo.previo, /if\(!ultimaFresca \|\| ultimaFresca\.finalizedAt !== last\.finalizedAt\)\{/);

  // Se aborta con un aviso propio, distinto del de conexión, y sin elegir por el
  // usuario qué fecha habría que deshacer.
  assert.match(undo.previo, /El historial cambió/);

  // Después del fetch y antes de tocar el estado local: si aborta, no se modifica
  // nada ni se escribe.
  const fetchIdx = undo.previo.indexOf('const fresh = await fetchServerState();');
  const guardIdx = undo.previo.indexOf('if(!ultimaFresca ||');
  const mutacionIdx = undo.previo.indexOf('localAvailabilityResponses = last.responses');
  assert.ok(fetchIdx > -1 && guardIdx > -1 && mutacionIdx > -1, 'falta alguna de las tres piezas');
  assert.ok(fetchIdx < guardIdx, 'la revalidación necesita el estado fresco');
  assert.ok(guardIdx < mutacionIdx, 'la revalidación va antes de tocar el estado local');
});

test("only offers undo when the snapshot carries its responses", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  // Falla cerrado: una fecha finalizada antes de este arreglo no tiene responses
  // en su snapshot, así que no se ofrece deshacerla. Perder el undo de una fecha
  // vieja es preferible a una restauración silenciosamente incompleta, que dejaría
  // ownership, franjas horarias e invitados perdidos o incorrectos.
  assert.match(demo, /isLatest && Array\.isArray\(h\.responses\) \?/);
  assert.match(demo, /id="undo-finalize-btn"/);

  // Sin reconstrucción ni migración de snapshots viejos: nadie debe fabricar
  // responses a partir de los players guardados.
  assert.doesNotMatch(demo, /last\.players[\s\S]{0,200}?responseId/);
  assert.doesNotMatch(demo, /h\.players[\s\S]{0,200}?responseId/);
});

// Aísla un tramo de código por marcadores. Sin esto las aserciones matchean
// cualquier parte del archivo: varias funciones comparten las mismas secuencias de
// llamadas y hacen pasar tests que no verifican nada.
function sliceBetween(demo, startMarker, endMarker, label){
  const start = demo.indexOf(startMarker);
  assert.ok(start > -1, `no ubiqué ${label}`);
  const end = demo.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `no ubiqué el final de ${label}`);
  return demo.slice(start, end);
}

const HISTORY_INPUTS = [
  ['precio de una fecha archivada', ".edit-price-input').forEach(inp=>{", /No se pudo guardar el precio/],
  ['marcador',                      ".score-input').forEach(inp=>{",      /No se pudo guardar el resultado/],
  ['goleadores',                    ".goals-input').forEach(inp=>{",      /No se pudieron guardar los goles/]
];

test("persist reports whether the save actually worked", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const persist = sliceBetween(demo, 'async function persist(){', '\n}', 'la función persist');

  // Sin devolver el booleano de saveState() ningún llamador puede distinguir un
  // guardado exitoso de uno que falló, y todos cantaban éxito igual.
  assert.match(persist, /const ok = await saveState\(state\);/);
  assert.match(persist, /return ok;/);
  assert.doesNotMatch(persist, /^\s*await saveState\(state\);\s*$/m);

  // updateKnownSets marca nombres como "ya conocidos", y mergeKeepingDeletions usa
  // eso para distinguir un alta ajena de algo que borramos a propósito. Si corre
  // tras un guardado fallido, registra estado que nunca llegó al servidor y una
  // sede ajena con ese nombre queda invisible para siempre en ese dispositivo.
  // Mismo patrón que ya usa el reclamo de jugador.
  assert.match(persist, /if\(ok\) updateKnownSets\(state\);/);
  assert.doesNotMatch(persist, /^\s*updateKnownSets\(state\);\s*$/m);
});

test("the match editor rolls back its own changes when saving fails", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const save = sliceBetween(demo, "document.getElementById('m-save').onclick = async ()=>{", '\n};', 'el handler de editar partido');

  assert.match(save, /const ok = await persist\(\);/);
  assert.match(save, /if\(!ok\)\{/);

  // matchInfo y frequentAliases los repone el sondeo, pero sedes, formations y las
  // posiciones ganan sobre el servidor en refreshFromServer, así que sin rollback
  // quedarían residuos que nada corrige.
  assert.match(save, /const previousMatchInfo = state\.matchInfo;/);
  assert.match(save, /const previousAliases = state\.frequentAliases;/);
  assert.match(save, /const previousFormations = state\.formations;/);
  assert.match(save, /const previousPositions = state\.players\.map\(player=>\(\{player, pos:player\.pos\}\)\);/);

  const rollback = sliceBetween(save, 'if(!ok){', 'return;', 'la rama de error de editar partido');
  assert.match(rollback, /state\.matchInfo = previousMatchInfo;/);
  assert.match(rollback, /state\.frequentAliases = previousAliases;/);
  assert.match(rollback, /state\.formations = previousFormations;/);
  assert.match(rollback, /previousPositions\.forEach\(entry=>\{ entry\.player\.pos = entry\.pos; \}\);/);
  assert.match(rollback, /render\(\);/);
  assert.match(rollback, /renderLocalOrganizer\(\);/);

  // La cancha nueva se saca por nombre en vez de restaurar el array entero: así no
  // se descarta una sede que otro dispositivo haya agregado y que el merge de
  // persist() ya sumó, que updateKnownSets marcaría como conocida y no volvería.
  assert.match(save, /let sedeAgregada = null;/);
  assert.match(save, /sedeAgregada = newLoc;/);
  assert.match(rollback, /if\(sedeAgregada\) state\.sedes = state\.sedes\.filter\(sede=>sede\.name !== sedeAgregada\);/);

  // saveLocalFormationState() pasa a correr sólo después del éxito, para no dejar
  // estado local de un cambio que el servidor rechazó.
  const exito = save.slice(save.indexOf('return;', save.indexOf('if(!ok){')));
  assert.match(exito, /saveLocalFormationState\(\);/);
  assert.doesNotMatch(rollback, /saveLocalFormationState\(\)/);

  // El modal se cierra recién con el guardado confirmado. Si se cerrara antes, un
  // fallo dejaría al organizador sin los seis campos que acababa de tipear.
  const cierre = save.indexOf("overlay.classList.remove('open');");
  const chequeo = save.indexOf('const ok = await persist();');
  assert.ok(cierre > -1, 'el handler no cierra el modal en ninguna parte');
  assert.ok(cierre > chequeo, 'el modal se cierra antes de saber si el guardado funcionó');
  assert.match(exito, /overlay\.classList\.remove\('open'\);/);
  assert.doesNotMatch(rollback, /overlay\.classList\.remove\('open'\)/);

  // Y al fallar nadie reescribe el formulario: los inputs sólo se cargan al abrir
  // el modal, así que lo tipeado sigue ahí para reintentar sin volver a escribirlo.
  assert.doesNotMatch(rollback, /getElementById\('m-(teamname|date|time|type|price|alias|loc|loc-new)'\)/);
  assert.doesNotMatch(rollback, /populateLocSelect/);
});

test("the match editor keeps a persistent inline error until the next attempt", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const modal = sliceBetween(demo, 'id="modal-overlay"', 'id="manage-sedes-overlay"', 'el modal de editar partido');
  const save = sliceBetween(demo, "document.getElementById('m-save').onclick = async ()=>{", '\n};', 'el handler de editar partido');

  // El toast se desvanece a los 3.2s, asi que no sirve como senal de "hay cambios
  // pendientes de reintento" mientras el modal sigue abierto. El mensaje inline es
  // la fuente persistente de ese estado.
  assert.match(modal, /<p class="modal-error" id="m-error" role="alert" hidden>No se pudo guardar\. Revisá la conexión e intentá otra vez\.<\/p>/);
  assert.match(demo, /\.modal-error\{/);
  // hidden deja de funcionar si el CSS le asigna display al parrafo.
  assert.doesNotMatch(demo, /\.modal-error\s*\{[^}]*display:/);

  // Se limpia antes de cada intento y se muestra solo si fallo.
  const limpieza = save.indexOf('matchError.hidden = true;');
  const chequeo = save.indexOf('const ok = await persist();');
  assert.ok(limpieza > -1, 'el handler no limpia el error antes de intentar');
  assert.ok(limpieza < chequeo, 'el error se tiene que limpiar antes del intento, no despues');

  const rollback = sliceBetween(save, 'if(!ok){', 'return;', 'la rama de error de editar partido');
  assert.match(rollback, /matchError\.hidden = false;/);
  const exito = save.slice(save.indexOf('return;', save.indexOf('if(!ok){')));
  assert.doesNotMatch(exito, /matchError\.hidden = false/);

  // No se duplica el mismo texto en un toast: el inline es la unica fuente.
  assert.doesNotMatch(rollback, /showToast/);

  // Abrir y cancelar tambien lo limpian, para que no reaparezca un error viejo.
  const abrir = sliceBetween(demo, "document.getElementById('edit-match-btn').onclick = ()=>{", '\n};', 'el handler que abre el modal');
  assert.match(abrir, /matchError\.hidden = true;/);
  const cancelar = sliceBetween(demo, "document.getElementById('m-cancel').onclick", '\n', 'el handler de cancelar');
  assert.match(cancelar, /matchError\.hidden = true;/);
});

test("the history inputs warn when saving fails", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  // Los tres se comprueban por separado: un solo aviso compartido dejaría pasar
  // que a dos de ellos les falte.
  for(const [nombre, marcador, aviso] of HISTORY_INPUTS){
    const handler = sliceBetween(demo, marcador, '\n  });', `el handler de ${nombre}`);
    assert.match(handler, /const ok = await persist\(\);/, `${nombre}: no usa el resultado de persist`);
    assert.match(handler, /if\(!ok\)/, `${nombre}: no comprueba el resultado`);
    assert.match(handler, aviso, `${nombre}: falta el aviso de error`);
  }
});
