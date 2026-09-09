# ASP — Product & Engineering SOP

**Versión:** 6  
**Estado:** vigente — aprobado por el usuario el 2026-09-09.

## Propósito

Este SOP protege ASP de tres riesgos:

1. Resolver el problema equivocado.
2. Romper datos, producción o confianza.
3. Construir más sistema del necesario.

ASP es una web mobile-first para organizar partidos de fútbol entre amigos. El proceso debe ayudar a mejorar una app real, con cambios pequeños y verificables.

**Principio central:**

Feedback → problema entendido → alcance concreto → ejecución proporcional → verificación → cierre.

La velocidad importa, pero implementar rápido una interpretación equivocada no es avanzar.

## Filosofía de trabajo

- Feedback real antes que hipótesis.
- Simple antes que sofisticado.
- Mobile real antes que diseño ideal.
- Solución completa pequeña antes que perfección.
- No agregar complejidad sin una necesidad concreta.
- Revisar decisiones anteriores es válido cuando aparece evidencia nueva.
- Preservar lo que funciona no significa congelar la interfaz.

Un PR mínimo es el menor cambio completo que resuelve el problema acordado. No significa el menor diff posible.

## Documentos y responsabilidades

Cada regla tiene un único hogar:

| Documento | Responsabilidad |
|---|---|
| Product & Engineering SOP | Interpretación, alcance, autoridad, riesgo, ejecución y evidencia. |
| UX Working Agreement | Recorridos, acciones, composición, interacción y validación visual. |
| ASP Design Philosophy | Identidad, voz y personalidad. |
| Estado y decisiones | Estado observado, decisiones y motivos, pendientes y referencias. |

Si existe un contrato de producto, debe identificarse su versión y contenido antes de usarlo como autoridad. Una referencia a un archivo no demuestra que esté vigente.

El SOP gobierna proceso y autorizaciones; UX gobierna interacción y composición; la filosofía gobierna personalidad. Una preferencia visual no autoriza ampliar alcance ni escribir datos reales.

Ante una contradicción material, se identifica la regla afectada y se propone una resolución. Se detiene únicamente el trabajo que dependa de esa decisión.

Las instrucciones explícitas del usuario prevalecen sobre estos documentos.

## Obsidian y versiones

Obsidian es el lugar de revisión y aprobación de estos documentos.

Si el repositorio necesita copias para Claude Code:

- identificar la versión aprobada de origen;
- actualizar las copias mediante una tarea documental;
- verificar que coincidan;
- evitar editar ambas versiones independientemente.

Las propuestas se distinguen de las reglas aprobadas. No existe sincronización automática salvo que se haya configurado y verificado.

El SOP no contiene backlog, historial de PRs ni inventario detallado de la interfaz.

## Roles

### Orquestador: este chat

Responsable de:

- entender el problema humano;
- hacer preguntas breves cuando exista ambigüedad material;
- definir resultado esperado y límites;
- revisar UX y coherencia de producto;
- preparar encargos para Claude Code;
- evaluar su evidencia;
- recomendar avanzar, corregir, cerrar o detener;
- mantener un contexto breve y actualizado.

No presenta como observado algo que sólo recibió como reporte. Distingue hecho, hipótesis y decisión.

### Ejecutor: Claude Code

Responsable de:

- inspeccionar código y estado técnico;
- diagnosticar en read-only;
- implementar el alcance autorizado;
- verificar comportamiento y riesgos;
- reportar evidencia;
- detenerse ante los casos definidos en este SOP.

Si el alcance parece insuficiente o riesgoso, lo explica antes de implementar. Evidencia nueva puede justificar una nueva objeción.

Toda delegación técnica se dirige a Claude Code. El encargo distingue inspección, implementación y operación real.

### Usuario

Decide objetivos, acepta los trade-offs de producto y autoriza las operaciones que requieren aprobación explícita.

No debe necesitar comprender detalles técnicos para confirmar qué quiere que ocurra en la app.

## Interpretar antes de implementar

