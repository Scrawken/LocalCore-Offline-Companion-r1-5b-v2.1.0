# LocalCore — S5.2 Implementation Task List

Slice: **S5.2 — Action Broker, approval UX, audit (GATE-4)**
Source: Phase 5 §4 (broker), §5 (approval UX), §7 (audit), §8 (safety);
S5.1 (registry, scoped FS, tiers); S1.2 (ChatEngine, model tool proposals).
Build Order §7 (GATE-4).
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

S5.2 is where desktop actions become executable. Its governing principle — **the model can propose
actions but can never authorize them** — is GATE-4.

**In scope:**
- The `ActionBroker`: validate → check scopes → dry run → determine approval → execute → audit.
- `ActionPreview` carrying the exact target, command, and diff.
- The approval UI with its four decisions and its timeout-to-deny behaviour.
- Main-process enforcement with a per-request nonce.
- The `ActionAuditEntry` and its integration with the shared audit log.
- Prompt-injection defences: tool output and memory as untrusted data.
- The GATE-4 decision record.

**Explicit non-goals (do not build here):**
- No shipped tools (S5.4) — the broker is verified against stub tools.
- No undo or quarantine (S5.3).
- No shell or screen tools (T1, T2).
- No changes to the scoped filesystem (S5.1).

Rationale: the broker is the choke point for every consequential action. It is built and gated
before any real tool ships, so the first tool is already mediated, previewed, and audited.

---

## 1. Ordering principles

1. **Broker skeleton before the UI** — the flow exists before its dialog.
2. **Preview before approval** — there must be an exact effect to show.
3. **Approval before execution** — no path from request to execution that skips the gate.
4. **Nonce enforcement before any execution path is reachable** — the renderer must never be able to
   approve.
5. **Audit alongside execution** — a log written after the fact loses failed and denied attempts.
6. **Timeout defaults to deny** — absence of a decision is a denial.
7. **GATE-4 before any tool ships.** Tools stay unregistered until the gate passes.

---

## 2. Task list

### Group 1 — Broker core

**A1 — `ActionBroker` interface**

Deliverable: the broker from Phase 5 §4.

Definition of done:
- [ ] `invoke`, `preview`, and `cancel` are implemented.
- [ ] `ActionRequest` carries `toolId`, `input`, `origin`, `conversationId`, and `turnId`.
- [ ] `ActionResult` carries `status`, `output`, `error`, `auditId`, and `undoRef`.
- [ ] The broker is the only path to `ToolDefinition.execute`.

**A2 — Broker flow**

Deliverable: the seven-step flow from Phase 5 §4.1.

Definition of done:
- [ ] Order is: validate input → check scopes → dry run → determine approval → approve → execute →
      audit.
- [ ] No step can be skipped or reordered (test A2-T1).
- [ ] A missing scope returns `denied` before any dry run.
- [ ] The flow is unit-testable at each step.

**A3 — Approval determination**

Deliverable: the matrix from Phase 5 §4.2.

Definition of done:
- [ ] **Standing grants are origin-matched**: a grant applies only to actions of the origin it was
      created under (Phase 5 §4.2).
- [ ] `low`/`moderate` risk may run under a same-origin standing grant.
- [ ] `high` risk may run under a standing grant **only for `user` origin**; `high`-risk `model` or
      `automation` actions always require fresh approval.
- [ ] `destructive` risk **always requires fresh approval for every origin and is never covered by a
      standing grant** (P5-9).
- [ ] An ungranted scope is denied outright.
- [ ] The model can never create, widen, or reuse a grant.

**A4 — Cancellation**

Definition of done:
- [ ] `cancel(actionId)` stops a pending action before execution where possible.
- [ ] Cancellation during approval closes the prompt and returns `cancelled`.
- [ ] Cancellation after execution is a no-op (the action already happened) and is reported honestly.
- [ ] Cancellation is idempotent.

---

### Group 2 — Action preview

**B1 — Preview contents**

Deliverable: `ActionPreview` from Phase 5 §4.

Definition of done:
- [ ] Fields: `toolId`, `summary`, `exactTarget`, `command`, `diff`, `effects`, `risk`,
      `reversible`, `requiresApproval`, `scopeUsed`.
