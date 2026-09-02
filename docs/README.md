# Documentación del proyecto

Análisis hecho en agosto de 2026, antes de encarar la V2. Sirve para no volver a investigar lo mismo.

## Qué hay acá

**[estado-actual-del-sistema.md](estado-actual-del-sistema.md)** — Inventario técnico completo: pantallas, qué puede hacer cada rol, qué guarda Supabase, qué está a medias, qué está hardcodeado y qué se planeó pero nunca se hizo. Empezá por acá si no conocés el proyecto.

Lo más importante que documenta:
- La app entera es un solo HTML (`sites-app/public/demo.html`). El proyecto Next.js que lo rodea solo lo muestra en un iframe.
- Todo el estado del grupo vive en **una sola fila JSON** de Supabase (`match_data`, `id=1`).
- Existe una tabla `player_responses` con seguridad por usuario (RLS) y restricciones reales, **que la app nunca usa**. Es la migración pendiente más importante.

**[app-anterior-vs-actual.md](app-anterior-vs-actual.md)** — La app actual se construyó sobre una anterior (`index-original.html`, en la raíz). Este documento compara ambas: qué se heredó sin cambios, qué se agregó y qué se perdió en el camino.

Hallazgo principal: la app anterior tenía lista de espera, estado "Duda" y deshacer el cierre de fecha. El manejo de pagos de hoy es el de esa app, copiado sin revisar.

**[runbook-agregar-habitual.md](runbook-agregar-habitual.md)** — Procedimiento para agregar o sacar un jugador habitual del grupo de forma segura. Hoy no hay UI: es una operación manual con `sites-app/scripts/seed-habitual-players.mjs`. Documenta el modelo (`habitualPlayers` como fuente de verdad, `habitualName` vs `name`), el paso a paso con dry-run y reconciliación contra prod, los riesgos de `--force` y el impacto en "Faltan confirmar" y tarjetas.

**[runbook-sanciones-pago.md](runbook-sanciones-pago.md)** — Reglas vigentes del dominio de plata: pago personal, `Faltan pagar` (deuda viva de la fecha), `Lista de morosos` (sanciones acumuladas), tarjetas 🟨 y birras 🍺. Aclara que son tres conceptos distintos, cómo se calcula cada tarjeta en `computeCards` (habitual + `status:'in'` + impago al horario de inicio, latcheado por `matchKey`), que pagar tarde no borra una amarilla, que los invitados cuentan para `Faltan pagar` pero nunca reciben tarjetas, y los casos borde. Es documentación de lo que ya hace el código, no una propuesta de cambio.

**[briefing-ux.md](briefing-ux.md)** — Documento autocontenido para pasarle a alguien externo que analice la experiencia de usuario. Incluye el contexto del grupo, el ciclo semanal real, las decisiones ya tomadas que no hay que reproponer, y un pedido explícito de que priorice en vez de tirar una lista larga. Los nombres reales están reemplazados por roles.

## Lo que NO está acá

El análisis del historial de WhatsApp y los scripts que lo procesan están en `analisis-privado/`, fuera del control de versiones: citan mensajes textuales de 26 personas.

Ese análisis es la evidencia detrás de varias de las decisiones de producto. Si necesitás consultarlo, está en la máquina de quien lo generó.

## Contexto que conviene saber

- **La app salió a producción el 27/07/2026.** Antes el grupo se organizaba con encuestas de WhatsApp: 90 en 10 meses, y cero desde que salió la app. La migración fue total.
- **El cupo es una referencia, no un límite.** Se apunta a 16 pero se juega con los que haya. No hay lista de espera y es a propósito.
- **No hay CI.** Los tests (`npm test` en `sites-app`) no corren solos en GitHub. Conviene correrlos sobre `main` después de cada merge, sobre todo si se trabaja en ramas paralelas: la app es un archivo único y los conflictos son fáciles.
- Los tests son expresiones regulares sobre el HTML: **no ejecutan la página ni detectan errores de sintaxis JS.**
