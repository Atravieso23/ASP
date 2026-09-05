**Estado:** versión 2 — vigente. Complementa el SOP operativo y no reemplaza documentación existente.

---

## Qué es esto y qué no es

Este documento fija **criterio de composición, jerarquía y layout mobile-first** para tomar mejores decisiones de PR mínimo en cambios de UX/UI.

Complementa, no reemplaza:

- **`docs/asp-sop.md`** manda en **proceso**: niveles de riesgo, STOP, quién autoriza qué, y copy honesto.
- **`docs/ux/asp-design-philosophy.md`** manda en **tono y voz**: personalidad futbolera, cuándo un emoji alcanza, las 5 preguntas de _Criterio para próximos PRs_.

Precedencia, si dos se contradicen: **SOP > design-philosophy > este documento.** Una contradicción se resuelve en el documento, no dentro del PR que la encontró.

Este documento cubre la capa que falta entre los dos: cuándo algo va en card o en fila, cuándo un input se muestra u oculta, cuándo un problema visual es en realidad un problema conceptual.

**No es:** un design system, una librería de componentes, un catálogo de tokens ni un proceso de aprobación nuevo. No se agrega Figma, ni tokens, ni librerías de UI salvo que un PR futuro lo justifique con evidencia real de que el criterio de acá ya no alcanza.

**No agrega STOPs nuevos.** Sí agrega un criterio de detección para un STOP que ya existe (ver _Cómo se usa dentro del flujo del SOP_).

---

## Reglas que NO viven acá

Estas rigen en cambios de UX pero su hogar canónico es otro documento. Se referencian, no se reescriben — una regla escrita dos veces diverge.

|Regla|Vive en|
|---|---|
|Copy honesto: qué puede y qué no puede afirmar ASP|SOP → _Copy honesto_|
|Mobile real con datos reales manda sobre el mock|SOP → _Mobile real_|
|Una señal que sirve antes de decidir se oculta después|SOP → _Principios operativos_|
|No crear data model nuevo para resolver presentación|SOP → _Principios operativos_|
|Un PR resuelve un problema humano|SOP → _Principios operativos_|
|Layout vs concepto: descartar lo conceptual primero|SOP → _Layout visual vs concepto_|
|Acciones críticas con texto visible, nunca sólo ícono|design-philosophy|
|Tono, personalidad, uso de emoji|design-philosophy|

---

## Dónde aplica y dónde no

**Aplica plenamente** a la pantalla del partido: es la pantalla del jugador, la que se abre parada en la vereda, y donde la altura vertical es un recurso escaso real.

**Aplica parcialmente** a pantallas administrativas y de historial: la jerarquía de pantalla y _mínimo scroll_ pesan menos; el resto de los patrones sigue rigiendo.

**No aplica** a nada que no sea interfaz del jugador o del organizador dentro de ASP.

Si un cambio cae en la zona parcial, decirlo en el diagnóstico en vez de aplicar criterio de pantalla-de-jugador por inercia.

---

## Principios UX específicos de ASP

1. **Simple > sofisticado.** La solución completa más simple gana, aunque exista una más "prolija".
2. **Mínimo scroll.** Cada bloque nuevo compite por altura vertical con el estado personal del jugador, que es el centro de acción de la pantalla.
3. **Acciones y datos relacionados van juntos.** Si dos campos se leen o se llenan como una sola idea, comparten fila; no son dos bloques separados.
4. **Controles secundarios compactos.** El tamaño grande se reserva para la CTA real del bloque. No todo botón necesita ser grande.
5. **Área táctil cómoda aunque el elemento visual sea chico.** Un campo angosto puede ser visualmente pequeño sin que el toque sea incómodo.
6. **Progressive disclosure.** Si un campo no aplica al estado actual, se oculta — no se muestra deshabilitado ni "por las dudas".
7. **Identidad base y presentación no se mezclan visualmente.** Quién sos y cómo te ven en este partido son conceptos distintos aunque convivan cerca.
8. **Un microajuste no se convierte en rediseño.** Primero se descarta que el problema sea conceptual (SOP → _Layout visual vs concepto_). Confirmado que es layout, si la solución mínima es CSS no se toca markup ni lógica. **El orden importa:** al revés, el "mínimo CSS" saltea la pregunta conceptual entera.

