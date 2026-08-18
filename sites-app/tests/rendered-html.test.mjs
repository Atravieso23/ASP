import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
  assert.match(html, /Organizador de Partidos ASP/i);
  assert.match(html, /src="\/demo\.html"/i);
});

test("connects the hosted app to Supabase using anonymous authentication", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /const DEMO_MODE = false/);
  // Backend oficial de producción: el proyecto Supabase de Agustín, que ya contiene
  // los datos reales del grupo (responses, players, history). Si demo.html vuelve a
  // apuntar a otro proyecto, la app queda hablando con un backend vacío, así que se
  // fija el ref y se prohíbe explícitamente el proyecto de prueba anterior.
  assert.match(demo, /https:\/\/bfmdozufgvjektqgbpli\.supabase\.co/);
  assert.doesNotMatch(demo, /wzjlcbiyasxamkfjmidr/,
    "demo.html volvió a apuntar al proyecto Supabase de prueba en vez del de Agustín");
  // El proyecto de Agustín usa la anon key clásica (JWT con role:anon). Es pública
  // por diseño y la protege RLS; lo único que no puede aparecer es una service key.
  assert.match(demo, /SUPABASE_ANON_KEY = 'eyJ[A-Za-z0-9_.-]+'/);
  assert.match(demo, /auth\.signInAnonymously\(\)/);
  assert.doesNotMatch(demo, /sb_secret_|service_role/i);
});

test("reflects locally saved availability in the player lists", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  // Con parámetros opcionales: las escrituras de responses derivan sobre un estado
  // que todavía no es el global. Sin argumentos sigue operando sobre state.
  assert.match(demo, /function syncLocalAvailabilityWithPlayers\(/);
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
  // La cancha se dibuja desde una proyección con la formación efectiva: el default
  // del tipo ya no se escribe en state.formations.
  assert.match(demo, /const proyeccion = proyectarPosiciones\(teamPlayers, formacion\)/);
  assert.doesNotMatch(demo, /reset-negro-btn|reset-blanco-btn|Reordenar según formación/);
  assert.doesNotMatch(demo, /view-formacion-btn|teams-view-formacion/);
});

test("assigns confirmed players to teams from the organizer responses", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.doesNotMatch(demo, /team-square|teamLetter/);
  assert.match(demo, /data-team-choice="negro"/);
  assert.match(demo, /data-team-choice="blanco"/);
  // Tocar el equipo que ya tenía lo saca de los dos. El cambio en sí lo hace el
  // helper compartido, que escribe una sola vez sobre estado fresco.
  assert.match(demo, /cambiarEquipoDeJugador\(name, player\.team===selectedTeam \? null : selectedTeam\)/);
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
  // Ser suplente es un dato de la proyección, no del jugador: nadie lo lee fuera
  // del render y escribirlo lo mandaba al servidor en cada guardado.
  assert.match(demo, /esExtra: !starterSet\.has\(player\)/);
  assert.doesNotMatch(demo, /isFormationExtra/);
  assert.match(demo, /findOpenSidelinePosition\(occupied,extraMinimumDistance\)/);
  assert.match(demo, /esExtra \? ' extra' : ''/);
  assert.match(demo, /\.field-chip\.extra\{/);
});

test("moves a tapped formation chip to the other visible pitch", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /function switchPlayerTeamFromPitch\(name\)/);
  assert.match(demo, /const nextTeam = player\.team==='negro' \? 'blanco' : 'negro'/);
  assert.match(demo, /player\.pos = null/);
  // El aviso de éxito sólo sale si el guardado se confirmó.
  assert.match(demo, /if\(await cambiarEquipoDeJugador\(name, nextTeam\)\)/);
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
  const finalizeHandler = sliceBetween(demo, 'finalizeConfirmBtn.onclick = async ()=>{', '\n};', 'el handler de finalizar');
  assert.match(finalizeHandler, /players: \[\],/);
  assert.match(finalizeHandler, /clearLocalOrganizerState\(\);/);
  const clearHandler = sliceBetween(demo, 'clearConfirmBtn.onclick = async ()=>{', '\n};', 'el handler de limpiar');
  assert.match(clearHandler, /responses: \[\], players: \[\]/);
  assert.match(clearHandler, /await saveState\(nextState\)/);
  // Limpiar conserva los datos del partido: no los toca ni para blanquearlos ni
  // para reescribirlos con la copia local.
  assert.doesNotMatch(clearHandler, /blankMatchInfo/);
  assert.doesNotMatch(clearHandler, /matchInfo:/);
  assert.match(demo, /conserva los datos del partido y la cancha/);
});

test("remembers frequent payment aliases without clearing match information", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /list="frequent-aliases"/);
  assert.match(demo, /frequentAliases: \[\]/);
  // Desde D3 el alias usado encabeza los frecuentes FRESCOS: superponerse en vez de
  // reemplazar es lo que evita borrar el que agregó otro dispositivo.
  assert.match(demo, /fresh\.frequentAliases = \[datos\.alias, \.\.\.otros\]\.slice\(0, 10\);/);
});

test("keeps player state derived from universal responses without reseeding demo profiles", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /players: \[\]/);
  assert.match(demo, /responses: \[\]/);
  assert.match(demo, /state\.responses = localAvailabilityResponses/);
  assert.match(demo, /asp_availability_local_backup_v1/);
  assert.doesNotMatch(demo, /localAvailabilityResponses\.length >= 18/);
  assert.match(demo, /target\.players = target\.players\.filter\(player=>responseNames\.has/);
  // El equipo viaja de la respuesta al jugador, nunca al revés: la respuesta es la
  // fuente de verdad y players.team se deriva de ella en cada sincronización.
  assert.match(demo, /player\.team = nextTeam/);
  assert.doesNotMatch(demo, /response\.team = player\.team/);
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
  // El cambio de tipo se decide contra el estado fresco y descarta lo que era de la
  // cancha anterior. No materializa los defaults del tipo nuevo: formacionEfectiva()
  // proyecta ese mismo valor sin escribirlo, así que la vista es idéntica y el default
  // no se disfraza de elección de nadie.
  assert.match(demo, /cambioDeTipo = fresh\.matchInfo\.type !== datos\.type;/);
  assert.match(demo, /if\(cambioDeTipo\)\{\s*\r?\n\s*fresh\.formations = \{\};[\s\S]*?player\.pos = null;/);
  // Sin los comentarios: el de acá al lado nombra la función justo para explicar por
  // qué dejó de llamarse.
  const guardar = sliceBetween(demo, 'async function guardarPartido(datos){', '\n}', 'el writer de editar partido')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(guardar, /ensureFormationDefaults\(\)/,
    'vuelve a materializar el default del tipo nuevo');
});

