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
  const confirmedListStart = demo.indexOf("function renderConfirmedList(inList)");
  const simpleListStart = demo.indexOf("function renderSimpleList", confirmedListStart);

  assert.doesNotMatch(demo.slice(confirmedListStart, simpleListStart), /team-square|teamLetter/);
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
  assert.match(demo, /id="count-in"[\s\S]*id="count-out"/);
  assert.doesNotMatch(demo, /id="count-duda"|data-value="doubt"|>En duda</);
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
});

test("keeps player state derived from responses and seeds 18 demo profiles once", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /players: \[\]/);
  assert.match(demo, /const DEFAULT_DEMO_RESPONSES = \[/);
  assert.match(demo, /asp_demo_responses_seeded_v3/);
  assert.match(demo, /localAvailabilityResponses\.length >= 18/);
  assert.equal((demo.match(/\{name:'[^']+', status:/g) ?? []).length, 18);
  assert.match(demo, /localStorage\.setItem\(LOCAL_DEMO_SEEDED_KEY, 'true'\)/);
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
  const ticketMarkup = demo.slice(ticket, demo.indexOf('id="legacy-join-section"'));
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
  assert.match(demo, /id="first-time-player-btn">Primera vez/);
  assert.match(demo, /id="recurrent-player-menu" role="listbox"/);
  assert.match(demo, /function renderRecurrentPlayerMenu\(\)/);
  assert.match(demo, /data-delete-recurrent-index/);
  assert.match(demo, /function setFirstTimeRegistration\(active,preserveValue=false\)/);
  assert.match(demo, /addRecurrentPlayer\(playerName\)/);
});

test("manages per-date guests from the collapsed player status", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /id="guest-manager-toggle"[^>]*>Gestionar invitados/);
  assert.match(demo, /id="guest-manager"[^>]*hidden/);
  assert.match(demo, /function getCurrentPlayerGuests\(\)/);
  assert.match(demo, /item\.isGuest === true/);
  assert.match(demo, /invitedBy:owner\.name/);
  assert.match(demo, /data-guest-status="in"/);
  assert.match(demo, /data-guest-paid="yes"/);
  assert.match(demo, /data-remove-guest/);
  assert.match(demo, /Invitado de \$\{escapeHtml\(item\.invitedBy/);
  assert.match(demo, /localStorage\.removeItem\(LOCAL_AVAILABILITY_KEY\)/);
});

test("keeps the user team summary compact", async () => {
  const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

  assert.match(demo, /\.split\{display:grid; grid-template-columns:1fr; gap:8px;\}/);
  assert.match(demo, /\.split-col ul\{[^}]*flex-wrap:wrap;[^}]*justify-content:center/);
  assert.match(demo, /\.split-col\{[^}]*padding:10px 12px[^}]*border-radius:10px/);
});
