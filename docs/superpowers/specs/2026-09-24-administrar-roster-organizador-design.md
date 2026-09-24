# Administrar roster desde Organizador

**Estado:** propuesta de implementación — diseño aprobado por el usuario el 2026-09-24.

## Problema

El grupo puede aprobar solicitudes de alta desde Organizador, pero no puede administrar desde esa misma vista quién sigue en el roster habitual. Hoy una baja exige una operación manual fuera de la app.

## Objetivo

Convertir el bloque de solicitudes en el punto único de administración del roster habitual: aprobar o rechazar solicitudes pendientes y sacar integrantes actuales cuando ya no forman parte del grupo.

## Alcance

En Organizador:

1. Mostrar un bloque compacto de **Gestión de jugadores** con dos botones de la misma jerarquía: **Solicitudes (N)** y **Roster (N)**. Los conteos indican el trabajo pendiente y el tamaño de la lista sin desplegarla en la vista principal.
2. **Solicitudes (N)** abre un panel propio con sólo las solicitudes pendientes y las acciones Aprobar y Rechazar.
3. **Roster (N)** abre un panel propio con una fila por integrante de `habitualPlayers` y el control **Sacar del roster**.
4. Antes de la baja, pedir confirmación que nombre a la persona y explique las consecuencias.
5. Al confirmar, operar sobre una lectura fresca y, de forma atómica en la misma escritura:
   - quitar la identidad normalizada de `habitualPlayers`;
   - quitar su respuesta regular del partido actualmente abierto, si existe;
   - conservar invitados, pagos, tarjetas, historial y solicitudes anteriores.
6. Si el dispositivo que realiza la operación tenía a esa persona como identidad elegida, limpiar esa identidad local y volver al selector.
7. Cada panel muestra un estado vacío comprensible cuando no hay solicitudes pendientes o integrantes, y se puede cerrar y volver al punto de origen.

## Comportamiento y copy

La confirmación dirá:

> ¿Sacar a {Nombre} del roster? También se eliminará su respuesta al partido actual. El historial de fechas anteriores no cambia.

El cambio no reanota ni crea una respuesta. Una baja es una excepción para una persona que dejó de participar; normalmente no se aplica a alguien que ya respondió, pero si ocurre se elimina esa respuesta actual por decisión explícita del usuario.

## Reglas de datos

- `habitualPlayers` sigue siendo la fuente de verdad de la membresía.
- La nueva vía cliente debe ser una única función focalizada, documentada y protegida por tests, equivalente en disciplina a `aprobarSolicitudDeAlta()`.
- La baja se identifica por nombre normalizado y sólo elimina respuestas no invitadas cuya identidad habitual corresponda a esa persona.
- Debe revalidar en el estado fresco: si ya no existe, no escribe; dos acciones concurrentes no pueden borrar una segunda persona ni fallar de manera silenciosa.
- No hay autorización real: Organizador es un control operativo visible para el grupo, no un permiso verificado.

## No incluido

- Borrado o edición de historial, pagos, tarjetas o invitados.
- Motivo de baja, auditoría de quién la realizó o recuperación/rehabilitación.
- Cambios a la vista de jugador.
- Roles, autenticación o permisos reales.

## Validación requerida

- Pruebas focalizadas de baja: roster, respuesta actual, idempotencia, relectura fresca, integridad de las demás claves y preservación del historial.
- Pruebas de render: los dos accesos compactos muestran sus conteos, abren el panel correcto, tienen vacío comprensible y permiten volver; la confirmación sigue siendo clara.
- Smoke mobile de Organizador a 320px y 375px con solicitudes y roster de nombres largos; sin clipping ni scroll horizontal.
- Suite, lint y revisión de diff limpios. El smoke usa datos falsos y no escribe Supabase real.

## Riesgo y decisión

Es un cambio Nivel 3: modifica membresía compartida y puede retirar la respuesta de otra persona. La mitigación es una confirmación explícita, una única escritura focalizada sobre estado fresco y validación de integridad.
