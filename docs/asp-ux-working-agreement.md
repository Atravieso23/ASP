# ASP — UX Working Agreement

*Estado: borrador para revisión. No commiteado, no reemplaza nada.*

## Qué es esto y qué no es

Este documento fija **criterio de composición, jerarquía, copy y layout mobile-first** para tomar mejores decisiones de PR mínimo en cambios de UX/UI. Complementa, no reemplaza:

- [`docs/asp-sop.md`](asp-sop.md) manda en **proceso**: niveles de riesgo, STOP, quién autoriza qué. Este documento no agrega ningún STOP nuevo.
- [`docs/ux/asp-design-philosophy.md`](ux/asp-design-philosophy.md) manda en **tono y voz**: personalidad futbolera, cuándo un emoji alcanza, las 5 preguntas de "Criterio para próximos PRs". Este documento no repite esas reglas, las da por vigentes.

Este documento cubre la capa que falta entre los dos: cuándo algo va en card o en fila, cuándo un input se muestra u oculta, cuándo un copy afirma más de lo que ASP sabe, y cuándo un problema visual es en realidad un problema conceptual.

**No es:** un design system, una librería de componentes, un catálogo de tokens ni un proceso de aprobación nuevo. No se agrega Figma, ni tokens, ni librerías de UI salvo que un PR futuro lo justifique con evidencia real de que el criterio de acá ya no alcanza.

---

## Principios UX específicos de ASP

1. **Mobile real con datos reales manda sobre el mock.** Nombres largos, estados parciales, 320–375px.
2. **Simple > sofisticado.** La solución completa más simple gana, aunque exista una más "prolija".
3. **Mínimo scroll.** Cada bloque nuevo compite por altura vertical con `Mi estado`, que es el centro de acción del jugador.
4. **Acciones y datos relacionados van juntos.** Si dos campos se leen o se llenan como una sola idea (casaca + N°), comparten fila, no dos bloques separados.
5. **Controles secundarios compactos; los grandes se reservan para la CTA real** del bloque (ej. `Guardar cambios`). No todo botón necesita ser grande.
6. **Área táctil cómoda aunque el elemento visual sea chico.** Un campo angosto (ej. el input de N°) puede ser visualmente pequeño sin que el toque sea incómodo.
7. **Progressive disclosure.** Si un campo no aplica al estado actual, se oculta — no se muestra deshabilitado ni "por las dudas".
8. **Copy honesto.** ASP no afirma un hecho que no puede conocer o derivar con certeza de los datos que tiene.
9. **Identidad base y presentación no se mezclan visualmente.** Quién sos (identidad) y cómo te ven en este partido (casaca, N°) son conceptos distintos aunque convivan cerca.
10. **No se crea data model nuevo para resolver un problema de presentación.** Si el dato ya existe (ej. la franja del anfitrión), se hereda o se deriva antes que pedirlo de nuevo.
11. **Un PR de UX resuelve una fricción humana concreta**, no una sensación de "se ve mejor".
12. **Un microajuste no se convierte en rediseño.** Si la solución mínima es CSS, no se toca markup ni lógica salvo que el diagnóstico muestre que CSS solo no alcanza.

---

## Patrones aprobados

### Jerarquía de pantalla
Orden recomendado/default en la pantalla del partido (`#tab-partido`; ya fijado en `asp-design-philosophy.md`, se reafirma acá como default de layout):
identidad → estado personal (`Estoy`/`En duda`/`Soy baja`) → disponibilidad (sólo si aplica) → pago personal → invitados → contexto grupal (convocatoria, horarios, próximo partido) → administrativo (editar partido, equipos, historial).
Un bloque nuevo se ubica en esta jerarquía por lo que **es**, no por dónde "queda bien".

### Cards
Una card completa (encabezado propio, borde/fondo) se reserva para un bloque que puede leerse solo y tiene entidad propia: `Mi estado`, el ticket del partido. **No se crea una card por cada subcampo o sub-decisión.** Si algo es un detalle de una card existente, va adentro como fila o hint, no como card hermana.

