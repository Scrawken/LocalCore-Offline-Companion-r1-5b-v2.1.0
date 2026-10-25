# LocalCore — S5.1 Implementation Task List

Slice: **S5.1 — Tool registry, scoped filesystem roots, permission tiers**
Source: Phase 5 §2 (registry and scopes), §3 (scoped filesystem), §6.1 (capability tiers);
S0.1 (permission/consent, audit).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- The `ToolScope` vocabulary and `RiskLevel`.
- The `ToolDefinition` contract, including the mandatory `dryRun`.
- The `ToolRegistry`.
- `ScopedFileSystem`: root confinement, traversal and symlink rejection, protected paths, and
  Windows path normalization.
- The capability-tier model (read-only on by default; write/delete/clipboard requiring
  enablement).
- The extended `ToolPermissionService`: grants, roots, tiers, and immediate revocation.

**Explicit non-goals (do not build here):**
- No Action Broker or approval UX (S5.2).
- No undo, quarantine, or reversibility (S5.3).
- No shipped tools (S5.4) — this slice provides the substrate.
- No shell or screen tools — both are **excluded from v1 entirely** (Phase 5 §9). Shell is not a
  deferred tool; it is excluded because it cannot be reconciled with the single-egress promise.
- No network tools; `network:external` routes through the existing S0.1 gateway.

Rationale: S5.1 is the containment layer for desktop actions. It is built and tested before any
tool exists, so that the first tool written is already confined, validated, and permission-gated.

---

## 1. Ordering principles

1. **Scopes before definitions** — a tool declares scopes from a fixed vocabulary.
2. **Definitions before the registry** — the registry stores definitions.
3. **Registry before the filesystem** — scoped handles are issued against declared scopes.
4. **Filesystem containment before any tool** — no tool may run before confinement is proven.
5. **Tiers before grants** — the tier model determines what is even reachable.
6. **Default deny throughout.** No scope granted means no action.
7. **Enforcement is layered:** the registry validates declarations, the filesystem enforces paths,
   the permission service enforces tiers.

---

## 2. Task list

### Group 1 — Scope vocabulary & risk

**A1 — `ToolScope` vocabulary**

Deliverable: the scope union from Phase 5 §2.1.

Definition of done:
- [ ] Scopes implemented: `fs:read`, `fs:write`, `fs:delete`, `fs:move`, `shell:execute`,
      `process:launch`, `clipboard:read`, `clipboard:write`, `screen:capture`, `app:control`,
      `network:external`.
- [ ] `screen:capture` is defined but marked as not shipped in v1.
- [ ] Scope strings are stable identifiers, not display labels.
- [ ] The vocabulary is data, so adding a scope does not require touching enforcement logic
      (test A1-T1).

**A2 — `RiskLevel`**

Definition of done:
- [ ] Levels: `low`, `moderate`, `high`, `destructive`.
- [ ] Every scope has a documented default risk level.
- [ ] A tool's declared risk cannot be lower than the maximum risk of its scopes (test A2-T1).
- [ ] Risk level drives approval behaviour in S5.2.

---

### Group 2 — Tool definitions & registry

**B1 — `ToolDefinition` contract**

Deliverable: the definition from Phase 5 §2.2.

Definition of done:
- [ ] Fields: `id`, `name`, `description`, `version`, `scopes`, `inputSchema`, `risk`,
      `reversible`, `dryRun`, `execute`.
- [ ] **`dryRun` is mandatory**; a definition without it cannot be registered (P5-27).
- [ ] `inputSchema` is a JSON schema validated at registration time.
- [ ] The type compiles under strict mode with no `any`.

**B2 — `ToolRegistry`**

Definition of done:
- [ ] `register`, `get`, and `list` are implemented.
- [ ] Registering a tool without `dryRun` fails with a structured error (P5-27).
- [ ] Registering a tool with an unknown scope or malformed schema fails.
- [ ] Duplicate `id` registration is rejected rather than silently overwriting.

**B3 — Input validation**

Definition of done:
- [ ] `inputSchema` is validated before `dryRun` and again before `execute` (P5-26).
- [ ] Invalid input is rejected with a field-level error, not a generic failure.
- [ ] Validation does not execute any part of the tool.
- [ ] Validation is deterministic.

**B4 — Scoped handle issuance**

Definition of done:
- [ ] A `ToolContext` exposes only the scoped handles for the tool's declared scopes.
- [ ] A tool with no `fs` scope receives no filesystem handle (test B4-T1).
- [ ] Handles are constructed from the permission service's granted roots, not from the request.
- [ ] A tool cannot obtain a handle it did not declare.

---

### Group 3 — Scoped filesystem

**C1 — Root confinement**

Deliverable: `ScopedFileSystem` from Phase 5 §3.

Definition of done:
- [ ] Every path is canonicalized and must resolve inside a granted root (P5-14).
- [ ] Read, write, list, move, delete, and restore are implemented.
- [ ] A path outside all roots is rejected with a structured error.
- [ ] Confinement is enforced before any OS operation, not after.

