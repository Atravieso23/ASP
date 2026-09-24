# Recordar jugador por dispositivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada navegador recuerde opcionalmente al último jugador habitual elegido, para facilitar próximos partidos sin vincular dispositivos ni otorgar permisos nuevos.

**Architecture:** Una clave nueva de `localStorage` guarda sólo la identidad habitual canónica elegida explícitamente mediante el checkbox. Al cargar, una función pura valida esa preferencia contra el roster: restaura una response propia existente o preselecciona la identidad para una respuesta nueva, pero nunca reclama ni edita automáticamente una response de otro dispositivo. La persistencia compartida y `ownerIds` no cambian por el checkbox.

**Tech Stack:** HTML, CSS y JavaScript en `sites-app/public/demo.html`; Node built-in test runner; ESLint; `localStorage` del navegador.

**Spec:** `docs/superpowers/specs/2026-09-24-recordar-jugador-dispositivo-design.md`

## Global Constraints

- La etiqueta visible exacta es `Recordar este jugador en este dispositivo` y no lleva texto auxiliar.
- El checkbox comienza desmarcado para una identidad no recordada; la selección no se presupone.
- El recuerdo usa una clave local nueva y sólo guarda la identidad habitual canónica; no guarda respuesta, pago, disponibilidad ni `ownerId`.
- Celular y desktop no se vinculan, sincronizan ni comparten permisos.
- Recordar una identidad no permite reclamar, editar ni sobrescribir una response perteneciente a otro dispositivo.
- Si la identidad recordada ya no está en `habitualPlayers`, se elimina el recuerdo y se muestra Registro.
- La baja de roster elimina también el recuerdo local de esa identidad en el dispositivo que ejecuta la baja.
- No añadir dependencias, cuentas, QR, códigos, roles, ni escrituras reales de Supabase durante validación.

## Review Focus

- Preferencia vieja o manipulada: una identidad ausente del roster se elimina localmente y no llega al selector.
- Response de otro dispositivo: el recuerdo puede rellenar la identidad, pero mantiene la confirmación/claim actual y no cambia `ownerIds` solo.
- Partido nuevo sin response propia: el jugador recordado queda listo para responder, sin crear una response hasta que toque Guardar cambios.
- Desmarcar el checkbox: elimina sólo la preferencia local y no altera la response actual ni el acceso ya adquirido.
- Nombre largo a 320px: checkbox y etiqueta quedan legibles, tocables y sin scroll horizontal.

---

### Task 1: Preferencia local explícita y pruebas de seguridad

**Files:**
- Modify: `sites-app/public/demo.html:4224-4253, 4939-4951`
- Create: `sites-app/tests/recordar-jugador-dispositivo.test.mjs`
- Modify: `sites-app/package.json`
- Modify: `sites-app/tests/solicitudes-alta.test.mjs`

**Interfaces:**
- Produces: `const LOCAL_REMEMBERED_HABITUAL_KEY = 'asp_remembered_habitual_v1'`.
- Produces: `leerJugadorRecordado(estado): string`, `guardarJugadorRecordado(nombre): boolean`, `olvidarJugadorRecordado(nombre): boolean`.
- Consumes: `state.habitualPlayers`, `localStorage`, the existing normalized-name convention (`trim()` + `toLocaleLowerCase('es')`).
- Contract: the storage value is the exact canonical roster entry or is absent; invalid/removed entries are deleted; these helpers never mutate `state`, `responses`, `ownerId` or `ownerIds`.

- [ ] **Step 1: Write failing unit tests for local preference helpers**

Create `tests/recordar-jugador-dispositivo.test.mjs`, extract the helpers from `demo.html` into a Node VM, and use a storage fake. Add these concrete cases:

```js
test("leerJugadorRecordado conserva el casing canónico del roster", () => {
  const w = makeWorld({ stored: "  alejandro leupold de souza jr. ", habituales: ["Alejandro Leupold de Souza Jr."] });
  assert.equal(w.read(), "Alejandro Leupold de Souza Jr.");
  assert.deepEqual(w.storage.removed, []);
});

test("leerJugadorRecordado borra una identidad que ya salió del roster", () => {
  const w = makeWorld({ stored: "Ale", habituales: ["Pablo de Achaval"] });
  assert.equal(w.read(), "");
  assert.deepEqual(w.storage.removed, ["asp_remembered_habitual_v1"]);
});
```

