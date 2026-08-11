# Task 3 — CTA explícito para invitados

- Status: DONE
- RED observado: `node --test --test-name-pattern "guest CTA" tests/rendered-html.test.mjs` falló como se esperaba porque `renderGuestManager()` dejó el CTA cerrado en `Gestionar invitados` en vez de `Agregar invitado`.
- GREEN observado: `node --test --test-name-pattern "guest CTA" tests/rendered-html.test.mjs` pasó (1/1).
- Verificación final: `node --test tests/rendered-html.test.mjs` pasó (54/54) y `git diff --check` no reportó errores.
- Archivos modificados:
  - `sites-app/public/demo.html`
  - `sites-app/tests/rendered-html.test.mjs`
  - `.superpowers/sdd/post-release-ux-quick-wins/task-3-report.md`
- Commit: `ux: hacer visible el alta de invitados`
- Self-review: el diff modifica sólo el texto inicial y la etiqueta derivada de `manager.hidden`. La nueva prueba ejecuta el `renderGuestManager()` real en un DOM controlado para ambos estados. No se modificaron el panel, el foco de apertura ni el flujo `agregarInvitado() → guardarCambioEnResponses()`.
- Preocupaciones: ninguna.