### Filas inline
Dos campos relacionados y angostos comparten una fila flex en vez de apilarse verticalmente (ejemplo real: `casaca-row` = "Nombre en la casaca" + "N°"). Regla: un campo opcional y angosto no se gana su propia fila completa sólo porque es un input nuevo.

### Inputs
- Se muestran sólo si aplican al estado actual (progressive disclosure) — ejemplo: el campo de N° sólo aparece para el jugador ya identificado.
- Placeholder en vez de valor por defecto que pueda leerse como una decisión ya tomada (los selectores de horario arrancan en `Desde`/`Hasta`, no en `16:00`, para no sugerir una franja que nadie eligió).
- Si el dato ya se puede derivar de otro lado, se hereda en vez de pedirlo de nuevo (el invitado nace con la franja del anfitrión; no tiene su propio selector en v1).

### Ayudas / hints
Cortos, debajo del campo, tono muted. Un hint debe aportar contexto real o reducir dudas; si repite el label o pesa más que el campo, se recorta o se borra.

### Botones
Las acciones críticas llevan texto visible siempre (nunca `⇄`, `+`, `✅` como única etiqueta — regla ya fijada en `asp-design-philosophy.md`, se reafirma para layout: el tamaño grande es *además* del texto, no un reemplazo). El tamaño grande se reserva a la CTA real del bloque; el resto son botones de tamaño normal aunque estén cerca.

### Estados vacíos
Copy breve y con tono, nunca un espacio en blanco silencioso: `Están todos ✅`, `Sin tarjetas por ahora 👍`, `Sin invitados`. Un estado vacío sigue siendo información, no ausencia de información.

### Señales temporales
Una señal que sólo ayuda **antes** de decidir se oculta **después** (principio ya vigente: `Faltan responder`, el indicador de cambios sin guardar). Estas señales son ayuda, no un registro permanente — su copy no debe sonar a conteo oficial (`Faltan responder: …`, no `Pendientes: N/N`).

### Copy honesto
- No se afirma `reservado`, `confirmado`, `cupo lleno`, `ganador`, `deuda saldada` si ASP no lo sabe con certeza. Se usan formas que reflejan una señal, no un hecho: `apuntamos a`, `pueden jugar a las`, `N todavía no respondieron`.
- En pagos, morosos y tarjetas: el copy deja explícito que son **autodeclarados** (`Ya pagué` lo marca el jugador, no un tercero que lo verifica). Nunca se redacta como si fuera una confirmación oficial de cobro.
- Acciones que se ven en la vista Organizador (sin auth hoy) se redactan sin tono de autoridad institucional — cualquiera las puede tocar, el copy no debe sugerir que hace falta un rol para eso, pero tampoco debe sonar tan casual que invite a tocarlas sin querer.

### Mobile angosto
Se prueba con nombres reales largos y anchos 320–375px antes de dar un layout por bueno. Un label no debe forzar 3 líneas de wrap en una columna angosta — si eso pasa, el label se acorta o el layout cambia, no se agranda la columna a costa de otra cosa.

### Cuándo ocultar o mostrar información
- Se oculta cuando el estado actual no lo necesita (`Soy baja` oculta Disponibilidad).
- Se muestra mientras aporta a una decisión activa (los horarios candidatos se muestran mientras no hay hora definida, se ocultan cuando ya hay una).
- Nunca se oculta información que sigue siendo relevante sólo por motivos estéticos.

---

## Anti-patrones