---

## Nivel de riesgo de un cambio de UX

El motor del SOP son los niveles 1/2/3. Este es el mapeo por defecto para las categorías de este documento. Ante la duda entre dos, se toma el más alto.

|Categoría de cambio|Nivel|
|---|---|
|Hint, tamaño de botón, espaciado, copy sin impacto de layout ni sobre lo que la app afirma|1|
|Card ↔ fila, orden dentro de un bloque, estado vacío|1|
|Jerarquía de pantalla, mostrar/ocultar, render condicional, progressive disclosure|2|
|**Cualquier copy sobre pago, deuda, confirmación, cupo o reserva**|2 mínimo|
|Estados de error que reportan si algo se guardó o no|2|
|Derivar un dato nuevo, tocar persistencia, agregar campo|3 — sale del alcance de este documento|

El caso que más se subclasifica: un cambio de copy en la pantalla de morosos parece Nivel 1 porque el diff es una línea, pero cambia lo que el jugador va a creer sobre plata. Es Nivel 2.

---

## Patrones aprobados

> Los ejemplos son ilustrativos. No se nombran clases, ids ni archivos: eso es inventario del estado actual de la UI y queda viejo en el próximo refactor.

### Jerarquía de pantalla

Orden default en la pantalla del partido:

```
identidad
→ estado personal (Estoy / En duda / Soy baja)
→ disponibilidad (sólo si aplica)
→ pago personal
→ invitados
→ contexto grupal (convocatoria, horarios, próximo partido)
→ administrativo (editar partido, equipos, historial)
```

Un bloque nuevo se ubica en esta jerarquía por lo que **es**, no por dónde "queda bien".

### Cards

Una card completa (encabezado propio, borde/fondo) se reserva para un bloque que puede leerse solo y tiene entidad propia.

**No se crea una card por cada subcampo o sub-decisión.** Si algo es un detalle de una card existente, va adentro como fila o hint, no como card hermana.

### Filas inline

Dos campos relacionados y angostos comparten una fila flex en vez de apilarse verticalmente — por ejemplo, un nombre corto y un número de dos dígitos que se llenan como una sola idea.

**Regla:** un campo opcional y angosto no se gana su propia fila completa sólo porque es un input nuevo.

### Inputs

- Se muestran sólo si aplican al estado actual (progressive disclosure).
- **Placeholder en vez de valor por defecto** que pueda leerse como una decisión ya tomada. Un selector de horario arranca vacío, no en una hora concreta: una hora precargada sugiere una franja que nadie eligió, y eso es afirmar algo que ASP no sabe.
- Si el dato ya se puede derivar de otro lado, se hereda en vez de pedirlo de nuevo.

### Ayudas / hints

Cortos, debajo del campo, tono muted. Un hint debe aportar contexto real o reducir dudas; si repite el label o pesa más que el campo, se recorta o se borra.

### Botones

El tamaño grande se reserva a la CTA real del bloque; el resto son de tamaño normal aunque estén cerca. (La regla de texto visible en acciones críticas vive en design-philosophy. El tamaño es _además_ del texto, nunca un reemplazo.)

### Estados vacíos

Copy breve y con tono, nunca un espacio en blanco silencioso: `Están todos ✅`, `Sin tarjetas por ahora 👍`, `Sin invitados`. Un estado vacío sigue siendo información, no ausencia de información.

### Señales temporales

Una señal que sólo ayuda antes de decidir se oculta después (regla en el SOP). Acá el criterio de composición: **su copy no debe sonar a conteo oficial.** `Faltan responder: …`, no `Pendientes: N/N`. Son ayuda, no un registro permanente.

### Copy en pantalla

La regla de fondo vive en SOP → _Copy honesto_. Acá, cómo se aplica a composición:

- Un número grande y destacado se lee como un hecho aunque el texto diga lo contrario. Si el dato es una señal, no se le da peso tipográfico de hecho.
- En la vista de Organizador —que **hoy no tiene auth**— el copy se redacta sin tono de autoridad institucional: cualquiera puede tocar esas acciones. Tampoco tan casual que invite a tocarlas sin querer. _Esto es una mitigación de redacción, no un control. Cualquiera puede marcar la deuda de otro como saldada._