- [ ] `exactTarget` is the full path, URL, or resource — never a paraphrase (P5-2).
- [ ] `command` is the literal command line for shell/process actions (P5-3).
- [ ] `effects` is an explicit bullet list of consequences, not a restatement of the summary.

**B2 — Diff generation**

Definition of done:
- [ ] `modify` produces a unified diff (P5-4).
- [ ] `create` and `delete` produce content or size previews (P5-4).
- [ ] `move` shows source and destination.
- [ ] Diffs are truncated with an explicit indicator for very large changes.

**B3 — Preview accuracy**

Definition of done:
- [ ] The preview describes the **actual** effect; a mismatch between preview and execution is a
      defect (test B3-T1).
- [ ] The preview is computed from the same inputs used for execution.
- [ ] A tool whose preview cannot be computed cannot execute (dryRun is mandatory, S5.1 B1).
- [ ] Preview generation does not mutate state.

---

### Group 3 — Approval UX

**C1 — Dialog contents**

Deliverable: the approval surface from Phase 5 §5.

Definition of done:
- [ ] The dialog shows: exact target, exact command, diff, effects, risk, reversibility, and scope
      used.
- [ ] **Deny is the default focus** (Phase 5 §5).
- [ ] The dialog does not truncate the target or command in a way that hides the effect
      (test C1-T1).
- [ ] Long content is scrollable rather than silently clipped.

**C2 — Decisions**

Definition of done:
- [ ] Controls: **Deny**, **Allow once**, **Allow for session**, **Always allow** (scoped).
- [ ] `Allow once` executes once; the next identical action prompts again (P5-5).
- [ ] `Allow for session` is valid for the session and clears on quit (P5-6).
- [ ] `Always allow` is scoped per tool + scope + root, is listed in permissions, and is revocable
      (P5-7).

**C3 — Destructive handling**

Definition of done:
- [ ] Destructive actions cannot be "always allowed" (P5-9).
- [ ] They require per-action confirmation with a distinct affordance.
- [ ] The affordance is visually and interactively different from the normal allow control
      (test C3-T1).
- [ ] A destructive action never proceeds on a single implicit approval.

**C4 — Timeout**

Definition of done:
- [ ] An unanswered prompt times out and results in **denial** (P5-20).
- [ ] The timeout duration is documented and configurable.
- [ ] The user is informed that the request expired rather than silently failing.
- [ ] A timeout does not leave the action in a pending state.

**C5 — Main-process enforcement**

Definition of done:
- [ ] The renderer displays the dialog but **cannot auto-approve** (P5-21).
- [ ] The decision carries a per-request nonce validated in the main process (P5-21).
- [ ] A forged or replayed nonce is rejected and logged (test C5-T1).
- [ ] Approval state is never inferred from renderer-supplied flags.

---

### Group 4 — Audit

**D1 — `ActionAuditEntry`**

Deliverable: the schema from Phase 5 §7.

Definition of done:
- [ ] Fields: `auditId`, `timestamp`, `toolId`, `origin`, `conversationId`, `turnId`, `scopeUsed`,
      `exactTarget`, `command`, `decision`, `approvalMode`, `result`, `error`, `bytesAffected`,
      `reversible`, `undoRef`, `durationMs`.
- [ ] Entries are written to the shared audit infrastructure under the `action` category.
- [ ] The store is append-only and encrypted (reuses S0.1 F1).
- [ ] The schema is versioned.

**D2 — Complete coverage**

Definition of done:
- [ ] Every action, approved or denied, produces exactly one entry with a matching result (P5-11).
- [ ] Denied and cancelled actions are recorded, not only successful ones (P5-11).
- [ ] A failure to write the audit entry fails the action (no silent unaudited action).
- [ ] The entry's `auditId` matches the one returned to the caller.

**D3 — Audit privacy**

Definition of done:
- [ ] The audit entry never contains file contents or credentials.
- [ ] `exactTarget` is a path/URL; content lives in the diff preview, not the log (test D3-T1).
- [ ] The log is user-viewable and clearable.
- [ ] Clearing the log does not remove memory or egress entries inadvertently.

---

### Group 5 — Safety

