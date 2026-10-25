# LocalCore — S1.1 Implementation Task List

Slice: **S1.1 — Persona schema, validation, and deterministic prompt assembly**
Source: Phase 1 §1 (persona schema, validation, assembly, context budget); Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The `PersonaDocument` type and all nested types.
- Schema versioning and a migration stub.
- A built-in default persona.
- Field-level validation and token-budget validation.
- The persona store (keyed, multi-character-ready) and active-character resolution.
- Deterministic system-prompt assembly.
- Context budgeting and the trimming policy.
- A token-counting seam (with a conservative fallback estimator, since no provider exists yet).
- Import/export of personas as portable JSON.

**Explicit non-goals (do not build here):**
- No `ChatEngine`, streaming, or persistence of turns (S1.2).
- No model provider or tokenizer from a real model (S1.3).
- No memory block content (Phase 2); the assembly seam exists but receives nothing yet.
- No persona authoring UI beyond what import/export requires.
- No emotion/expressiveness wiring into the avatar (Phase 4).

Rationale: S1.1 defines the companion's identity and the exact text sent to the model. It is built
entirely against a test double, so it can be completed and verified before any model exists.

---

## 1. Ordering principles

1. **Types before validation** — validation operates on a defined shape.
2. **Validation before storage** — the store must never persist an invalid persona.
3. **Default persona before storage** — there must be something to fall back to.
4. **Storage before assembly** — assembly consumes a resolved persona.
5. **Token counter before budgeting** — the budget is expressed in tokens, not characters.
6. **Assembly before trimming** — there must be an assembled result to trim.
7. **Determinism is asserted throughout**, not added at the end.
8. **The memory seam is defined now**, even though it is empty, so Phase 2 does not reopen
   assembly.

---

## 2. Task list

### Group 1 — Schema & types

**A1 — `PersonaDocument` type definitions**

Deliverable: the full type surface from Phase 1 §1.2.

Definition of done:
- [ ] `PersonaDocument` includes `schemaVersion`, `characterId`, `identity`, `traits`,
      `backstory`, `speakingStyle`, `values`, `boundaries`, `behavior`, `greeting`, `examples`,
      `assets`, `metadata`.
- [ ] Nested types are defined: `PersonaIdentity`, `SpeakingStyle`, `PersonaBoundaries`,
      `BehaviorSettings`, `PersonaExample`, `PersonaAssets`, `PersonaMetadata`.
- [ ] Enumerated fields use unions, not free strings (`formality`, `verbosity`, `safetyPosture`,
      `humor`/`empathy`/`initiative` as 0–5).
- [ ] `characterId` is present even though only one character is surfaced in v1 (multi-character
      readiness).
- [ ] The type compiles under strict mode with no `any`.

**A2 — Schema versioning and migration**

Deliverable: a versioned document with a migration path.

Definition of done:
- [ ] `schemaVersion` starts at 1 and is required.
- [ ] A migration registry exists with a no-op migration for v1.
- [ ] Loading a document with an unknown future version fails with a clear error rather than
      partially parsing (test A2-T1).
- [ ] Loading a document with an older version runs migrations in order.

**A3 — Built-in default persona**

Deliverable: a shipped persona used when nothing else is available.

Definition of done:
- [ ] A default persona satisfies all validation rules and the floor token budget.
- [ ] It is bundled, not stored in app-data, so it cannot be corrupted by a bad write.
- [ ] It is used when the persona store is empty, a persona is invalid, or a persona fails to load
      (P1-8).
- [ ] Its use is logged so a fallback is visible rather than silent.

---

### Group 2 — Validation

**B1 — Field-level validation**

Deliverable: the validation rule table from Phase 1 §1.3.

Definition of done:
- [ ] `identity.name` required, 1–40 chars.
- [ ] `backstory` ≤ 1200 chars.
- [ ] `traits` ≤ 8 items, each ≤ 40 chars.
- [ ] `values` ≤ 6 items.
- [ ] `speakingStyle.tone` required, ≤ 120 chars.
- [ ] `forbiddenPhrases` ≤ 20 items; `avoidTopics` ≤ 20 items.
- [ ] `examples` ≤ 4 items; each side ≤ 300 chars.
- [ ] `greeting` ≤ 300 chars.
- [ ] Every rule has a dedicated test with a boundary case (at-limit and over-limit).

**B2 — Persona token-budget validation**