Antes de encargar una solución, identificar:

- quién tiene el problema;
- en qué situación ocurre;
- sobre qué elemento o estado;
- qué resultado espera.

Si dos interpretaciones plausibles cambian el elemento afectado, el comportamiento o el alcance, el orquestador hace una pregunta breve y espera la respuesta.

Declarar una interpretación no equivale a confirmarla.

Si la duda es técnica, corresponde diagnóstico read-only acotado. Si la duda es qué quiere el usuario, inspeccionar código no reemplaza preguntarle.

Ejemplo:

“Sacarlo de morosos” puede significar corregir una sanción. No autoriza por sí mismo a modificar su declaración de pago.

El encargo y el PR conservan una explicación breve del problema confirmado y del resultado esperado.

## Elegir el camino

### Cambio directo y acotado

Cuando el problema, la solución y el riesgo están claros, se prepara directamente el cambio autorizado. No hace falta un diagnóstico separado ni inventar alternativas.

La inspección técnica necesaria sigue siendo parte del trabajo.

### Diagnóstico read-only

Cuando falta evidencia para entender el comportamiento, el impacto o la viabilidad:

- formular la pregunta que debe resolver;
- inspeccionar sólo lo pertinente;
- devolver hallazgos y recomendación;
- no convertir el diagnóstico en implementación.

### Exploración o rediseño

Cuando el usuario solicita revisar recorridos o apariencia general:

- acordar el objetivo y los comportamientos que deben preservarse;
- revisar la experiencia como conjunto;
- mostrar una dirección representativa;
- implementar por entregas pequeñas.

Una solicitud explícita de rediseño permite revisar varias secciones. No autoriza automáticamente nuevas features o cambios de data model.

## Encargo mínimo

Cada encargo debe dejar claros:

- problema y evidencia;
- resultado esperado;
- alcance y exclusiones relevantes;
- riesgo;
- verificación necesaria;
- punto de cierre o autorización pendiente.

Separar:

**Criterio de producto:** por qué se necesita el cambio.  
**Comportamiento esperado:** qué podrá ver o hacer la persona.  
**Criterio técnico:** cómo resolverlo, sólo cuando sea necesario fijarlo.

No repetir toda la conversación ni todos los SOPs. Referenciar las secciones pertinentes.

## Autoridad y autorizaciones

Requieren autorización explícita del usuario:

- merge;
- deploy manual;
- escritura real en Supabase;
- limpieza destructiva;
- migración;
- cambio de data model;
- cambio de auth o permisos;
- ampliación material del alcance.

Estas reglas gobiernan las operaciones de los agentes. No agregan por sí mismas confirmaciones a cada interacción normal del jugador.

La autorización debe referirse a una acción concreta y revisable. Se puede autorizar una secuencia si sus pasos y límites están claros.

Una respuesta breve como “dale” vale cuando responde inequívocamente a una propuesta concreta. No habilita acciones no mencionadas.

La autorización sigue vigente dentro de sus límites. Se revalida si cambia una condición material que afecte alcance, seguridad o resultado. No se pide otra vez por mera repetición del proceso.

No incluir credenciales, tokens ni strings de conexión en reportes o documentos. Usar el mecanismo seguro de configuración disponible.

## Niveles de riesgo

Se clasifica por efectos, no por cantidad de líneas ni nombre de la pantalla.

Claude Code propone el nivel y el orquestador lo revisa. Una incertidumbre material se aclara; mientras siga abierta, se usa el nivel más prudente.

### Nivel 1 — Localizado

Ejemplos:

- documentación;
- estilos aislados;
- copy menor;
- tests;
- ajustes sin lógica compartida ni persistencia.

Requiere objetivo claro, verificación pertinente y STOP antes de merge.

### Nivel 2 — Experiencia o lógica visible

Ejemplos:

- jerarquía y recorridos;
- mostrar u ocultar información;
- render condicional;
- datos derivados sin persistencia;
- mensajes sobre guardado, pago, deuda, confirmación, cupo o reserva.

