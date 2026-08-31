# ASP Design Philosophy

## Tesis

**Claridad para la acción. Personalidad para la identidad. Compacto por defecto. Explícito cuando importa.**

ASP es una web mobile-first para organizar partidos de fútbol entre amigos. No es una SaaS corporativa, una app genérica de eventos ni un formulario administrativo.

ASP debe sentirse como una cancha digital mínima: un lugar donde el grupo confirma, se carga un poco, paga, suma invitados y llega al partido sin quilombo.

La interfaz debe ser clara, pero no neutra; compacta, pero no seca; futbolera, pero no críptica.

## Qué es ASP

ASP existe para resolver una situación concreta y repetida:

- saber quién juega, quién está en duda y quién es baja;
- saber a qué hora puede cada uno;
- saber quién pagó;
- sumar invitados;
- organizar el partido con la menor fricción posible.

El usuario típico no entra a explorar la app. Entra rápido, muchas veces desde el celular y probablemente desde WhatsApp, para hacer una acción puntual.

Por eso ASP prioriza:

1. velocidad;
2. claridad;
3. poco scroll;
4. estados visibles;
5. personalidad de grupo.

## 1. Mobile-first real

Mobile-first no significa achicar una interfaz de escritorio. Significa diseñar para el uso real: una mano, pantalla angosta, poco tiempo, contexto social y necesidad de confirmar rápido.

La pantalla muestra primero lo que cambia el partido, en este orden:

1. identidad del jugador;
2. estado personal: Estoy / En duda / Soy baja;
3. disponibilidad, sólo si aplica;
4. pago personal;
5. invitados;
6. contexto grupal;
7. detalles administrativos.

## 2. Claridad en acciones críticas

Toda acción que cambie datos importantes debe ser entendible sin explicación externa. Esto incluye cambiar jugador, marcar el estado personal o de pago, agregar invitados, guardar cambios y saldar pagos.

En estos casos ASP no depende sólo de símbolos, iconos o emojis.

Ejemplos correctos:

- Cambiar jugador
- Estoy
- En duda
- Soy baja
- Ya pagué
- Debo
- Agregar
- Saldar birra

Ejemplos a evitar como etiqueta única:

- ⇄
- +
- OK
- …
- ⚽

**Regla:** lo que se toca para cambiar datos debe ser claro.

## 3. Personalidad en estados y contexto

ASP no debe sonar neutral. Su personalidad vive especialmente en chips, badges, estados vacíos, mensajes secundarios, nombres de secciones, confirmaciones y momentos de grupo.

Ejemplos de tono válido:

- Siempre para la pelota
- Nombre en la casaca
- Saldar birra
- Lista de morosos
- Sin invitados
- Todo fulvo
- Baja sensible
- Te esperamos
- Falta la banda

La voz es futbolera, sobria y de grupo: más vestuario que dashboard corporativo.

**Regla:** lo que acompaña, resume o celebra puede ser futbolero, siempre que no vuelva misteriosa una acción importante.

## 4. Compacto por defecto, explícito cuando importa

ASP evita ocupar espacio vertical innecesario. No todo necesita una tarjeta, un título o una explicación permanente.

La interfaz puede ser compacta cuando el estado es normal y más explícita cuando algo:

- está activo;
- cambió;
- requiere atención;
- puede generar un error;
- necesita una confirmación visible.

Los chips pueden ser compactos en reposo y expresivos cuando representan un estado activo.

Caso testigo:

- reposo: `Todo el día`;
- activo: `Siempre para la pelota ⚽❤️`.

**Regla:** el texto largo aparece cuando aporta confirmación, emoción o seguridad, no como relleno permanente.

## 5. Progressive disclosure

Si algo no aplica, se oculta, se resume o se repliega.

Cuando el jugador marca `Soy baja`, el bloque Disponibilidad se oculta porque una baja no necesita indicar horarios. Mostrarlo agregaría ruido y ocuparía espacio sin aportar valor.

**Regla:** no mostrar controles por las dudas; mostrarlos cuando sirven.

## 6. Emojis como acento

Los emojis forman parte del tono de ASP, pero no reemplazan significado crítico.

Correcto:

- Siempre para la pelota ⚽❤️
- Pagado ✅
- Debo 🍺
- Listo ⚽

Incorrecto:

- ⚽❤️ como única etiqueta de un chip;
- ⇄ como único contenido de un botón;
- ✅ sin texto para un estado de pago;
- iconos sin texto en acciones críticas.