test("supports recurrent players with identity-focused first-time copy", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /LOCAL_RECURRENT_PLAYERS_KEY/);
  assert.match(demo, /id="first-time-player-btn">Este soy yo/);
  assert.match(demo, /id="player-picker-help">Usá siempre el mismo nombre para evitar duplicados\./);
  assert.match(demo, /id="recurrent-player-menu" role="listbox"/);
  assert.match(demo, /function renderRecurrentPlayerMenu\(\)/);
  assert.match(demo, /data-delete-recurrent-index/);
  assert.match(demo, /function setFirstTimeRegistration\(active,preserveValue=false\)/);
  assert.match(demo, /setFirstTimeRegistration\(!registeringFirstTime,true\)/);
  assert.match(demo, /button\.textContent = active \? 'Cancelar' : 'Este soy yo';/);
  assert.match(demo, /label\.textContent = active \? 'Tu nombre' : 'Nombre del jugador';/);
  assert.match(demo, /help\.textContent = 'Usá siempre el mismo nombre para evitar duplicados\.';/);
  assert.match(demo, /confirm\.textContent = active \? 'Confirmar mi respuesta' : 'Confirmar';/);
  assert.doesNotMatch(demo, /Registrarme/, 'el flujo de identidad vuelve a mostrar el copy de registro');
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
  assert.match(demo, /Usá siempre el mismo nombre para evitar duplicados\./);
  assert.match(demo, /showPlayerNameFeedback\('error','No pudimos guardar tu respuesta/);
});

test("lets a trusted player reuse an existing response on another device", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const claimModal = sliceBetween(
    demo,
    '<div class="modal-overlay" id="claim-player-overlay">',
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
    'el modal para confirmar el jugador',
  );
  const claimHandler = sliceBetween(
    demo,
    "document.getElementById('claim-player-confirm').onclick = async ()=>{",
    'clearConfirmBtn.onclick = async ()=>{',
    'el handler para confirmar el jugador',
  );

  assert.match(claimModal, /<h2>Confirmá quién sos<\/h2>/);
  assert.match(claimModal, /Desde este dispositivo vas a poder editar su asistencia, horario y pago durante esta fecha\./);
  assert.match(claimModal, /Sí, usar este jugador/);
  assert.match(demo, /¿Sos \$\{selectedResponse\.name\}\?/);
  assert.match(demo, /function responseBelongsToCurrentDevice\(response\)/);
  assert.match(demo, /response\.ownerIds\|\|\[\]/);
  assert.match(claimHandler, /addCurrentDeviceToResponse\(target\)/);
  assert.match(claimHandler, /button\.textContent = 'Confirmando…'/);
  assert.match(claimHandler, /No pudimos permitirte editar a \$\{target\.name\} desde este dispositivo\. Intentá nuevamente\./);
  assert.match(claimHandler, /restoreCurrentLocalResponse\(\)/);
  assert.match(claimHandler, /Ya podés editar a \$\{target\.name\} desde este dispositivo\./);
  assert.doesNotMatch(claimModal + claimHandler, /Ya estoy registrado|recordará al jugador|Vinculando|vincular este dispositivo|quedó vinculado/i);
  assert.doesNotMatch(demo, /No se pudo recordar al jugador local/);
});

test("manages per-date guests from the collapsed player status", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /¿A tu invitado le dio paja registrarse\?/);
  assert.match(demo, /Gestioná su asistencia y pago desde acá\./);
  assert.match(demo, /id="guest-manager-toggle"[^>]*>Agregar invitado/);
  assert.match(demo, /id="guest-manager"[^>]*hidden/);
  assert.match(demo, /function getCurrentPlayerGuests\(\)/);
  assert.match(demo, /item\.isGuest === true/);
  // El anfitrión se relocaliza en las responses frescas antes de colgarle el invitado.
  assert.match(demo, /invitedBy:anfitrion\.name/);
  assert.match(demo, /class="guest-paid-check/);
  assert.match(demo, /data-guest-paid="\$\{guest\.responseId\}"/);
  assert.match(demo, /data-remove-guest/);
  assert.doesNotMatch(demo, /data-guest-status=/);
  assert.doesNotMatch(demo, /<details class="guest-item">/);
  assert.match(demo, /Invitado de \$\{escapeHtml\(item\.invitedBy/);
  assert.match(demo, /localStorage\.removeItem\(LOCAL_AVAILABILITY_KEY\)/);
});

test("renders the guest CTA from the manager visibility", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const guestManagerRenderer = sliceBetween(
    demo,
    'function renderGuestManager(){',
    '\nfunction renderLocalOrganizer(){',
    'renderGuestManager',
  );
  const manager = { hidden: true };
  const toggle = { textContent: '' };
  const list = { innerHTML: '', querySelectorAll(){ return []; } };
  const count = { textContent: '' };
  const elements = {
    'guest-manager': manager,
    'guest-manager-toggle': toggle,
    'guest-list': list,
    'guest-manager-count': count,
  };
  const context = vm.createContext({
    document: { getElementById(id){ return elements[id] || null; } },
    getCurrentPlayerGuests(){ return []; },
  });

  new vm.Script(`${guestManagerRenderer}\nglobalThis.renderGuestManager = renderGuestManager;`)
    .runInContext(context);

  context.renderGuestManager();
  assert.equal(toggle.textContent, 'Agregar invitado');

  manager.hidden = false;
  context.renderGuestManager();
  assert.equal(toggle.textContent, 'Cerrar invitados');
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
  // El pago sigue siendo reversible desde los dos botones, pero ya no se pinta antes
  // de guardar: la escritura focalizada decide y el resumen se repinta con el ok.
  assert.match(demo, /marcarMiPago\(button\.dataset\.value === 'yes'\)/);
  assert.match(demo, /mockStatusCard\.classList\.toggle\('collapsed'\)/);
  assert.match(demo, /id="change-player-btn"[^>]*>¿Te equivocaste de nombre\? Cambiar jugador/);
  assert.match(demo, /function setRegisteredPlayerNameMode\(allowChange=false\)/);
  assert.match(demo, /input\.readOnly = Boolean\(ownResponse && !changingRegisteredPlayer\)/);
  assert.match(demo, /Estás editando la respuesta de \$\{ownResponse\.name\}/);
  assert.match(demo, /Cambio de jugador activado/);
  assert.match(demo, /input\.select\(\)/);
});

