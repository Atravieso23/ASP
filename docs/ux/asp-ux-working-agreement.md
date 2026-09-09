# ASP — UX Working Agreement

**Versión:** 3  
**Estado:** vigente — aprobado por el usuario el 2026-09-09.

## Propósito

Este documento guía recorridos, acciones, composición e interacción de ASP.

Debe ayudar a que la app sea clara, cómoda en mobile y visualmente coherente, preservando su personalidad de grupo.

No es un inventario de la UI actual ni una lista de features pendientes.

## Relación con otros documentos

- Product & Engineering SOP: interpretación, alcance, riesgo, autorizaciones, verificación y copy honesto.
- ASP Design Philosophy: identidad, voz y personalidad.
- Estado y decisiones: decisiones concretas, evidencia, pendientes e historial.

Los niveles de riesgo y los STOP viven únicamente en el SOP.

Aprobar un criterio UX no demuestra que la app ya lo cumpla. Las diferencias se registran como hallazgos; no se convierten automáticamente en trabajo autorizado.

## Alcance

Aplica a las interfaces del jugador y del organizador, incluidos partido, pagos, Split, tarjetas, invitados e historial.

La prioridad de cada pantalla depende de la tarea que ayuda a resolver. No se aplica por inercia la jerarquía de la pantalla del partido a todas las demás.

## Entender el recorrido antes de componer

Para una sección nueva o un rediseño, describir brevemente:

- qué necesita resolver la persona;
- qué información necesita;
- qué acciones tiene;
- qué cambia después de cada acción;
- cómo corrige un error;
- qué relación existe con otras secciones.

Distinguir comportamiento observado, feedback recibido e hipótesis.

Una acción técnicamente posible no se agrega sin una necesidad que la justifique.

Si el feedback admite interpretaciones que cambian el resultado, se aplica la confirmación breve del SOP.

## Principios

### Claridad antes que compactación

Reducir espacio desperdiciado. Conservar separación cuando ayuda a leer, tocar o reconocer grupos.

Menos scroll no significa automáticamente mejor UX. Evaluar también esfuerzo de búsqueda, comprensión y cantidad de pasos.

### Acciones junto a su contexto

Una acción debe aparecer donde la persona entiende sobre qué elemento opera y qué efecto tendrá.

No corregir un estado diferente sólo porque resulte más fácil técnicamente.

### Jerarquía según tarea y momento

El estado personal suele ser importante, pero no existe un orden de pantalla invariable.

La fecha, hora, lugar u otro contexto necesario para decidir debe estar disponible antes o junto a la acción.

Cambiar el orden exige explicar qué tarea mejora y qué se vuelve menos accesible.

### Mostrar lo útil

Mostrar información mientras sirva para decidir, consultar, explicar o corregir.

Ocultar o replegar controles que no aplican. No esconder información todavía relevante sólo para limpiar la pantalla.

Si ocultar algo vuelve incomprensible una opción o su disponibilidad, mostrar una explicación breve.

### Coherencia sin sobrediseño

Reutilizar tratamientos visuales y patrones conocidos cuando funcionan.

Unas pocas variables compartidas de color, espaciado y tipografía pueden ayudar. No obligan a crear una librería de componentes ni incorporar herramientas nuevas.

## Dirección visual

ASP debe tener una composición reconocible y consistente.

La dirección visual define lo suficiente para trabajar con coherencia:

- tipografía y jerarquía;
- color y contraste;
- espaciado;
- superficies y agrupaciones;
- botones y controles;
- estados de interacción.

“Más lindo” o “menos AI” son puntos de partida, no instrucciones de implementación suficientes.

Traducir ese feedback a aspectos observables y comparables. No asumir que quitar emojis, agregar degradados o reducir todos los espacios resuelve el problema.

## Rediseño autorizado

Cuando el usuario solicita un rediseño:

1. Identificar recorridos y comportamientos que deben preservarse.
2. Revisar la experiencia como conjunto.
3. Mostrar una pantalla representativa en tamaño móvil y un recorrido principal.
4. Acordar la dirección visual y funcional.
5. Extenderla por entregas pequeñas.
6. Comprobar que lo anterior sigue funcionando.

La muestra utiliza contenido realista y estados relevantes. No hace falta diseñar todas las pantallas antes de empezar.

El mock ayuda a decidir; no reemplaza validar la implementación.

Combinar cambios de card, copy y controles no amplía por sí mismo el alcance. Hay ampliación cuando cambia el resultado acordado, el riesgo o los límites.

## Patrones de composición

### Agrupaciones y cards

Usar una card cuando ayuda a reconocer un bloque con entidad propia.

No asignar una card a cada dato o subdecisión. Tampoco eliminar agrupaciones útiles sólo para reducir altura.

### Filas y campos

Agrupar campos relacionados cuando siguen siendo legibles y cómodos.

En mobile angosto, permitir apilarlos si mejora su uso. La relación conceptual no obliga a compartir una fila.

Los labels deben seguir siendo comprensibles con textos largos y nombres reales.

