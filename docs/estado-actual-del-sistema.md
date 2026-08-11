# Estado actual del sistema — ASP / Organizador de partidos

Inventario técnico del código tal como está hoy. Repositorio `el-wizz/organizador-partidos`, rama `main`.

**Aclaración sobre el origen de esta información:** yo (Claude) **no construí esta aplicación**. Me incorporé en esta sesión y todo lo que sigue proviene de leer el código actual y de probar la app en vivo contra la base real. Donde no pude verificar algo, lo digo explícitamente. No hay nada acá basado en memoria de decisiones previas de diseño.

---

## 0. Resumen de una línea

Toda la aplicación es **un único archivo HTML estático de ~3.150 líneas** (`sites-app/public/demo.html`) con HTML, CSS y JavaScript en línea, que guarda **todo el estado del grupo en una sola fila JSON de Supabase**. El proyecto Next.js que lo rodea no hace nada funcional: solo lo muestra dentro de un iframe.

---

## 1. Arquitectura real vs. arquitectura aparente

| Lo que parece | Lo que es |
|---|---|
| App Next.js 16 + React 19 + vinext/Cloudflare | Contenedor vacío |
| `sites-app/app/page.tsx` | 11 líneas: un `<iframe src="/demo.html">` |
| Drizzle ORM + D1 configurados | `db/schema.ts` está vacío a propósito; sin uso |
| — | **`public/demo.html` es la aplicación completa** |

Detalles verificados:

- `sites-app/app/page.tsx` (11 líneas) renderiza únicamente un iframe hacia `/demo.html`.
- `sites-app/app/layout.tsx` define metadata/OpenGraph ("Organizador de Partidos ASP") y nada más.
- `sites-app/db/schema.ts`: `// Intentionally empty by default. export {};`
- Supabase se carga por CDN externo: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">` (demo.html:1001). Si ese CDN falla o está bloqueado, la app muestra "No se pudo conectar" y no arranca.
- En la raíz del repo hay `index.html` (2.201 líneas) e `index-original.html` (1.845 líneas): versiones anteriores que **no se sirven** desde la app actual. Conviene decidir si se archivan.
- Hosting: OpenAI Sites. Publicar es un paso manual separado del merge a `main`.

**Consecuencia práctica:** no existe separación en componentes, ni sistema de módulos, ni tipos. Todo cambio se hace sobre un archivo monolítico. Los tests (23) validan el HTML renderizado con expresiones regulares y comprobaciones de texto, no comportamiento real.

---

## 2. Pantallas que existen

**Navegación principal** (dos vistas mutuamente excluyentes):

1. **Usuario** — con dos pestañas internas:
   - **Partido**: "Mi estado" + ticket del partido + equipos Negro/Blanco
   - **Historial**: fechas finalizadas + tabla de posiciones
2. **Organizador** — panel único con scroll:
   - Disponibilidad por horario (top 3 horarios, gráfico de barras)
   - Respuestas de jugadores (contadores + tabla desplegable con buscador)
   - Formaciones de equipos (dos canchas con fichas arrastrables)
   - Cerrar o reiniciar la fecha

**Modales (7):**

| Modal | Alcanzable | Función |
|---|---|---|
| Editar partido | Sí | Nombre del grupo, día, hora, cancha, tipo de fútbol, precio, alias |
| Canchas guardadas | Sí (desde Editar partido) | Editar/eliminar sedes |
| **Plantel del grupo** | **NO** | Está dentro de una sección con `hidden` |
| Finalizar fecha | Sí | Archiva la fecha en el historial |
| Limpiar todo | Sí | Borra respuestas sin archivar |
| Confirmar pago | Sí | Confirmación del organizador |
| Ya estoy registrado | Sí | Reclamar un jugador desde otro dispositivo |

---

## 3. Qué puede hacer el jugador

