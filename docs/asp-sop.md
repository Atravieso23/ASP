# SOP ASP — Product & Engineering Working Agreement

*Estado del documento: versión 4 — SOP operativo estable.*

## 1. Propósito

Este SOP existe para proteger ASP de tres riesgos principales:

1. Construir de más.
2. Romper datos, producción o confianza.
3. Resolver el problema equivocado.

No existe para meter burocracia.

El nivel de rigor debe ser proporcional al riesgo del cambio.

Principio central:

> Feedback real → interpretación explícita → diagnóstico proporcional → PR mínimo → verificación → STOP.

PR mínimo no significa diff mínimo.

Significa:

> El menor cambio completo que resuelve el problema aprobado sin agregar sistema innecesario.

---

## 2. Contexto de trabajo

ASP es una web mobile-first para organizar partidos de fútbol entre amigos.

El producto prioriza:

- simpleza;
- velocidad de entrega;
- feedback real;
- cambios chicos;
- UX clara;
- mobile real antes que mock lindo;
- no sobrediseñar;
- no agregar modelo nuevo sin necesidad real;
- no tocar datos o producción sin gates proporcionales al riesgo.

El flujo actual usa:

- ChatGPT como orquestador de producto y alcance;
- Claude Code como ejecutor técnico.

Son herramientas del flujo actual, no una restricción arquitectónica del producto.

---

## 3. Autoridad

El orquestador puede diagnosticar, recomendar y preparar una decisión.

El ejecutor puede inspeccionar, implementar y verificar.

Pero ninguno debe autoautorizar operaciones que requieren aprobación explícita.

Requieren autorización explícita del usuario:

- merge;
- deploy manual;
- Supabase write;
- cleanup destructivo;
- migración;
- cambio de data model;
- cambio de auth/roles;
- cualquier ampliación material de scope durante una implementación.

Regla:

> Recomendación del orquestador ≠ autorización operativa.

---

## 4. Roles

### Orquestador

Responsable de:

- traducir feedback real a un problema concreto;
- declarar la interpretación cuando pueda existir ambigüedad;
- decidir qué se toca y qué no;
- definir el PR mínimo;
- separar decisiones de producto de implementación;
- evitar scope creep;
- recomendar avanzar, frenar o mergear;
- mantener el estado canónico;
- detectar cuando un PR resuelve el síntoma pero no el problema conceptual.

El orquestador no debe introducir decisiones de producto de contrabando dentro de un PR técnico.

### Ejecutor

Responsable de:

- inspeccionar el código;
- realizar diagnósticos read-only;
- implementar sólo el scope aprobado;
- correr verificaciones proporcionales;
- hacer smoke cuando corresponda;
- reportar evidencia;
- frenar en los STOP definidos;
- no ampliar scope ni iniciar otro cambio sin autorización.

---

## 5. Estado canónico

Después de cada merge o cierre de ciclo registrar, como mínimo:

```
main remoto = <SHA>
main local = <SHA>
prod servido = <SHA | no verificado | pendiente>
PRs abiertos = <n>
working tree = limpio
branch actual = main
próximo PR = no iniciado
deploy manual = no ejecutado
```

Nunca asumir:

```
main = prod
```

Producción sólo se declara en un SHA cuando fue verificado.

Si el auto-deploy todavía está pendiente o no fue comprobado:

```
prod servido = no verificado
```

---

## 6. Flujo base

Flujo estándar:

```
diagnóstico read-only si hace falta
→ interpretación / decisión de producto
→ scope aprobado
→ implementación mínima
→ tests proporcionales
→ smoke si corresponde
→ STOP
→ autorización explícita
→ merge
→ actualizar estado canónico
→ verificar producción si corresponde
→ smoke post-merge si corresponde
→ STOP
```

No todos los cambios necesitan todas las etapas con el mismo nivel de detalle.

Primero se evalúa riesgo.

---

## 7. Niveles de riesgo

### Nivel 1 — Cambio chico y localizado

Ejemplos:

- copy menor;
- CSS aislado;
- markup pequeño;
- helper local;
- tests;
- cambios sin persistencia ni lógica compartida.

Proceso:

1. Objetivo en una frase.
2. Qué NO se toca.
3. Implementación.
4. Verificación proporcional.
5. STOP antes de merge.

Regla:

> No convertir un cambio trivial en una investigación.

Un smoke visual sólo es necesario si el cambio realmente puede alterar layout, interacción o render.

---

### Nivel 2 — UX o lógica visible

Ejemplos:

- jerarquía visual;
- render condicional;
- preview;
- movimiento de información;
- comportamiento visible derivado de datos existentes;
- lógica UI sin nueva persistencia.

Proceso:

1. Diagnóstico read-only proporcional.
2. Declarar criterio de producto.
3. Evaluar alternativas sólo si existe una decisión real entre enfoques.
4. Elegir el menor cambio completo.
5. Implementar.
6. Tests relevantes.
7. Smoke visual.
8. STOP antes de merge.