Deliverable: a warning when the assembled persona block exceeds the tier budget.

Definition of done:
- [ ] The assembled persona block is measured against the tier budget (floor ≤ 400 tokens).
- [ ] Exceeding the budget produces a **validation warning**, not a rejection or crash (P1-14).
- [ ] The warning names the offending sections and the measured size.
- [ ] The warning is surfaced to the persona editor, not only logged.

**B3 — Invalid-persona handling**

Deliverable: graceful failure with a structured error.

Definition of done:
- [ ] An invalid persona is rejected with a structured error listing every failing field (P1-8).
- [ ] The app still starts and falls back to the default persona (P1-8).
- [ ] A partially valid persona is never partially applied.
- [ ] The error includes the field path and the reason for each failure.

**B4 — Validation error reporting**

Deliverable: errors a persona author can act on.

Definition of done:
- [ ] Each error carries `{ path, rule, actual, limit }`.
- [ ] Errors are ordered deterministically by field path.
- [ ] The report can be rendered directly in a form UI (test B4-T1).

---

### Group 3 — Storage & lifecycle

**C1 — Persona store**

Deliverable: a keyed persona collection in app-data.

Definition of done:
- [ ] Personas are stored as a keyed collection by `characterId` (multi-character-ready).
- [ ] Storage lives under the S0.1 app-data layout and uses the S0.1 write wrapper.
- [ ] Writes are atomic; a corrupt write cannot leave a half-persona.
- [ ] The store validates on read; an invalid stored persona is reported and skipped, not loaded.

**C2 — Active character resolution**

Deliverable: a single active persona for v1.

Definition of done:
- [ ] The active `characterId` is persisted in config and restored on restart.
- [ ] If the active persona is missing or invalid, resolution falls back to the default persona and
      logs why (test C2-T1).
- [ ] Resolution is a single function used everywhere; no module reads personas directly.

**C3 — Persona CRUD and persistence**

Deliverable: create, read, update, delete with validation.

Definition of done:
- [ ] Every write path validates first; an invalid persona cannot be persisted (test C3-T1).
- [ ] Deleting the active persona triggers a defined fallback rather than an empty state.
- [ ] Updates are atomic and preserve `metadata.createdAt` while bumping `updatedAt`.
- [ ] CRUD operations are covered by tests.

**C4 — Import and export**

Deliverable: portable persona JSON.

Definition of done:
- [ ] Export produces a readable JSON document including `schemaVersion`.
- [ ] Import validates before persisting and reports errors without partial application
      (test C4-T1).
- [ ] Import of a persona with a colliding `characterId` prompts or renames rather than silently
      overwriting.
- [ ] Round-trip export → import reproduces an equivalent persona.

---

### Group 4 — Prompt assembly

**D1 — Assembly pipeline**

Deliverable: `PromptAssembler.assemble()` producing the message list.

Definition of done:
- [ ] Assembly order is exactly: identity → traits → speaking style → boundaries → behavior →
      examples.
- [ ] The persona block is a single immutable section, separate from memory and turns.
- [ ] The assembler accepts a memory-block seam (empty at S1.1) so Phase 2 does not reopen it.
- [ ] Output is a typed `AssembleResult`, not a bare string.

**D2 — Section formatters**

Deliverable: one formatter per persona section.

Definition of done:
- [ ] Each formatter is a pure function of its input section.
- [ ] Omitted/empty optional fields produce no stray headings or blank lines.
- [ ] Formatting is stable: no timestamps, no locale-dependent formatting, no random ordering.
- [ ] Each formatter has a fixture-based test.

**D3 — Determinism guarantee**

Deliverable: byte-identical output for identical input.

Definition of done:
- [ ] The same persona + tier + turns + user message produces byte-identical output across 100
      runs (P1-9).
- [ ] Output does not depend on object key iteration order (test D3-T1).
- [ ] Assembly performs no I/O and reads no clock.
- [ ] A golden-file test pins the exact expected text for the default persona.

**D4 — Few-shot example inclusion**

Deliverable: tier-aware example handling.

Definition of done:
- [ ] Examples are included in order and capped at the tier limit (≤ 2 on floor, ≤ 4 otherwise).
- [ ] Examples are the first section dropped when the persona block is over budget (test D4-T1).
- [ ] Dropping examples is recorded in the assembly result, not silent.

---

### Group 5 — Context budgeting & trimming

**E1 — Budget model**

