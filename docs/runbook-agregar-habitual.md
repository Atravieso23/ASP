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

- **No corre solo.** No está en el build; los tests sólo importan sus helpers
  puros (el `main()` está detrás de un guard de entrypoint y no se dispara).
- Es una escritura manual a producción: **dry-run por defecto**, no escribe nada
  hasta pasar `--apply`.
- Hace **una sola** escritura: un PATCH sobre la columna `data` de la fila
  `id=1`, preservando **todas** las demás keys (`responses`, `history`,
  `matchInfo`, `sedes`, `cards`, etc.). No toca responses ni pagos.

Tiene **dos modos**:

| Modo | Qué hace | `--force` |
| --- | --- | --- |
| `--add "Nombre"` / `--remove "Nombre"` | cambio **quirúrgico** de UN nombre sobre la lista que hay **hoy en el server** (lee fresco, aplica ± 1, escribe). No usa la constante. | no aplica |
| reseed (sin `--add`/`--remove`) | escribe la constante `HABITUAL_PLAYERS` **entera**. Aborta si el server ya tiene lista no vacía. | requerido para pisar |

```
# cambio de un nombre (lo habitual)
node scripts/seed-habitual-players.mjs --add "Nombre"            # dry-run
node scripts/seed-habitual-players.mjs --add "Nombre" --apply    # escribe
node scripts/seed-habitual-players.mjs --remove "Nombre"         # dry-run
node scripts/seed-habitual-players.mjs --remove "Nombre" --apply # escribe

# reseed completo (raro: sólo tras un deploy que cambia la lista base entera)
node scripts/seed-habitual-players.mjs                           # dry-run
node scripts/seed-habitual-players.mjs --apply --force           # reemplaza la lista
```

### Atajos npm

`sites-app/package.json` expone dos alias para el camino por defecto (`--add` /
`--remove`). Todo lo demás del script no cambia: siguen siendo **dry-run salvo
`--apply`**, corren desde el repo (no desde la app), y `--apply` sigue siendo
**Nivel 3 con autorización propia**.

```
cd sites-app

# agregar un habitual
npm run habitual:add -- "Nombre Identidad"              # dry-run
npm run habitual:add -- "Nombre Identidad" --apply      # escribe (Nivel 3)

# sacar un habitual
npm run habitual:remove -- "Nombre Identidad"           # dry-run
npm run habitual:remove -- "Nombre Identidad" --apply   # escribe (Nivel 3)
```

El `--` es de npm: separa los args del script de los de `npm run`. El nombre va
entre comillas. `--apply` va **después** del nombre. El reseed completo con
`--force` **no** tiene alias: se corre con `node ...` a mano, a propósito.

`--add` aborta (0 writes) si el nombre normalizado ya está. `--remove` aborta
(0 writes) si no está; si el nombre a sacar tiene una response no-invitada en la
fecha, imprime una **advertencia con el `responseId`** y sigue (la response no se
toca: queda como historial).

> Una ejecución real de `--apply` contra producción es **Nivel 3** (toca datos de
> prod). El PR que agrega estos modos NO autoriza ninguna escritura: cada
> ejecución real necesita su propia autorización explícita.

---

## Procedimiento seguro — `--add` / `--remove` (camino por defecto)

> **Antes de empezar:** el jugador nuevo **no puede usar la app** hasta que se
> corra el `--apply`. El selector "¿Quién sos?" es cerrado y `savePlayerRegistration`
> tiene un gate duro contra `habitualPlayers`: sin estar en la lista no se puede
> registrar ni ver su estado. Avisale que va a estar bloqueado hasta entonces.
>
> **Qué te pasa el organizador:** el **string de identidad base** exacto — nombre
> real o corto, el que va a ser la clave estable. **No** la casaca ni un apodo que
> la persona vaya a querer cambiar después (eso vive en `response.name`, editable
> desde la app). Si dudás, preguntá; el nombre no se cambia fácil una vez sembrado.

### 1. Dry-run

```
cd sites-app
npm run habitual:add -- "Nombre Identidad"        # o: npm run habitual:remove -- "Nombre"
# equivalente sin alias: node scripts/seed-habitual-players.mjs --add "Nombre Identidad"
```

Imprime:

- `habitualPlayers actual en el servidor: [...]` — la verdad de hoy;
- `diff:  + "Nombre"` (o `- "Nombre"`);
- `habitualPlayers a escribir: [...]`;
- `Se preservan sin tocar N keys: responses, history, matchInfo, ...`;
- en `--remove`, la advertencia de responses homónimas si las hay.

### 2. Revisá el diff

- El cambio es **exactamente** ± un nombre. La lista "a escribir" es la del
  server con ese único cambio.
- Nombre nuevo **único** normalizado (`trim` + minúsculas) contra el resto. Si
  choca, el script ya aborta; elegí apellido o apodo para distinguir.
