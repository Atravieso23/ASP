# Runbook — pagos, morosos, tarjetas 🟨 y birras 🍺

Documento de referencia de las reglas vigentes del dominio de plata: pago
personal, deuda de la fecha (`Faltan pagar`), sanciones acumuladas
(`Lista de morosos`), tarjetas amarillas y birras.

> **Estado:** describe el comportamiento **actual y aceptado** de
> `sites-app/public/demo.html`. No hay bug funcional confirmado. La lógica de acá
> es la regla vigente, no una propuesta. Cualquier cambio de copy, layout o
> comportamiento es un PR aparte con su propio scope.

Todo el código citado vive en `sites-app/public/demo.html` (archivo único). Los
nombres de función son estables; los números de línea no se citan porque el
archivo se edita seguido.

---

## A. Tres conceptos distintos

Son tres cosas separadas que la gente suele confundir:

| Concepto | Qué es | Dónde se ve | Fuente de verdad |
| --- | --- | --- | --- |
| **Pago personal** | "yo ya puse mi cuota de esta fecha" | checkbox `Ya pagué` dentro de la card **Mi estado** | `response.paid` (boolean / `null`) |
| **`Faltan pagar`** | **deuda viva** de la cuota de la fecha actual: quiénes del "Estoy" todavía no marcaron pago | línea dentro del **ticket**, debajo del resumen de plata | se deriva en vivo de `responses` (`status:'in'` + `paid !== true`) |
| **`Lista de morosos`** | **sanciones acumuladas** del grupo: tarjetas 🟨 y birras 🍺 que se arrastran entre fechas | sección propia, **debajo del bloque de Equipos** | `state.cards.byPlayer` |

**`Faltan pagar` NO es `Lista de morosos`.** El primero es "debés la plata de
hoy" y desaparece apenas pagás. El segundo es "te sancionaron por no pagar a
tiempo en alguna fecha" y no se borra pagando después.

Tras la evaluación de tarjetas de una fecha, la misma persona impaga puede
aparecer **en los dos bloques a la vez**: debe la cuota (`Faltan pagar`) y se
comió la amarilla (`Lista de morosos`). Es correcto: son dos consecuencias del
mismo hecho.

---

## B. `Faltan pagar` (deuda viva de la fecha)

- **Vive en el ticket**, como último nodo, debajo de `.money-summary` (el
  contador "Pagaron X de Y · Recaudado $Z"). Se movió ahí en PR #40; antes estaba
  en el bloque personal de Pago.
- Se recalcula en cada `render()` (el sondeo redibuja cada 4 s).
- **A quién lista:** `getResponsePlayers('in')` filtrado por `!p.paid`. Es decir:
  responses con `status:'in'` cuyo `paid` no es `true` (`false`, `null` o
  ausente cuentan como impago).
- **Incluye invitados.** `state.players` tiene una entrada por cada response,
  invitados incluidos, así que un invitado "Estoy" impago figura en la lista. El
  orden pone primero la response propia no invitada, después los invitados
  propios, después el resto; alfabético dentro de cada grupo.
- **No depende del horario del partido.** Aparece siempre que haya alguien
  "Estoy" sin pago, antes o después del inicio.
- **No depende de las tarjetas** ni de `state.cards`.
- **Si alguien paga tarde, sale de `Faltan pagar`** en el próximo render. La
  deuda viva se resuelve pagando, en cualquier momento.
- Estados del texto:
  - con impagos: `Faltan pagar: ` + nombres en negrita;
  - todos pagaron y hay confirmados: `Ya pagaron todos ✓` (verde, clase
    `.all-paid`);
  - nadie confirmado: vacío (`:empty { display:none }`).

