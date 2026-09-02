# Runbook — decisión de horario / cancha

Cómo se decide hoy el horario y la cancha del partido, qué datos tiene la app
para ayudar a esa decisión, y el **contrato** de una futura mini-vista de
disponibilidad para la vista Jugador.

> **Estado:** documentación de lo que ya hace el código + una regla de inferencia
> propuesta. **No implementa UI.** No hay bug: es un hueco de producto. Cualquier
> UI nueva es un PR aparte con su propio scope.

Código citado: `sites-app/public/demo.html` (archivo único). Se citan nombres de
función, no líneas (el archivo se edita seguido).

---

## A. El problema

Hay **dos momentos distintos** en la vida de un partido:

1. **Partido definido** — ya hay fecha, hora y cancha. Lo que se necesita:
   mostrarlas claramente, arriba, sin scroll.
2. **Partido en decisión** — todavía se está viendo cuándo y dónde jugar. Lo que
   se necesita: ver qué horarios juntan más gente, sin abrir otra encuesta.

**PR #44** (mini-bloque `Próximo partido`, ver [G](#g-relación-con-pr-44)) cubre
el momento 1. Este runbook documenta el momento 2, que hoy **no está cubierto en
la vista Jugador**.

El feedback real que originó este frente no era sólo "ver cuándo se juega": era
que **al momento de decidir, la información de disponibilidad no está accesible
para todos los jugadores** (vive sólo en la vista Organizador).

---

## B. Flujo actual de decisión

- **La decisión de horario/cancha pasa por WhatsApp.** La app no la orquesta.
- **La app sólo guarda el resultado final** en `state.matchInfo`.
- El modal **"Editar partido"** (se abre con el botón ✏️ `#edit-match-btn`, que
  vive en el **ticket de la vista Jugador**) escribe estos 7 campos de una:
  `teamName`, `date`, `time`, `loc`, `type`, `priceTotal`, `alias`.
  - `time` es un `<input type="text">` **libre, sin validación de formato**.
  - `loc` sale de un select contra `state.sedes[]`; se puede dar de alta una
    cancha nueva ahí mismo.
- **No hay roles reales.** `setMainView()` sólo togglea `display`: cualquiera
  puede abrir la vista Organizador y cualquiera puede editar el partido desde el
  ticket. El split "Jugador / Organizador" es organización de UI, no permisos.
- **No hay encuesta formal ni "horarios candidatos".** Cero concepto de opciones.
  `matchInfo.time` es un único string: representa el horario final, no una lista.

---

## C. Datos disponibles

Todo sale del blob `match_data` (fila `id=1`). Para la decisión de horario:

| Dato | Forma | Nota |
| --- | --- | --- |
| `responses[].status` | `'in'` \| `'duda'` \| `'out'` | — |
| `responses[].from` / `responses[].to` | `"HH:MM"` a hora redonda | franja del jugador. Guard: no se guarda `in`/`duda` sin ambas y con `to > from`. |
| `responses[].isGuest` (+ `invitedBy`) | sólo invitados | el invitado hereda `from`/`to` del anfitrión **al crearse**; no se actualiza si el anfitrión cambia su franja después. |
| `responses[].habitualName` / `responses[].name` | strings | identidad estable / nombre visible. |
| `matchInfo.date` / `matchInfo.time` / `matchInfo.loc` | strings | el partido definido (o vacíos). |
| `state.sedes[]` | `{name, address}[]` | canchas guardadas; el botón 📍 arma el link de mapa al vuelo con `address` o `loc`. |

Lo que **no existe**:

- **`responses[].availability[]`** — no hay array de franjas. Una response tiene
  **un solo** intervalo `[from, to)`.
- **`fullDay` persistido** — "Siempre para la pelota" no se guarda como flag: se
  representa como `from:'09:00'` y `to:'22:00'`. Al reabrir se re-deriva
  (`isFullDay = from==='09:00' && to==='22:00'`).
- **`matchInfo.capacity`** — se deriva de `type` (`F5 ÷10 … F11 ÷22`). Es
  referencia, no límite.
- **`matchInfo.mapUrl`** — no se guarda; el link de Google Maps se construye en
  el momento.

