# LocalCore — S5.4 Implementation Task List

Slice: **S5.4 — v1 tools live and tier gating**
Source: Phase 5 §9 (v1 tool set), §6.1 (capability tiers), §10 (acceptance tests);
S5.1 (registry, scoped FS, tiers); S5.2 (broker, approval); S5.3 (quarantine, undo).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The shipped read-only tools: list, read, and search.
- The gated write tools: write/create and move/rename.
- The gated delete tool, using quarantine.
- The gated clipboard tools and the open-URL tool.
- The opt-in shell tool, always per-action approved.
- Tier gating enforcement and the default surface.
- End-to-end verification that the model's action vocabulary matches the enabled tiers.

**Explicit non-goals (do not build here):**
- No screen capture (T1) — defined but not shipped.
- No Action Broker, approval UX, quarantine, or undo internals (S5.2, S5.3).
- No network tools beyond routing `network:external` through the S0.1 gateway.
- No automation/scripting surface beyond a single action per request.

Rationale: S5.4 is the first slice that lets the companion touch the user's machine. It ships only
after GATE-4, and it ships read-only first, with every mutating tool behind an explicit enablement.

---

## 1. Ordering principles

1. **Read-only tools first** — the smallest useful surface, and the safest to verify end to end.
2. **Gated tools behind their tier** — write, delete, clipboard, and shell are unavailable until
   enabled.
3. **Delete last among file tools** — it depends on quarantine and undo.
4. **Shell last overall** — the highest-consequence tool, opt-in, always per-action.
5. **Tier gating before shipping any tool** — an ungated tool defeats the model.
6. **The model's action vocabulary is the enabled set.** A disabled tool is not advertised to the
   model at all.
7. **GATE-4 must have passed** before any tool is registered in a production build.

---

## 2. Task list

### Group 1 — Read-only tools (default surface)

**A1 — List directory**

Definition of done:
- [ ] Lists entries under a granted root with name, type, size, and modified time.
- [ ] Requires only `fs:read` and runs under a standing grant (P5-23).
- [ ] A path outside granted roots is rejected (ties to S5.1 C1).
- [ ] Large directories are paginated or bounded (test A1-T1).

**A2 — Read file**

Definition of done:
- [ ] Reads a file under a granted root, with an encoding and size bound.
- [ ] Files above a size threshold are truncated with an explicit indicator (test A2-T1).
- [ ] Binary files are detected and reported rather than dumped as text.
- [ ] Protected paths are refused (ties to S5.1 C5).

**A3 — Search files**

Definition of done:
- [ ] Searches by name and by content within granted roots.
- [ ] Content search is bounded in time and results, and never scans outside roots.
- [ ] Results include the path and a bounded excerpt.
- [ ] Search does not follow symlinks outside roots (ties to S5.1 C3).

**A4 — Read-only surface advertisement**

Definition of done:
- [ ] The three read tools are advertised to the model by default (P5-23).
- [ ] Their descriptions are written so the model uses them appropriately.
- [ ] They are available without enabling any tier beyond the default.
- [ ] They remain gated by granted roots even though they are default-on.

---

### Group 2 — Write tools (gated)

**B1 — Write / create file**

Definition of done:
- [ ] Requires `fs:write` and the write tier enabled (P5-24).
- [ ] `dryRun` produces a unified diff for modify and a content preview for create (P5-4).
- [ ] Execution snapshots the original before writing (ties to S5.3 B1).
- [ ] Returns an `undoRef` on success (P5-17).

**B2 — Move / rename**

Definition of done:
- [ ] Requires `fs:move` and the write tier enabled (P5-24).
- [ ] `dryRun` shows source and destination.
- [ ] Execution records source and destination for undo (ties to S5.3 B2).
- [ ] A destination outside granted roots is rejected.

**B3 — Write approval behaviour**

Definition of done:
- [ ] Write and move require approval unless a matching standing grant exists (Phase 5 §4.2).
- [ ] A standing grant is scoped per tool + scope + root (P5-7).
- [ ] A write outside the granted root invalidates the grant and re-prompts (P5-8).
- [ ] Model-origin writes always cross the approval gate (P5-18).

---

### Group 3 — Delete tool (gated, destructive)

**C1 — Delete file (quarantine)**

Definition of done:
- [ ] Requires `fs:delete` and the delete tier enabled (P5-24).
- [ ] `dryRun` shows the exact target and that the item will be quarantined (P5-2).
- [ ] Execution moves the target to quarantine (P5-16).
- [ ] **Never persistently auto-approved** (P5-9).

