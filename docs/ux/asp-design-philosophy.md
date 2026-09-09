# ASP — Design Philosophy

**Estado:** vigente — aprobado por el usuario el 2026-09-09.

## Tesis

**Claridad para la acción. Personalidad para la identidad. Espacio con intención. Confianza cuando importa.**

ASP es una web mobile-first para organizar partidos de fútbol entre amigos.

Debe sentirse como un lugar del grupo: entrar, entender qué pasa, hacer lo necesario y llegar al partido sin quilombo.

La interfaz es clara sin ser impersonal, futbolera sin ser críptica y simple sin verse descuidada.

## Para quién diseñamos

La persona suele llegar desde el celular para resolver algo concreto:

- responder si juega;
- consultar el partido;
- indicar disponibilidad;
- declarar un pago;
- sumar un invitado;
- organizar o corregir algo;
- consultar gastos, balances o sanciones.

El diseño ayuda a completar esa tarea y a entender qué ocurrió después.

No supone que la persona conoce el funcionamiento interno de ASP.

## Claridad en acciones importantes

Las acciones que cambian datos o decisiones llevan texto visible y comprensible.

Los símbolos y emojis pueden acompañar, pero no reemplazar su significado.

Ejemplos:

- Cambiar jugador.
- Estoy.
- En duda.
- Soy baja.
- Ya pagué.
- Agregar invitado.
- Guardar cambios.
- Sacar la amarilla.

La etiqueta debe explicar la acción sobre el elemento correcto. El significado veraz de pagos, confirmaciones y otros estados se rige por Copy honesto, en el SOP.

## Personalidad de grupo

La voz es futbolera, sobria y cercana.

La personalidad aparece especialmente en nombres de secciones, estados secundarios, mensajes de grupo y pequeños momentos de celebración.

El humor acompaña; no obliga a descifrar qué hace un botón ni qué significa una deuda.

Una expresión interna del grupo es útil cuando se entiende en contexto. No se agrega jerga para demostrar personalidad.

## Identidad visual

La personalidad también vive en:

- tipografía;
- color;
- espaciado;
- composición;
- tratamiento de controles;
- consistencia entre pantallas.

Agregar emojis o frases futboleras a una interfaz genérica no alcanza para darle identidad.

ASP puede tener una apariencia cuidada con pocos recursos visuales bien elegidos.

La dirección concreta y los patrones de composición viven en UX Working Agreement.

## Espacio con intención

ASP evita títulos, cajas y explicaciones que no aportan.

También conserva el espacio que permite leer, tocar y entender agrupaciones.

Compactar es un recurso, no un objetivo por encima de la comprensión o la comodidad.

El texto se extiende cuando aporta orientación, confirmación o seguridad. Se recorta cuando sólo ocupa espacio.

## Emojis como acento

Los emojis pueden aportar tono y reconocimiento.

El texto debe alcanzar para entender la acción o el estado aunque se ignoren los emojis.

No se agrega un emoji a cada control por consistencia decorativa.

La repetición se evalúa por su utilidad y por el ruido que produce.

## Confianza antes que chiste

En errores, guardado, identidad, pagos, pérdida de información y acciones sensibles, el tono es directo.

Ejemplos:

- Guardando…
- Guardado.
- No se pudo guardar.
- Revisá antes de seguir.

La personalidad nunca debe ocultar una consecuencia importante ni afirmar algo que la app no sabe.

## Movimiento con propósito

Las microinteracciones pueden:

- confirmar una acción;
- mostrar progreso;
- revelar contexto;
- ayudar a reconocer un cambio;
- acompañar un momento del grupo.

No deben demorar la tarea, distraer de un error ni sugerir éxito antes de que corresponda.

ASP no necesita animaciones decorativas para sentirse viva.

## Evolución sin crecimiento innecesario

No se agregan estructuras, secciones o modelos mentales sin una necesidad concreta.

Mejorar la apariencia y la coherencia es un objetivo válido cuando el usuario lo solicita. No exige inventar nuevas funcionalidades.

Las decisiones anteriores pueden revisarse ante feedback nuevo. Se conserva su motivo y se explica qué cambió.

Los tests verifican el comportamiento acordado; no convierten una decisión visual en permanente.

## Cómo se usa este documento

Ante una decisión de diseño, comprobar:

- ¿Se entiende qué se puede hacer?
- ¿La personalidad ayuda sin confundir?
- ¿La composición se siente cuidada y coherente?
- ¿El espacio y el movimiento tienen una función?
- ¿Se está agregando complejidad con un propósito concreto?

Estas preguntas guían el criterio. No crean una aprobación adicional ni un cuestionario obligatorio para cada ajuste.

## Mantenimiento

Este documento conserva principios duraderos.

El orden de pantalla, los patrones de interacción y la validación viven en UX Working Agreement.

Los PRs, textos vigentes de componentes, nombres de tests, decisiones históricas y propuestas pendientes viven en Estado y decisiones.

El usuario aprueba cambios a la filosofía. Claude Code puede aplicarlos mediante una tarea documental autorizada.