- Buscar su nombre en una lista de jugadores ya registrados (autocompletado).
- Registrarse como jugador nuevo ("Registrarme").
- Declarar disponibilidad: **Estoy / No estoy** (binario).
- Elegir franja horaria: Desde / Hasta, en horas enteras de 09:00 a 22:00.
- Confirmar → su respuesta se sincroniza con todos los dispositivos.
- Editar su respuesta después (colapsa a un resumen con botón "Editar respuesta").
- Cambiar de jugador si se equivocó al registrarse.
- **Marcarse a sí mismo como pagado** (¿Ya pagué? Sí/No).
- Agregar, marcar pago y eliminar **invitados** propios.
- Reclamar un jugador existente desde otro dispositivo ("¿Sos Pablo?").
- Copiar el alias de pago; abrir la ubicación de la cancha en un mapa.
- Ver los equipos armados y el historial.
- **Borrar a cualquier jugador de la lista compartida** (ver §12, problema de permisos).

## 4. Qué puede hacer el organizador

No hay autenticación de organizador: **cualquiera puede entrar a la vista Organizador**. Es una pestaña, no un rol.

- Editar los datos del partido (día, hora, cancha, tipo, precio total, alias).
- Gestionar canchas guardadas, con dirección para el botón de mapa.
- Ver disponibilidad agregada por horario (los 3 horarios con más gente).
- Ver la tabla de todas las respuestas, con buscador.
- Asignar equipo (Negro/Blanco) a cada jugador confirmado.
- Elegir formación por equipo y mover fichas en la cancha (tocar = cambiar de equipo; arrastrar = reposicionar).
- Finalizar la fecha (archiva en historial y limpia todo para la próxima).
- Limpiar todo (borra sin archivar).
- En el historial: cargar resultado y goleadores por partido.

---

## 5. Qué guarda Supabase

### Tabla realmente en uso: `match_data`

- **Una sola fila**, `id = 1` (constante `ROW_ID` en demo.html:1019, con el comentario "todo el equipo comparte esta misma fila").
- Columnas usadas: `id`, `data` (JSON), `updated_at`.
- **Todo el estado del grupo vive en ese único blob JSON.**

Forma del JSON:

```
{
  matchInfo:  { teamName, date, time, loc, type, priceTotal, alias },
  players:    [ { name, status, team, paid, number, pos:{x,y}, isCaptain } ],
  responses:  [ { responseId, ownerId, ownerIds[], name, status, from, to,
                  paid, team, isGuest, invitedBy, updatedAt } ],
  history:    [ { finalizedAt, matchInfo, players[], score:{negro,blanco}, goals:{} } ],
  sedes:      [ { name, address } ],
  roster:     [ { name, number } ],
  formations: { negro: "3-2-2", blanco: "3-2-2" },
  frequentAliases: []
}
```

Nota: `players` y `responses` guardan información solapada. `responses` es la fuente de verdad; `players` se deriva de ella en cada render (`syncLocalAvailabilityWithPlayers`).

### Autenticación

`supabaseClient.auth.signInAnonymously()`. Cada dispositivo recibe un `user.id` anónimo que se usa como `ownerId` para saber qué respuesta le pertenece. `ownerIds[]` permite que varios dispositivos compartan un mismo jugador.

### Tabla que existe pero NO se usa: `player_responses`

El archivo `supabase-player-responses.sql` (raíz del repo) crea una tabla mucho mejor diseñada:

- Una fila por jugador, con `user_id` por defecto `auth.uid()`.
- Restricciones reales: nombre entre 2 y 60 caracteres y sin espacios sobrantes; `status in ('in','doubt','out')`; horarios coherentes dentro de 09:00–22:00 con `to > from`; `paid` solo si `status = 'in'`.
- Índice único por nombre normalizado (sin distinguir mayúsculas) por partido.
- Una sola respuesta por usuario y partido.
- **Row Level Security activo** con políticas: cada usuario solo lee y modifica lo suyo.
- Trigger de `updated_at`.

**La aplicación nunca la consulta.** Solo hay dos consultas en todo el código y ambas van a `match_data` (demo.html:1067 y 1099).

**Implicancia de seguridad importante:** hoy cualquier visitante anónimo puede sobrescribir el estado completo del grupo con un solo `upsert`, incluido el historial. La protección de "es mi respuesta" existe únicamente en JavaScript del lado del cliente. La migración SQL que resolvería esto ya está escrita pero no conectada.