### Mobile angosto

Los anchos de prueba están en SOP → _Mobile real_. Acá, el criterio de composición que sale de ellos:

Un label no debe forzar 3 líneas de wrap en una columna angosta. Si eso pasa, se acorta el label o cambia el layout; no se agranda la columna a costa de otro campo.

### Cuándo ocultar o mostrar información

- Se oculta cuando el estado actual no lo necesita (declararse baja oculta la disponibilidad).
- Se muestra mientras aporta a una decisión activa (los horarios candidatos se muestran mientras no hay hora definida, se ocultan cuando ya hay una).
- **Nunca se oculta información que sigue siendo relevante sólo por motivos estéticos.**

---

## Estados de error, offline y latencia

> **Propuesta — falta confirmación.** Este bloque no estaba en v1 y es el hueco más grande del documento: ASP se usa en una cancha, con señal mala, y "marqué que voy y no se guardó" es el escenario más probable de todos.

- **Un fallo de guardado nunca es silencioso.** Si el estado del jugador no se persistió, la pantalla lo dice; no queda mostrando el estado nuevo como si hubiera funcionado.
- **El error dice qué hacer, no qué pasó.** `No se pudo guardar, probá de nuevo` sirve; un código de Supabase no.
- **El estado en pantalla no se adelanta a la confirmación** en nada que otro jugador vaya a leer. Un optimistic update que después falla le mostró al usuario una mentira.
- **Latencia:** si una acción tarda más de lo instantáneo, el control tocado muestra que está trabajando y no se puede tocar dos veces. Sin criterio acá, cada PR lo resuelve distinto.
- Un reintento nunca duplica: tocar dos veces `Ya pagué` no genera dos registros.

---

## Acciones destructivas

> **Propuesta — falta confirmación.**

- Confirmación explícita sólo cuando la acción es **destructiva y no trivialmente reversible** desde la misma pantalla.
- Darse de baja no necesita confirmación: se deshace tocando otra opción.
- Borrar un invitado que alguien más cargó, sí.
- La confirmación nombra qué se va a perder, no pregunta en abstracto.
- Confirmar todo es igual de malo que no confirmar nada: la gente aprende a tocar "sí" sin leer.

---

## Piso de accesibilidad

> **Propuesta — falta confirmación.** Una línea alcanza; sin ella, "muted" y "compacto" se degradan solos PR a PR.

- Texto de contenido nunca por debajo de 14px; hints, nunca por debajo de 12px.
- Contraste mínimo 4.5:1 para texto normal, 3:1 para texto grande. `muted` es un tono, no un permiso para bajar de ahí.
- Área táctil mínima 44×44px, aunque el elemento visual sea más chico.
- El color nunca es el único portador de un estado: siempre va acompañado de texto o ícono.

---

## Anti-patrones

|Anti-patrón|Por qué se evita|
|---|---|
|**Demasiadas cards**|Cada card es altura vertical fija; una pantalla con 6 cards para 6 datos chicos rompe _mínimo scroll_ sin necesidad.|
|**Controles grandes sin CTA real**|Un botón grande que no es la acción principal del bloque compite visualmente con la que sí importa.|
|**Labels largos en columnas angostas**|En 320–375px un label de 20+ caracteres en una columna angosta wrapea a 3 líneas y rompe el layout — se acorta el label o se repiensa la columna, no se agranda a costa de otro campo.|
|**Duplicar información**|Si un dato ya se ve en un lugar, no se repite igual en otro sin una razón. Un resumen distinto, sí; el mismo dato dos veces, no.|
|**Mezclar identidad con presentación**|Confunde "quién sos" con "cómo te ven este partido" — dos preguntas distintas que se resuelven por separado aunque estén cerca en pantalla.|
|**Afirmar hechos no conocidos**|Genera expectativas falsas. Ver SOP → _Copy honesto_.|
|**Peso visual de hecho para un dato que es señal**|Un número grande se lee como confirmado aunque el copy diga "apuntamos a". El tamaño también afirma.|
|**Agregar data model para resolver presentación**|Si el problema es "se ve mal" o "falta un dato que ya existe en otro lado", la solución es de layout o de derivación, no una columna nueva en Supabase.|
|**Rediseñar todo por una molestia puntual**|Una queja sobre un campo no autoriza reordenar la pantalla entera; se resuelve lo que la queja describe. Ver SOP → _Feedback real_.|
|**Fallo silencioso**|El jugador cree que confirmó y no confirmó. Es la peor falla posible en una app cuyo único trabajo es saber quién juega.|