**Ya existe un cálculo de disponibilidad por franja**, inline en
`renderLocalOrganizer()`: recorre `hour = 9 … 21`, cuenta las responses con
`status==='in' && from <= "HH:00" && to > "HH:00"`, ordena y se queda con el
**top 3** (`topHours`). Sólo se muestra en la vista Organizador ("Disponibilidad
por horario"). El estado vacío dice *"Todavía no hay horarios para comparar.
Confirmá respuestas desde 'Mi estado'."*

---

## D. Regla de inferencia (vigente / propuesta)

Para calcular "cuántos pueden a cada hora":

- **Franjas:** de `09:00` a `21:00`, una por hora (13 slots).
- **Una persona cuenta para un slot si:**
  - `status === 'in'`;
  - `from <= slot`;
  - `to > slot`.
- El rango se trata como **`[from, to)`** (fin exclusivo): `16:00–20:00` cuenta
  para 16, 17, 18 y 19, no para 20.
- **Full-day** (`from:'09:00'`, `to:'22:00'`) cuenta en **todos** los slots 09–21.
- **`out`** no cuenta.
- **`duda`** no cuenta en el número principal.
  - *Opcional futuro:* mostrar las dudas aparte, como `+N en duda`.
- **Invitados sí cuentan** — ocupan cupo real en la cancha.
- **Empates:** ordenar por cantidad descendente y, a igualdad, por **hora más
  temprana**. Si dos franjas empatan, mostrarlas con el mismo número; **no**
  declarar una única "ganadora".
- **Esta inferencia NUNCA escribe `matchInfo.time`.** Es sólo lectura.

Esta es exactamente la regla que ya usa `renderLocalOrganizer()` (salvo el
detalle de mostrar dudas aparte, que hoy no hace).

---

## E. Qué puede decir la UI futura

Copy **honesto** (describe disponibilidad, no decisión):

- `Cuándo cierra mejor`
- `18:00 · 11 pueden`
- `16:00 · 8 pueden`
- `Todavía pocas respuestas`
- `Horario y cancha a definir`

Copy a **evitar** (implica una decisión que la app no toma):

- `Horario ganador`
- `Se juega a las 18`
- `Elegido`
- cualquier texto que suene a decisión automática.

---

## F. Jugador vs Organizador

**La vista Jugador debería ver** (resumen compacto):

- 2–4 franjas principales con "cuántos pueden";
- quién falta confirmar, si aplica (ya existe `faltanConfirmar()`);
- el horario/cancha final cuando ya está definido (PR #44).

**La vista Organizador conserva** el detalle largo:

- tabla completa de respuestas (Jugador · Equipo · Estado · Disponibilidad · Pago);
- rangos `from–to` por jugador;
- chart más detallado si hace falta;
- edición de `matchInfo`;
- equipos y formaciones;
- cerrar / reiniciar la fecha.

Hoy **ninguna acción está restringida a Organizador** (el único "gate" es cambiar
de pestaña). Endurecer eso es un tema estructural aparte, no de este frente.

En una mini-vista de disponibilidad, cuidar que **no parezca editable** lo que es
un cálculo: los números de franja no son inputs, y "viene ganando" (si se usa) no
es un botón para fijar el horario.

---

## G. Relación con PR #44

- Cuando `matchInfo.time` **existe**, el bloque `Próximo partido`
  (`renderProximoPartido()`) muestra fecha · hora en la línea principal y
  cancha · countdown en la secundaria.
- Cuando `matchInfo.time` **falta**, hoy el bloque muestra sólo
  `"Próximo partido sin confirmar"`. Ese es el gancho natural para el momento 2:
  una UI futura podría, en ese caso, mostrar la disponibilidad sugerida **dentro
  o inmediatamente después del mismo bloque**.
- **No crear un tercer bloque pesado** arriba de `Mi estado` si se puede extender
  `proximo-partido` con un estado "en decisión".
- **El caso confirmado de PR #44 debe quedar intacto**: `renderProximoPartido()`
  ya distingue `mi.date && mi.time` del resto, así que el hook existe sin tocar
  ese camino.

---

## H. Qué NO hacer

- **No** crear una encuesta nueva todavía.
- **No** agregar data model de horarios candidatos (`matchInfo.time` sigue siendo
  un único string).
- **No** escribir `matchInfo.time` automáticamente desde ningún cálculo.
- **No** llamar "decisión" / "ganador" / "elegido" a un cálculo de disponibilidad.
- **No** mover toda la vista Organizador a la vista Jugador.
- **No** mezclar este frente con "Nombre en la casaca".
- **No** mezclar este frente con el número de camiseta (ver
  [`runbook-agregar-habitual.md`](runbook-agregar-habitual.md) y el diagnóstico
  de PR #44 para por qué ese va aparte, con posible migración de
  `habitualPlayers`).
- **No** tocar pagos / morosos / tarjetas
  ([`runbook-sanciones-pago.md`](runbook-sanciones-pago.md)).

---

## I. Futuro posible (no aprobado)

**PR futuro — UI mínima (Alternativa "B" del diagnóstico):**

- extraer el cálculo de disponibilidad por hora de `renderLocalOrganizer()` a una
  **función pura testeable**;
- reutilizarla en Organizador (verificando que el chart no cambia) y en Jugador;
- mostrar top 3 o top 4 horarios con "N pueden";
- cuando `matchInfo.time` está vacío, presentarlo en el bloque `Próximo partido`
  como estado "en decisión"; cuando está cargado, dejar PR #44 intacto;
- tests de la función pura: `in`, `duda` (excluida / aparte), invitados,
  full-day, empates, umbral de "pocas respuestas", estado vacío.

**Encuesta formal de horarios candidatos:** sólo si la disponibilidad inferida
no alcanza en uso real. Requeriría data model nuevo y contradice la filosofía de
ASP ("la menor cantidad razonable de software"; "WhatsApp sigue siendo la capa de
conversación").