Writers que cambian `paid`: `marcarMiPago(paid)` (el propio jugador, por
`responseId`, exige `status:'in'`) y `marcarPagoDeInvitado(responseId, paid)` (el
anfitrión, sólo sus invitados). Ambos pasan por `guardarCambioEnResponses`, que
lee el estado fresco del servidor y reescribe el blob completo con el resto
intacto. El organizador **no** tiene hoy un control para marcar el pago de otro
jugador habitual (la tabla del organizador muestra `✓`/`✕` de sólo lectura).

---

## C. Tarjetas amarillas 🟨

Se calculan en `computeCards` (función **pura**: mismos inputs → mismo output,
sin efectos). El único que la llama con efectos es `evaluarTarjetasSiCorresponde`.

### Regla vigente

Al **horario de inicio del partido**, una response recibe 1 amarilla si cumple
**todo**:

1. **no es invitado** (`r.isGuest !== true`);
2. **`status:'in'`** ("En duda" y "Soy baja" no cuentan);
3. **`paid !== true`** (impago: `false`, `null` o ausente);
4. su **identidad resuelve a un habitual vigente**: `r.habitualName` está en
   `habitualPlayers` (normalizado trim + minúsculas), o —fallback legacy—
   `r.name` está en `habitualPlayers`. Si no resuelve, **no cuenta**.

Detalles:

- **Máximo 1 amarilla por jugador por partido** (dedup por identidad).
- El **deadline** es el inicio del partido pinneado a Argentina (`-03:00`, sin
  DST): `matchInfo.date + 'T' + matchInfo.time + ':00-03:00'`. Un `time` de una
  cifra (`"9:30"`) se paddea a `"09:30"`; cualquier otro formato inválido hace
  que la evaluación se saltee sin crashear.
- **`now < deadline`** → no evalúa.
- Sin `habitualPlayers` sembrado → no evalúa.
- La evaluación de una fecha queda **latcheada por `matchKey`**
  (`date + '|' + time`): `cards.evaluated[matchKey] = true`. **Un partido se
  evalúa una sola vez.** Se marca `evaluated` aunque no haya ningún sancionado,
  para no recalcular esa fecha en cada refresh.

### Qué NO revierte una amarilla ya asignada

- **Pagar tarde** (después del deadline): la amarilla queda. `computeCards` no
  vuelve a correr para ese `matchKey`.
- **Pasar a "Soy baja" o "En duda" después de la evaluación**: la amarilla
  queda.
- **`Limpiar todo`**: preserva `state.cards` desde la lectura fresca
  (`{ ...fresh, responses:[], players:[], formations:{} }`). No resetea tarjetas
  ni el latch. `matchInfo` (y por lo tanto `matchKey`) tampoco se toca.
- **Finalizar la fecha**: `nextState.cards = fresh.cards`. Las tarjetas y birras
  viajan a la fecha siguiente. `matchInfo` pasa a vacío, así que la próxima fecha
  tiene un `matchKey` nuevo y se evalúa de nuevo.

No existe hoy ninguna acción (ni de jugador ni de organizador) para quitar una
amarilla suelta.

### Disparo automático

`evaluarTarjetasSiCorresponde` se llama al final de `init()` y al final de
`refreshFromServer()` (que corre cada 4 s vía `setInterval`). Anti-loop en dos
capas:

1. pre-chequeo barato contra `state.cards.evaluated[matchKey]` local → no lee el
   servidor si el partido es futuro, tiene la hora rota o ya fue evaluado;
2. re-chequeo de `fresh.cards.evaluated[matchKey]` **dentro** de la escritura
   focalizada → si otro dispositivo evaluó entre la lectura y la escritura,
   aborta sin escribir.

Persiste **sólo** `cards`. No toca pagos, `responses`, `players`, `matchInfo`.

---

## D. Birras 🍺

- **Cada segunda amarilla genera una birra.** En `computeCards`, cuando un
  jugador que ya tenía `yellows:1` vuelve a caer:
  `yellows → 0`, `reds += 1`, `beers += 1`. La segunda amarilla se **convierte**
  en roja + birra y las amarillas vuelven a 0.
