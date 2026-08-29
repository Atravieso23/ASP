# ASP — Agent Instructions

## Purpose
ASP exists to organize the weekly football match with the least possible friction.

The product should help the group answer:
- Am I playing?
- What time can I play?
- Did I pay?
- Am I bringing guests?
- Who still needs to respond or pay?

WhatsApp remains the conversation layer.
ASP is the source of truth for the match.

## Core philosophy
Use the least reasonable amount of software to solve the real problem.

Priority order:
1. Real user feedback > hypothetical problems
2. UX > technical sophistication
3. Simple > general
4. Shipped and used > theoretically perfect
5. Clear and transferable code > clever architecture

## Default constraints
Do NOT add these unless the current task clearly requires them:
- new tables
- new auth/account systems
- CAS/concurrency infrastructure
- microservices
- new infrastructure
- broad refactors
- abstractions for future use
- unrelated cleanup
- “while we are here” improvements

Current real concurrency target is roughly 5–6 users editing near the same time.

Do not design for 18+ simultaneous editors unless real evidence changes the requirement.

## Scope rule
If a task grows beyond the approved scope:
STOP.

Report:
- what was discovered
- why the current scope is insufficient
- the smallest new scope you recommend

Do not silently expand the task.

## Required workflow
For non-trivial work:

problem
→ investigate
→ separate facts from hypotheses
→ propose minimum solution
→ approval
→ tests
→ implementation
→ verification
→ candidate
→ preview
→ release

Do not implement a non-trivial design before approval.

Small bugs may use a shorter version of the process, but must still stay scoped and should get regression tests when reasonable.

## Reporting style
Do the work; do not narrate every thought.

Final report should normally contain:
- root cause / finding
- files changed
- what changed
- verification results
- known risks or limitations
- exact STOP state

## Data / backend rules
- Keep the current Supabase architecture unless a real product need requires otherwise.
- Preserve focused writers.
- Do not introduce CAS unless specifically approved.
- Do not execute production writes or seeds without explicit approval.
- Do not seed `habitualPlayers` before the deployed production code supports it.

## Product invariants
### Habitual players
- `habitualPlayers` = membership in the regular group.
- Membership is explicit and organizer-controlled.
- “Organizer-controlled” describes the product rule, not a requirement to introduce a new authentication or role system. Use the existing permission model unless a separate task explicitly changes it.
- Guests never automatically become habitual.
- Weekly responses do not automatically change habitual membership.

### Responses
- `responses` = current match participation/status data.
- Guests are independent responses.
- Guest identity/actions should use `responseId`, not name.
- `isGuest=true`
- `invitedBy` identifies the host.

### Guests
- 4+ guests must all remain visible and manageable.
- Guest names must be unique within a match. On add, the name is compared normalized (trim + case-insensitive) against current responses, guests already added, and `habitualPlayers`; a collision blocks the add and prompts for apellido/apodo. (Superseded the earlier "duplicate guest names are allowed" rule after real QA.)
- Do not mutate real names with artificial suffixes.
- Guest payment/removal must operate by `responseId` (never by name), including when older data still contains same-named guests.
- Guests do not disappear if the host changes to `No estoy`.

## Engineering judgment
Always classify proposals as:
- needed now
- useful later
- premature / overengineering

If something is technically good but oversized for ASP, explicitly say so.

## Models
Default coding model: Sonnet-class model.

Use cheaper models only for narrow mechanical tasks.

Escalate to Opus-class models only for:
- high-risk data changes
- difficult architecture decisions
- unresolved bugs after normal attempts
- important second opinions
- unusually high uncertainty

Do not use a more expensive model merely because a task is long.