test("defaults to F8 and assigns every confirmed player to a balanced team", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /type:'F8'/);
  assert.match(demo, /function chooseBalancedTeam\(excludeName=''/);
  assert.match(demo, /counts\.negro <= counts\.blanco \? 'negro' : 'blanco'/);
  assert.match(demo, /existingResponse\?\.team \|\| chooseBalancedTeam\(playerName\)/);
  // El invitado se balancea contra las responses del servidor, no contra la copia
  // local, que ignora a los que se sumaron desde el último sondeo.
  assert.match(demo, /team:chooseBalancedTeam\(nombre, responses\)/);
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
  assert.match(demo, /const archived = \{[\s\S]{0,400}?responses:/);

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
  assert.match(demo, /const archived = \{[\s\S]{0,600}?formations:/);
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

  // Snapshot previo, esperar el guardado, revertir y avisar si falló. persist() no
  // sirve acá porque adopta las responses del servidor, y el undo justamente las
  // reemplaza. Tampoco usa la escritura focalizada de pagos/invitados: no modifica
  // una response puntual y ya trae su propia lectura fresca más arriba.
  assert.match(undo.previo, /const previousState = state;/);
  assert.match(undo.previo, /const previousResponses = localAvailabilityResponses;/);
  assert.match(undo.previo, /const ok = await saveState\(state\);/);
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

test("sets the complete availability range from the full-day control", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const availabilityHelpers = sliceBetween(
    demo,
    'const mockHourOptions =',
    'function restoreCurrentLocalResponse',
    'los helpers de disponibilidad',
  );
  const makeSelect = (initialValue, optionValues = []) => {
    let values = optionValues;
    let value = initialValue;
    return {
      get value(){ return value; },
      set value(nextValue){ value = values.includes(nextValue) ? nextValue : ''; },
      get optionValues(){ return values; },
      set innerHTML(markup){
        values = [...markup.matchAll(/value="([^"]+)"/g)].map(([, optionValue]) => optionValue);
        value = values.includes(value) ? value : '';
      },
    };
  };
  const hourOptions = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
    '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
  ];
  const mockFrom = makeSelect('16:00', hourOptions);
  const mockTo = makeSelect('20:00', hourOptions);
  const fullDayControl = { checked: false };
  const timeClasses = new Set();
  const mockTimes = {
    classList: {
      toggle(name, force){ if(force){ timeClasses.add(name); } else { timeClasses.delete(name); } return force; },
      contains(name){ return timeClasses.has(name); },
    },
  };
  const context = vm.createContext({
    mockFrom,
    mockTo,
    mockFullDay: fullDayControl,
    mockTimes,
    document: {
      getElementById(id){ return id === 'my-status-full-day' ? fullDayControl : null; },
    },
  });

  new vm.Script(`${availabilityHelpers}\nglobalThis.setFullDayAvailability = setFullDayAvailability;`)
    .runInContext(context);
  const clickConnection = demo.match(/document\.getElementById\('my-status-full-day'\)\.onclick = setFullDayAvailability;/);
  assert.ok(clickConnection, 'el control de día completo no está conectado al helper');
  new vm.Script(clickConnection[0]).runInContext(context);

  // Al activar el checkbox, cubre 09:00–22:00 y deshabilita los selects, sin perder la semántica.
  fullDayControl.checked = true;
  fullDayControl.onclick();
  assert.equal(mockFrom.value, '09:00');
  assert.deepEqual(mockTo.optionValues, [
    '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
    '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
  ]);
  assert.equal(mockTo.value, '22:00');
  assert.equal(mockFrom.disabled, true);
  assert.equal(mockTo.disabled, true);
  assert.ok(mockTimes.classList.contains('is-full-day'), 'no marcó el estado de día completo');

  // Al desactivarlo, vuelven los valores previos y se rehabilitan los selects.
  fullDayControl.checked = false;
  fullDayControl.onclick();
  assert.equal(mockFrom.value, '16:00');
  assert.equal(mockTo.value, '20:00');
  assert.equal(mockFrom.disabled, false);
  assert.equal(mockTo.disabled, false);
  assert.ok(!mockTimes.classList.contains('is-full-day'), 'no limpió el estado de día completo');
});

const HISTORY_INPUTS = [
  ['precio de una fecha archivada', ".edit-price-input').forEach(inp=>{", /No se pudo guardar el precio/,    /guardarPrecioDeHistorial\(inp\.dataset\.finalizedAt,/],
  ['marcador',                      ".score-input').forEach(inp=>{",      /No se pudo guardar el resultado/, /guardarResultadoDeHistorial\(inp\.dataset\.finalizedAt,/],
  ['goleadores',                    ".goals-input').forEach(inp=>{",      /No se pudieron guardar los goles/,/guardarGolesDeHistorial\(inp\.dataset\.finalizedAt,/]
];

test("persist reports whether the save actually worked", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const persist = sliceBetween(demo, 'async function persist(overlayResponses){', '\n}', 'la función persist');

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

test("the match editor never touches local state before the save lands", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const save = sliceBetween(demo, "document.getElementById('m-save').onclick = async ()=>{", '\n};', 'el handler de editar partido');

  // Desde D3 no hay rollback porque no hay nada que revertir: el handler lee el
  // formulario y delega la escritura, que parte del estado fresco y no publica hasta
  // que el servidor confirmó. Lo que antes eran cuatro snapshots y una rama de
  // restauración -matchInfo, alias, formations, posiciones y la cancha agregada- es
  // ahora la ausencia de mutaciones.
  assert.match(save, /const \{ok, cambioDeTipo\} = await guardarPartido\(\{/);
  assert.doesNotMatch(save, /await persist\(\)/, 'sigue serializando la copia local');
  for(const mutacion of [/state\.matchInfo\s*=/, /state\.frequentAliases/, /state\.formations\s*=/, /state\.sedes/, /\.pos\s*=[^=]/]){
    assert.doesNotMatch(save, mutacion, `el handler muta ${mutacion} antes de guardar`);
  }
  assert.doesNotMatch(save, /previous(MatchInfo|Aliases|Formations|Positions|FieldType)/,
    'quedaron snapshots de un rollback que ya no existe');

  const fallo = sliceBetween(save, 'if(!ok){', 'return;', 'la rama de error de editar partido');
  assert.doesNotMatch(fallo, /render\(\)/, 'redibuja sin que nada haya cambiado');

  // saveLocalFormationState() corre sólo después del éxito y sólo si cambió el tipo,
  // para no dejar estado local de un cambio que el servidor rechazó.
  const exito = save.slice(save.indexOf('return;', save.indexOf('if(!ok){')));
  assert.match(exito, /if\(cambioDeTipo\) saveLocalFormationState\(\);/);
  assert.doesNotMatch(fallo, /saveLocalFormationState\(\)/);

  // El modal se cierra recién con el guardado confirmado. Si se cerrara antes, un
  // fallo dejaría al organizador sin los seis campos que acababa de tipear.
  const cierre = save.indexOf("overlay.classList.remove('open');");
  const chequeo = save.indexOf('await guardarPartido(');
  assert.ok(cierre > -1, 'el handler no cierra el modal en ninguna parte');
  assert.ok(cierre > chequeo, 'el modal se cierra antes de saber si el guardado funcionó');
  assert.match(exito, /overlay\.classList\.remove\('open'\);/);
  assert.doesNotMatch(fallo, /overlay\.classList\.remove\('open'\)/);

  // Y al fallar nadie reescribe el formulario: los inputs sólo se cargan al abrir
  // el modal, así que lo tipeado sigue ahí para reintentar sin volver a escribirlo.
  assert.doesNotMatch(fallo, /getElementById\('m-(teamname|date|time|type|price|alias|loc|loc-new)'\)/);
  assert.doesNotMatch(fallo, /populateLocSelect/);
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
  const chequeo = save.indexOf('await guardarPartido(');
  assert.ok(limpieza > -1, 'el handler no limpia el error antes de intentar');
  assert.ok(limpieza < chequeo, 'el error se tiene que limpiar antes del intento, no despues');

  const fallo = sliceBetween(save, 'if(!ok){', 'return;', 'la rama de error de editar partido');
  assert.match(fallo, /matchError\.hidden = false;/);
  const exito = save.slice(save.indexOf('return;', save.indexOf('if(!ok){')));
  assert.doesNotMatch(exito, /matchError\.hidden = false/);

  // No se duplica el mismo texto en un toast: el inline es la unica fuente.
  assert.doesNotMatch(fallo, /showToast/);

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
  for(const [nombre, marcador, aviso, llamada] of HISTORY_INPUTS){
    const handler = sliceBetween(demo, marcador, '\n  });', `el handler de ${nombre}`);
    assert.match(handler, llamada, `${nombre}: no delega en la función nombrada`);
    assert.match(handler, /const ok = await guardar/, `${nombre}: no usa el resultado del guardado`);
    assert.match(handler, /if\(!ok\)/, `${nombre}: no comprueba el resultado`);
    assert.match(handler, aviso, `${nombre}: falta el aviso de error`);
  }
});

test("the history inputs save before touching the screen and address dates by identity", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  for(const [nombre, marcador] of HISTORY_INPUTS){
    const handler = sliceBetween(demo, marcador, '\n  });', `el handler de ${nombre}`);

    // Save-first: mutar state y renderizar antes del guardado mostraba como aplicado
    // algo que el servidor podía rechazar, y dependía del sondeo para revertirlo.
    assert.doesNotMatch(handler, /state\.history\[/, `${nombre}: sigue mutando el historial local`);
    const guardado = handler.indexOf('const ok = await guardar');
    const render = handler.indexOf('render();');
    assert.ok(guardado > -1 && render > guardado, `${nombre}: redibuja antes de saber si guardó`);

    // El índice del DOM sólo vale para el array local: si otro dispositivo archivó o
    // deshizo una fecha, esa posición en el estado fresco es otra fecha.
    assert.doesNotMatch(handler, /dataset\.hidx/, `${nombre}: sigue resolviendo la fecha por índice`);
  }

  // La identidad tiene que viajar en TODOS los inputs del historial, no en algunos:
  // el marcador son dos, uno por equipo, y al que le falte queda sin poder guardar.
  const inputs = [...demo.matchAll(/<input[^>]*class="(?:edit-price-input|score-input|jersey-input goals-input)"[^>]*>/g)]
    .map(([tag]) => tag);
  assert.equal(inputs.length, 4, 'cambió la cantidad de inputs editables del historial');
  for(const tag of inputs){
    assert.match(tag, /data-finalized-at="\$\{escapeHtml\(h\.finalizedAt\|\|''\)\}"/,
      `un input del historial no lleva la fecha en el markup: ${tag}`);
  }

  // Sin fecha no se escribe: falla seguro en vez de agarrar la primera entrada.
  const helper = sliceBetween(demo, 'function conFechaDeHistorial(fresh, finalizedAt, mutar){', '\n}', 'el resolvedor de fechas');
  assert.match(helper, /if\(!finalizedAt\) return false;/);
  assert.match(helper, /find\(item=>item\.finalizedAt===finalizedAt\)/);
  assert.match(helper, /if\(!fecha\) return false;/);
});

test("the focused writer starts from the server and publishes only once the save lands", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const focalizado = sliceBetween(demo, 'async function persistFocalizado(aplicar, opciones){', '\n}', 'la función persistFocalizado');

  // Parte de fresh y no de la copia local: es toda la diferencia con persist().
  assert.match(focalizado, /const fresh = await fetchServerState\(\);/);
  assert.match(focalizado, /if\(!fresh\) return false;/);
  assert.match(focalizado, /if\(!aplicar\(fresh\)\) return false;/);
  assert.match(focalizado, /const ok = await saveState\(fresh\);/);
  assert.match(focalizado, /if\(!ok\) return false;/);

  // players no le pertenece a estos llamadores: los del servidor pasan intactos.
  assert.doesNotMatch(focalizado, /mergePlayers/, 'mergea players, que no son suyos');
  assert.doesNotMatch(focalizado, /mergeSedesArr/, 'mergea sedes, que no son suyas');

  // Quien no es dueño de players conserva los suyos; los de Equipos reconcilian igual
  // que el sondeo. Sin eso, el arrastre y la formación descartarían su propia intención
  // recién guardada al quedarse con la copia local vieja.
  assert.match(focalizado, /state\.players = playersLocales;/);
  assert.match(focalizado, /if\(adoptarPlayers\) reconciliarPlayers\(playersRemotos\);/);

  // Save-first: la publicación va después del ok, nunca antes.
  const guardado = focalizado.indexOf('const ok = await saveState(fresh);');
  for(const publicacion of ['state = fresh;', 'localAvailabilityResponses = state.responses;', 'updateKnownSets(state);']){
    const idx = focalizado.indexOf(publicacion);
    assert.ok(idx > guardado, `publica "${publicacion}" antes de saber si el servidor aceptó`);
  }

  // El sondeo no puede quedar congelado por una salida temprana.
  assert.match(focalizado, /\}finally\{[\s\S]*saving = false;/);
});

// Las dos acciones destructivas del panel de organizador. Comparten la forma
// "guardar primero, tocar lo local después" pero no el contenido, así que cada
// aserción corre sobre los dos por separado: un solo test compartido dejaría
// pasar que a uno le falte.
const DESTRUCTIVAS = [
  {
    nombre: 'finalizar la fecha',
    marcador: 'finalizeConfirmBtn.onclick = async ()=>{',
    overlay: 'finalizeOverlay',
    error: 'finalizeError',
    errorId: 'f-error',
    abrir: "document.getElementById('finalize-btn').onclick",
    cancelar: "document.getElementById('f-cancel').onclick",
    aviso: /No se pudo finalizar la fecha\. Revisá la conexión e intentá otra vez\./,
    exito: /Fecha finalizada\. Arrancás de cero para la próxima/,
  },
  {
    nombre: 'limpiar todo',
    marcador: 'clearConfirmBtn.onclick = async ()=>{',
    overlay: 'clearOverlay',
    error: 'clearError',
    errorId: 'c-error',
    abrir: "document.getElementById('clear-btn').onclick",
    cancelar: "document.getElementById('c-cancel').onclick",
    aviso: /No se pudo limpiar\. Revisá la conexión e intentá otra vez\./,
    exito: /Se borraron las respuestas y equipos para todos/,
  },
];

// Parte un handler destructivo en "antes de saber el resultado" y "sólo si guardó".
// Sin partirlo, una aserción de presencia pasa igual si la mutación quedó del lado
// equivocado del chequeo, que es exactamente el bug que estos tests cubren.
function extractDestructiva(demo, caso){
  const handler = sliceBetween(demo, caso.marcador, '\n};', `el handler de ${caso.nombre}`);
  const chequeo = handler.indexOf('const ok = await saveState(nextState);');
  assert.ok(chequeo > -1, `${caso.nombre}: no guarda el nextState antes de decidir`);
  const rama = handler.indexOf('if(!ok){', chequeo);
  assert.ok(rama > chequeo, `${caso.nombre}: no comprueba el resultado del guardado`);
  const corte = handler.indexOf('return;', rama);
  assert.ok(corte > rama, `${caso.nombre}: la rama de error no corta la ejecución`);
  return {
    todo: handler,
    previo: handler.slice(0, chequeo),
    fallo: handler.slice(rama, corte),
    exito: handler.slice(corte),
  };
}

test("the destructive actions save before touching any local state", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  // La regla del PR: hasta que Supabase no confirme, el estado local visible no
  // cambia. Con la mutación primero, un guardado rechazado dejaba la pantalla en
  // cero y el sondeo reconstruía players desde responses, perdiendo posiciones,
  // capitán y dorsal para todo el grupo.
  for(const caso of DESTRUCTIVAS){
    const h = extractDestructiva(demo, caso);
    // updateKnownSets aparte de las demás: correrlo sobre un vaciado que nunca
    // llegó al servidor hacía que el sondeo leyera los jugadores remotos como un
    // borrado deliberado y no los repusiera nunca. Era el bug original de limpiar.
    for(const mutacion of ['clearLocalOrganizerState()', 'state = nextState', 'updateKnownSets(', 'render()', 'resetMyStatusCard()']){
      assert.ok(!h.previo.includes(mutacion), `${caso.nombre}: ${mutacion} corre antes de saber si guardó`);
      assert.ok(h.exito.includes(mutacion), `${caso.nombre}: falta ${mutacion} en el camino de éxito`);
    }
    // Y nada de escribir directo sobre state mientras se arma el nextState.
    assert.doesNotMatch(h.previo, /\n\s*state\.(players|responses|formations|matchInfo|history)\s*=/,
      `${caso.nombre}: muta state para construir el guardado`);
  }
});

test("the destructive actions warn inline instead of claiming success", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  for(const caso of DESTRUCTIVAS){
    const h = extractDestructiva(demo, caso);
    // Mismo patrón que el aviso de editar partido, empezando por la clase: si el
    // párrafo no la lleva, queda sin el estilo de error aunque el texto esté.
    const parrafo = sliceBetween(demo, `<p class="modal-error" id="${caso.errorId}"`, '</p>', `el aviso inline de ${caso.nombre}`);
    assert.match(parrafo, /role="alert" hidden>/, `${caso.nombre}: el aviso no arranca oculto`);
    assert.match(parrafo, caso.aviso, `${caso.nombre}: texto del aviso incorrecto`);

    // El toast se desvanece a los 3.2s: no sirve como señal de "hay un reintento
    // pendiente" mientras el modal sigue abierto.
    assert.match(h.fallo, new RegExp(`${caso.error}\\.hidden = false;`), `${caso.nombre}: no muestra el aviso al fallar`);
    assert.doesNotMatch(h.fallo, /showToast/, `${caso.nombre}: duplica el aviso en un toast`);
    assert.doesNotMatch(h.exito, new RegExp(`${caso.error}\\.hidden = false`), `${caso.nombre}: muestra el aviso en el camino de éxito`);
    assert.match(h.exito, caso.exito, `${caso.nombre}: falta el aviso de éxito`);

    // Se limpia antes de cada intento, y también al abrir y al cancelar, para que
    // no reaparezca un error viejo de la semana pasada.
    const limpieza = h.todo.indexOf(`${caso.error}.hidden = true;`);
    assert.ok(limpieza > -1 && limpieza < h.previo.length, `${caso.nombre}: no limpia el aviso antes de intentar`);
    for(const marcador of [caso.abrir, caso.cancelar]){
      const tramo = sliceBetween(demo, marcador, '\n};', `${caso.nombre}: ${marcador}`);
      assert.match(tramo, new RegExp(`${caso.error}\\.hidden = true;`), `${caso.nombre}: ${marcador} no limpia el aviso`);
    }
  }
});

test("the destructive actions leave the modal open when the save was rejected", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  for(const caso of DESTRUCTIVAS){
    const h = extractDestructiva(demo, caso);
    const cierre = `${caso.overlay}.classList.remove('open');`;
    assert.ok(!h.previo.includes(cierre), `${caso.nombre}: cierra el modal antes de saber si guardó`);
    assert.ok(!h.fallo.includes(cierre), `${caso.nombre}: cierra el modal aunque el guardado falló`);
    assert.ok(h.exito.includes(cierre), `${caso.nombre}: no cierra el modal tras guardar bien`);
  }
});

test("finalizing a date never archives locally when the save was rejected", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const h = extractDestructiva(demo, DESTRUCTIVAS[0]);

  // push muta el array in-place: guardar la referencia no lo revierte, y un
  // reintento sin sondeo intermedio dejaba una segunda entrada vacía que además
  // se quedaba con el botón de Deshacer del partido real.
  assert.doesNotMatch(h.todo, /state\.history\.push/, 'sigue archivando con push sobre state.history');
  assert.match(h.previo, /history: \[\.\.\.baseHistory, archived\]/, 'no arma un array de historial nuevo');

  // La reconciliación previa con el servidor no cambia: mismos players mergeados y
  // mismo historial remoto si viene más largo. Sólo deja de mutar state para armarla.
  assert.match(h.previo, /const basePlayers = mergePlayers\(fresh\.players, state\.players\);/);
  assert.match(h.previo, /fresh\.history\.length > \(state\.history\|\|\[\]\)\.length/);
  // sedes lo mergeaba el segundo fetch de persist(), que acá ya no existe.
  assert.match(h.previo, /const baseSedes = mergeSedesArr\(fresh\.sedes, state\.sedes\);/);

  // Los alias frecuentes son del grupo y finalizar no los toca. Desde `...state`
  // viajaba la copia local, así que finalizar borraba el alias que otro dispositivo
  // acababa de guardar.
  assert.match(h.previo, /frequentAliases: fresh\.frequentAliases,/);

  // La fecha archivada se copia, no se referencia: si quedara apuntando a los
  // arrays vivos, limpiar el estado local después la vaciaría.
  assert.match(h.previo, /matchInfo: \{\.\.\.state\.matchInfo\}/);
  assert.match(h.previo, /responses: localAvailabilityResponses\.map\(r=>\(\{\.\.\.r\}\)\)/);
  assert.match(h.previo, /formations: \{\.\.\.state\.formations\}/);
  assert.match(h.previo, /players: getResponsePlayers\(undefined, basePlayers\)\.map\(p=>\(\{\.\.\.p\}\)\)/);
});

test("clearing everything starts from the server so it cannot overwrite remote fields", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const h = extractDestructiva(demo, DESTRUCTIVAS[1]);

  // saveState escribe el blob entero. Partiendo de la copia local, de hasta 4s de
  // antigüedad, Limpiar pisaba una sede o un alias que otro dispositivo acababa de
  // guardar. Ahora aplica sólo lo que significa "limpiar" sobre el estado fresco.
  assert.match(h.previo, /const fresh = await fetchServerState\(\);/);
  assert.match(h.previo, /const nextState = \{\.\.\.fresh, responses: \[\], players: \[\], formations: \{\}\};/);
  for(const conservado of ['sedes', 'frequentAliases', 'matchInfo', 'history']){
    assert.doesNotMatch(h.previo, new RegExp(`\\n\\s*${conservado}: `), `limpiar no debería tocar ${conservado}`);
  }
});

