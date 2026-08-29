# ASP Engineering Philosophy

## What ASP is

ASP is a small web product for organizing a weekly football match among a real group of friends.

It is not intended to become a generic sports platform, SaaS product, enterprise scheduling system, or highly distributed application.

The engineering goal is:

> Solve the real problem of the next match with the least reasonable amount of software.

The main product questions are simple:

For a player:
- Am I playing?
- At what time can I play?
- Did I pay?
- Am I bringing guests?

For the organizer:
- Who is in?
- Who is doubtful?
- Who has not replied?
- Who still owes payment?
- Which guests are coming?
- What needs attention before the match?

WhatsApp remains the discussion layer.
ASP should hold the structured truth.

ASP is a responsive mobile-first website, not a native mobile application. Do not introduce native-app architecture unless explicitly requested.

---

## Product philosophy

### Real feedback beats hypothetical robustness

Observed user friction has priority over imagined edge cases.

Examples of useful signals:
- a player could not manage a fourth guest
- guest controls appeared before player identification
- clearing a match accidentally destroyed the player selector

Those are stronger inputs than hypothetical load scenarios.

### UX is a first-class engineering requirement

ASP should feel fast, obvious, and compact.

The target is not maximum feature density.

The target is:
- minimum friction
- minimum scrolling
- clear grouping
- progressive disclosure
- mobile-first interaction
- no controls shown before they are actionable

### Prefer the simple solution

The correct engineering solution is not always the most robust solution possible.

A solution should match:
- actual usage
- actual risk
- actual user count
- actual failure cost

Current expected concurrency is roughly 5–6 users editing near the same time.

ASP does not currently need infrastructure designed around heavy multi-user concurrency.

---

## YAGNI policy

By default, do not add:

- new databases or tables
- new auth systems
- new account systems
- microservices
- queues
- distributed locking
- CAS infrastructure
- caching layers
- new hosting layers
- unrelated refactors
- generalized abstractions
- speculative extensibility

Any of these may become valid later.

They require evidence.

The question is not:

> Would this make the system more robust?

The question is:

> Does ASP need this robustness now?

---

## Decision categories

Every proposal should be classified as one of:

### Needed now
Solves a current release requirement or observed user problem.

### Useful later
Reasonable improvement, but not required for current usage.

### Premature / overengineering
Adds significant complexity for a scenario that does not currently justify it.

This classification should be stated explicitly when the answer is not obvious.

---

## Development workflow

Preferred sequence:

1. Real problem or requirement
2. Investigation
3. Separate facts from hypotheses
4. Minimum proposed solution
5. Approval
6. Tests
7. Implementation
8. Verification
9. Candidate
10. Preview
11. Release
12. Observe real usage again

For non-trivial work, implementation should not begin before the proposed approach is approved.

If hidden complexity appears during implementation:
- stop
- explain the new finding
- propose the smallest revised scope
- wait for approval

Do not silently expand a task.

---

## Anti-overengineering rules

Stop and reassess when an agent proposes:

- a new subsystem
- a new persistence model
- a broad refactor
- a generalized framework
- a new infrastructure dependency
- a new permission model
- a rewrite of working code
- cleanup unrelated to the current issue

A technically elegant solution can still be wrong for ASP.

---

## Architecture stance

The existing architecture is accepted unless a real product problem proves otherwise.

Current direction:
- monolithic `demo.html`
- Supabase shared persistence
- Vercel deployment
- GitHub branches and PRs
- previews before production when useful

The monolith may not be ideal forever.

That alone is not sufficient reason to refactor it.

Refactoring should occur only when the current structure blocks a concrete change or produces repeated defects.

---

## Data invariants

### habitualPlayers

`habitualPlayers` represents stable membership in the regular group.

It is not the same thing as participation in the current match.

Rules:
- explicit membership
- organizer-controlled
- guests never auto-promote
- current responses do not automatically mutate membership
- removing a habitual player should affect future “Falta confirmar”, not rewrite history

### responses

`responses` represents the current match.

It contains:
- regular-player responses
- guest responses

Regular participation is not permanent membership.

### Guests

Each guest is an independent response.

Expected fields/semantics include:
- unique `responseId`
- `isGuest=true`
- `invitedBy`
- own payment state
- own participation information where supported

Operations must rely on `responseId`, not name.

Duplicate names are valid.

The persisted name must remain the real name.

UI may add context for disambiguation.

At least 4–6 guests must remain fully manageable.

### Payment

Payment remains binary:
- paid
- pending

Do not build partial payment, exemptions, accounting, or reconciliation unless real usage requires them.

### Todo el día

The current representation remains:
- `09:00–22:00`

No new backend boolean is required unless a concrete problem appears.

---

## Reliability policy

ASP needs reasonable reliability, not enterprise guarantees.

Current acceptable behavior for rare write conflicts:
- clear error
- retry

Do not pursue CAS or complex concurrency control without real evidence that lost writes are affecting users.

Existing reliability protections should not be removed merely because stronger guarantees are no longer a current goal.

---

## Testing philosophy

Tests should protect user-visible invariants and known regressions.

Good examples:
- 4+ guests all render
- fourth guest can be paid/removed by responseId
- adding a guest whose name is already taken is rejected (normalized)
- anonymous user does not see guest controls
- clearing the current match does not erase habitual membership

Do not add large amounts of test machinery merely to inflate coverage.

Tests should make future regressions expensive, not make development ceremonial.

---

## Release philosophy

Production usage is part of product discovery.

Do not wait for a theoretically complete system.

Prefer:
- coherent batch
- preview
- release
- observe
- adjust

The group using ASP is an important source of requirements.

Real user feedback should regularly reshape the backlog.

---

## Agent orchestration

Recommended roles:

### Product
Pablo:
- user feedback
- desired UX
- priorities
- what feels wrong
- release decisions

### Orchestration
ChatGPT:
- translate product intent into technical scope
- identify overengineering
- choose implementation depth
- define task boundaries
- review candidate reports
- decide when more investigation is needed
- recommend model escalation

### Coding agent
Claude / equivalent:
- inspect repo
- implement approved scope
- write tests
- run verification
- report evidence
- stop at requested gates

The coding agent should not silently redefine product scope.

---

## Model policy

Use model capability proportionally to uncertainty and risk.

### Default
Sonnet-class model.

Suitable for:
- normal feature work
- bugs
- tests
- UI
- gap analysis
- Git operations
- scoped refactors

### Cheap/mechanical model
Use only for tightly specified work:
- renames
- simple copy changes
- repetitive searches
- mechanical test updates

### Opus-class escalation
Use when:
- normal model is stuck
- data migration is risky
- architecture is genuinely ambiguous
- a major second opinion is valuable
- uncertainty is unusually high

Do not escalate simply because a task is long.

---

## Trust rule

Agents must distinguish:

- fact
- hypothesis
- decision

When uncertain, say so.

Do not present speculative explanations as confirmed causes.

Do not treat “possible” as “necessary”.

Do not treat “more robust” as “better” without considering the product's actual scale and failure cost.

The goal is not to eliminate all mistakes.

The goal is to make mistakes:
- less likely
- visible
- bounded
- reversible
