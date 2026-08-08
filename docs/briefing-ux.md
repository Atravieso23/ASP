# ASP — briefing de producto para análisis de UX

> Documento autocontenido. Quien lo lea no tiene acceso al código ni a conversaciones previas.
> Los nombres de personas están reemplazados por roles a propósito.

---

## 1. Qué es

App web para organizar el picado semanal de un grupo de amigos en Buenos Aires. Se juega los sábados. El grupo son ~16 personas fijas, más invitados que traen los propios jugadores.

Se usa **desde el celular, casi exclusivamente**. Conviven en un grupo de WhatsApp que sigue activo y que es donde pasa la vida social del grupo.

**La app está en producción desde el 27/07/2026. Hace unas dos semanas.** Antes de eso, el grupo se organizaba con encuestas de WhatsApp: 90 encuestas en 10 meses. Desde que salió la app, **cero encuestas**. La migración fue total y rápida.

Eso importa para cualquier recomendación: es una herramienta recién adoptada, no un producto maduro. La gente todavía está aprendiendo a usarla.

---

## 2. Qué hace hoy

### Vista Jugador
- Buscar tu nombre o registrarte
- Declarar disponibilidad: **Estoy / En duda / No estoy**
- Elegir franja horaria (Desde–Hasta, horas enteras, 09:00 a 22:00)
- Editar tu respuesta después
- Marcarte a vos mismo como pagado (sí/no)
- Agregar invitados propios y gestionar su asistencia y pago
- Usar tu mismo jugador desde otro teléfono
- Ver el ticket del partido: día, hora, cancha, tipo (F5/F7/F8…), precio total, cuota por persona, alias para transferir, mapa
- Ver "Confirmados X de N" como referencia
- Ver los equipos armados y el historial de fechas

### Vista Organizador (sin contraseña: cualquiera puede entrar)
- Editar los datos del partido
- Gestionar canchas guardadas con dirección
- Gráfico de disponibilidad por hora (los 3 horarios con más gente)
- Tabla de respuestas con buscador
- Asignar equipo (Negro/Blanco) a cada confirmado
- Formaciones arrastrables sobre una cancha
- Finalizar la fecha (archiva en historial) o limpiar todo

### Historial
- Fechas cerradas, con resultado, goleadores y tabla de posiciones

---

## 3. Cómo se organiza el grupo, según evidencia real

Analizamos 9.133 mensajes del grupo de WhatsApp (oct 2025 – ago 2026). El ciclo semanal es medible y consistente:

```
Lunes–Miércoles  Convocatoria. Se pregunta quién juega.
                 (68% de las encuestas se lanzaban acá)
Martes–Miércoles Se decide cancha + horario + formato, los tres juntos.
Jueves           "¿Cuántos somos?" — aparece la alarma.
Viernes          Bajas de último momento (46% de las bajas caen este día)
                 y búsqueda de invitados para tapar los huecos (35%).
Viernes–Sábado   Se arman los equipos.
Sábado           Partido. Y pagos (38% de los mensajes de plata).
Domingo          Pagos rezagados y reclamos.
```

El 40% de toda la conversación se concentra en viernes y sábado.

### Las tres fricciones más grandes, ordenadas por frecuencia real

**a) "¿Cuántos somos?" — 141 mensajes.** Es de lejos el tema más recurrente, con pico jueves y viernes. La app ya muestra "Confirmados X de N", pero se agregó hace pocos días y todavía no sabemos si alcanza.

**b) Los pagos son mucho más complejos de lo que la app modela.** Hoy la app tiene un simple "pagaste sí/no" por jugador, y divide el precio de la cancha entre la capacidad de la cancha. La realidad del grupo:

- Los gastos **no son solo la cancha**: son cancha + birras + asado.
- **No todos participan de cada gasto.** Cita textual del grupo: *"hay algunos que no escabiaron... uno no tomó birra y trajo su vino, así que no lo conté; otro vino solo para el asado"*. Alguien lleva esa cuenta a mano.
- **Uno adelanta todo** y después cobra: *"me sableteo 72k de una"*.
- **Se paga por varios**: *"yo pagué 2, pero una la tomamos con mis amigos"*.
- **Las deudas cruzan semanas**: *"X te debe 5k, Y como 15k"*.
- **Se compensan entre sí**: *"restale lo que te debe de propina así no hacen dos transacciones"*.
- Se olvidan (*"ah, ya había transferido"*) y se disputan (*"pero yo pagué"*).