| Anti-patrón | Por qué se evita |
|---|---|
| **Demasiadas cards** | Cada card es altura vertical fija; una pantalla con 6 cards para 6 datos chicos rompe "mínimo scroll" sin necesidad. |
| **Controles grandes sin CTA real** | Un botón grande que no es la acción principal del bloque compite visualmente con la que sí importa. |
| **Labels largos en columnas angostas** | En 320–375px un label de 20+ caracteres en una columna de 72px wrapea a 3 líneas y rompe el layout — se acorta el label o se repiensa la columna, no se agranda a costa de otro campo. |
| **Duplicar información** | Si un dato ya se ve en un lugar (el ticket), no se repite igual en otro sin una razón (un resumen distinto, sí; el mismo dato dos veces, no). |
| **Mezclar identidad con presentación** | Confunde "quién sos" con "cómo te ven este partido" — dos preguntas distintas que necesitan resolverse por separado aunque estén cerca en pantalla. |
| **Afirmar hechos no conocidos** | `reservado`, `confirmado`, `ganador` son afirmaciones que ASP no puede sostener con los datos que tiene; generan expectativas falsas. |
| **Agregar data model para resolver presentación** | Si el problema es "se ve mal" o "falta un dato que ya existe en otro lado", la solución es de layout o de derivación, no una columna nueva en Supabase. |
| **Rediseñar todo por una molestia puntual** | Una queja sobre un campo no autoriza reordenar la pantalla entera; se resuelve lo que la queja describe (ver SOP §9 sobre interpretar el objeto real del feedback). |

---

## Cómo se usa este documento dentro del flujo del SOP

- **Antes de un PR de UX:** revisar si el cambio ya tiene un patrón aprobado acá o si cae en un anti-patrón conocido, antes de proponer alcance. Si el patrón no existe todavía, el diagnóstico read-only debe decir explícitamente que es un caso nuevo.
- **Durante el diagnóstico read-only:** usar las categorías de este documento (cards / filas / inputs / hints / botones / copy) para nombrar con precisión qué tipo de cambio es. Nombrarlo bien evita mezclar dos categorías en un mismo PR sin darse cuenta.
- **Para separar criterio UX de implementación:** este documento fija *qué* debe verse o sentirse; *cómo* se implementa (markup, CSS, JS) sigue siendo decisión del ejecutor durante el PR, no de este documento.
- **Para decidir si un cambio es layout, concepto o producto** (ver SOP §11): si mover, agrandar o recolorear algo no resuelve la fricción real que describió el feedback, el problema no es de estilo — es que el bloque conceptual está en el lugar equivocado o falta un dato. Este documento ayuda a descartar la hipótesis de layout antes de aceptarla.
- **Para evitar scope creep:** si resolver un PR de UX empieza a tocar más de una categoría de patrón a la vez (por ejemplo, una card nueva + un copy nuevo + un campo nuevo), es la señal de que el scope creció y corresponde el STOP de SOP §16, no seguir ampliando dentro del mismo PR.

---

## Preguntas del orquestador ante feedback visual o UX

Estas preguntas se suman a las 5 de "Criterio para próximos PRs" de `asp-design-philosophy.md` (fricción real, claridad de la acción, personalidad, compacto, evidencia) — no las reemplazan. Se usan cuando el feedback es sobre layout/composición y la interpretación no es obvia; no hace falta correrlas todas para un cambio trivial y reversible.

1. ¿El feedback describe un problema de **layout** (dónde/cómo se ve algo que ya existe) o un problema **conceptual** (falta o sobra información, el bloque está mal planteado)?
2. ¿Ya existe un patrón aprobado acá para este caso, o es genuinamente nuevo?
3. ¿La solución agrega una card/fila/input nuevo, o reordena/oculta/deriva algo que ya existe?
4. ¿Qué deja de verse o de poder hacerse fácil si se aprueba este cambio? (todo espacio ganado se le quita a otra cosa)
5. ¿Esto está resolviendo una fricción real y repetida, o una hipótesis de "quedaría mejor así"?

---

## Mantenimiento de este documento

Mismo espíritu que el SOP (§20): esto describe **criterio**, no un changelog ni un inventario del estado actual de la UI. Se edita cuando un principio o un patrón cambia de verdad — no se le agrega un párrafo con fecha por cada PR que lo usa. El detalle de qué PR hizo qué vive en memoria de proyecto y en los propios PRs, no acá.