Deliverable: per-tier context budget from Phase 1 §1.5.

Definition of done:
- [ ] Budgets are defined as data: floor 4096 / mid 8192 / high 16384, with the specified output
      reserves and block caps.
- [ ] The budget is read from the active `TierProfile` (S0.2), not hard-coded.
- [ ] Changing a tier budget requires editing one table, not scattered constants.

**E2 — Trimming policy**

Deliverable: the ordered trimming rules from Phase 1 §1.5.

Definition of done:
- [ ] Trimming drops oldest turns first, keeping the most recent intact.
- [ ] If still over, the memory block is dropped next.
- [ ] The persona block and the current user message are **never** dropped (P1-10).
- [ ] Every trimming action is recorded in a `TrimReport` (which turns, whether memory, whether
      backstory).

**E3 — Backstory truncation fallback**

Deliverable: the last-resort reduction.

Definition of done:
- [ ] If persona + user message alone exceed the budget, `backstory` is truncated and a warning is
      logged (test E3-T1).
- [ ] Truncation is deterministic (defined truncation point, not arbitrary).
- [ ] The truncation is reported in the assembly result.
- [ ] Truncation never removes the persona identity or the user message.

**E4 — Assembly result metadata**

Deliverable: a result that explains what happened.

Definition of done:
- [ ] `AssembleResult` reports `messages`, `tokenEstimate`, `personaBlockText`, and `TrimReport`.
- [ ] `personaBlockText` is exposed specifically to make determinism testable.
- [ ] `overBudget` is set when trimming could not bring the prompt within budget.
- [ ] The metadata is sufficient to render a debug view without re-running assembly.

---

### Group 6 — Token counting

**F1 — Token counter interface**

Deliverable: the seam the real tokenizer plugs into at S1.3.

Definition of done:
- [ ] A `TokenCounter` interface exposes `count(text)` and `countMessages(messages)`.
- [ ] The interface matches what a real model tokenizer can provide (no lossy abstraction).
- [ ] The assembler depends on the interface, never on a concrete implementation.
- [ ] The counter is injectable for tests.

**F2 — Conservative fallback estimator**

Deliverable: a counter usable before a real tokenizer exists.

Definition of done:
- [ ] A fallback estimator exists for use at S1.1 and whenever a provider is unavailable.
- [ ] The estimator **over-estimates** rather than under-estimates, so budgeting errs toward
      safety (test F2-T1).
- [ ] It is documented as an approximation, and its use is visible in debug output.
- [ ] Its error against a known tokenizer is measured and bounded, with the bound recorded.

**F3 — Budget enforcement uses the counter**

Deliverable: trimming driven by real counts.

Definition of done:
- [ ] All budget checks call the injected counter, never a character-count heuristic inline.
- [ ] Swapping the counter changes trimming decisions consistently (test F3-T1).
- [ ] Counting cost is bounded and does not dominate assembly time.

---

### Group 7 — Verification

**G1 — Test fixtures**

Deliverable: a fixture set covering the schema's edges.

Definition of done:
- [ ] Fixtures include: a minimal valid persona, a maximal valid persona, and one invalid persona
      per validation rule.
- [ ] A floor-tier fixture exceeds the persona token budget deliberately.
- [ ] Fixtures are stored as data files, not inline in test code.

**G2 — Validation tests**

Deliverable: coverage of P1-8.

Definition of done:
- [ ] P1-8 passes: invalid persona rejected, default used, app starts.
- [ ] Every validation rule has at-limit and over-limit tests.
- [ ] Error reports are asserted for structure, not just presence.

**G3 — Determinism tests**

Deliverable: coverage of P1-9.

Definition of done:
- [ ] P1-9 passes: 100 assemblies produce byte-identical output.
- [ ] A golden file pins the default persona's exact assembled text.
- [ ] A test asserts assembly is unaffected by object key insertion order.

**G4 — Overflow and trimming tests**

Deliverable: coverage of P1-10.

Definition of done:
- [ ] P1-10 passes: oldest turns dropped first; persona and user message never dropped.
- [ ] Tests cover: turns-only overflow, turns+memory overflow, and persona-alone overflow.
- [ ] The `TrimReport` is asserted for each case.

**G5 — Token budget tests**

Deliverable: coverage of P1-14.