Add tests that `guardarJugadorRecordado` rejects blank/absent identities without writing, `olvidarJugadorRecordado` does nothing for another identity, and all three helpers contain no `persistFocalizado`, `savePlayerRegistration`, `ownerId` or `ownerIds` references.

Extend the existing roster-removal tests to prove `limpiarIdentidadRetirada()` also invokes `olvidarJugadorRecordado()` for the removed habitual and does not erase another remembered player.

- [ ] **Step 2: Run the new tests and confirm failure**

Run from `sites-app`:

```powershell
node --test tests/recordar-jugador-dispositivo.test.mjs tests/solicitudes-alta.test.mjs
```

Expected: FAIL because the preference key and helpers do not exist.

- [ ] **Step 3: Implement only the local helpers**

Add a distinct preference key; do not repurpose `LOCAL_CURRENT_PLAYER_KEY`, because it is a session-era value written by existing registration and claim flows. Implement canonical roster validation:

```js
function leerJugadorRecordado(estado = state){
  let raw = '';
  try{ raw = localStorage.getItem(LOCAL_REMEMBERED_HABITUAL_KEY) || ''; }catch(e){ return ''; }
  const key = String(raw).trim().toLocaleLowerCase('es');
  const habitual = (estado?.habitualPlayers || []).find(h => String(h).trim().toLocaleLowerCase('es') === key);
  if(habitual) return String(habitual);
  if(raw) try{ localStorage.removeItem(LOCAL_REMEMBERED_HABITUAL_KEY); }catch(e){}
  return '';
}
```

`guardarJugadorRecordado(nombre)` must validate against the current roster before `setItem`. `olvidarJugadorRecordado(nombre)` removes the key only when the saved canonical identity matches the normalized argument; it must not clear a different preference. Invoke the latter inside `limpiarIdentidadRetirada()` after its match succeeds.

- [ ] **Step 4: Run focused tests and commit the local data boundary**

```powershell
node --test tests/recordar-jugador-dispositivo.test.mjs tests/solicitudes-alta.test.mjs
git diff --check
git add sites-app/public/demo.html sites-app/tests/recordar-jugador-dispositivo.test.mjs sites-app/tests/solicitudes-alta.test.mjs sites-app/package.json
git commit -m "feat: guardar jugador recordado por dispositivo"
```

Expected: tests and diff check pass; the commit contains no Supabase writer.

### Task 2: Checkbox contextual junto a la identidad

**Files:**
- Modify: `sites-app/public/demo.html:850-870, 5094-5110, 5612-5656, 5898-5913`
- Modify: `sites-app/tests/rendered-html.test.mjs`
- Modify: `sites-app/tests/recordar-jugador-dispositivo.test.mjs`

**Interfaces:**
- Consumes: `leerJugadorRecordado()`, `guardarJugadorRecordado(nombre)`, `olvidarJugadorRecordado(nombre)`, the selected `habitualName`.
- Produces: checkbox `#remember-player-device` and wrapper `#remember-player-device-field`.
- Contract: it is visible only when a valid habitual identity is selected; its checked state reflects that exact identity's local preference; toggling it is local-only.

- [ ] **Step 1: Write failing markup and interaction tests**

Add a source test that requires the exact label and associates it to the checkbox:

```js
test("el checkbox de recuerdo tiene copy exacto y está junto a la identidad", () => {
  assert.match(demo, /id="remember-player-device"/);
  assert.match(demo, /for="remember-player-device">Recordar este jugador en este dispositivo</);
  const identity = demo.slice(demo.indexOf('id="my-player-name"'), demo.indexOf('id="my-status-choice"'));
  assert.match(identity, /remember-player-device/);
});
```

