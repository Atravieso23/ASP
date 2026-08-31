<!-- PR de ASP. Borrá lo que no aplique, pero respondé el checklist. -->

## Qué cambia

<!-- 1–3 frases. Qué problema real resuelve y para quién. -->

## Tipo de PR

- [ ] Cambio de UX/UI
- [ ] Process / docs-only
- [ ] Bug fix chico
- [ ] Otro:

## Criterio de diseño (de `docs/ux/asp-design-philosophy.md`)

Todo PR de UX/UI tiene que poder responder estas 5. Si no puede, todavía no está listo.

1. **¿Qué fricción real reduce?**
   >
2. **¿La acción crítica sigue siendo clara?** (texto visible, no sólo íconos/emojis)
   >
3. **¿Conserva o mejora la personalidad futbolera?** (chips, vacíos, confirmaciones)
   >
4. **¿Sigue siendo compacto en mobile?** (menos superficie visible, poco scroll, una mano)
   >
5. **¿Agrega complejidad sólo donde hay evidencia de uso real?**
   >

## Scope

Marcá sólo lo que este PR toca **a propósito**. Todo lo demás queda intacto.

- [ ] UI / HTML
- [ ] CSS
- [ ] JS
- [ ] Backend
- [ ] Data model
- [ ] Selector de jugador
- [ ] Pagos
- [ ] Invitados
- [ ] Lista de morosos
- [ ] Tarjetas
- [ ] Saldar birra
- [ ] `docs/ux/asp-design-philosophy.md`

Recordatorio: no se tocan backend, Supabase, data model, ni
selector/pagos/invitados/Lista de morosos/Tarjetas/Saldar birra salvo que estén
tildados arriba y explicados abajo.

Si algo se salió del scope aprobado: **STOP** y reportar (qué se descubrió, por qué
el scope no alcanza, cuál es el scope mínimo nuevo recomendado).

## Verificación

- **Tests / comprobaciones ejecutadas:**
  <!-- ej: `npm test` en sites-app → N/N; o qué regex/regresión se ajustó y por qué -->
- **Screenshots / preview:** <!-- si aplica; antes/después en mobile -->
- **Supabase writes:** no / sí — explicar
- **Deploy manual:** no / sí — explicar

## Riesgos / límites conocidos

<!-- Qué queda fuera, qué deuda queda abierta, qué habría que mirar en review. -->