- Es la **identidad base**, no la casaca: no metas apodos que la persona vaya a
  querer cambiar después.
- Guardá la salida del dry-run: la lista `actual` impresa es tu pre-estado para
  rollback.

### 3. Autorización explícita

`--apply` contra producción es **Nivel 3** (toca datos de prod) y necesita su
**propia autorización explícita** — el PR que agregó estos alias/modos no la
cubre. Pedí el OK y elegí un momento tranquilo: no en pleno miércoles de
confirmaciones; **no con el partido empezado y sin evaluar** si el afectado está
"Estoy" impago (riesgo de comerse una 🟨 — ver [tarjetas](#tarjetas)).

### 4. Escribí

```
npm run habitual:add -- "Nombre Identidad" --apply
# equivalente: node scripts/seed-habitual-players.mjs --add "Nombre Identidad" --apply
```

`--apply` va **después** del nombre. Una sola escritura PATCH sobre `id=1`, sólo
la key `habitualPlayers`; el resto del blob (`responses`, `history`, `cards`,
`matchInfo`, `sedes`, …) se preserva por construcción.

### 5. Verificá en la app

- El selector "¿Quién sos?" muestra al nuevo (o ya no muestra al que sacaste).
- "Faltan responder" lo incluye (ver [impacto](#impacto-en-faltan-confirmar)).
- Ninguna response cambió: nombres, pagos y equipos de la fecha siguen igual.

---

## Procedimiento del reseed completo (raro)

Sólo cuando cambia la lista base entera (p. ej. el deploy 16 → 14). Requiere
reconciliar la constante `HABITUAL_PLAYERS` del script contra lo que devuelve el
dry-run (`node scripts/seed-habitual-players.mjs`), confirmarlo con otro dry-run,
y recién ahí `node scripts/seed-habitual-players.mjs --apply --force`. Para sumar
o sacar **un** nombre no se usa este camino: se usa `--add` / `--remove`.

---

## Riesgos de `--force` (sólo el reseed completo)

`--force` **reemplaza la lista entera**. No hace merge. Los riesgos son todos de
"la constante del script no era la lista real":

- **Revertir un cleanup manual.** Si alguien corrigió una identidad directo sobre
  el blob (p. ej. unificar "Juan RR" → "Juampi Ramos") y el script no lo
  refleja, `--force` lo pisa. Por eso el dry-run previo no es opcional.
- **Perder una alta reciente.** Mismo mecanismo: si se agregó a alguien y no se
  actualizó la constante, `--force` lo borra de la membresía.

`--add` / `--remove` **no tienen este riesgo**: operan sobre la lista fresca del
server, no sobre la constante. Por eso son el camino por defecto.

- **Carrera con otro dispositivo** (todos los modos). El script lee fresco y
  después escribe; los writers de la app hacen lo mismo con el blob completo
  (preservando `habitualPlayers` de la lectura fresca). La ventana es chica y el
  objetivo real de concurrencia es ~5-6 editores, pero conviene correr el script
  en un momento tranquilo.

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
- **No** correr `--apply` (ni `--apply --force`) sin haber hecho antes el dry-run
  y revisado el diff. Para el reseed completo, además reconciliar la constante
  contra lo que hay en prod.
- **No** promover un invitado a habitual "porque ya está en la fecha". Si esa
  persona es habitual, agregala a `habitualPlayers` por este procedimiento; su
  condición de invitado en la fecha actual es un tema aparte.
- **No** tocar otras keys del blob desde el script. El script ya está escrito
  para tocar sólo `habitualPlayers`; no lo extiendas para "aprovechar el viaje".
- **No** hacer esto en pleno pico de confirmaciones si podés evitarlo.

---

## Futuro posible (no implementado)

- **UI sólo para Organizador:** un input "Agregar jugador al grupo" en la vista
  Organizador que hace append a `habitualPlayers` (sin crear response).
  **Evaluado y descartado** en el diagnóstico de septiembre 2026: rompe el
  test-guard "el cliente nunca muta `habitualPlayers`"
  (`registro-lista-cerrada.test.mjs`, `habitual-players.test.mjs`) y, como la
  vista Organizador **no tiene noción de permisos**, "organizer-controlled"
  degradaría a "cualquiera con la URL edita la membresía" — choca con el
  invariante de producto. Si alguna vez se retoma, es un PR Nivel 3 propio con
  las 5 preguntas de diseño y esa decisión de producto explícita.

Los modos `--add` / `--remove` del script ya están implementados y son el camino
por defecto, ahora con alias npm (`npm run habitual:add` / `habitual:remove`).
Siguen siendo dev-only: corren desde el repo, no desde la app. El alta de un
habitual es rara (unas pocas veces al año); el script quirúrgico + este runbook
alcanzan sin sumar sistema.