---

## 6. Estados que existen

**Disponibilidad:** `'in'` (Estoy) / `'out'` (No estoy).
Existe un tercer estado `'duda'` en el código (botón "Duda" en demo.html:766 y un bucle en la línea 1935) pero está dentro de la sección oculta: **inalcanzable**. El SQL sin usar también lo contempla como `'doubt'`.

**Pago:** `true` / `false` / `null` (`null` cuando el jugador no va).

**Equipo:** `'negro'` / `'blanco'` / `null`.

**Modos del formulario de nombre** (tres banderas globales que interactúan):
- `registeringFirstTime` — creando un jugador nuevo
- `changingRegisteredPlayer` — corrigiendo el nombre propio
- ninguna de las dos — buscando en la lista

Esta máquina de estados es la fuente de la mayoría de los errores que encontramos (§14).

**Estado local del navegador (localStorage):**
- `asp_current_player_demo_v1` — nombre del jugador de este dispositivo
- `asp_recurrent_players_demo_v1` — lista de nombres para el autocompletado
- `asp_availability_local_backup_v1` — copia de respaldo de una versión anterior
- `asp_formations_demo_v1` — declarado pero **sin uso** (ver §13)

---

## 7. Cómo funciona un partido hoy

1. Alguien entra a Organizador → Editar partido → carga día, hora, cancha, tipo de fútbol, precio total y alias.
2. Cada jugador entra, busca o crea su nombre, elige Estoy/No estoy y su franja horaria, y confirma.
3. Opcionalmente cada uno suma invitados y marca su propio pago.
4. El organizador ve la disponibilidad agregada y asigna equipos (o los toma como vienen: hay asignación automática balanceada).
5. Ajusta formaciones moviendo fichas.
6. Al terminar: **Finalizar fecha** → se archiva `{matchInfo, players}` en `history`, se vacían respuestas y datos del partido, y queda listo para la próxima.
7. En Historial se puede cargar el resultado y los goleadores.

**No hay concepto de "partido" como entidad.** Existe un único partido activo a la vez (la fila `id=1`), y el historial es un array dentro del mismo JSON. No se pueden tener dos fechas abiertas en paralelo.

---

## 8. Cómo se representan los jugadores

Un jugador vive en **tres lugares distintos** a la vez:

| Estructura | Qué es | Ciclo de vida |
|---|---|---|
| `responses[]` | Fuente de verdad. Lo que la persona declaró. | Se borra al finalizar la fecha |
| `players[]` | Derivado. Suma equipo, dorsal, posición en cancha, capitán. | Se reconstruye en cada render |
| `roster[]` | "Plantel del grupo". Lista histórica de nombres. | **Nunca se limpia** |

La identidad se basa en el **nombre en texto**, comparado en minúsculas con `toLocaleLowerCase('es')`. No hay identificador estable de persona. `responseId` (UUID) identifica la respuesta, no al jugador.

Consecuencia: dos personas con el mismo nombre no pueden coexistir; la app pide agregar apellido o apodo.

## 9. Cómo se representan los invitados

Los invitados **sí existen** y están razonablemente implementados. Son respuestas normales con dos campos extra:

- `isGuest: true`
- `invitedBy: "<nombre del anfitrión>"`

Características:
- Solo se pueden agregar después de que el anfitrión confirmó su propia asistencia.
- Heredan la franja horaria del anfitrión.
- Reciben equipo automático balanceado.
- El anfitrión gestiona su pago y puede eliminarlos.
- Aparecen en la tabla del organizador marcados como "Invitado de X".
- Se validan contra nombres duplicados.
- Si el anfitrión cambia su propio nombre, se actualiza `invitedBy` en sus invitados.
- **No** se agregan al plantel del grupo (hay un comentario explícito al respecto en el código).

## 10. Cómo funciona el pago