**E1 — Prompt-injection defence**

Definition of done:
- [ ] Tool results and retrieved memory are treated as **untrusted data, never instructions**
      (Phase 5 §8.1).
- [ ] Content in memory, transcripts, or tool output cannot trigger an action (P5-19).
- [ ] Actions are invocable only from the chat turn, the UI, or a user-configured automation
      (P5-19).
- [ ] A model-proposed action always crosses the approval gate (P5-18).

**E2 — Model-origin handling**

Definition of done:
- [ ] Actions with `origin: "model"` are always mediated by the broker (P5-18).
- [ ] They require fresh approval unless a **model-origin** standing grant exists (created by the
      user in response to a model-origin prompt).
- [ ] `high`-risk and `destructive` model-origin actions always require fresh approval.
- [ ] The approval dialog makes the origin visible so the user knows the model proposed it
      (test E2-T1).
- [ ] A model-proposed action cannot reuse a `user`-origin grant.

**E3 — No self-authorization**

Definition of done:
- [ ] The model cannot approve its own action, grant scopes, enable tiers, or widen roots.
- [ ] Approval decisions are validated in the main process with the nonce (C5).
- [ ] Any attempt from a non-user origin is rejected and audited (test E3-T1).
- [ ] There is no code path where `origin: "model"` results in an auto-approval for destructive
      risk.

---

### Group 6 — Verification

**F1 — Test doubles**

Definition of done:
- [ ] Stub tools exercise each risk level, including a destructive one.
- [ ] A stub approval channel can return each decision and a timeout.
- [ ] A synthetic renderer cannot forge approvals.
- [ ] Tests run offline and deterministically.

**F2 — P5-1 to P5-4: blocking and preview fidelity**

Definition of done:
- [ ] P5-1 passes: an unapproved action is blocked, not executed, and surfaced.
- [ ] P5-2 passes: the approval shows the full target, not a paraphrase.
- [ ] P5-3 passes: shell approval shows the literal command line.
- [ ] P5-4 passes: modify shows a unified diff; create/delete show a preview.

**F3 — P5-5 to P5-8: approval modes**

Definition of done:
- [ ] P5-5 passes: allow once executes once, then prompts again.
- [ ] P5-6 passes: allow session is valid for the session and clears on quit.
- [ ] P5-7 passes: always allow is scoped, listed, and revocable.
- [ ] P5-8 passes: a new scope/root invalidates the grant and re-prompts.

**F4 — P5-9 to P5-11: destructive, revocation, audit**

Definition of done:
- [ ] P5-9 passes: destructive is never persistently auto-approved.
- [ ] P5-10 passes: revocation denies the next action immediately; in-flight actions are handled
      and logged.
- [ ] P5-11 passes: one matching audit entry per action, approved or denied.

**F5 — P5-18 to P5-21: safety**

Definition of done:
- [ ] P5-18 passes: a model-proposed action always crosses the approval gate.
- [ ] P5-19 passes: memory/tool output cannot trigger an action.
- [ ] P5-20 passes: approval timeout results in denial.
- [ ] P5-21 passes: the renderer cannot auto-approve; the nonce is validated in main.

**F6 — GATE-4 decision record**

Definition of done:
- [ ] The record states whether the approval UX prevents self-authorization and shows exact effects.
- [ ] It names the tests that prove it (P5-18, P5-19, P5-21, E3).
- [ ] It confirms tools stay unregistered until the gate passes.
- [ ] It is checked in and referenced by S5.4 and the release checklist.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S5.1-B2, S5.1-B4 | A2–A4 |
| A2 | A1 | A3, B1 |
| A3 | A2, S5.1-D2, S5.1-E2 | C2 |
| A4 | A1 | C4 |
| B1 | A2, S5.1-B1 | B2, C1 |
| B2 | B1 | B3, F2 |
| B3 | B2 | F2 |
| C1 | B1 | C2 |
| C2 | C1, A3, S5.1-E2 | C3, F3 |
| C3 | C2, A3 | F4 |
| C4 | C1, A4 | F5 |
| C5 | C2, S0.1 (IPC) | E3, F5 |
| D1 | S0.1-F1 | D2 |
| D2 | D1, A2 | F4 |
| D3 | D1 | — |
| E1 | A2, S2.2 (retrieval) | F5 |
| E2 | A3, S1.2 (tool proposals) | F5 |
| E3 | C5, A3, S5.1-E4 | F6 |
| F1 | A1, C2, D1 | F2–F6 |
| F2 | F1, A2, B1–B3 | — |
| F3 | F1, C2 | — |
| F4 | F1, C3, D2, S5.1-E3 | — |
| F5 | F1, E1, E2, C4, C5 | — |
| F6 | F1, E3 | S5.4 |