test("the destructive actions fail closed when the server cannot be read", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  // Sin lectura fresca no hay forma de saber contra qué se está escribiendo, y el
  // guardado casi seguro también va a fallar. Mismo criterio que el undo.
  for(const caso of DESTRUCTIVAS){
    const h = extractDestructiva(demo, caso);
    const guard = h.previo.indexOf('if(!fresh){');
    assert.ok(guard > -1, `${caso.nombre}: no comprueba que pudo leer el servidor`);
    assert.match(h.previo.slice(guard), new RegExp(`${caso.error}\\.hidden = false;`),
      `${caso.nombre}: el guard del fetch no avisa`);
  }
});

test("the destructive confirmations block the poll and the second tap while saving", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  for(const caso of DESTRUCTIVAS){
    const h = extractDestructiva(demo, caso);

    // Sin saving, el sondeo de cada 4s cae en el medio del guardado y repone en
    // pantalla lo que la base está borrando. Limpiar no lo marcaba: guardaba con
    // saveState() suelto en vez de pasar por persist().
    const marcaSaving = h.previo.indexOf('saving = true;');
    assert.ok(marcaSaving > -1, `${caso.nombre}: no bloquea el sondeo mientras guarda`);
    assert.ok(marcaSaving < h.previo.indexOf('await fetchServerState()'),
      `${caso.nombre}: marca saving después de leer el servidor`);

    // Dos taps seguidos son dos operaciones reales, no una repetida: en finalizar,
    // dos entradas de historial distintas. Es parte de este arreglo, no el guard
    // transversal de reentrada.
    assert.match(h.previo, /\.disabled = true;/, `${caso.nombre}: no bloquea el botón mientras guarda`);

    // Y las dos cosas se restauran pase lo que pase, incluso ante un error
    // inesperado: si no, el panel queda con el botón muerto y el sondeo congelado.
    const finally_ = sliceBetween(h.todo, '}finally{', '\n  }', `el finally de ${caso.nombre}`);
    assert.match(finally_, /saving = false;/, `${caso.nombre}: no libera saving en el finally`);
    assert.match(finally_, /\.disabled = false;/, `${caso.nombre}: no rehabilita el botón en el finally`);
  }
});