**C2 — Traversal rejection**

Definition of done:
- [ ] `..` segments that escape a root are rejected, not normalized away (P5-12).
- [ ] Encoded and mixed-separator traversal attempts are rejected (test C2-T1).
- [ ] Rejection is reported with the offending path (redacted as needed).
- [ ] No OS call occurs for a rejected path.

**C3 — Symlink resolution**

Definition of done:
- [ ] Symlinks are resolved and the **final target** must be inside a root (P5-13).
- [ ] A symlink pointing outside a root is rejected (P5-13).
- [ ] A symlink chain is fully resolved before the containment check.
- [ ] A broken symlink is handled without a crash.

**C4 — Read-only roots**

Definition of done:
- [ ] `write`, `move`, and `delete` are rejected on a read-only root (P5-14).
- [ ] `read` and `list` succeed on a read-only root.
- [ ] The rejection is distinguishable from a permission error.
- [ ] Root modes are persisted per root.

**C5 — Protected paths**

Definition of done:
- [ ] App-data secrets, OS directories, and other system locations are deny-listed (P5-15).
- [ ] The deny-list applies **even under a broad root** (P5-15).
- [ ] The deny-list is data, documented, and testable.
- [ ] A protected path is rejected before the containment check succeeds.

**C6 — Windows path normalization**

Definition of done:
- [ ] Case-insensitivity is handled in containment comparisons.
- [ ] UNC paths and junctions are resolved and checked.
- [ ] Alternate separators are normalized.
- [ ] Trailing dots/spaces and short (8.3) names cannot bypass the check (test C6-T1).

---

### Group 4 — Capability tiers

**D1 — Tier model**

Deliverable: the tiers from Phase 5 §6.1.

Definition of done:
- [ ] Tiers: read-only (on), write (off), delete (off), clipboard (off). Shell and screen are **not
      shipped** (Phase 5 §9).
- [ ] Tier defaults are exactly as specified (T5).
- [ ] Enabling a tier is a user action and cannot be performed by a tool or the model (P5-25).
- [ ] Tier state is persisted.

**D2 — Tier enforcement**

Definition of done:
- [ ] A tool whose scopes fall in a disabled tier is unavailable (P5-24).
- [ ] Read-only tools are available by default **within granted roots only** (P5-23).
- [ ] A disabled tier produces no approval prompt — the tool simply is not available (test D2-T1).
- [ ] Enabling a tier takes effect without a restart.

**D3 — Tier change auditing**

Definition of done:
- [ ] Enabling or disabling a tier emits an event for the audit log.
- [ ] The event records the tier, the new state, and the time.
- [ ] A tier change does not retroactively authorize in-flight actions.
- [ ] Tier changes are visible in the permissions surface.

---

### Group 5 — Permission service

**E1 — Roots configuration**

Definition of done:
- [ ] `setRoots` / `getRoots` manage user-configured roots with modes (Phase 5 §6.2).
- [ ] Roots are never granted by the app on its own.
- [ ] Adding or removing a root takes effect immediately.
- [ ] Root changes are audited.

**E2 — Grants**

Definition of done:
- [ ] `request`, `grant`, `revoke`, and `list` are implemented.
- [ ] A grant carries `toolId`, `scopes`, `roots`, `mode` (`session` | `persistent`),
      `grantedAt`, `expiresAt`, and `categoryBound`.
- [ ] **Grants are category-bound:** a later action needing an uncovered scope or root invalidates
      the grant and re-prompts (P5-8).
- [ ] Session grants clear on quit; persistent grants survive.

**E3 — Immediate revocation**

Definition of done:
- [ ] Revocation takes effect on the next action with no restart (P5-10).
- [ ] In-flight actions are cancelled where the tool supports it; otherwise they complete and are
      logged, and no further actions proceed (P5-10).
- [ ] Revocation emits an audit event.
- [ ] There is no caching that could serve a revoked grant (test E3-T1).

**E4 — No self-authorization**

Definition of done:
- [ ] The model cannot grant scopes, enable a tier, or widen a root (P5-25).
- [ ] These operations are only reachable from the user-facing permission surface.
- [ ] A call attempting them from a non-user origin is rejected and logged (test E4-T1).
- [ ] The rejection is auditable.

---

### Group 6 — Verification

**F1 — Test doubles**

Definition of done:
- [ ] A fixture filesystem with known files, symlinks, and junctions.
- [ ] A stub tool exercising each scope.
- [ ] Tests run offline and deterministically.
- [ ] Path tests run on Windows, where the semantics differ.

**F2 — P5-12: traversal**

Definition of done:
- [ ] P5-12 passes: `..` escapes rejected.
- [ ] Mixed-separator and encoded variants are covered.

**F3 — P5-13: symlink escape**

Definition of done:
- [ ] P5-13 passes: a symlink outside a root is rejected.
- [ ] Symlink chains are covered.

**F4 — P5-14: read-only root**

Definition of done:
- [ ] P5-14 passes: writes rejected on a read-only root.
- [ ] Reads succeed on the same root.