Parallel opportunities: Group 4 (audit) can be built alongside Group 2 (preview) once the flow is
fixed. Group 5 (safety) depends on Groups 3 and 4.

---

## 4. Slice-level Definition of Done

S5.2 is complete when **all** of the following hold:

- [ ] An unapproved action is blocked, not executed, and surfaced (P5-1).
- [ ] Approval shows the exact target, command, and diff (P5-2, P5-3, P5-4).
- [ ] Allow once / session / always behave distinctly, and always-allow is scoped and revocable
      (P5-5, P5-6, P5-7).
- [ ] A new scope or root invalidates a grant and re-prompts (P5-8).
- [ ] Destructive actions are never persistently auto-approved (P5-9).
- [ ] Revocation denies the next action immediately (P5-10).
- [ ] Every action, approved or denied, produces one matching audit entry (P5-11).
- [ ] A model-proposed action always crosses the approval gate (P5-18).
- [ ] Memory or tool output cannot trigger an action (P5-19).
- [ ] Approval timeout results in denial (P5-20).
- [ ] The renderer cannot auto-approve; the nonce is validated in the main process (P5-21).
- [ ] GATE-4 is recorded, and no tool is registered until it passes (F6).

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| Renderer can forge an approval | The entire gate is defeated | Nonce validated in main; forged nonce rejected (C5, F5) |
| Preview understates the effect | User approves something worse than shown | Preview computed from execution inputs; mismatch is a defect (B3) |
| Destructive action gets a persistent grant | Unrecoverable data loss | Destructive never persistent; distinct affordance (C3, F4) |
| Timeout leaves a pending action | Action executes later, unexpectedly | Timeout is denial; no pending state (C4, F5) |
| Model-origin action reuses a user grant | Model effectively self-authorizes | Origin recorded; user grants not reused by model origin (E2) |
| Tool output treated as instructions | Injection executes an action | Untrusted-data rule; no action from tool output (E1, F5) |
| Denied attempts not audited | No record of what was attempted | Audit covers denied and cancelled (D2, F4) |
| Audit log stores file contents | Sensitive data in the log | Path and diff separation; asserted (D3) |
| Approval dialog truncates the target | User cannot see what they are approving | Scrollable, untruncated target/command (C1) |

---

## 6. Traceability

| Phase 5 reference / test | Covered by |
|---|---|
| §4 `ActionBroker` | A1, A2 |
| §4.1 Broker flow | A2 |
| §4.2 Approval determination | A3 |
| §4 `ActionPreview` | B1–B3 |
| §5 Approval UX, decisions | C1–C4 |
| §5 Main-process enforcement | C5 |
| §7 `ActionAuditEntry` | D1–D3 |
| §8.1 Prompt-injection defence | E1 |
| §8.3 No self-authorization | E3 |
| P5-1 Unapproved action | F2 |
| P5-2 / P5-3 / P5-4 Preview fidelity | B1–B3, F2 |
| P5-5 / P5-6 / P5-7 Approval modes | C2, F3 |
| P5-8 Grant widening | S5.1-E2, F3 |
| P5-9 Destructive | C3, F4 |
| P5-10 Revocation | S5.1-E3, F4 |
| P5-11 Audit completeness | D2, F4 |
| P5-18 Model origin | E2, F5 |
| P5-19 Injection | E1, F5 |
| P5-20 Timeout | C4, F5 |
| P5-21 Renderer forgery | C5, F5 |

S5.2 output (broker, approval UX, audit) is consumed by S5.3 (undo and quarantine), S5.4 (shipped
tools), and the release checklist (GATE-4).