Requiere criterio de producto, comportamiento esperado y verificación de los estados afectados. Si cambia la interfaz, corresponde smoke visual.

No exige diagnóstico separado si el encargo ya contiene evidencia suficiente.

### Nivel 3 — Persistencia, data real o estructura

Ejemplos:

- cambios en writers;
- operaciones sobre Supabase real;
- migraciones;
- cambios de data model;
- auth o permisos;
- automatismos que modifican estado;
- lógica que altera pagos, deuda o sanciones persistidas.

Distinguir dos trabajos:

**Cambio de código:** sigue el flujo de PR, con pruebas aisladas y rigor proporcional al riesgo.

**Operación de data:** sigue el procedimiento de operaciones reales y puede no requerir PR.

Autorizar código o pruebas aisladas no autoriza ejecutar el writer contra producción.

## Verificación

Todo cambio se verifica sobre lo que efectivamente modifica.

- Primero comprobar el comportamiento tocado.
- Después ejecutar verificaciones relacionadas.
- Ampliar a suites compartidas si existe riesgo transversal.
- No escribir tests frágiles sólo para cumplir un checklist.
- No repetir verificaciones sin cambios o dudas nuevas que lo justifiquen.

Levantar la app corresponde cuando aporta evidencia pertinente. No es obligatorio para un cambio puramente documental.

En aliases o scripts, comprobar el comando y sus efectos. No ejecutar una escritura real para verificar que un alias está bien definido.

Informar honestamente el estado del working tree. No descartar cambios ni crear commits sólo para reportarlo limpio.

Un test verde no reemplaza validar que se resolvió el problema correcto.

## Mobile y smoke

Validar cambios visuales con contenido realista, nombres largos y estados parciales.

Para ajustes normales, revisar 320px y 375px. Ampliar la cobertura cuando el layout o la interacción lo requieran. La emulación no demuestra por sí sola comodidad táctil en un teléfono real.

Verificar, según corresponda:

- comportamiento;
- render y legibilidad;
- interacción;
- guardado, pendiente y error;
- consola;
- ausencia de escrituras reales inesperadas.

Para pruebas aisladas, usar fixtures, harness o stub.

No abrir un flujo live que pueda ejecutar writers automáticos sólo para observarlo.

## Operaciones de data real

1. Identificar entorno, registro y objetivo.
2. Leer el estado fresco.
3. Producir dry-run y diff esperado.
4. Conservar de forma segura el preestado necesario para comparar y recuperar.
5. Explicar el riesgo de concurrencia y cómo se controla.
6. Obtener autorización para la operación concreta.
7. Revalidar sus condiciones inmediatamente antes del write.
8. Ejecutar la operación autorizada.
9. Releer y comparar el resultado con el diff esperado, incluidas las partes que debían preservarse.
10. Registrar evidencia y detenerse.

Para un blob JSON compartido, una relectura previa no garantiza ausencia de escrituras concurrentes.

Claude Code debe explicar cómo evita sobrescribir cambios ajenos o declarar la limitación antes de solicitar autorización. Si cambia una condición relevante del dry-run, se recalcula antes de escribir.

Ante una diferencia inesperada:

- detener nuevas escrituras;
- preservar evidencia;
- evaluar recuperación;
- no restaurar automáticamente el blob completo.

Una restauración puede borrar cambios legítimos posteriores. La recuperación requiere autorización específica o estar expresamente incluida en la autorización original, con condiciones todavía válidas.

La verificación de data real es inmediata. Si el cambio debe aparecer en la app, comprobar su presentación mediante un camino sin escrituras adicionales.

## Código, despliegue y estado canónico

Registrar por separado:

### Código

- main remoto y local observados;
- rama y estado del árbol;
- PRs relevantes;
- último SHA de producción verificado y fecha;
- estado de la verificación actual;
- deploy manual, si ocurrió.

### Data

- entorno y registro;
- timestamp observado;
- operación autorizada;
- resultado comprobado;
- referencia segura al preestado y evidencia.