// Los tres handlers de canchas guardadas. Se aíslan de a uno: comparten las mismas
// llamadas (persist, renderSedesManageList) y una aserción sobre el archivo entero
// pasaría aunque el rollback estuviera en el handler equivocado.
function extractSedes(demo){
  const seccion = sliceBetween(demo, 'function renderSedesManageList(){',
    "document.getElementById('open-manage-sedes-btn')", 'la sección de canchas guardadas');
  return {
    seccion,
    editar: sliceBetween(seccion, 'inp.onchange = async ()=>{', '\n    };', 'el handler de editar cancha'),
    eliminar: sliceBetween(seccion, 'btn.onclick = async ()=>{', '\n    };', 'el handler de eliminar cancha'),
    agregar: sliceBetween(demo, "document.getElementById('add-sede-btn').onclick = async ()=>{", '\n};', 'el handler de agregar cancha'),
  };
}

// Parte un handler de canchas en "antes de saber el resultado" y "rama de fallo".
function ramas(handler, label){
  const chequeo = handler.indexOf('const {ok, motivo} = await ');
  assert.ok(chequeo > -1, `${label}: no usa el resultado de la operación`);
  const rama = handler.indexOf('if(!ok){', chequeo);
  assert.ok(rama > chequeo, `${label}: no comprueba el resultado del guardado`);
  // La rama se corta en su propio return: sin acotarla, "fallo" arrastraría también
  // el camino de éxito y cualquier aserción negativa sobre ella sería falsa.
  const cierre = handler.indexOf('return;', rama);
  assert.ok(cierre > rama, `${label}: la rama de error no corta la ejecución`);
  return { previo: handler.slice(0, chequeo), fallo: handler.slice(rama, cierre + 'return;'.length), todo: handler };
}