**C2 — Restore path**

Definition of done:
- [ ] The delete result exposes the quarantine reference so restore is reachable (P5-16).
- [ ] Restore is available from the same surface as the delete.
- [ ] A restore conflict is surfaced rather than silently overwriting (ties to S5.3 D3).
- [ ] The quarantine surface lists the item with its original path.

**C3 — Directory delete**

Definition of done:
- [ ] A recursive delete is explicitly identified as such in the preview (test C3-T1).
- [ ] The preview states the number of items and total size affected.
- [ ] The whole tree is quarantined, not just the top directory.
- [ ] A partial failure reports exactly what was and was not quarantined.

---

### Group 4 — Clipboard and open URL (gated)

**D1 — Clipboard read / write**

Definition of done:
- [ ] Requires the clipboard tier enabled (P5-24).
- [ ] Read and write are separate scopes with separate approvals.
- [ ] The preview for a read states that clipboard content will be read; for a write, the exact
      content (bounded) is shown (test D1-T1).
- [ ] Clipboard operations are not reversible and say so.

**D2 — Open URL**

Definition of done:
- [ ] Requires `app:control` and the relevant tier enabled.
- [ ] The preview shows the exact URL (P5-2).
- [ ] The URL is opened in the default browser; the app performs no fetch itself.
- [ ] A URL that would cause egress is not fetched by the app, so the S0.1 gateway is not bypassed.

---

### Group 5 — Shell exclusion (documented)

**E1 — Shell is not shipped**

Deliverable: the documented exclusion and its rationale.

Definition of done:
- [ ] `shell:execute` is defined in the scope vocabulary but **no shell tool is registered in v1**
      (P5-22, Phase 5 §9).
- [ ] The exclusion rationale is recorded: a shell can spawn arbitrary child processes that open
      sockets, and neither approval nor command inspection can prevent that.
- [ ] The UI does not offer a shell enablement toggle, because there is nothing to enable.
- [ ] A test asserts that no tool declaring `shell:execute` can be registered in a v1 build
      (test E1-T1).

**E2 — Path to enabling shell later**

Definition of done:
- [ ] The requirements are documented: OS-level network containment of the entire shell process
      tree; a distinct consent scope for shell network access; verification that no unapproved
      egress occurs.
- [ ] The requirements are recorded as a separately gated capability, not a configuration flag.
- [ ] No partial shell implementation ships behind a hidden flag.

---

### Group 6 — Tier gating & defaults

**F1 — Default surface**

Definition of done:
- [ ] A fresh install exposes **only** the read-only tools to the model (P5-23).
- [ ] Write, delete, and clipboard are unavailable and unadvertised until enabled (P5-24).
- [ ] No tool is reachable without at least one granted root.
- [ ] The default surface is asserted by a test, not by documentation.

**F2 — Enablement flow**

Definition of done:
- [ ] Enabling a tier explains what it unlocks and its risk (test F2-T1).
- [ ] Enabling is a user action only; the model cannot enable a tier (P5-25).
- [ ] Disabling a tier immediately removes the tools from the model's vocabulary (P5-24).
- [ ] Enablement state is persisted and audited.

**F3 — Vocabulary consistency**

Definition of done:
- [ ] The tools advertised to the model exactly equal the enabled set (test F3-T1).
- [ ] A disabled tool is not advertised, so the model cannot propose it.
- [ ] A proposal for an unavailable tool is rejected with a clear error if it occurs anyway.
- [ ] The advertised set updates without a restart.

---

### Group 7 — Verification

**F4 — Test doubles**

Definition of done:
- [ ] A fixture filesystem with known files and directories.
- [ ] A stub approval channel returning each decision.
- [ ] The clock is injectable.
- [ ] Tests run offline and deterministically.

**F5 — P5-22 to P5-25: gating**

Definition of done:
- [ ] P5-22 passes: shell is disabled until explicitly enabled and always per-action.
- [ ] P5-23 passes: read tools work by default within granted roots.
- [ ] P5-24 passes: write/delete tools denied until the tier is enabled.
- [ ] P5-25 passes: the model cannot enable a tier.

**F6 — Tool end-to-end**

