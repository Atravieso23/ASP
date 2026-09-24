# Administrar roster desde Organizador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el grupo administre altas y bajas del roster habitual desde dos accesos compactos de Organizador, sin perder historial.

**Architecture:** `habitualPlayers` sigue siendo la fuente de verdad. Una nueva escritura focalizada `sacarDelRoster(nombre)` relee el blob, quita únicamente la identidad habitual y su response regular actual; las listas se renderizan dentro de dos modales existentes en estilo, pero nuevos y separados. Los botones de Organizador sólo abren esos modales y el modal de roster delega la baja a su writer.

**Tech Stack:** HTML, CSS y JavaScript en un único `sites-app/public/demo.html`; Node built-in test runner; ESLint; Supabase mediante el adaptador existente `persistFocalizado`.

**Spec:** `docs/superpowers/specs/2026-09-24-administrar-roster-organizador-design.md`

## Global Constraints

- `habitualPlayers` es la fuente de verdad de membresía; la baja identifica el nombre con `trim()` y `toLocaleLowerCase('es')`.
- Una baja quita la response no invitada actual asociada a esa identidad; no toca invitados, pagos, tarjetas, `history`, `players`, `sedes`, `formations`, `frequentAliases` ni solicitudes resueltas.
- La única vía nueva de cliente que escribe `habitualPlayers` es `sacarDelRoster(nombre)`; revalida contra el estado fresco y no escribe si ya no existe.
- No hay roles reales: Organizador es control operativo visible, no permiso verificado.
- Organizador muestra dos accesos compactos de igual jerarquía: `Solicitudes (N)` y `Roster (N)`; cada uno abre su propio modal y no deja listas largas expuestas por defecto.
- La confirmación exacta de baja es: `¿Sacar a "{Nombre}" del roster? También se eliminará su respuesta al partido actual. El historial de fechas anteriores no cambia.`
- Los paneles y acciones deben funcionar a 320px y 375px, sin scroll horizontal, y sus controles tienen área táctil de 44px.
- No añadir dependencias, roles, motivos de baja, rehabilitación ni escrituras reales de Supabase durante la validación.

## Review Focus

- Baja de un nombre con mayúsculas, acentos o espacios: sólo debe afectar a esa identidad normalizada y a su response regular, no a un invitado homónimo.
- Doble toque o una baja resuelta por otro dispositivo: el segundo intento no debe escribir ni quitar a otro integrante.
- Una persona retirada que estaba elegida en el mismo navegador: debe volver al selector de identidad y no conservar una selección inválida.
- Roster sin integrantes y solicitudes sin pendientes: ambos modales deben explicar el vacío y cerrarse sin error.
- Nombres largos: deben envolver en la fila del modal; los controles no deben recortarse ni abrir scroll horizontal a 320px.

---

### Task 1: Escritura focalizada de baja y protección de datos

**Files:**
- Modify: `sites-app/public/demo.html:2863-2895, 4705-4805`
- Modify: `sites-app/tests/solicitudes-alta.test.mjs`
- Modify: `sites-app/tests/registro-lista-cerrada.test.mjs`
- Modify: `docs/runbook-agregar-habitual.md`

**Interfaces:**
- Consumes: `persistFocalizado(aplicar)`, `state.habitualPlayers`, `state.responses`.
- Produces: `async function sacarDelRoster(nombreCrudo): Promise<boolean>`.
- Contract: returns `true` only after a fresh blob contains the habitual identity and the callback removes it; returns `false` and makes zero writes for blank, absent or already removed names.

- [ ] **Step 1: Write failing writer tests in `solicitudes-alta.test.mjs`**

Extend `WRITER_SOURCE` and `makeWorld()` to expose `sacarDelRoster`. Add focused cases using the existing fake `persistFocalizado`:

```js
test("sacarDelRoster: quita el habitual y su response regular actual", async () => {
  const w = makeWorld(serverOf([], {
    habitualPlayers: ["Ale", "Félix BV"],
    responses: [
      { responseId: "r-ale", isGuest: false, habitualName: "Ale", name: "Ale", paid: true },
      { responseId: "r-felix", isGuest: false, habitualName: "Félix BV", name: "Félix", paid: false },
      { responseId: "g-ale", isGuest: true, invitedBy: "Ale", name: "Ale", paid: false },
    ],
  }));
  assert.equal(await w.sacar("  félix bv "), true);
  assert.deepEqual(w.server().habitualPlayers, ["Ale"]);
  assert.deepEqual(w.server().responses.map(r => r.responseId), ["r-ale", "g-ale"]);
});
```

Add tests that assert: the writer preserves `matchInfo`, `history`, `cards`, `players`, `sedes`, `formations`, `frequentAliases` and `solicitudesAlta`; an absent name returns `false` with zero writes; calling twice makes only one write; a response with matching display `name` but different `habitualName` is preserved.

- [ ] **Step 2: Run only the new tests and confirm failure**

Run from `sites-app`:

```powershell
node --test tests/solicitudes-alta.test.mjs
```

Expected: failing tests because `sacarDelRoster` does not yet exist.

- [ ] **Step 3: Implement the writer in `demo.html`**

Add it beside `aprobarSolicitudDeAlta()` and use the fresh callback only:

```js
async function sacarDelRoster(nombreCrudo){
  const nombre = String(nombreCrudo == null ? '' : nombreCrudo).trim();
  if(!nombre) return false;
  const clave = nombre.toLocaleLowerCase('es');
  return persistFocalizado(fresh=>{
    const habituales = Array.isArray(fresh.habitualPlayers) ? fresh.habitualPlayers : [];
    const existe = habituales.some(h=>String(h).trim().toLocaleLowerCase('es')===clave);
    if(!existe) return false;
    fresh.habitualPlayers = habituales.filter(h=>String(h).trim().toLocaleLowerCase('es')!==clave);
    fresh.responses = (Array.isArray(fresh.responses) ? fresh.responses : []).filter(r=>
      r && (r.isGuest || String(r.habitualName || '').trim().toLocaleLowerCase('es')!==clave)
    );
    return true;
  });
}
```

Use the repository's existing error handling convention around `persistFocalizado`; do not call `guardarCambioEnResponses`, mutate local arrays before the fresh read, or add an alternate writer.

Update the guard test in `registro-lista-cerrada.test.mjs` so it explicitly permits only `aprobarSolicitudDeAlta()` and `sacarDelRoster()` to mutate `habitualPlayers`, while all other existing writers remain prohibited. Update `docs/runbook-agregar-habitual.md` to make the Organizador flow the normal path and retain the CLI as an operational fallback.

- [ ] **Step 4: Run focused tests and confirm they pass**

```powershell
node --test tests/solicitudes-alta.test.mjs tests/registro-lista-cerrada.test.mjs tests/habitual-players.test.mjs
```

Expected: PASS, including no regression to the existing rule that ordinary player registration cannot alter membership.

- [ ] **Step 5: Commit the data layer**

```powershell
git add sites-app/public/demo.html sites-app/tests/solicitudes-alta.test.mjs sites-app/tests/registro-lista-cerrada.test.mjs docs/runbook-agregar-habitual.md
git commit -m "feat: permitir bajas desde el roster"
```

### Task 2: Dos accesos compactos y modales de gestión