- **Las birras se acumulan** (`beers` sólo baja con "Saldar birra").
- `reds` se registra en `byPlayer` pero **nunca se muestra** en la UI (no hay
  🟥 ni "roja" en `Lista de morosos`).
- **`Saldar birra`** (`saldarBirra(playerName)`): baja `beers` en 1
  (`Math.max(0, beers - 1)`). Es la **única escritura manual** sobre
  `state.cards`.
  - **No toca** `yellows`, `reds`, `evaluated` ni `log`, ni ninguna otra key del
    blob.
  - Revalida `beers > 0` contra el estado fresco dentro de la escritura: dos
    clicks seguidos → el segundo ve `beers` en 0 y aborta.
  - El botón sólo aparece para jugadores con `beers > 0`. Una amarilla suelta
    (`yellows:1, beers:0`) muestra `🟨` sin botón: no se puede "saldar".
- **Hoy cualquiera puede saldar una birra**, con un `window.confirm`
  (`¿Confirmás que {nombre} saldó una birra?`). ASP no tiene roles reales: la
  vista Organizador es otra pestaña, no un permiso. El modelo es de buena fe,
  coherente con el resto de la app.

`Lista de morosos` muestra, por jugador con `yellows>0` o `beers>0`:
`🍺 debe 1 birra` / `🍺 debe N birras` (birra primero) y/o `🟨`. Orden: primero
los que deben birra, después los de sólo amarilla; alfabético dentro de cada
grupo. Empty state: `Sin tarjetas por ahora 👍`. Las reglas
(`Si no figurás pago antes del inicio del partido, sumás 🟨.` /
`Cada 2 amarillas, debés una birra para la banda 🍺.`) están en el HTML estático
y se ven siempre.

---

## E. Invitados

Regla vigente, **no es un bug**:

- Los invitados **sí cuentan** en `Faltan pagar`: un invitado "Estoy" impago
  aparece como deuda viva de la fecha.
- Los invitados **nunca reciben tarjetas ni birras**: `computeCards` saltea
  `r.isGuest === true` antes de cualquier otra cosa.
- El anfitrión **no recibe automáticamente** una tarjeta por un invitado impago.
- Consecuencia: un invitado impago puede figurar en `Faltan pagar` y no aparecer
  nunca en `Lista de morosos`. Esa asimetría es intencional: la sanción es sobre
  la membresía habitual, no sobre visitas.

---

## F. Identidad / legacy

- **`habitualName`** = identidad estable (valor exacto de `habitualPlayers`,
  asignado al identificarse desde el selector cerrado). Es la clave de dedupe,
  claim y tarjetas. Ver [`runbook-agregar-habitual.md`](runbook-agregar-habitual.md).
- **`name`** = casaca / nombre visible, editable por el jugador sin tocar su
  identidad.
- `computeCards` resuelve la identidad de cada response contra `habitualPlayers`:
  **`habitualName` primero, `name` como fallback legacy**. La clave en
  `cards.byPlayer` es siempre la **identidad canónica** (el string tal como está
  en `habitualPlayers`), nunca la casaca.
- **Divergencia visual posible:** `Faltan pagar` muestra `response.name` (la
  casaca); `Lista de morosos` muestra la identidad canónica. La misma persona
  puede figurar como "Fran F." en un bloque y "Francisco Sánchez Keenan" en el
  otro si editó su casaca.
- **Falso negativo legacy:** una response vieja sin `habitualName` cuyo `name`
  es un apodo que no matchea ninguna entrada de `habitualPlayers` **no recibe
  amarilla** aunque la persona sea habitual e impaga. Se corrige solo cuando esa
  persona re-confirma desde el selector (ahí su response backfillea
  `habitualName`).

---

## G. Casos borde importantes