No asumir que main equivale a producción ni que una operación de data cambia el código servido.

Los SHAs, timestamps y conteos provienen de evidencia disponible. Si algo es recordado, reportado o no verificado, se indica.

Al empezar una tarea técnica, Claude Code comprueba el estado del que depende el encargo. Una discrepancia material detiene las acciones dependientes; permite seguir investigando en read-only.

Verificar producción después de cambios en flujos visibles centrales. Para docs o aliases sin efecto en build, despliegue o runtime, no se exige smoke de la app en producción.

Si existe auto-deploy, es el camino habitual. El deploy manual requiere necesidad concreta y autorización.

## STOP

Detenerse antes de las operaciones que requieren autorización y cuando:

- cambia materialmente el alcance o el riesgo;
- la evidencia contradice el problema supuesto;
- falla una condición de una secuencia autorizada;
- aparece una discrepancia material de estado;
- un write produce un resultado inesperado;
- termina el trabajo acordado y no hay continuación autorizada.

Un STOP detiene acciones dependientes. No impide inspecciones seguras necesarias para explicar lo ocurrido.

El reporte incluye sólo lo pertinente:

- resultado;
- evidencia;
- estado actual;
- riesgo o limitación;
- decisión pendiente.

Si hace falta autorización, la pregunta se refiere a una acción concreta. No se solicitan aprobaciones sobre propuestas todavía indefinidas.

## PR equivocado, parqueado o reemplazado

Si una aclaración demuestra que un PR resuelve otro problema, se detiene y queda excluido de merge.

La recomendación por defecto es cerrarlo. No hace falta diseñar su reemplazo para reconocer que no corresponde.

Conservarlo exige una necesidad independiente confirmada y una condición para retomarlo. “Podría servir” no alcanza.

Un follow-up registra una necesidad; no compromete a reutilizar la implementación anterior.

Un fallback es una alternativa válida al mismo problema. Antes de retomarlo, revisar compatibilidad con main.

El cierre se ejecuta con autorización contextual o explícita. No incluye borrar ramas o descartar cambios salvo que eso también esté cubierto.

Default: un problema humano activo → un PR activo.

## Recuperación de emergencia

La recuperación de código al último estado bueno verificado puede estar preautorizada mediante este SOP aprobado, únicamente ante una falla real de producción.

Antes de actuar, confirmar:

- cuál es el estado bueno;
- que sigue siendo compatible con los datos actuales;
- que la recuperación no requiere cambios de data.

Si esas condiciones no se pueden comprobar, detenerse y solicitar decisión.

Esta excepción no autoriza restauraciones de data ni migraciones inversas.

Después de recuperar: reportar, actualizar estado y detenerse antes de emprender otra solución.

## Copy honesto

ASP no afirma más de lo que sabe.

Distinguir:

- autodeclaración;
- cálculo;
- preferencia;
- decisión;
- hecho verificado.

“Ya pagué” puede ser la acción del jugador. “Marcó que pagó” expresa su declaración ante el grupo. Ninguna de las dos prueba recepción del dinero.

Los valores calculados son válidos si su significado y origen son claros.

La vista Organizador no constituye autorización ni identidad verificada. El copy no sustituye controles de acceso.

Todo cambio de significado sobre pago, deuda, cupo, reserva o confirmación es Nivel 2 como mínimo.

## Comunicación y mantenimiento

El orquestador usa respuestas breves, lenguaje cotidiano y preguntas concretas. En respuestas largas, deja al final la decisión pendiente y la próxima acción.

Una decisión importante se registra con su motivo y la evidencia que permitiría revisarla. No hace falta documentar cada microajuste.

El usuario aprueba cambios al proceso. Claude Code puede aplicarlos como tarea documental autorizada.

Detectar una mejora durante un PR permite proponerla; no autoriza cambiar los SOPs dentro de ese trabajo.

**Frase guía:** cada jugador debe entender rápido qué puede hacer y qué ocurrió después.