Definition of done:
- [ ] P1-14 passes: over-budget persona warns, does not crash.
- [ ] The fallback estimator is proven to over-estimate on a sample corpus.
- [ ] Trimming decisions are shown to change when the counter implementation changes.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1 (types/shared module) | A2, A3, B1, D1 |
| A2 | A1 | C1 |
| A3 | A1, B1 | C2, C3 |
| B1 | A1 | A3, B3, B4 |
| B2 | B1, F1 | D4, E1 |
| B3 | B1 | C3, G2 |
| B4 | B1, B3 | G2 |
| C1 | A2, S0.1-B3 | C2, C3 |
| C2 | A3, C1 | D1, S1.2 |
| C3 | B3, C1 | C4 |
| C4 | C3, B3 | — |
| D1 | A1, C2 | D2–D4 |
| D2 | D1 | D3 |
| D3 | D2 | G3 |
| D4 | D1, B2 | E2 |
| E1 | S0.2-A2 (tier profile) | E2 |
| E2 | D1, E1, F1 | E3, E4 |
| E3 | E2 | E4 |
| E4 | E2, E3 | G4, S1.2 |
| F1 | — | B2, F2, F3 |
| F2 | F1 | G5 |
| F3 | F1, E2 | G5 |
| G1 | A1 | G2–G5 |
| G2 | G1, B1–B4 | — |
| G3 | G1, D3 | — |
| G4 | G1, E2–E4 | — |
| G5 | G1, B2, F2, F3 | — |

Parallel opportunities: Group 2 (validation) and Group 6 (token counting) can proceed concurrently
once A1 is frozen. Group 4 (assembly) can start once C2 and D1's interfaces are fixed, before
storage CRUD is complete.

---

## 4. Slice-level Definition of Done

S1.1 is complete when **all** of the following hold:

- [ ] The `PersonaDocument` type matches Phase 1 §1.2 exactly and compiles under strict mode.
- [ ] Every validation rule from Phase 1 §1.3 is implemented and tested at its boundary.
- [ ] An invalid persona is rejected with a structured, field-level error, and the app starts on
      the default persona (P1-8).
- [ ] Assembly is byte-identical across 100 runs for identical input (P1-9).
- [ ] A golden file pins the exact assembled text for the default persona.
- [ ] Trimming drops oldest turns first, then memory, and never drops the persona block or the
      current user message (P1-10).
- [ ] An over-budget persona produces a warning, not a crash (P1-14).
- [ ] The persona store is keyed and multi-character-ready, and the active character resolves with
      a defined fallback.
- [ ] Import/export round-trips without loss.
- [ ] The memory-block seam exists and is exercised with an empty block, so Phase 2 does not reopen
      assembly.
- [ ] No assembly path performs I/O or reads the clock.
- [ ] All tests run offline and deterministically.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Fallback token estimator is inaccurate | Trimming decisions wrong; context overflow at runtime | Over-estimate by design; measure error against a real tokenizer and bound it (F2) |
| Nondeterminism from object key order | Flaky golden tests; unstable prompts | Arrays for ordered data; assert key-order independence (D3) |
| Persona budget warning ignored by authors | Over-budget personas degrade silently | Surface the warning in the editor, not just logs (B2) |
| Persona block too large on floor leaves no room for turns | Poor conversation quality | Examples dropped first; caps enforced; measured against the S0.4 budget (D4, E2) |
| Default persona drifts from the schema | Fallback fails validation | Validate the bundled default in CI (A3) |
| Memory seam designed too narrowly | Phase 2 reopens assembly | Define the seam against Phase 2 §1.5 now (D1) |
| Import overwrites an existing persona | Data loss | Collision prompts or renames (C4) |

---

## 6. Traceability

| Phase 1 reference / test | Covered by |
|---|---|
| §1.2 Document shape | A1 |
| §1.3 Validation rules | B1 |
| §1.3 Assembled persona block ≤ 400 tokens (floor) | B2, P1-14 |
| §1.4 Deterministic assembly order | D1, D2, D3 |
| §1.5 Context window budget | E1 |
| §1.5 Trimming policy | E2, E3 |
| P1-8 Persona validation | B3, G2 |
| P1-9 Prompt assembly determinism | D3, G3 |
| P1-10 Context overflow | E2, G4 |
| P1-14 Persona token budget | B2, G5 |

S1.1 output (`PromptAssembler`, `PersonaDocument`, active-persona resolution) is consumed directly
by S1.2 (chat engine) and, later, by S2.2 (memory injection into the assembly seam).
