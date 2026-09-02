# Runbook — agregar (o sacar) un habitual del grupo

Procedimiento para modificar la lista de jugadores habituales de ASP de forma
segura. Hoy **no hay UI** para esto: es una operación controlada que corre una
persona con acceso al repo. Este documento existe porque la app ya le dice al
jugador *"pedí que te agreguen en el grupo"*, pero el "agregar" no estaba escrito
en ningún lado.

> Alcance: sólo describe el procedimiento actual. No propone ni habilita una UI
> nueva. Ver [Futuro posible](#futuro-posible) al final.

---

## Modelo mental (leer antes de tocar nada)

### `habitualPlayers` es la fuente de verdad de la membresía

- Vive en el blob JSON de Supabase: `match_data.data.habitualPlayers` (fila
  `id=1`). Es un **array de strings**, una entrada por persona.
- Representa la **membresía estable en el grupo**, no la participación en la
  fecha de esta semana. Son cosas distintas.
- La app arranca con `habitualPlayers: []` y adopta lo que venga del servidor. Un
  blob viejo sin la key se normaliza a `[]` sin romper nada.
- **El cliente nunca escribe `habitualPlayers`.** Ni el registro, ni "Cambiar
  jugador", ni finalizar la fecha, ni "Limpiar todo" la modifican: los writers de
  la app la arrastran intacta desde la lectura fresca del servidor. Está blindado
  por tests (`tests/habitual-players.test.mjs`,
  `tests/registro-lista-cerrada.test.mjs`). La única vía de cambio es la de este
  runbook.

### Identidad estable vs. nombre visible

| Campo | Qué es | Dónde vive |
| --- | --- | --- |
| entrada de `habitualPlayers` | la **identidad base** del grupo (nombre real / corto). Una por persona. | `match_data.data.habitualPlayers` |
| `response.habitualName` | la identidad base **copiada** a la respuesta de la fecha cuando el jugador se identifica desde el selector cerrado. Es la clave estable para dedupe, claim, "Cambiar jugador" y tarjetas. | `match_data.data.responses[].habitualName` |
| `response.name` | el **nombre visible / casaca**. Lo puede editar el jugador ("Nombre en la casaca") sin tocar su identidad. Es lo que se muestra en las listas del partido. | `match_data.data.responses[].name` |

La lista de `habitualPlayers` guarda **sólo la identidad base**. El nombre visible
de cada uno NO va acá: vive en su `response.name`.

### Invariantes de producto

- **Los invitados no son habituales.** `agregarInvitado()` nunca setea
  `habitualName` y nunca toca `habitualPlayers`. Un invitado no se "promueve"
  solo.
- **Agregar un habitual no crea una response.** Sumar un nombre a
  `habitualPlayers` sólo lo hace aparecer en el selector "¿Quién sos?" y en
  "Faltan confirmar". La response nace recién cuando esa persona entra a la app y
  se confirma.
- Sacar un habitual afecta el futuro ("Faltan confirmar" de las próximas
  fechas), no reescribe el historial.

---

## El script

`sites-app/scripts/seed-habitual-players.mjs`

- **No corre solo.** No está en el build ni en los tests.
- Es una escritura manual a producción: **dry-run por defecto**, no escribe nada
  hasta pasar `--apply`.
- Tiene la lista hardcodeada en la constante `HABITUAL_PLAYERS` (hoy, 14
  identidades base).
- Hace **una sola** escritura: un PATCH sobre la columna `data` de la fila
  `id=1`, preservando **todas** las demás keys (`responses`, `history`,
  `matchInfo`, `sedes`, `cards`, etc.). No toca responses ni pagos.
- Si el servidor ya tiene `habitualPlayers` no vacío, **aborta** salvo que pases
  `--force`.

```
node scripts/seed-habitual-players.mjs                 # dry-run: muestra qué haría
node scripts/seed-habitual-players.mjs --apply         # siembra SÓLO si la lista está vacía
node scripts/seed-habitual-players.mjs --apply --force # reemplaza una lista ya existente
```

Producción ya tiene una lista sembrada, así que en la práctica **cualquier cambio
hoy es `--apply --force`**.

---

## Procedimiento seguro

### 1. Leé la lista que hay en producción AHORA

```
cd sites-app
node scripts/seed-habitual-players.mjs
```

El dry-run imprime `habitualPlayers actual en el servidor: [...]`. Esa es la
verdad. **No asumas** que es igual a la constante `HABITUAL_PLAYERS` del script:
puede haber divergido por cleanups manuales previos (correcciones de identidad
hechas directo sobre el blob).

### 2. Reconciliá la constante contra lo que devolvió el dry-run

Editá `HABITUAL_PLAYERS` en el script para que sea **exactamente** la lista de
producción **más** (o menos) el cambio que querés hacer:

- La lista final tiene que ser la de prod + el nuevo nombre. Nada más.
- Cada entrada única normalizada (`trim` + minúsculas): sin duplicados ni
  variantes de la misma persona.
- Nombre nuevo **único** contra el resto de la lista. Si choca con otro habitual,
  usá apellido o apodo para distinguir (igual que con los invitados).
- Es la **identidad base**, no la casaca: no metas apodos que la persona vaya a
  querer cambiar después.

### 3. Confirmá con otro dry-run

```
node scripts/seed-habitual-players.mjs
```

Verificá que `habitualPlayers a escribir` sea la lista correcta y que
`Se preservan sin tocar N keys` liste `responses`, `history`, `matchInfo`, etc.

### 4. Escribí

```
node scripts/seed-habitual-players.mjs --apply --force
```

### 5. Verificá en la app

- El selector "¿Quién sos?" muestra al nuevo (o ya no muestra al que sacaste).
- "Faltan confirmar" lo incluye (ver [impacto](#impacto-en-faltan-confirmar)).
- Ninguna response cambió: los nombres, pagos y equipos de la fecha siguen igual.

---

## Riesgos de `--force`

`--force` **reemplaza la lista entera**. No hace merge. Los riesgos son todos de
"la constante del script no era la lista real":

- **Revertir un cleanup manual.** Si alguien corrigió una identidad directo sobre
  el blob (p. ej. unificar "Juan RR" → "Juampi Ramos") y el script no lo
  refleja, `--force` lo pisa. Por eso el paso 1 (leer prod) no es opcional.
- **Perder una alta reciente.** Mismo mecanismo: si se agregó a alguien y no se
  actualizó la constante, `--force` lo borra de la membresía.
- **Carrera con otro dispositivo.** El script lee fresco y después escribe; los
  writers de la app hacen lo mismo con el blob completo (preservando
  `habitualPlayers` de la lectura fresca). La ventana es chica y el objetivo real
  de concurrencia es de ~5-6 editores, pero conviene correr el script en un
  momento tranquilo (no en pleno miércoles de confirmaciones).

Mitigación: hacer el dry-run del paso 1, copiar la lista que imprime, y
construir la nueva a partir de esa —no a partir de lo que uno recuerda.

---

## Impacto en "Faltan confirmar"

Apenas el nuevo habitual está en la lista, si todavía no respondió aparece en el
bloque **"Faltan confirmar"** (con el 👀 y el chip del contador). No hay forma de
agregarlo "en silencio".

Consecuencia práctica: si lo agregás a mitad de semana, la próxima persona que
abra la app lo va a ver como pendiente y puede pingearlo por WhatsApp. Si es un
tema, agregalo **después** de cerrar la fecha de esa semana, o avisá vos primero
por el grupo.

Un habitual que ya respondió cualquier cosa (incluso "No estoy") **no** figura en
"Faltan confirmar": sólo cuenta la ausencia de una response propia.

---

## Casos borde a mirar

### Invitado homónimo en la fecha

Si en la fecha actual ya hay un **invitado** con el mismo nombre que el habitual
que vas a agregar:

- El alta de nuevos invitados con ese nombre ya está bloqueada (dedupe contra
  `habitualPlayers`).
- El invitado que **ya estaba** sigue en `responses` como `isGuest:true`. No se
  convierte en el habitual ni cuenta como su confirmación.
- Resultado: el habitual nuevo aparece en "Faltan confirmar" aunque haya alguien
  con ese nombre jugando. Es confuso visualmente, no es corrupción. Si pasa,
  resolvelo cambiando el nombre visible del invitado o esperando a que el
  habitual real se confirme.

### Responses legacy sin `habitualName`

Responses viejas pueden no tener `habitualName` (se completó después). "Faltan
confirmar" y el selector matchean esas responses por `name` como fallback:

- Si el nombre del nuevo habitual **coincide** (normalizado) con el `name` de una
  response legacy, esa persona se da por confirmada aunque su response no tenga
  `habitualName`. Suele ser lo correcto.
- Si **difiere** (la response legacy usa un apodo), el habitual nuevo va a
  figurar como pendiente hasta que esa persona re-confirme desde el selector
  cerrado (ahí su response backfillea `habitualName`).

### Tarjetas

`computeCards` arma su lista de identidades vigentes desde `habitualPlayers`. La
regla: al horario de inicio del partido, cada habitual confirmado como "Estoy"
que no figura pago recibe 1 amarilla.

- Si el partido de esa semana **ya fue evaluado** (`cards.evaluated[matchKey]`),
  el latch protege: no se recalcula.
- Si **todavía no** fue evaluado y agregás un habitual que ya está "Estoy" +
  impago, cuando se dispare la evaluación (alguien abre la app pasado el horario
  de inicio) **puede comerse una amarilla**.
- Mitigación: agregar habituales fuera de la ventana "partido empezado y sin
  evaluar", o revisar `cards` después si el timing fue justo.

---

## Qué NO hacer

- **No** agregar un habitual editando `responses` a mano. Agregar membresía no es
  crear una respuesta de la fecha.
- **No** meter apodos o "Nombre en la casaca" en `habitualPlayers`. Va la
  identidad base.
- **No** correr `--apply --force` sin haber hecho antes el dry-run del paso 1 y
  reconciliado la constante contra lo que hay en prod.
- **No** promover un invitado a habitual "porque ya está en la fecha". Si esa
  persona es habitual, agregala a `habitualPlayers` por este procedimiento; su
  condición de invitado en la fecha actual es un tema aparte.
- **No** tocar otras keys del blob desde el script. El script ya está escrito
  para tocar sólo `habitualPlayers`; no lo extiendas para "aprovechar el viaje".
- **No** hacer esto en pleno pico de confirmaciones si podés evitarlo.

---

## Futuro posible (no implementado)

Dos ideas si esto empieza a pasar seguido y molesta el paso manual. Ninguna está
hecha ni aprobada; cada una necesitaría su propio PR con scope y las 5 preguntas
de diseño.

- **UI sólo para Organizador:** un input "Agregar jugador al grupo" en la vista
  Organizador que hace append a `habitualPlayers` (sin crear response). Requiere
  revisar el invariante de test "el cliente nunca muta `habitualPlayers`" y
  definir qué significa "sólo Organizador" (hoy la vista no tiene ninguna noción
  de permisos).
- **Modo `--add` en el script:** `node scripts/seed-habitual-players.mjs --add
  "Nombre"` que lee fresco, hace append + dedupe y escribe, en vez de reemplazar
  la lista entera. Más seguro que mantener la constante a mano, pero sigue siendo
  dev-only.

La frecuencia real hasta hoy es baja (la lista cambió una vez, 16 → 14), así que
por ahora el procedimiento manual de arriba alcanza.