// Las tres operaciones, ya fuera de los handlers y sin DOM.
function extractOperacionesSede(demo){
  return {
    agregar: sliceBetween(demo, 'async function agregarSede(nombre, direccion){', '\n}', 'agregarSede'),
    editar: sliceBetween(demo, 'async function editarSede(clavePropia, campo, valor){', '\n}', 'editarSede'),
    eliminar: sliceBetween(demo, 'async function eliminarSede(clavePropia){', '\n}', 'eliminarSede'),
  };
}

test("venue names are unique under the same normalization the merge uses", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const ops = extractOperacionesSede(demo);

  // mergeSedesArr y updateKnownSets normalizan con name.toLowerCase(), y los
  // handlers ya recortan con trim(). Si dos nombres colapsan para el merge son la
  // misma cancha: agregar una homónima pisaba la dirección de la que ya existía y
  // renombrar a una homónima fusionaba las dos, siempre en silencio.
  assert.match(demo, /function sedeKey\(name\)\{ return \(name\|\|''\)\.trim\(\)\.toLowerCase\(\); \}/);

  // La validación corre contra las canchas que se le pasan —las frescas—, no contra
  // state: el chequeo local no ve la cancha que otro teléfono agregó desde el último
  // sondeo, y dos altas del mismo nombre terminaban fusionadas sin aviso.
  const ocupada = sliceBetween(demo, 'function sedeOcupadaEnFresco(sedes, nombre, clavePropia){', '\n}', 'sedeOcupadaEnFresco');
  assert.doesNotMatch(ocupada, /state\./, 'valida contra el estado local en vez del fresco');
  // clavePropia: renombrar una cancha cambiándole sólo las mayúsculas a sí misma no
  // se puede rechazar contra sí misma.
  assert.match(ocupada, /sedeKey\(sede\.name\) !== clavePropia && sedeKey\(sede\.name\) === clave/);

  // El guard va antes de tocar la lista fresca, en las dos operaciones que crean nombre.
  const guardAlta = ops.agregar.indexOf('if(sedeOcupadaEnFresco(fresh.sedes, nombre)){');
  assert.ok(guardAlta > -1, 'el alta no valida el nombre duplicado');
  assert.ok(guardAlta < ops.agregar.indexOf('fresh.sedes.push'), 'el alta valida después de mutar la lista');

  const guardRename = ops.editar.indexOf("if(campo === 'name' && sedeOcupadaEnFresco(fresh.sedes, valor, clavePropia)){");
  assert.ok(guardRename > -1, 'el rename no valida el nombre duplicado');
  assert.ok(guardRename < ops.editar.indexOf('fresh.sedes[indice][campo] = valor;'), 'el rename valida después de mutar la cancha');

  // Y al rechazar no se limpia lo escrito: el organizador puede corregir el nombre
  // sin volver a tipear la dirección.
  const h = ramas(extractSedes(demo).agregar, 'agregar cancha');
  assert.doesNotMatch(h.fallo, /\.value = ''/, 'el alta limpia los inputs al rechazar');
});