---

## Cómo se usa dentro del flujo del SOP

- **Antes de un PR de UX:** revisar si el cambio ya tiene un patrón aprobado acá o si cae en un anti-patrón conocido, antes de proponer alcance. Si el patrón no existe, el diagnóstico read-only debe decir explícitamente que es un caso nuevo.
- **Durante el diagnóstico read-only:** usar las categorías de este documento (cards / filas / inputs / hints / botones / copy / errores) para nombrar con precisión qué tipo de cambio es, y proponer el nivel de riesgo con la tabla de _Nivel de riesgo de un cambio de UX_. Nombrarlo bien evita mezclar dos categorías en un mismo PR sin darse cuenta.
- **Para separar criterio de implementación:** este documento fija _qué_ debe verse o sentirse; _cómo_ se implementa sigue siendo decisión del ejecutor durante el PR.
- **Para descartar la hipótesis de layout:** si mover, agrandar o recolorear algo no resuelve la fricción que describió el feedback, el problema no es de estilo — el bloque conceptual está mal ubicado o falta un dato. Ver SOP → _Layout visual vs concepto_.
- **Para evitar scope creep:** si resolver un PR de UX empieza a tocar más de una categoría de patrón a la vez (una card nueva + un copy nuevo + un campo nuevo), es señal de que el scope creció. Corresponde el STOP de **SOP → _STOP rules_ (ampliar scope)**, no seguir ampliando dentro del mismo PR.

---

## Preguntas del orquestador ante feedback visual o UX

Se suman a las 5 de _Criterio para próximos PRs_ de design-philosophy; no las reemplazan. Se usan cuando el feedback es sobre layout/composición y la interpretación no es obvia. No hace falta correrlas todas para un cambio trivial y reversible.

1. ¿El feedback describe un problema de **layout** (dónde/cómo se ve algo que ya existe) o **conceptual** (falta o sobra información, el bloque está mal planteado)?
2. ¿Ya existe un patrón aprobado acá para este caso, o es genuinamente nuevo?
3. ¿La solución agrega una card/fila/input nuevo, o reordena/oculta/deriva algo que ya existe?
4. **¿Qué deja de verse o de poder hacerse fácil si se aprueba este cambio?** Todo espacio ganado se le quita a otra cosa.
5. ¿Esto resuelve una fricción real y repetida, o una hipótesis de "quedaría mejor así"?
6. ¿Cambia lo que ASP _afirma_, o sólo cómo se ve lo que ya afirmaba?

---

## Alta de patrones nuevos

Cuando un cambio resuelve un caso que no tiene patrón acá:

1. El diagnóstico lo declara como caso nuevo.
2. El patrón se **propone en el STOP**, junto al reporte.
3. Lo incorpora el usuario, después del merge.

**Nunca se agrega un patrón dentro del PR que lo estrenó.** Eso es scope creep sobre el proceso, y además convierte una solución sin rodar en doctrina.

---

## Mantenimiento

Mismo espíritu que SOP → _Documentación viva_: esto describe **criterio**, no un changelog ni un inventario del estado actual de la UI.

Se edita cuando un principio o un patrón cambia de verdad — no se le agrega un párrafo con fecha por cada PR que lo usa. El detalle de qué PR hizo qué vive en memoria de proyecto y en los propios PRs, no acá.

**Sin nombres de clases, ids ni rutas de archivo.** Si un ejemplo necesita uno para entenderse, el ejemplo está mal escrito.

Lo modifica el usuario. Un agente propone en un STOP; no aplica.