- **Autodeclarado**: cada jugador se marca "¿Ya pagué? Sí/No" sin ninguna verificación.
- El organizador también puede marcar el pago de otros (con modal de confirmación).
- Ambos caminos escriben en el mismo campo `paid`.
- El monto por persona se calcula: `precio total ÷ divisor fijo por tipo de cancha` (F5÷10, F7÷14, F8÷16, F9÷18, F11÷22). **El divisor es la capacidad de la cancha, no la cantidad real de anotados**, así que la cuota no cambia si va menos gente.
- "Recaudado" = cuota por persona × cantidad de pagados.
- Hay una lista pública de "Faltan pagar: X, Y" y un alias copiable.
- Los alias usados se guardan como sugerencias para próximas fechas.

**No hay registro de transacciones, ni fecha de pago, ni montos parciales, ni quién confirmó el pago.** Es un booleano.

## 11. Cómo funciona la disponibilidad

- Franja horaria en horas enteras: `from` y `to`, entre 09:00 y 22:00.
- Se valida que `to > from`.
- El organizador ve un gráfico de los **3 horarios con más jugadores disponibles**, calculado hora por hora.
- Un jugador cuenta como disponible en una hora si `from <= hora < to`.
- Al elegir "No estoy", se ocultan los selectores de horario y se limpian los valores.

**No hay cruce automático entre la disponibilidad declarada y el horario del partido.** Si el partido es a las 20:00 y alguien declaró 16:00–18:00, la app no avisa.

---

## 12. Implementado pero incompleto

1. **Sin roles.** "Organizador" es una pestaña, no un permiso. Cualquiera puede finalizar la fecha, limpiar todo o editar el partido.
2. **Cualquiera puede borrar a cualquiera.** El borrado de jugadores no verifica de quién es la respuesta, y el botón "×" está pegado al nombre que uno toca para elegirse — en celular es un error de dedo con consecuencias para todo el grupo.
3. **Fallos de red silenciosos.** Marcar pago, agregar invitados y asignar equipos actualizan la pantalla sin comprobar que se haya guardado. Si Supabase no responde, el usuario cree que quedó guardado. (El borrado ya lo corregimos, ver §14.)
4. **El cupo se calcula pero nunca se ve.** El texto "Cupo de esta cancha: 16 jugadores (3/16 confirmados)... el que se anota de más queda en lista de espera" se genera en cada render pero vive dentro de una sección oculta. **La lista de espera se menciona pero no está implementada.**
5. **La gestión del plantel es inalcanzable**, mientras la lista sigue creciendo sola (hoy 28 entradas).
6. **Estado "Duda"** existe en el código y en el SQL, pero no en la interfaz.
7. **La cuota no se ajusta** a la cantidad real de jugadores.
8. **Sin notificaciones ni recordatorios** de ningún tipo.
9. **Historial de resultados sin validación**: se cargan goles por jugador sin comprobar que sumen el marcador.
10. **Sincronización por sondeo cada 4 segundos** que reemplaza el estado completo. No hay resolución de conflictos real: gana el último que escribe.

## 13. Cosas hardcodeadas

- **Credenciales de Supabase en el archivo** (demo.html:1007-1008): URL y clave pública están en el HTML, visibles para cualquiera. Es una clave `publishable`, pensada para ser pública, pero implica que no hay entorno de pruebas separado: **cualquiera que abra el archivo escribe en la base real**.
- `ROW_ID = 1`: un único partido posible.
- Divisores de precio fijos por tipo de cancha.
- Formaciones fijas por tipo (3 opciones por cada uno).
- Horarios limitados a 09:00–22:00, en horas enteras.
- Equipos fijos "Negro" y "Blanco".
- Nombre del grupo por defecto "ASP".
- La fecha por defecto es siempre **el próximo sábado** (`nextSaturdayISO`).
- Textos de la interfaz en español rioplatense, dentro del HTML.

**Código muerto detectado:**
- `DEMO_MODE = false` hace que `saveLocalFormationState()` y `loadLocalFormationState()` retornen de inmediato: son funciones vacías en producción.
- `DEFAULT_DEMO_RESPONSES` (17 jugadores de ejemplo: Clara, Fede, Sol, Tomás...) está definido pero nunca se usa. **Sin embargo esos nombres están hoy en el plantel real de la base**, probablemente sembrados por una versión anterior.
- `renderConfirmedList()` y `renderSimpleList()` escriben en elementos `list-in` / `list-out` que ya no existen en el DOM.
- Toda la sección `legacy-join-section` (selector de nombre + botones Juego/Duda/No juego + nota de cupo + gestión de plantel) está oculta pero se sigue actualizando en cada render.