No es obligatorio inventar A/B/C cuando la solución es obvia.

---

### Nivel 3 — Datos, producción o comportamiento estructural

Aplica cuando existe riesgo real sobre:

- Supabase writes;
- datos de producción;
- cleanup;
- migraciones;
- persistencia;
- data model;
- auth / roles;
- lógica de pagos o deuda que pueda alterar estado;
- automatismos que escriben;
- backend compartido que pueda modificar datos o permisos.

No convierte automáticamente en Nivel 3 un cambio puramente visual dentro de una pantalla de pagos, tarjetas o morosos.

Proceso:

1. Read-only con evidencia.
2. Definir gates explícitos.
3. Definir diff esperado.
4. Conservar preestado suficiente si la operación es destructiva.
5. Obtener autorización explícita.
6. Revalidar el estado inmediatamente antes del write si pudo cambiar.
7. Ejecutar una operación controlada.
8. Verificar el resultado.
9. STOP.

Regla:

> Si toca datos o producción, "parece bien" no alcanza.

---

## 8. STOP rules

STOP obligatorio antes de:

- mergear;
- deploy manual;
- Supabase write;
- cleanup;
- migración;
- cambio de data model;
- cambio de auth/roles;
- ampliar scope;
- iniciar un PR nuevo después de cerrar el actual, salvo que ya exista autorización explícita para una secuencia;
- sustituir o cerrar un PR cuando todavía no está clara la resolución del problema que lo reemplaza.

Al llegar a STOP, el ejecutor reporta de forma compacta:

```
PR / rama / commit
qué cambió
qué NO cambió
tests
smoke si aplica
riesgo o caveat relevante
estado actual
```

No agregar campos vacíos ni ceremonias que no aporten información.

---

## 9. Feedback real

El feedback real suele llegar en lenguaje natural y no como una spec.

Antes de implementar, determinar qué objeto está describiendo el feedback.

Por ejemplo:

```
"poner esto más arriba"
```

puede referirse a:

- convocatoria;
- horario;
- pagos;
- faltan responder;
- cancha;
- estado personal;
- orientación;
- decisión;
- detalle social.

Regla:

> Si una interpretación dudosa puede cambiar el scope o el comportamiento, declararla antes de implementar.

No hace falta abrir una investigación cuando la interpretación es obvia y reversible.

---

## 10. Criterio de producto vs comportamiento esperado

Cuando un cambio toca lógica visible, separar:

```
Criterio de producto:
por qué existe la regla.

Comportamiento esperado:
qué debe ver o experimentar el usuario.

Criterio técnico:
cómo se implementa, sólo cuando sea relevante.
```

Ejemplo abstracto:

```
Criterio de producto:
una señal sólo debe mostrarse mientras ayuda a decidir.

Comportamiento esperado:
antes de la decisión → visible
después de la decisión → oculta

Criterio técnico:
derivar el estado usando los datos existentes.
```

Esto evita convertir una decisión de producto en una casualidad de implementación.

---

## 11. Layout visual vs concepto

No todo problema visual se resuelve con CSS.

Antes de compactar, mover o agregar columnas, preguntar:

```
¿El problema es altura?
¿Contraste?
¿Jerarquía?
¿Orden?
¿El bloque conceptual está mal?
¿La información correcta está en el lugar equivocado?
```

Regla:

> Si el frame conceptual está mal, no parchear solamente la presentación.

---

## 12. Mobile real

ASP es mobile-first.

La validación visual debe priorizar:

- contenido real;
- nombres reales;
- textos largos;
- estados parciales;
- pantallas angostas.

Regla:

> Mobile real con datos reales manda sobre el mock.

Para un cambio visual normal alcanza con probar:

- un ancho angosto;
- un ancho móvil representativo.

Usar una matriz más grande de widths sólo cuando el cambio sea especialmente sensible al layout.

---

## 13. Tests

Los tests deben ser proporcionales al riesgo.

Prioridad:

1. cubrir directamente el comportamiento modificado;
2. correr tests relacionados;
3. ampliar a suite compartida cuando el cambio toca lógica común o existe riesgo de regresión transversal.

No agregar tests frágiles únicamente para satisfacer un checklist.

Un suite verde no reemplaza comprobar que el comportamiento nuevo realmente está cubierto.

---

## 14. Smokes

### Smoke requerido

Hacer smoke cuando el cambio pueda afectar:

- layout;
- render;
- interacción;
- lógica visible;
- editor que modifica UI visible;
- comportamiento central del jugador;
- producción servida.

Verificar según corresponda:

```
commit esperado
DOM / comportamiento esperado
casos principales
mobile real
consola limpia
ausencia de writes inesperados
```

Si se usa harness o stub para evitar producción:

```
0 requests reales de escritura a Supabase
```

### Smoke post-merge

Hacerlo cuando:

- importa verificar exactamente lo servido en `main`;
- el cambio afecta un flujo visible central;
- existe diferencia posible entre branch y producción;
- hubo refactor de lógica compartida.

Antes de afirmar éxito en producción, verificar qué SHA está servido.

### Smoke opcional

Normalmente no es necesario para:

- docs-only;
- test-only;
- copy menor sin impacto de layout;
- cambios completamente cubiertos por verificación estática y tests suficientes.

---

## 15. Supabase y producción

Regla fuerte:

> No abrir o ejecutar un flujo live que pueda disparar writers automáticos sólo para "mirar".

Preferir, según el caso:

```
leer estado
→ verificar HTML / commit servido
→ usar harness local o stub
→ realizar smoke sin writes
```

Para una escritura real:

```
read-only
→ gates
→ diff esperado
→ conservar preestado si es destructiva
→ autorización explícita
→ revalidar preestado si pudo cambiar
→ write controlado
→ verificar resultado
→ STOP
```

No inventar nueva arquitectura para obtener seguridad si una comprobación puntual alcanza.

### Deploy

Si existe auto-deploy, ése es el camino por defecto.

No ejecutar deploy manual simplemente porque sí.

Un deploy manual puede hacerse cuando existe una necesidad concreta —por ejemplo, fallo o ausencia del auto-deploy— y fue autorizado explícitamente.

---

## 16. PRs supersedidos y trabajo concurrente

Un PR puede quedar temporalmente abierto como fallback mientras se valida una solución mejor.

Reglas:

1. No mergear un PR que ya se sabe conceptualmente insuficiente.
2. Mantenerlo como fallback sólo mientras tenga utilidad concreta.
3. Si otro PR lo absorbe, cerrar el anterior sin merge.
4. Registrar brevemente el motivo.

Default operativo:

> Un problema humano activo → un PR activo.

Se pueden mantener trabajos paralelos sólo cuando sean realmente independientes y su estado esté explícitamente registrado.

---

## 17. Copy honesto

El copy no debe afirmar más de lo que ASP sabe.

Regla:

> Si el sistema no puede conocer o derivar confiablemente un hecho, no afirmarlo como verdadero.

Esto aplica especialmente a conceptos como:

- reservado;
- confirmado;
- ganador;
- se juega a X;
- cupo;
- deuda saldada;
- cancha confirmada.

Sí se pueden mostrar valores calculados si derivan inequívocamente de datos existentes.

No confundir una señal, estimación o preferencia con una decisión real.

---

## 18. Principios operativos

1. Un PR resuelve un problema humano.
2. Feedback real manda, pero primero se interpreta.
3. Diagnóstico proporcional al riesgo.
4. PR mínimo significa solución mínima completa.
5. Datos y producción requieren gates.
6. Ningún agente se autoautoriza un write o merge.
7. No mezclar UX menor con cambios estructurales.
8. No crear modelo nuevo para resolver un problema que los datos actuales ya permiten resolver.
9. No afirmar en copy algo que ASP no sabe.
10. Mobile real con datos reales manda.
11. Si una señal sólo sirve antes de decidir, ocultarla después.
12. Mantener estado canónico después de cada ciclo.
13. Test y smoke proporcionales.
14. No hacer deploy manual sin necesidad.
15. Si un PR queda absorbido, cerrarlo sin merge.
16. No transformar ASP en un sistema más grande que el problema que resuelve.

---

## 19. Patrón de PR mínimo

Antes de implementar debería poder responderse:

```
¿Qué problema humano resuelve?
¿Qué criterio de producto aplica?
¿Qué comportamiento esperado tiene?
¿Qué toca?
¿Qué NO toca?
¿Qué riesgo tiene?
¿Qué verificación necesita?
¿Toca datos o producción?
```

Preguntas adicionales sólo cuando sean relevantes:

```
¿Necesita smoke?
¿Necesita smoke post-merge?
¿Necesita Supabase?
¿Necesita data model?
¿Necesita rollback o captura de preestado?
```

Si una respuesta material sigue siendo desconocida, falta diagnóstico.

---

## 20. Documentación viva

El SOP describe **cómo trabajamos**.

No debe convertirse en:

- backlog;
- changelog;
- listado de PRs recientes;
- documentación detallada de una feature;
- snapshot del estado actual de la UI.

Esos elementos viven en documentación separada, por ejemplo:

```
docs/asp-product-contract.md
docs/project-handoff.md
backlog / issues
```

Un cambio de comportamiento de ASP no exige una nueva versión del SOP salvo que cambie también la forma de trabajo.

---

## 21. Frase guía

> ASP no necesita más sistema del necesario.
> Necesita que cada jugador entienda rápido qué tiene que hacer.

Y para el proceso:

> Menos épica, más PR mínimo.