### Inputs

- Mantener una etiqueta que identifique el campo.
- Usar placeholders como ayuda, no como único significado del control.
- No precargar una elección que pueda confundirse con una decisión del usuario.
- Mostrar valores guardados cuando corresponda.
- Reutilizar datos existentes sólo si representan el mismo concepto.

Identidad, alias, participación y membresía no se tratan como equivalentes.

### Botones

Distinguir la acción principal de las secundarias mediante jerarquía visual.

Un botón secundario puede ser discreto, pero debe seguir siendo fácil de tocar.

Las acciones críticas llevan texto visible conforme a ASP Design Philosophy.

### Ayudas

Una ayuda explica algo necesario o reduce una duda real.

Si repite el label, no aporta información o pesa más que el control, se elimina o simplifica.

### Estados vacíos

Explicar brevemente qué significa el vacío y, cuando sea útil, cómo continuar.

No confundir “no hay datos” con “todavía no cargaron” o “falló la carga”.

### Redundancias

Eliminar repeticiones sin función.

Conservarlas cuando permiten actuar sin volver atrás, sostienen orientación o muestran un resumen útil. Repetir un dato no es por sí mismo un error.

## Guardado, error y latencia

La interfaz distingue pendiente, guardado y error cuando esa diferencia importa.

No presenta como persistido un cambio cuyo guardado falló.

Puede mostrar respuesta local inmediata si comunica el estado pendiente y permite recuperarse. La actualización optimista se evalúa por sus efectos; no está prohibida de forma general.

Los errores explican lo necesario y ofrecen un siguiente paso comprensible. No muestran detalles internos como explicación principal.

Cuando una acción está en curso, su estado debe ser perceptible. Evitar envíos duplicados; si hay persistencia, verificar también los reintentos.

El comportamiento offline debe reflejar lo que la app realmente soporta. No insinuar que algo se sincronizará después si esa capacidad no existe.

## Correcciones y acciones sensibles

Distinguir:

- cambiar una decisión personal;
- corregir un dato;
- retirar una sanción;
- borrar información;
- modificar algo de otra persona.

La ubicación y el texto deben dejar claro cuál de esas acciones ocurre.

Pedir confirmación cuando exista pérdida difícil de revertir, impacto sobre terceros o una consecuencia que pueda sorprender. No confirmar cada interacción por rutina.

La confirmación nombra el elemento y la consecuencia.

Cuando la reversión es sencilla y segura, una opción de deshacer puede ser preferible.

La vista Organizador no es un permiso real. Toda propuesta de administración, incluida membresía, explica quién podrá ejecutarla con los controles existentes.

## Piso de usabilidad y accesibilidad

Estos son criterios internos de ASP, no una declaración de cumplimiento integral de un estándar.

- Texto de contenido de al menos 14px y ayudas de al menos 12px; aumentar cuando la lectura lo requiera.
- Contraste de al menos 4.5:1 en texto normal y 3:1 en texto grande.
- Área táctil objetivo de al menos 44×44px, aunque el elemento visible sea menor.
- El color no comunica un estado por sí solo.
- Controles con nombres comprensibles y foco visible.
- Evitar que el zoom o el aumento de texto impidan completar la tarea.
- En modales, mantener navegación y cierre comprensibles, incluido el regreso al control de origen.

Compactar no permite degradar estos criterios.

## Validación

Para cambios acotados, verificar el recorrido afectado y sus estados relevantes.

Para rediseño, comparar antes y después:

- claridad de la tarea;
- información disponible;
- cantidad y calidad de pasos;
- legibilidad;
- comodidad táctil;
- coherencia visual;
- personalidad;
- comportamiento preservado.

La cobertura móvil y las reglas de pruebas sin writes reales viven en el SOP.

No dar por validado un recorrido sólo porque el mock se vea bien.

## Evitar

- Resolver otro problema válido que el usuario no pidió.
- Agregar controles por completar un catálogo de acciones.
- Compactar hasta volver difícil leer o tocar.
- Confundir ausencia de información con limpieza visual.
- Rediseñar toda la app por una molestia puntual sin alcance acordado.
- Impedir un rediseño explícitamente solicitado usando reglas para microajustes.
- Tratar un texto o layout histórico como inmutable porque tiene tests.
- Introducir persistencia nueva para resolver algo que sólo necesita presentación.
- Confundir una hipótesis estética con un hallazgo comprobado.

## Uso y mantenimiento

Antes de un cambio, consultar sólo los criterios pertinentes.

Si aparece un caso nuevo, resolverlo con los principios existentes o explicitar la decisión necesaria. No todo caso nuevo necesita un patrón nuevo.

Una solución se incorpora como patrón cuando tiene utilidad reutilizable. No se convierte en doctrina sólo por haber sido implementada una vez.

El usuario aprueba cambios al documento. Claude Code puede aplicarlos en una tarea documental autorizada.

Las decisiones puntuales, su evidencia y las condiciones para revisarlas se guardan en Estado y decisiones.