**F5 — P5-15: protected paths**

Definition of done:
- [ ] P5-15 passes: secrets and system directories denied under a broad root.

**F6 — P5-16, P5-23, P5-24, P5-25, P5-26, P5-27**

Definition of done:
- [ ] P5-16 passes: delete quarantines (deferred in full to S5.3; the hook exists here).
- [ ] P5-23 passes: read tools work by default within granted roots.
- [ ] P5-24 passes: write/delete denied until the tier is enabled.
- [ ] P5-25 passes: the model cannot enable a tier.
- [ ] P5-26 passes: invalid input rejected before dryRun and execute.
- [ ] P5-27 passes: a tool without dryRun cannot be registered.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1 (shared types) | A2, B1 |
| A2 | A1 | B1 |
| B1 | A1, A2 | B2, B4 |
| B2 | B1 | B3, B4 |
| B3 | B1 | B4, F6 |
| B4 | B2, E2 | S5.2 |
| C1 | S0.1-B3, E1 | C2–C6 |
| C2 | C1 | F2 |
| C3 | C1 | F3 |
| C4 | C1, E1 | F4 |
| C5 | C1 | F5 |
| C6 | C1 | F2, F3 |
| D1 | A1 | D2, D3 |
| D2 | D1, B2 | F6 |
| D3 | D1, S0.1-F1 | — |
| E1 | S0.1-A3 | C1, E2 |
| E2 | E1, B1 | E3, B4 |
| E3 | E2 | F6 |
| E4 | D1, E2 | F6 |
| F1 | C1, B2 | F2–F6 |
| F2 | F1, C2, C6 | — |
| F3 | F1, C3, C6 | — |
| F4 | F1, C4 | — |
| F5 | F1, C5 | — |
| F6 | F1, B3, D2, E3, E4 | — |

Parallel opportunities: Group 3 (scoped filesystem) and Group 4 (tiers) can proceed concurrently
once scopes and the registry exist. Group 5 (permissions) is independent of Group 3.

---

## 4. Slice-level Definition of Done

S5.1 is complete when **all** of the following hold:

- [ ] Every scope and risk level from Phase 5 §2.1 is implemented (A1, A2).
- [ ] A tool without `dryRun` cannot be registered (P5-27).
- [ ] Tool input is validated before `dryRun` and `execute` (P5-26).
- [ ] Path traversal is rejected (P5-12).
- [ ] Symlink escapes are rejected (P5-13).
- [ ] Writes are rejected on read-only roots (P5-14).
- [ ] Protected paths are denied even under a broad root (P5-15).
- [ ] Read-only tools work by default within granted roots (P5-23).
- [ ] Write, delete, and clipboard are denied until their tier is enabled (P5-24).
- [ ] The model cannot enable a tier, grant a scope, or widen a root (P5-25).
- [ ] Revocation is immediate, with no cached grant able to override it (P5-10).
- [ ] All path tests run on Windows with real filesystem semantics.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Windows path quirks bypass containment | Files outside roots are reachable | Case, UNC, junction, 8.3 normalization; tested on Windows (C6) |
| Symlink chain escapes after the check | Root confinement defeated | Resolve fully, then check the final target (C3) |
| Protected paths reachable under a broad root | Secrets or system files exposed | Deny-list applied before confinement passes (C5) |
| A tool receives a handle it did not declare | Confused-deputy privilege escalation | Handles issued only for declared scopes (B4) |
| Disabled tier still prompts | User sees approval for something unavailable | Tool simply unavailable; asserted (D2) |
| Grant cached across a revoke | Revoked permission still usable | No caching; revocation re-read per action (E3) |
| A tool lowers its declared risk | Under-approval of a dangerous action | Risk floor derived from scopes (A2) |
| Root added by the app itself | Unconsented filesystem access | Roots are user-only (E1) |

---

## 6. Traceability

| Phase 5 reference / test | Covered by |
|---|---|
| §2.1 Scope vocabulary | A1, A2 |
| §2.2 `ToolDefinition`, `ToolContext` | B1, B4 |
| §2.2 Registry rules | B2, B3 |
| §3 Scoped filesystem roots | C1–C6 |
| §6.1 Capability tiers (T5) | D1, D2 |
| §6.2 `ToolPermissionService`, grants | E1–E3 |
| §8.3 No self-authorization | E4 |
| P5-10 Revocation | E3 |
| P5-12 Path traversal | C2, F2 |
| P5-13 Symlink escape | C3, F3 |
| P5-14 Read-only root | C4, F4 |
| P5-15 Protected paths | C5, F5 |
| P5-16 Quarantine (hook) | F6 |
| P5-23 Read-only default | D2, F6 |
| P5-24 Write gating | D2, F6 |
| P5-25 Tier is user-only | E4, F6 |
| P5-26 Schema validation | B3, F6 |
| P5-27 dryRun required | B1, B2, F6 |

S5.1 output (registry, scoped filesystem, tiers, permissions) is consumed by S5.2 (Action Broker),
S5.3 (quarantine), and S5.4 (shipped tools).