test("the venue operations work on the fresh state and never on the local copy", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const ops = extractOperacionesSede(demo);

  for(const [nombre, cuerpo] of Object.entries(ops)){
    // Toda la intención se aplica sobre `fresh`: partir de la copia local es lo que
    // revertía una dirección ajena o duplicaba un rename.
    assert.match(cuerpo, /persistFocalizado\(fresh=>\{/, `${nombre}: no usa el escritor focalizado`);
    assert.doesNotMatch(cuerpo, /state\./, `${nombre}: toca el estado local`);
    assert.doesNotMatch(cuerpo, /persist\(\)/, `${nombre}: sigue usando el escritor viejo`);
    // Devuelven el motivo: "ya existe", "ya no está" y "no hay conexión" no son lo mismo.
    assert.match(cuerpo, /return \{ok, motivo\};/, `${nombre}: no devuelve el motivo`);
  }

  // La identidad que cruza el await es la clave, nunca el índice.
  assert.match(ops.editar, /const indice = buscarSedeEnFresco\(fresh\.sedes, clavePropia\);/);
  assert.match(ops.eliminar, /const indice = buscarSedeEnFresco\(fresh\.sedes, clavePropia\);/);
  for(const nombre of ['editar', 'eliminar']){
    assert.match(ops[nombre], /if\(indice < 0\)\{ motivo = SEDE_SIN_OBJETIVO; return false; \}/,
      `${nombre}: no falla cerrado cuando la cancha ya no está`);
  }
  const buscar = sliceBetween(demo, 'function buscarSedeEnFresco(sedes, clave){', '\n}', 'buscarSedeEnFresco');
  assert.match(buscar, /findIndex\(sede => sedeKey\(sede\.name\) === clave\)/);
});

test("the venue handlers never touch the local state before the save", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const s = extractSedes(demo);

  for(const [nombre, handler] of [['agregar', s.agregar], ['editar', s.editar], ['eliminar', s.eliminar]]){
    const h = ramas(handler, nombre);
    // Save-first: sin mutación previa no hay rollback que mantener, y un guardado
    // rechazado no deja residuo que el sondeo tenga que corregir.
    assert.doesNotMatch(h.previo, /state\.sedes/, `${nombre}: muta las canchas locales antes de guardar`);
    assert.doesNotMatch(h.todo, /dataset\.idx/, `${nombre}: sigue resolviendo la cancha por índice`);
    // La rama de fallo no revierte nada porque no hay nada revertido.
    assert.doesNotMatch(h.fallo, /state\.sedes/, `${nombre}: revierte estado que nunca tocó`);
  }

  // La identidad viaja en el markup de las tres filas.
  const fila = sliceBetween(demo, '<input type="text" data-sede-key=', '`;', 'la fila de la lista de canchas');
  assert.equal((fila.match(/data-sede-key="\$\{escapeHtml\(sedeKey\(s\.name\)\)\}"/g) || []).length, 3,
    'faltan claves en la fila: van en los dos inputs y en el botón de eliminar');
  assert.match(demo, /<button class="icon-btn danger" data-sede-key="\$\{escapeHtml\(sedeKey\(s\.name\)\)\}" data-action="delete-sede"/);
  assert.doesNotMatch(fila, /data-idx=/, 'la fila sigue llevando el índice');

  // Los handlers pasan la clave, no el índice.
  assert.match(s.editar, /editarSede\(inp\.dataset\.sedeKey, campo, valor\)/);
  assert.match(s.eliminar, /eliminarSede\(btn\.dataset\.sedeKey\)/);
});