Definition of done:
- [ ] Each shipped tool is exercised end to end through the broker with approval.
- [ ] Each tool's preview matches its effect (ties to S5.2 B3).
- [ ] Each mutating tool produces a working undo or a quarantine entry.
- [ ] Each tool is audited with a matching result.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S5.1-B1, S5.2-A1 | A4, F5 |
| A2 | S5.1-B1, S5.2-A1 | A4 |
| A3 | S5.1-B1, S5.2-A1 | A4 |
| A4 | A1, A2, A3, S5.1-D2 | F1 |
| B1 | S5.1-C1, S5.2-A2, S5.3-B1 | F6 |
| B2 | S5.1-C1, S5.2-A2, S5.3-B2 | F6 |
| B3 | B1, B2, S5.2-C2 | F6 |
| C1 | S5.3-C2, S5.2-C3 | C2, F6 |
| C2 | C1, S5.3-D1 | F6 |
| C3 | C1, S5.1-C1 | F6 |
| D1 | S5.1-B1, S5.2-A2 | F6 |
| D2 | S5.1-B1, S5.2-A2, S0.1 (gateway) | F6 |
| E1 | S5.1-D2, S5.2-C3 | E2, F5 |
| E2 | E1 | F6 |
| E3 | E1 | F6 |
| F1 | A4, S5.1-D2 | F5 |
| F2 | S5.1-D2, S5.2-C2 | F3 |
| F3 | F2, S5.1-D2 | F5 |
| F4 | A1, B1, S5.2-A1 | F5, F6 |
| F5 | F4, F1, F2, E1 | — |
| F6 | F4, A1–A4, B1–B3, C1–C3, D1, D2, E1–E3 | — |

Parallel opportunities: Groups 1–4 can be built concurrently once the broker is available. Group 5
(shell) should be built last and independently reviewed.

---

## 4. Slice-level Definition of Done

S5.4 is complete when **all** of the following hold:

- [ ] Read-only tools work by default within granted roots (P5-23).
- [ ] Write and move are denied until the write tier is enabled (P5-24).
- [ ] Delete is denied until the delete tier is enabled, and quarantines rather than removing
      (P5-16, P5-24).
- [ ] Clipboard and open-URL are denied until their tier is enabled.
- [ ] Shell is disabled by default, opt-in, and always per-action approved (P5-22).
- [ ] The model cannot enable any tier (P5-25).
- [ ] The tools advertised to the model exactly equal the enabled set (F3).
- [ ] Every shipped tool's preview matches its effect (S5.2 B3).
- [ ] Every mutating tool produces a working undo or quarantine entry (P5-17).
- [ ] Every tool action is audited with a matching result (P5-11).
- [ ] GATE-4 has passed before any tool is registered in a production build.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| A gated tool ships enabled | Model can act beyond consent | Default surface asserted by test (F1, F5) |
| Disabled tool still advertised to the model | Model proposes unavailable actions | Vocabulary equals enabled set (F3) |
| Shell reachable without explicit opt-in | Highest-consequence tool available by default | Separate opt-in; always per-action (E1, F5) |
| Recursive delete understated in the preview | User approves more than they understood | Preview states item count and size (C3) |
| Clipboard write shows truncated content | User approves unseen content | Bounded but explicit content preview (D1) |
| Open URL bypasses the gateway | Unaudited egress via the app | App performs no fetch; the browser does (D2) |
| Undo missing for a mutating tool | Irreversible surprise | Every mutating tool returns undo or quarantine (F6) |
| Shell command reaches the network unnoticed | Uncontrolled egress | Flagged in preview; app-controlled paths use the gateway (E2) |

---

## 6. Traceability

| Phase 5 reference / test | Covered by |
|---|---|
| §9 v1 tool set (files, clipboard, open URL) | A1–A4, B1–B3, C1–C3, D1, D2 |
| §9 Shell opt-in capability (T2) | E1–E3 |
| §6.1 Capability tiers (T5) | F1, F2 |
| §10 P5-22 Shell default | E1, F5 |
| §10 P5-23 Read-only default | A4, F1, F5 |
| §10 P5-24 Write gating | B1–B3, C1, D1, F5 |
| §10 P5-25 Tier is user-only | F2, F5 |
| §10 P5-11 Audit completeness | F6 |
| §10 P5-16 Quarantine | C1, C2 |
| §10 P5-17 Undo | B1, B2, F6 |

S5.4 completes the tools track. Its output (the shipped tool set and tier gating) is consumed by the
release checklist and by Phase 6 only insofar as `network:external` tools route through the gateway.