Add VM tests for a valid selected habitual: unremembered renders unchecked; remembered renders checked; an invalid/free name hides the wrapper. Add a handler test that checking calls `guardarJugadorRecordado(habitualName)` and unchecking calls `olvidarJugadorRecordado(habitualName)` without calling a server writer.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
node --test tests/rendered-html.test.mjs tests/recordar-jugador-dispositivo.test.mjs
```

Expected: FAIL because the control and its lifecycle functions do not exist.

- [ ] **Step 3: Implement the contextual control**

Place a semantic checkbox field directly below the chosen identity and before status/availability controls. Use the app's established 12px/14px typography and 44px touch target; do not add helper copy.

Create `renderRememberPlayerDevice()` that derives the selected base identity from the current player/selected name, checks roster membership, sets `checked` through `leerJugadorRecordado()`, and hides the wrapper for Registration or an invalid identity. Call it from the existing identity rendering path and after player changes.

The `change` handler must only set/remove the local preference. It must not save the current response, set a default availability, mutate `ownerIds`, trigger a claim, or show a success toast.

- [ ] **Step 4: Run focused tests and commit the UI**

```powershell
node --test tests/rendered-html.test.mjs tests/recordar-jugador-dispositivo.test.mjs tests/cambiar-jugador-identidad-tomada.test.mjs
git diff --check
git add sites-app/public/demo.html sites-app/tests/rendered-html.test.mjs sites-app/tests/recordar-jugador-dispositivo.test.mjs
git commit -m "feat: permitir recordar jugador en el dispositivo"
```

Expected: all tests pass and existing identity-taken/claim behavior remains unchanged.

### Task 3: Restauración segura al abrir y smoke móvil

**Files:**
- Modify: `sites-app/public/demo.html:1777-1787, 5612-5656, 6066-6080`
- Modify: `sites-app/tests/recordar-jugador-dispositivo.test.mjs`

**Interfaces:**
- Consumes: `leerJugadorRecordado()`, `responseBelongsToCurrentDevice(response)`, `deriveSelectorNames()`, `renderRecurrentPlayerMenu()`, existing claim flow.
- Produces: `restaurarJugadorRecordado()`.
- Contract: it restores existing own response normally; for a new match it preselects only the local habitual identity; for another device's response it leaves ownership unchanged and uses the normal confirm/claim path.

- [ ] **Step 1: Write failing restoration tests**

Add VM tests for all three data states:

```js
test("restaurarJugadorRecordado: partido nuevo preselecciona pero no crea response", () => {
  const w = makeRestoreWorld({ remembered: "Alejandro", habituales: ["Alejandro"], responses: [] });
  w.restore();
  assert.equal(w.input.value, "Alejandro");
  assert.equal(w.calls.save, 0);
  assert.equal(w.calls.claim, 0);
});
```

Add a response owned by this device and assert the existing restore path is called. Add a response owned by another device and assert no `ownerIds` mutation, no save, and no automatic claim. Add a removed remembered player and assert local storage is cleared and Registration remains empty.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
node --test tests/recordar-jugador-dispositivo.test.mjs
```

Expected: FAIL because `restaurarJugadorRecordado()` does not exist.

- [ ] **Step 3: Implement restoration without automatic ownership**

After the initial server state, selector names and own-response detection are ready, call `restaurarJugadorRecordado()` before the normal visual render completes. The helper must:

1. Read and validate the canonical preference.
2. Return immediately when no preference exists or an own response already restores through `restoreCurrentLocalResponse()`.
3. For a valid roster identity with no response, put its canonical name in `#my-player-name`, keep Registration mode, and render the existing selector/menu state without saving.
4. For an existing response belonging to another device, prefill the canonical name but leave `currentLocalResponseName` empty and route only through the already-existing confirmation/claim interaction when the person continues.
5. Never write state, `ownerIds` or Supabase from this helper.

Use the same function after refresh if a remembered identity is invalidated by another device's roster removal, but do not repeatedly overwrite an actively edited input.

- [ ] **Step 4: Run full automated verification**

```powershell
npm test
npm run lint
git diff --check
```

Run from `sites-app`. If Windows cannot execute the existing `npm test` build prefix, run its listed `node --test` files directly and report the pre-existing shell limitation separately.

- [ ] **Step 5: Smoke with fake Supabase data at 320px and 375px**

Verify all of the following without real writes:

1. A newly chosen habitual sees the unchecked checkbox with the exact label.
2. Checking it survives a reload in the same browser and leaves no network write.
3. A next-match state with no response preselects the remembered player but does not create a response until Guardar cambios.
4. A second device's response still requires the existing confirmation/claim path.
5. Unchecking forgets only the preference; current response remains intact.
6. A roster removal clears the remembered identity on the acting device.
7. Long names wrap; checkbox and label fit at 320px and 375px; no horizontal scroll, clipped control or console error.

- [ ] **Step 6: Commit restoration and stop before publication**

```powershell
git add sites-app/public/demo.html sites-app/tests/recordar-jugador-dispositivo.test.mjs
git commit -m "feat: restaurar jugador recordado al abrir"
```

Report branch, commits, test/lint/diff results, smoke evidence and any untracked local directory. Stop before push, PR, merge, deploy or real Supabase writes.