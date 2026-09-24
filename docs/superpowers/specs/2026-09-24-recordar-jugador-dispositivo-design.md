# Recordar jugador por dispositivo

**Estado:** propuesta de implementación — diseño aprobado por el usuario el 2026-09-24.

## Problema

Un jugador puede usar ASP desde celular y desktop. Hoy la app conserva señales locales y una sesión técnica por navegador, pero no presenta una decisión clara para recordar a la persona en ese dispositivo ni restaura de forma consistente esa elección entre partidos.

## Objetivo

Permitir que cada navegador recuerde, de forma optativa e independiente, al último jugador elegido. El objetivo es reducir la repetición de elegir identidad en próximos partidos sin vincular dispositivos, crear cuentas ni afirmar que dos dispositivos pertenecen a la misma persona.

## Alcance

1. Mostrar el checkbox **Recordar este jugador en este dispositivo** debajo de la identidad elegida, antes de guardar la respuesta.
2. El checkbox empieza desmarcado para una identidad no recordada. Si ese navegador ya recuerda a esa identidad, aparece marcado.
3. Al marcarlo, guardar únicamente la identidad habitual canónica en almacenamiento local del navegador. Al desmarcarlo, borrar ese recuerdo local.
4. Al abrir la app, validar el recuerdo contra `habitualPlayers`:
   - si la identidad sigue en el roster y su response actual pertenece a este dispositivo, restaurar el estado de jugador como hoy;
   - si sigue en el roster pero no existe response propia para el partido nuevo, preseleccionarla para continuar la respuesta sin crear ni confirmar nada automáticamente;
   - si existe una response de otro dispositivo, conservar el mecanismo actual de confirmación/claim antes de permitir editarla;
   - si ya no pertenece al roster, borrar el recuerdo local y mostrar Registro.
5. Si una baja de roster retira a la identidad recordada, borrar también ese recuerdo local.

## Límites explícitos

- Celular y desktop no se vinculan ni se sincronizan.
- No se agregan cuentas, email, QR, códigos, roles ni permisos nuevos.
- El recuerdo local no acredita identidad ni da acceso automático a una response controlada por otro dispositivo.
- Borrar datos del navegador, usar incógnito o cambiar de navegador elimina el recuerdo.
- El checkbox no escribe Supabase ni cambia `ownerId` u `ownerIds` por sí mismo.

## Copy

Único texto nuevo visible:

> Recordar este jugador en este dispositivo

No lleva texto auxiliar ni promete que los dispositivos se recuerden entre sí.

## Validación requerida

- Pruebas de guardado, restauración, desmarcado y eliminación de un recuerdo inválido.
- Pruebas de que el checkbox no modifica datos compartidos ni evita el claim de una response ajena.
- Prueba de que una baja de roster borra el recuerdo local correspondiente.
- Smoke mobile a 320px y 375px: checkbox legible, táctil y sin scroll horizontal; estados de jugador recordado, jugador nuevo y roster retirado.
- Suite, lint y diff check limpios. Sin escrituras reales de Supabase durante la validación.

## Riesgo y decisión

Es un cambio Nivel 2: altera un recorrido de identidad y persistencia local, pero no agrega persistencia compartida ni permisos. La salvaguarda clave es que recordar un nombre no equivale a reclamar una response de otro dispositivo.