**Files:**
- Modify: `sites-app/public/demo.html:682-700, 1051-1058, 1207-1268, 1718-1724, 2942-2960, 5186-5213`
- Modify: `sites-app/tests/solicitudes-alta.test.mjs`
- Modify: `sites-app/tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `state.solicitudesAlta`, `state.habitualPlayers`, `renderSolicitudesAlta()`, `sacarDelRoster(nombre)`.
- Produces: `renderGestionRoster()`, `renderSolicitudesAlta()` for the solicitudes modal, and modal controls `open-join-requests`, `open-roster-manager`, `manage-join-requests-overlay`, `manage-roster-overlay`.
- Contract: the main Organizador view shows only two count-bearing buttons. Each opens exactly its own modal; row actions are delegated from the static list element.

- [ ] **Step 1: Write failing render and markup tests**

Replace the current main-card expectations with tests that enforce compact entry points and hidden detail by default:

```js
test("Organizador muestra dos accesos compactos, no las listas abiertas", () => {
  assert.match(demo, /id="open-join-requests"/);
  assert.match(demo, /id="open-roster-manager"/);
  assert.match(extractFunction(demo, "renderGestionRoster"), /Solicitudes \(\$\{/);
  assert.match(extractFunction(demo, "renderGestionRoster"), /Roster \(\$\{habituales\.length\}\)/);
  const organizerMarkup = demo.slice(demo.indexOf('id="organizer-view"'), demo.indexOf('id="history-view"'));
  assert.doesNotMatch(organizerMarkup, /id="join-requests-list"|id="roster-manage-list"/);
});
```

Add DOM-fake tests for `renderSolicitudesAlta()` and `renderGestionRoster()` that assert pending-only requests, exact counts, roster names, `data-sacar-del-roster` on every habitual, and clear empty-state copy. Add source tests that both modal IDs are included in `anyModalOpen`, preventing refresh from replacing an open panel.

- [ ] **Step 2: Run the focused tests and confirm failure**

```powershell
node --test tests/solicitudes-alta.test.mjs tests/rendered-html.test.mjs
```

Expected: FAIL because the current Organizer card renders the requests list inline and no roster modal exists.

- [ ] **Step 3: Implement compact controls, modals, renderers and event wiring**

Replace the inline `Solicitudes pendientes` card with a compact `Gestión de jugadores` card containing two 44px buttons. Render their labels from `state` on every `renderLocalOrganizer()` call:

```js
function renderGestionRoster(){
  const solicitudes = Array.isArray(state?.solicitudesAlta) ? state.solicitudesAlta : [];
  const habituales = Array.isArray(state?.habitualPlayers) ? state.habitualPlayers : [];
  document.getElementById('open-join-requests').textContent = `Solicitudes (${solicitudes.filter(s=>s?.estado==='pendiente').length})`;
  document.getElementById('open-roster-manager').textContent = `Roster (${habituales.length})`;
}
```

Create two separate modal overlays following the existing `manage-morosos-overlay` structure:

- `manage-join-requests-overlay`: title `Solicitudes pendientes`, the existing empty/list IDs, and `manage-join-requests-close`.
- `manage-roster-overlay`: title `Roster actual`, explanatory text, `roster-manage-empty`, `roster-manage-list`, and `manage-roster-close`.

Move the existing request list into its modal without changing approve/reject copy. Implement `renderRosterManageList()` as a pure render over `state.habitualPlayers`, escaping names and rendering:

```html
<li class="join-request-row">
  <span class="jr-name">{nombre escapado}</span>
  <button type="button" class="jr-reject" data-sacar-del-roster="{nombre escapado}">Sacar del roster</button>
</li>
```

Use the existing row styles with `flex-wrap`, 12px/14px floors and 44px buttons; do not create a third visual system. Wire open/close controls, add both overlay IDs to `anyModalOpen`, and delegate clicks from `roster-manage-list`. Before calling the writer, use this exact confirmation template:

```js
const pregunta = `¿Sacar a "${nombre}" del roster? También se eliminará su respuesta al partido actual. El historial de fechas anteriores no cambia.`;
if(!window.confirm(pregunta)) return;
```

Disable only the clicked button during the operation, show the established error toast when it fails, then refresh/render the management counts and open panel from the resulting state.

- [ ] **Step 4: Run focused tests and confirm they pass**

```powershell
node --test tests/solicitudes-alta.test.mjs tests/rendered-html.test.mjs tests/disponibilidad-jugador.test.mjs
```

Expected: PASS, including existing organizer refresh wiring.

- [ ] **Step 5: Commit the management interface**

```powershell
git add sites-app/public/demo.html sites-app/tests/solicitudes-alta.test.mjs sites-app/tests/rendered-html.test.mjs
git commit -m "feat: agrupar gestión de jugadores en Organizador"
```

### Task 3: Recuperación de identidad local y validación móvil

**Files:**
- Modify: `sites-app/public/demo.html:4033-4037, 4134-4138, 4836-4870, 5720-5726`
- Modify: `sites-app/tests/solicitudes-alta.test.mjs`

**Interfaces:**
- Consumes: successful `sacarDelRoster(nombre)`, `currentLocalResponseName`, `LOCAL_CURRENT_PLAYER_KEY`, `setRegisteredPlayerNameMode(true)`.
- Produces: `limpiarIdentidadRetirada(nombre)`.
- Contract: only the browser whose selected identity matches the removed habitual clears its local identity; all other browsers simply observe the updated roster after refresh.

- [ ] **Step 1: Write a failing local-identity test**

Extract the helper into the VM harness and test the exact browser state transition:

```js
test("limpiarIdentidadRetirada: limpia sólo la identidad retirada de este dispositivo", () => {
  const w = makeLocalIdentityWorld({ currentLocalResponseName: "Félix BV" });
  assert.equal(w.limpiar("  félix bv "), true);
  assert.equal(w.currentName(), "");
  assert.deepEqual(w.localStorage.removed, ["asp_current_player_demo_v1"]);
  assert.equal(w.nameModeCalls, 1);
});
```

Add the negative case for another person: no storage call and no mode change. Add a source assertion that the successful roster-removal handler calls this helper only after the writer returns `true`.

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
node --test tests/solicitudes-alta.test.mjs
```

Expected: FAIL because the helper and successful-handler call do not yet exist.

- [ ] **Step 3: Implement local recovery**

Implement `limpiarIdentidadRetirada(nombre)` using the same normalized comparison as the writer. On a match, set `currentLocalResponseName = ''`, remove `LOCAL_CURRENT_PLAYER_KEY` inside the existing `try/catch` style, call `setRegisteredPlayerNameMode(true)`, clear the identity input, and return `true`; otherwise return `false`. Invoke it only after a successful `sacarDelRoster(nombre)` result. Do not clear availability, guests or any other browser's state preemptively.

- [ ] **Step 4: Run focused tests, then the full automated suite**

```powershell
node --test tests/solicitudes-alta.test.mjs
npm test
npm run lint
git diff --check
```

Expected: all commands succeed. The complete test command is run from `sites-app`.

- [ ] **Step 5: Smoke the actual Organizador UI before committing**

Run the local app with fake Supabase data only. At both 320px and 375px, verify:

1. The main Organizador view contains only `Solicitudes (N)` and `Roster (N)`, without either long list.
2. Each button opens the correct modal; close returns to Organizador.
3. A long pending name wraps and Aprobar/Rechazar stay tappable.
4. A long roster name wraps and `Sacar del roster` stays tappable.
5. Confirming a roster removal updates its count, removes the current response, preserves a guest homonym, and keeps the modal legible.
6. No horizontal scroll or clipped controls occur, and browser console is clean.

Do not connect the smoke to real Supabase and do not deploy.

- [ ] **Step 6: Commit recovery and verification changes**

```powershell
git add sites-app/public/demo.html sites-app/tests/solicitudes-alta.test.mjs
git commit -m "fix: limpiar identidad al sacar del roster"
```

## Final verification before PR

- [ ] Run from `sites-app`: `npm test`, `npm run lint`, and `git diff --check`.
- [ ] Inspect `git diff main...HEAD -- sites-app/public/demo.html sites-app/tests/solicitudes-alta.test.mjs sites-app/tests/registro-lista-cerrada.test.mjs sites-app/tests/rendered-html.test.mjs docs/runbook-agregar-habitual.md` and confirm every change implements this plan.
- [ ] Repeat the 320px and 375px fake-data smoke from Task 3 after the final commit.
- [ ] Report the branch, commits, exact verification results, the untracked `.superpowers/` directory if still present, and stop before push, PR, merge, deploy or real Supabase writes.