| Escenario | Qué pasa |
| --- | --- |
| **Pago tardío** | Sale de `Faltan pagar` al instante. **No** borra una tarjeta ya asignada (latch por `matchKey`). |
| **Habitual nuevo agregado antes de la evaluación** | Si está `status:'in'` + impago al deadline, puede quedar alcanzado por la evaluación y comerse una 🟨. Ver [`runbook-agregar-habitual.md`](runbook-agregar-habitual.md). |
| **Invitado homónimo de un habitual** | Puede aparecer como deuda viva en `Faltan pagar` (por su response de invitado) pero **no** como sanción. El habitual real, si no respondió, sigue contándose aparte. |
| **Ex-habitual sancionado** | Sigue en `Lista de morosos` mientras tenga `yellows>0` o `beers>0`: `morososDeCards` itera `cards.byPlayer` sin filtrar contra `habitualPlayers` vigente. La deuda/sanción persiste aunque salga del grupo. |
| **Evaluación duplicada (2 dispositivos)** | Se evita con el latch `evaluated[matchKey]` y la revalidación contra el estado fresco dentro de la escritura. Si igual hubiera empate, `computeCards` es determinista y `byPlayer` sale del acumulado base, así que el resultado es el mismo; a lo sumo difiere un timestamp de `log` (auditoría). |
| **`Limpiar todo` sobre una fecha ya evaluada** | `matchKey` no cambia (se conserva `matchInfo`), así que si se re-popula la misma fecha nadie se vuelve a sancionar: el latch lo bloquea. |
| **`Lista de morosos` vacía / todos pagaron / nadie confirmado** | Empty state `Sin tarjetas por ahora 👍`; `Faltan pagar` → `Ya pagaron todos ✓` o vacío. Sin errores. |

---

## H. Qué NO hacer

- **No borrar tarjetas o birras manualmente desde Supabase** salvo un cleanup
  explícito y acordado (mismo criterio que cualquier escritura a producción:
  leer fresco, tocar sólo lo necesario, una escritura).
- **No asumir que marcar pago tarde perdona la sanción.** Son cosas distintas
  (sección A). Si el grupo decide perdonar una amarilla, hoy la única vía es
  editar `cards.byPlayer` a mano en Supabase.
- **No confundir `Faltan pagar` con `Lista de morosos`** al comunicar por
  WhatsApp: uno es "debés la plata de hoy", el otro "arrastrás una sanción".
- **No sancionar invitados.** Es regla vigente que no reciben tarjetas.
- **No resetear `state.cards`** al cerrar o limpiar la fecha. Ningún writer lo
  hace hoy y cambiarlo requiere decisión explícita: las birras pendientes se
  perderían.
- **No tocar `habitualPlayers`** fuera de
  [`runbook-agregar-habitual.md`](runbook-agregar-habitual.md): cambia quién es
  sancionable.

---

## I. Futuro posible (no implementado)

Ideas registradas para cuando haya evidencia de fricción real. Ninguna está
hecha ni aprobada; cada una sería su propio PR con scope y —si toca UI— las 5
preguntas de diseño.

- **Microcopy** que explique mejor la diferencia entre "pendiente" (deuda viva)
  y "moroso" (sancionado), cerca del checkbox de pago y/o como subcopy de
  `Lista de morosos`.
- **Botón de organizador para perdonar una amarilla** (writer nuevo + control
  UI + tests).
- **Roles reales** para acotar quién puede saldar birras.
- **Mejor separación visual** entre deuda viva (ticket) y sanciones acumuladas
  (`Lista de morosos`), hoy separadas por el bloque de Equipos.
- **Tests nuevos** para: invitado impago en `Faltan pagar`; pago tardío que no
  borra la 🟨; divergencia `name` / identidad canónica entre los dos bloques;
  `morososDeCards` sin filtrar contra `habitualPlayers` vigente.

Ver también la deuda abierta **"Faltan pagar"** en
[`ux/asp-design-philosophy.md`](ux/asp-design-philosophy.md): *"No confundir mi
pago con la deuda del grupo."*
