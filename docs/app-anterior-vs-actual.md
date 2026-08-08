# La app anterior vs. la app actual — comparación con evidencia

Anexo al informe "Estado actual del sistema". Responde directamente a los puntos 3, 5 y 6 del prompt de análisis: **qué resolvía la app anterior, qué se heredó y qué sigue sin resolver.**

Todo lo que sigue sale de comparar el código de los dos archivos, no de suposiciones.

## Qué archivo es cuál

| Archivo | Líneas | Supabase | Rol |
|---|---|---|---|
| `index-original.html` (raíz) | 1.845 | proyecto `bfmdozufgvjekt…` | **App anterior** (confirmada por el dueño del repo) |
| `index.html` (raíz) | 2.201 | mismo proyecto anterior | Variante intermedia, misma estructura |
| `sites-app/public/demo.html` | ~3.150 | proyecto `wzjlcbiyasxam…` | **App actual en producción** |

Los tres archivos entraron en el primer commit del repositorio ("Primera versión del proyecto"). Los dos de la raíz ya no se sirven: quedaron como referencia histórica.

Secciones de la app anterior: **Anotarse · Jugadores · Equipos · Caja · Historial de fechas**.

---

## 1. Lo que la app anterior YA resolvía y la actual PERDIÓ

Este es el hallazgo principal. Son funciones que existían y funcionaban, y que hoy no están.

### 1.1 Lista de espera — estaba implementada de verdad

En la app anterior, al superar el cupo de la cancha el jugador pasaba automáticamente a estado `espera`, con aviso:

```
index-original.html:1525   status = 'espera';
index-original.html:1526   showToast(`Cupo lleno (${cap}). ${name} queda en lista de espera.`);
```

Tenía contador propio (`count-espera`), lista propia (`list-espera`) y mensaje de vacío ("Nadie en espera por ahora").

**En la app actual:** el estado `espera` **no existe**. Pero el texto que lo anunciaba sí sobrevivió — sigue generándose en cada render:

> "Cupo de esta cancha: 16 jugadores (3/16 confirmados, 8 por equipo). **El que se anota de más queda en lista de espera.**"

…solo que ese texto vive dentro de una sección oculta, así que nadie lo lee. La app actual **promete una función que ya no tiene, en un cartel que nadie ve.**

### 1.2 Estado "Duda"

La app anterior manejaba cuatro estados: `in`, `espera`, `duda`, `out` (línea 1464), con contador y lista propios para las dudas.

**En la app actual:** solo quedan `in` / `out`. El botón "Duda" existe en el código pero está en la sección oculta, y la migración SQL sin usar todavía lo contempla como `doubt`. Para un grupo de fútbol, "no sé todavía" es una respuesta real y muy frecuente: hoy no tiene dónde ir.

### 1.3 Banco de suplentes

Cuando un equipo tenía más jugadores que posiciones en la formación, la app anterior lo avisaba:

```
index-original.html:1030   'Sin ubicar en la cancha: ' + nombres
```

**En la app actual:** los jugadores que sobran se acomodan solos en el lateral de la cancha, sin ningún cartel que aclare que están fuera del once.

### 1.4 Otras funciones perdidas

| Función | Qué hacía | Estado actual |
|---|---|---|
| `theme-toggle` | Cambiar entre tema claro y oscuro | Eliminado; quedó tema oscuro fijo |
| `undo-finalize-btn` | **Deshacer el cierre de una fecha** | Eliminado: finalizar es irreversible |
| `view-lista-btn` / `view-formacion-btn` | Alternar entre ver equipos como lista o como cancha | Eliminado |
| `reset-negro-btn` / `reset-blanco-btn` | Resetear la formación de un equipo | Eliminado |

Dos merecen atención: **deshacer el cierre de fecha** (hoy si alguien toca "Finalizar" por error, no hay vuelta atrás) y el **tema claro** — de hecho el error de contraste que corregimos en el PR #3 era literalmente una regla CSS del tema claro que quedó huérfana cuando se eliminó el selector.

---

## 2. Lo que se heredó prácticamente sin cambios

La sección **"Caja"** de la app anterior es hoy la barra de pagos de la app actual, casi idéntica: *Pagaron X de Y · Recaudado · Faltan pagar*, más los botones **Finalizar fecha** y **Limpiar todo**.

También se heredaron tal cual:
- El cálculo de la cuota como precio total ÷ divisor fijo por tipo de cancha (F5÷10, F7÷14…)
- El alias copiable para transferir
- El historial de fechas con resultado, goleadores y tabla de posiciones
- La gestión de canchas/sedes con dirección y botón de mapa
- La gestión de plantel del grupo (que en la app actual quedó inalcanzable)
- Las formaciones arrastrables sobre la cancha
- El modal de confirmación de pago

**Conclusión sobre pagos:** la intuición era correcta. El manejo de pagos de la app actual **es** el de la app anterior. No evolucionó — se copió. Sigue siendo un booleano por jugador, sin registro de transacciones, sin fecha, sin quién pagó por quién.

---

## 3. Lo que la app actual agregó de nuevo

| Función nueva | Qué resuelve |
|---|---|
| **Disponibilidad horaria** (Desde/Hasta por jugador) | Antes solo se decía si jugabas; ahora también en qué franja |
| **Gráfico de disponibilidad por horario** | Permite elegir el horario según cuándo puede más gente |
| **Invitados** con anfitrión (`invitedBy`) | Registra quién trae a cada invitado y quién responde por su pago |
| **Identidad por dispositivo** (`ownerId`) + reclamar jugador | Cada uno edita lo suyo; se puede usar el mismo jugador en otro teléfono |
| **Registro y autocompletado de jugadores** | Antes se elegía de un desplegable fijo; ahora te registrás |
| **Vista Organizador separada** | Antes todo estaba mezclado en una sola pantalla |
| **Alias frecuentes** | Sugerencias de alias usados en fechas anteriores |

El salto conceptual real de la app actual es **pasar de "una planilla compartida" a "cada jugador responde por sí mismo"**. Eso es lo que trajo la identidad anónima por dispositivo, los invitados con anfitrión y la disponibilidad por franja horaria.

---

## 4. Qué significa esto para la V2

1. **Hay funciones para recuperar, no solo para inventar.** Lista de espera, estado "Duda" y deshacer el cierre de fecha ya existieron y funcionaban. Recuperarlas es más barato que diseñarlas de cero, y el historial de WhatsApp probablemente muestre que hacen falta (sobre todo "Duda" y las bajas de último momento).

2. **La deuda de pagos viene de arrastre.** No es una limitación de la app actual: es un diseño de la app anterior que nunca se revisó. Si el grupo tiene fricción real con plata, ahí no hay nada construido sobre lo que apoyarse.

3. **La app actual cambió el modelo mental sin terminar la mudanza.** Pasó de planilla a respuestas individuales, pero dejó atrás piezas que dependían del modelo viejo (lista de espera, cupo visible, plantel) sin reemplazarlas. Eso explica la mayoría de las secciones huérfanas del informe técnico.

4. **El cupo es el agujero más visible.** Hoy la app no le dice a nadie cuántos lugares quedan, aunque lo calcula. Para un partido con cupo fijo, esa es probablemente la pregunta más frecuente del grupo.