test("the venue handlers only touch the screen once the save landed", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const s = extractSedes(demo);

  // El alta limpia los inputs recién con el ok: antes los vaciaba primero y tenía que
  // reponer lo tipeado en la rama de error para que el reintento fuera posible.
  const alta = ramas(s.agregar, 'agregar cancha');
  assert.doesNotMatch(alta.previo, /\.value = ''/, 'limpia los inputs antes de saber si guardó');
  assert.doesNotMatch(alta.fallo, /\.value = name/, 'sigue reponiendo lo tipeado a mano');
  const exitoAlta = alta.todo.slice(alta.todo.indexOf('return;', alta.todo.indexOf('if(!ok){')));
  assert.match(exitoAlta, /nameInput\.value = '';/);
  assert.match(exitoAlta, /renderSedesManageList\(\);/, 'no vuelve a dibujar la lista tras guardar bien');

  // Un rename cambia la clave de la fila: sin actualizarla, el cambio siguiente sobre
  // esa misma fila buscaría un nombre que ya no existe. Se reescriben los atributos en
  // vez de redibujar, porque el onchange del nombre salta al pasar al campo de
  // dirección y redibujar le sacaría el foco recién puesto.
  const edicion = ramas(s.editar, 'editar cancha');
  const exitoEdicion = edicion.todo.slice(edicion.todo.indexOf('return;', edicion.todo.indexOf('if(!ok){')));
  assert.match(exitoEdicion, /if\(campo === 'name'\)\{/, 'no actualiza la clave de la fila tras un rename');
  assert.match(exitoEdicion, /const claveNueva = sedeKey\(valor\);/);
  assert.match(exitoEdicion, /querySelectorAll\('\[data-sede-key\]'\)\.forEach\(el=>\{\s*\r?\n\s*el\.dataset\.sedeKey = claveNueva;/);
  assert.doesNotMatch(exitoEdicion, /renderSedesManageList\(\);/, 'redibuja la lista y le roba el foco al campo siguiente');

  // La baja repinta también el desplegable de canchas del modal de partido.
  const baja = ramas(s.eliminar, 'eliminar cancha');
  const exitoBaja = baja.todo.slice(baja.todo.indexOf('return;', baja.todo.indexOf('if(!ok){')));
  assert.match(exitoBaja, /populateLocSelect\(state\.matchInfo\.loc\);/);
  assert.doesNotMatch(baja.previo, /populateLocSelect/, 'repinta el desplegable antes de saber si guardó');
});

test("the venue manager keeps a persistent inline error until the next attempt", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const s = extractSedes(demo);

  // Mismo patrón que editar partido. El toast se va a los 3.2s y no alcanza como
  // señal de "hay un cambio que no se guardó" mientras el modal sigue abierto.
  assert.match(demo, /<p class="modal-error" id="sedes-error" role="alert" hidden><\/p>/);
  assert.match(demo, /const SEDES_ERROR_GUARDADO = 'No se pudo guardar el cambio en las canchas\. Revisá la conexión e intentá otra vez\.';/);
  assert.match(demo, /const SEDES_ERROR_DUPLICADO = 'Ya tenés una cancha con ese nombre\.';/);
  // Reintentar no sirve cuando la cancha ya no existe: necesita su propio aviso en vez
  // de compartir el de "revisá la conexión".
  assert.match(demo, /const SEDES_ERROR_SIN_OBJETIVO = 'Esa cancha ya no existe: otro dispositivo la eliminó\.';/);
  const mensaje = sliceBetween(demo, 'function mensajeDeErrorDeSede(motivo){', '\n}', 'el mapeo de motivos a avisos');
  assert.match(mensaje, /if\(motivo === SEDE_DUPLICADA\) return SEDES_ERROR_DUPLICADO;/);
  assert.match(mensaje, /if\(motivo === SEDE_SIN_OBJETIVO\) return SEDES_ERROR_SIN_OBJETIVO;/);
  assert.match(mensaje, /return SEDES_ERROR_GUARDADO;/);

  // Se limpia antes de cada intento, en los tres, y también al abrir y al cerrar.
  for(const [nombre, handler] of [['agregar', s.agregar], ['editar', s.editar], ['eliminar', s.eliminar]]){
    const limpieza = handler.indexOf('hideSedesError();');
    assert.ok(limpieza > -1, `${nombre}: no limpia el aviso antes de intentar`);
    assert.ok(limpieza < handler.indexOf('const {ok, motivo} = await '), `${nombre}: limpia el aviso después del intento`);
    assert.match(handler, /showSedesError\(mensajeDeErrorDeSede\(motivo\)\);/, `${nombre}: no distingue el motivo del fallo`);
  }
  for(const marcador of ["document.getElementById('open-manage-sedes-btn').onclick", "document.getElementById('manage-sedes-close').onclick"]){
    const tramo = sliceBetween(demo, marcador, '\n};', marcador);
    assert.match(tramo, /hideSedesError\(\);/, `${marcador} no limpia el aviso`);
  }
});

test("the venue handlers never claim success when the save was rejected", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");
  const s = extractSedes(demo);

  // El aviso inline es la única fuente: duplicarlo en un toast sería ruido, y un
  // toast de éxito en la rama de error es justo el bug que este PR corrige.
  for(const [nombre, handler] of [['agregar', s.agregar], ['editar', s.editar], ['eliminar', s.eliminar]]){
    const h = ramas(handler, nombre);
    assert.doesNotMatch(h.fallo, /showToast/, `${nombre}: avisa el error con un toast`);
    assert.match(h.fallo, /return;/, `${nombre}: la rama de error no corta la ejecución`);
    assert.doesNotMatch(handler, /await (agregar|editar|eliminar)Sede\([^)]*\);(?!\s*\r?\n\s*if\(!ok\))/,
      `${nombre}: hay una operación cuyo resultado no se comprueba`);
  }
});