## 14. Planeado pero todavía no existe

- **La tabla `player_responses` con seguridad por usuario**: migración escrita y lista, sin conectar. Es el cambio de arquitectura más importante pendiente.
- **Lista de espera** cuando se supera el cupo: mencionada en el texto, nunca implementada.
- **Múltiples partidos / fechas simultáneas**: la estructura no lo permite.
- **Roles y permisos**.
- **Base de datos D1 + Drizzle**: configuradas en el andamiaje pero con esquema vacío.
- No encontré ningún archivo de especificación, roadmap ni documentación de producto en el repositorio. El único README es el genérico del starter `vinext`.

---

## 15. Lo que hicimos en esta sesión

Cuatro ramas, cada una con sus pruebas (23/23 pasando) y verificación en vivo contra la base real.

**PR #1 — `fix/cambiar-jugador-registrar` — ya integrado a `main`**
Al usar "Cambiar jugador", el botón "Registrarme" quedaba oculto. Si el nombre correcto no estaba en la lista, no había forma de crearlo.

**PR #2 — `fix/borrado-jugador-no-persiste` — subido, pendiente de revisión**
El borrado de jugadores e invitados **decía que funcionaba pero no se guardaba**. El guardado se disparaba sin esperar respuesta, y el sondeo de cada 4 segundos reponía al jugador borrado leyendo el estado anterior del servidor. El mensaje de éxito aparecía igual aunque la escritura fallara. Ahora se espera el guardado, se bloquea el sondeo mientras escribe, y si falla se revierte avisando.
*Este error apareció con datos reales: un jugador de prueba que yo creía borrado seguía en la base.*

**PR #3 — `audit/ux-mejoras` — subido, pendiente de revisión** (auditoría de experiencia de usuario)
1. Al borrar tu propio jugador quedabas encerrado: el campo pasaba a solo lectura con el nombre borrado y sin botón para registrarte de nuevo.
2. "Cambiar jugador" rechazaba nombres nuevos con "No encontramos ese jugador", que es justo lo que uno intenta hacer al corregirse.
3. Al cambiar de nombre, el anterior quedaba huérfano para siempre en el plantel compartido.
4. **Contraste**: el selector Usuario/Organizador conservaba un fondo blanco translúcido de un tema claro anterior. Sobre el fondo oscuro la pestaña inactiva quedaba en 2:1 de contraste (el mínimo accesible es 4.5:1), lo que dificultaba descubrir la vista de Organizador. Ahora está en 5.7:1.
5. **Objetivos táctiles**: los botones de copiar alias y de mapa medían 24×24 px (se recomiendan 44). Copiar el alias es la acción que usa todo el mundo para pagar. Ahora el área tocable es 42×42 sin cambiar el diseño.
6. "Recaudado $0" cuando todavía no hay precio cargado parecía un error; ahora muestra "—".

**Pendiente de decisión** (documentado, sin tocar): permisos de borrado (§12.2), fallos de red silenciosos (§12.3), cupo invisible y lista de espera (§12.4), plantel inalcanzable (§12.5).

---

## 16. Las tres preguntas que definen la V2

De todo el inventario, estas son las decisiones estructurales de las que depende el resto:

1. **¿Se migra a `player_responses` con RLS, o se sigue con el JSON compartido?** Define si el sistema puede tener seguridad real. La migración ya está escrita.
2. **¿"Partido" pasa a ser una entidad con identidad propia?** Hoy hay uno solo, fijo en `id=1`. De esto dependen las fechas múltiples, la lista de espera y las estadísticas por temporada.
3. **¿Existe el rol de organizador?** Hoy no, y de eso dependen los permisos de borrar, finalizar y editar.

Una cuarta, de forma más que de fondo: **¿el HTML monolítico se parte en componentes React de verdad, o se asume que va a seguir siendo un archivo único?** El andamiaje Next.js hoy está pago pero no usado.
