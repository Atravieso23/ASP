# Handoff del proyecto ASP

Documento de entrada para quien se suma a trabajar en el repo. No reemplaza a
[`CLAUDE.md`](../CLAUDE.md) ni a la doc de `docs/`; los ordena.

## Repo real

- **Repo:** `Atravieso23/ASP` (GitHub).
- **Rama principal:** `main`.
- **`main` es la fuente de verdad.** Lo que está en `main` es lo que vale. No hay
  otra rama "de producción".

### Repo viejo

Puede que en clones antiguos exista un remote `origin` apuntando a
`el-wizz/organizador-partidos`. Ese repo es un espejo viejo y **no** es la fuente
de verdad. El repo real es `Atravieso23/ASP`. Si tu clon tiene ese `origin`,
trabajá siempre contra `Atravieso23/ASP` (como remote `atravieso` u `origin`,
según cómo lo hayas clonado); no bases ramas en el repo viejo.

## Ramas `legacy/*`

Las ramas:

- `legacy/agustin-pre-unificacion`
- `legacy/pablo-pre-unificacion`

son **snapshots históricos** del estado previo a la unificación del código. Se
conservan a propósito como archivo. **No se borran y no se mergean.** No las uses
como base de trabajo.

## Flujo de trabajo recomendado

1. **Sincronizar `main` desde el repo real:**

   ```
   git switch main
   git pull --ff-only <remote-del-repo-real> main
   ```

   - Si clonaste directo `Atravieso23/ASP`, normalmente el remote real es `origin`.
   - En el clon viejo de Pablo, el remote real es `atravieso`.
   - **No hacer pull desde `el-wizz/organizador-partidos`** (repo viejo).

2. **Crear una rama chica:** un cambio, un objetivo. Nombre tipo
   `fix/...`, `chore/...`, `docs/...`, `feat/...`.
3. **Hacer el cambio acotado:** sólo lo que entra en el scope aprobado. Si el
   trabajo crece más allá del scope: **STOP** y reportá (qué se descubrió, por qué
   el scope no alcanza, cuál es el scope mínimo nuevo).
4. **Completar el template de PR** (`.github/pull_request_template.md`): tipo de
   PR, las 5 preguntas de diseño si toca UX/UI, y el bloque de **Scope** marcando
   sólo lo que el PR toca a propósito.
5. **Correr los checks:** `npm test` en `sites-app`. No hay CI: los tests no
   corren solos en GitHub, hay que correrlos a mano. `npm test` hace `npm run
   build` primero. Los tests son expresiones regulares sobre el HTML: no ejecutan
   la página ni detectan errores de sintaxis de JS.
6. **Abrir el PR** contra `main` del repo real.
7. **Merge sólo con aprobación explícita** del organizador. No se mergea solo.

## Leer antes de tocar UI

- [`docs/ux/asp-design-philosophy.md`](ux/asp-design-philosophy.md) — filosofía
  UX/UI de ASP y las 5 preguntas que todo cambio de interfaz tiene que poder
  responder.
- [`.github/pull_request_template.md`](../.github/pull_request_template.md) —
  checklist de diseño y de scope.
- [`CLAUDE.md`](../CLAUDE.md) — propósito del producto, filosofía core,
  restricciones por defecto, invariantes de producto.

## Restricciones importantes

- **No hacer escrituras a Supabase sin autorización explícita.**
- **No hacer deploy manual salvo autorización explícita.**
- **No tocar backend ni data model salvo que esté en el scope aprobado** del PR.
- **No tocar** selector de jugador, pagos, invitados, Lista de morosos, Tarjetas
  ni Saldar birra, salvo que estén tildados en el scope del PR y explicados.

Ante la duda, el default es no tocar y preguntar.