**Regla:** el texto visible debe alcanzar para entender la acción o el estado aunque se ignoren los emojis.

## 7. Microinteracciones con intención

ASP no necesita animaciones decorativas. Una microinteracción debe cumplir al menos una función:

1. confirmar una acción;
2. mostrar que algo se guardó;
3. revelar u ocultar contexto;
4. reducir ruido;
5. hacer sentir viva la interacción grupal.

Ejemplos válidos:

- al marcar `Soy baja`, Disponibilidad se repliega;
- al activar `Todo el día`, los selectores se ocultan visualmente;
- al guardar, aparece un estado claro de guardado;
- si hay cambios sin guardar, aparece una señal sobria;
- al marcar un pago, el estado cambia de forma evidente;
- si faltan confirmaciones, se muestra una presión social liviana.

**Regla:** nada de fuegos artificiales; feedback útil, rápido y con tono.

## 8. Confianza antes que chiste

ASP prioriza claridad absoluta ante cambios sin guardar, errores de guardado, conflictos de identidad, invitados duplicados, datos inconsistentes, pagos y acciones destructivas.

En estos casos el tono puede ser humano, pero no ambiguo:

- Cambios sin guardar
- Guardando…
- Guardado
- No se pudo guardar
- Ese nombre ya está ocupado
- Revisá antes de seguir

**Regla:** cuando hay riesgo de pérdida, error o confusión, la interfaz baja el nivel de chiste.

## 9. No generalizar antes de tiempo

ASP evita crecer por ansiedad de producto. No se agregan estructuras, secciones ni modelos mentales nuevos sin una necesidad real del grupo.

La disponibilidad segmentada, por ejemplo, sólo debería avanzar si la disponibilidad simple deja de alcanzar.

**Regla:** simple primero; general sólo con evidencia.

## Reglas prácticas de UI

1. Las acciones críticas llevan texto visible.
2. Los símbolos pueden acompañar, no reemplazar.
3. Los emojis son acento, no interfaz principal.
4. Los chips pueden ser compactos en reposo y expresivos cuando están activos.
5. Si una sección no aplica al estado actual, se oculta o se resume.
6. Los estados de guardado y error son explícitos y sobrios.
7. El microcopy futbolero vive mejor en estados secundarios, estados vacíos y confirmaciones.
8. Mobile-first significa menos superficie visible, no simplemente texto más chico.
9. No se crean tarjetas o filas si una composición más directa alcanza.
10. Se priorizan la lectura rápida y las acciones con una mano.
11. No se agrega complejidad sin evidencia de uso real.
12. La interfaz debe sentirse de grupo, no de oficina.

## Decisiones ya alineadas

- `Soy baja` oculta Disponibilidad: si el jugador no juega, los horarios no aplican.
- `Cambiar jugador` reemplaza a `⇄`: cambiar identidad es crítico y no debe ser críptico.
- `Siempre para la pelota ⚽❤️` aporta identidad como estado expresivo; queda abierta la posibilidad de usar `Todo el día` en reposo y la versión expresiva al activarse.

## Deudas abiertas

Estas cuestiones quedan documentadas para decisiones futuras. Este documento no las implementa ni define su solución final.

### Identidad / Nombre en la casaca

Evitar duplicar la identidad ya resuelta por el selector. Evaluar si el nombre visible sólo debe aparecer cuando haga falta corregirlo o diferenciarlo.

### Faltan pagar

Mantener primero el estado de pago personal y evaluar debajo un contexto grupal compacto. No confundir mi pago con la deuda del grupo.

### Cambios sin guardar

Agregar en un PR futuro una señal clara, sobria y persistente mientras exista riesgo de pérdida.

### Disponibilidad segmentada

No avanzar sin evidencia de que la disponibilidad simple dejó de alcanzar.

### Chip full-day

Evaluar el patrón compacto en reposo (`Todo el día`) y expresivo al activarse (`Siempre para la pelota ⚽❤️`).

## Criterio para próximos PRs

Cada cambio futuro de UX/UI debe poder responder:

1. ¿Qué fricción real reduce?
2. ¿La acción crítica sigue siendo clara?
3. ¿Conserva o mejora la personalidad futbolera?
4. ¿Es compacto en mobile?
5. ¿Agrega complejidad sólo donde existe evidencia?

Si no puede responder esas preguntas, el cambio todavía no está listo.