Antes de esta app probaron **Tricount** (app de gastos compartidos). Fracasó por fricción de adopción: *"nunca usé tricount"*, *"no sé si todos tienen la app"*. Esa frustración es literalmente el origen de este proyecto.

Lo que el grupo pidió, textual: *"que quede registrado quién ya fue pagando y cada uno anote lo suyo"*, *"que no tengamos que estar preguntando qué gastó cada uno"*.

**c) La decisión de cancha/horario/formato es grupal y votada, y la app no la contempla.** Las encuestas viejas ofrecían opciones como *"Cancha A 16hs F8"* vs *"Cancha B 15hs F7"* vs *"Cancha C 20hs F8"*, **con el precio por persona de cada una**. Para el grupo son una sola decisión, porque dependen entre sí. En la app son tres campos sueltos que carga el organizador a mano, sin votación ni comparación de precios.

### Otras cosas observadas
- Las bajas del viernes no avisan a nadie: cambiás tu estado y el resto se entera si mira.
- Un anfitrión tuvo que volver a preguntar la cancha para pasársela a su invitado, porque el dato estaba enterrado en el chat.
- Hubo una encuesta dedicada a quién lleva la pelota y el inflador.
- El organizador tuvo que escribir a mano las instrucciones de pago y llegada de una cancha (seña, efectivo, anunciarse en la oficina).

---

## 4. Decisiones ya tomadas — NO hace falta re-proponerlas

Esto ya se discutió y se resolvió. Proponerlo de nuevo sería ruido:

- **Sin lista de espera ni cupo duro.** El grupo apunta a 16 pero juega con los que consiga. El número es una referencia, no un límite. Nadie queda afuera.
- **Sin lista de miembros del grupo, por ahora.** Existía una estructura así pero estaba rota y se eliminó. Se podría reconstruir más adelante si hace falta.
- **Sin notificaciones push propias.** WhatsApp es el canal donde vive el grupo. Competirle por la atención es mala idea; apoyarse en él es mejor.
- **Sin chat interno.** Ya está resuelto y no queremos moverlo.

---

## 5. Restricciones

- **Es una versión temprana con dos semanas de uso.** El equipo NO quiere agobiar a los usuarios con funciones nuevas mientras todavía se acomodan.
- Grupo chico y de confianza: no hace falta anti-fraude ni permisos elaborados. Hoy no hay ni rol de organizador — es una pestaña que cualquiera abre, y está bien así.
- Mobile-first, uso real desde el celular en la calle.
- Técnicamente es una sola página; agregar pantallas tiene costo. Preferimos densificar lo que ya existe antes que sumar secciones.
- Español rioplatense, tono informal.

---

## 6. Lo que necesitamos de vos

Analizá esto como diseñador de producto y respondé de forma **deliberadamente restringida**. No queremos un catálogo de funciones.

**1. Elegí como máximo TRES cambios para la próxima iteración.** Para cada uno:
   - Qué problema observado resuelve, citando la evidencia de arriba
   - Cómo se vería concretamente en una pantalla de celular
   - Por qué ahora y no después
   - Qué riesgo tiene (de confundir, de que nadie lo use, de romper el hábito recién formado)

**2. Decinos explícitamente qué NO deberíamos construir todavía**, aunque parezca obvio o tentador. Esta parte nos importa tanto como la anterior.

**3. Sobre los pagos en particular:** es la fricción más vieja y más profunda, pero también la más difícil. Decinos si conviene encararla ahora o esperar, y si la respuesta es esperar, cuál es la señal que nos debería indicar que llegó el momento.

**4. Una pregunta abierta:** ¿hay algo en el ciclo semanal del grupo que la app esté ignorando y que no hayamos notado?

Preferimos una recomendación con la que puedas argumentar en contra de vos misma, antes que una lista larga. Si creés que lo mejor es **no tocar nada durante unas semanas y observar**, decilo — es una respuesta válida y la vamos a tomar en serio.
