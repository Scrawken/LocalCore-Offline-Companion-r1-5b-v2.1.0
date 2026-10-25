# LocalCore — S6.1 Implementation Task List

Slice: **S6.1 — Cloud consent UI and activity view**
Source: Phase 6 §2 (consent UI flows A–D, default mode, personal-data policy);
S0.1 (Egress Gateway, Consent, Audit).
Build Order slice table.
Owners: unassigned by design — this list is ordered by dependency, not by person.

---

## 0. Slice scope

**In scope:**
- `CloudConsentState` and per-scope consent modes.
- The **ask-each-time** default for every cloud scope.
- Flow A: first-time enablement with disclosure and per-scope setup.
- Flow B: the per-request consent dialog, which is the **default path**.
- Flow C: revocation, including `revokePersonalData`.
- Flow D: the activity view over the egress audit log.
- The personal-data gate and its persistent-indicator obligation.

**Explicit non-goals (do not build here):**
- No cloud providers or credentials (S6.2) — this slice is verified against the gateway's test
  double.
- No redaction toggles; the preview is display-only in v1 (CL2).
- No end-to-end privacy verification (S6.3).
- No account, sync, or marketplace surfaces.

Rationale: the consent UI is the user-facing half of the Egress Gateway. It is built and verified
against the gateway alone, so the consent flows can be tested without any cloud provider existing.

---

## 1. Ordering principles

1. **State model before UI** — the UI renders a defined state.
2. **Default mode before enablement** — the strictest default must exist before anything can be
   enabled.
3. **Enablement before per-request consent** — a scope must be enabled before it can prompt.
4. **Prompt before decision handling** — there must be a prompt to answer.
5. **Revocation before the activity view** — grants must be manageable before history is shown.
6. **The prompt is the normal path, not an exception.** Ask-each-time means Flow B is default.
7. **Main process enforces every decision.** The renderer draws; it never decides.

---

## 2. Task list

### Group 1 — Consent state

**A1 — `CloudConsentState`**

Deliverable: the state model from Phase 6 §2.

Definition of done:
- [ ] Fields: `cloudEnabled`, `scopes[]` (with `mode`, `personalDataConsent`,
      `dataConsentCategories`, `allowHosts`), `providers`, `activitySummary`.
- [ ] State is derived from the S0.1 consent store, not a parallel store (test A1-T1).
- [ ] `getState()` is safe to poll from the UI.
- [ ] The state is the single source the UI renders.

**A2 — Default mode (ask each time)**

Deliverable: the strictest default (CL1).

Definition of done:
- [ ] **Every cloud scope defaults to `ask`** (P6-3).
- [ ] No scope defaults to `allow`.
- [ ] A fresh install has no allow records of any kind (P6-2).
- [ ] The default is asserted by a test, not by documentation.

**A3 — Per-scope modes**

Definition of done:
- [ ] `setScopeMode(scope, mode)` supports `deny`, `ask`, and `allow` (P6-4).
- [ ] Enabling one scope does not enable another (P6-4).
- [ ] A mode change takes effect on the next request, without a restart.
- [ ] Mode changes are audited.

---

### Group 2 — Enablement (Flow A)

**B1 — Cloud off by default**

Definition of done:
- [ ] The settings surface states plainly: "Cloud is off. Everything currently runs on your
      device." (Phase 6 §2.2)
- [ ] No cloud request is possible while cloud is disabled (P6-2).
- [ ] The state is visible without opening a submenu.
- [ ] Enabling is an explicit user action, never a default or a migration.

**B2 — Disclosure**

Definition of done:
- [ ] The disclosure states what cloud adds, what leaves the device, and which scopes exist
      (P6-5).
- [ ] It appears **before** any cloud request can be made (P6-5).
- [ ] It is written in plain language, not legal boilerplate.
- [ ] It distinguishes chat content from audio (the most sensitive category).

**B3 — Per-scope setup**

Definition of done:
- [ ] The user sets grant/deny/ask for each scope: `cloud-inference`, `cloud-voice`,
      `model-download`, `asset-download`, `update-check`.
- [ ] Each scope explains what it covers in one sentence.
- [ ] The setup is skippable, leaving everything at `ask` (or `deny`).
- [ ] The resulting state is persisted and audited.

**B4 — Connection test**

Definition of done:
- [ ] An optional test request is itself gated by `cloud-inference` (Phase 6 §2.2).
- [ ] The test result reports success or the specific failure, without leaking credentials.
- [ ] A failed test does not disable cloud; it reports the reason.
- [ ] The test is not run automatically.

---

### Group 3 — Per-request consent (Flow B)

**C1 — Consent prompt**

Deliverable: the dialog from Phase 6 §2.3.

Definition of done:
- [ ] The prompt shows: destination host, purpose, data categories, and the field-level preview.
- [ ] Deny is the default focus.
- [ ] The prompt is rendered by the UI but the decision is enforced in the main process.
- [ ] A prompt that is never answered times out to deny.

**C2 — Preview display**

Deliverable: the display-only preview (CL2).

Definition of done:
- [ ] The preview lists fields with paths, categories, and truncated samples (P6-12).
- [ ] **No field-level redaction controls exist in v1** (P6-13).
- [ ] The preview reflects the actual serialized payload (P6-12).
- [ ] Very large payloads are summarized without hiding the categories involved.

**C3 — Decision handling**

Definition of done:
- [ ] **Deny** blocks the request with `consent-denied`.
- [ ] **Send once** sends this request only; the next identical request prompts again.
- [ ] **Always allow for this scope** stores a persistent grant with the exact approved categories
      (P6-7).
- [ ] Every decision writes an audit entry.

**C4 — Personal-data gate**

Definition of done:
- [ ] The first personal-data egress forces a previewed prompt, even if the scope is `allow`
      (P6-7).
- [ ] "Always allow" records `dataConsent` plus the exact categories approved.
- [ ] A request carrying a **new category** invalidates consent and re-prompts (P6-8).
- [ ] `revokePersonalData` returns the scope to prompting (P6-10).

---

### Group 4 — Revocation (Flow C)

**D1 — Grant listing**

Definition of done:
- [ ] All grants are listed with scope, mode, personal-data status, categories, and host
      narrowing.
- [ ] Revoking any grant is reachable from the list.
- [ ] Session grants are visually distinguished from persistent ones.
- [ ] The list reflects the consent store, not a cached copy.

**D2 — Personal-data revocation**

Definition of done:
- [ ] `revokePersonalData(scope)` clears only the personal-data grant, leaving the scope record
      intact (P6-10).
- [ ] After revocation, the next personal-data request prompts again (P6-10).
- [ ] Revocation is one click from where the persistent indicator is shown.
- [ ] Revocation is audited.

**D3 — Immediate effect**

Definition of done:
- [ ] Revocation takes effect on the next request with no restart (P6-11).
- [ ] An in-flight request is not retroactively cancelled, but no new one proceeds (P6-11).
- [ ] No cache can serve a revoked grant (test D3-T1).
- [ ] The activity view reflects the revocation.

---

### Group 5 — Activity view (Flow D)

**E1 — Activity list**

Definition of done:
- [ ] Lists egress attempts with timestamp, host, purpose, decision, categories, result, and
      duration (P6-22).
- [ ] Denied attempts appear alongside granted ones (P6-22).
- [ ] Entries come from the S0.1 audit log, not a separate record.
- [ ] Entries never contain bodies or credentials (P6-26).

**E2 — Filtering**

Definition of done:
- [ ] Filter by scope and by decision.
- [ ] Filtering is deterministic and does not reorder within a filter.
- [ ] The summary counters (`requests`, `denied`, `lastAt`) match the filtered view.
- [ ] Large logs are paginated.

**E3 — Clearing**

Definition of done:
- [ ] The user can clear the activity log.
- [ ] Clearing is itself recorded.
- [ ] Clearing the egress log does not clear action or memory audit categories.
- [ ] The confirmation states what is and is not affected.

**E4 — Retention**

Definition of done:
- [ ] Retention follows the S0.1 configurable window (default 30 days) (ties to S0.1 F4).
- [ ] Pruning is auditable.
- [ ] The current retention setting is visible in the activity view.
- [ ] Changing retention takes effect on the next prune.

---

### Group 6 — Verification

**F1 — Test doubles**

Definition of done:
- [ ] The gateway's fake egress target drives all consent tests (S0.1 G1).
- [ ] A scripted consent channel can return each decision and a timeout.
- [ ] A synthetic renderer cannot forge a decision.
- [ ] Tests run offline and deterministically.

**F2 — P6-2 / P6-3: defaults**

Definition of done:
- [ ] P6-2 passes: cloud is off until explicitly enabled.
- [ ] P6-3 passes: every cloud scope defaults to `ask`.

**F3 — P6-4 / P6-5: enablement**

Definition of done:
- [ ] P6-4 passes: enabling inference does not enable voice.
- [ ] P6-5 passes: enablement shows what leaves the device before any request.

**F4 — P6-6 / P6-7 / P6-8: consent**

Definition of done:
- [ ] P6-6 passes: the default path prompts with a truthful preview.
- [ ] P6-7 passes: first personal-data egress forces a previewed prompt.
- [ ] P6-8 passes: a new category re-prompts; consent does not silently widen.

**F5 — P6-9 / P6-10 / P6-11: revocation**

Definition of done:
- [ ] P6-9 passes: a persistent indicator is visible while personal-data egress is active.
- [ ] P6-10 passes: one-click revoke returns the scope to prompting.
- [ ] P6-11 passes: revocation is immediate, with no restart.

**F6 — P6-13: display-only**

Definition of done:
- [ ] P6-13 passes: no field-level redaction controls exist in v1.
- [ ] The preview is present and accurate despite being display-only.

**F7 — P6-22 / P6-23 / P6-26: activity and disable**

Definition of done:
- [ ] P6-22 passes: every egress is listed with decision, categories, and result.
- [ ] P6-23 passes: disabling cloud returns to fully local with no residual calls.
- [ ] P6-26 passes: the log contains host/path/categories/hash, never bodies or keys.

---

## 3. Dependency notes

| Task | Requires | Enables |
|---|---|---|
| A1 | S0.1-C1/C2 | A2, A3 |
| A2 | A1 | B1, F2 |
| A3 | A1 | B3, F3 |
| B1 | A2 | B2 |
| B2 | B1 | B3, F3 |
| B3 | B2, A3 | B4, F3 |
| B4 | B3, S0.1-D1 | — |
| C1 | B3, S0.1-D1 | C2, C3 |
| C2 | C1, S0.1-D3 | F6 |
| C3 | C1, A3 | C4, F4 |
| C4 | C3, S0.1-D5 | D2, F4 |
| D1 | A3, C3 | D2 |
| D2 | D1, C4 | F5 |
| D3 | D2, S0.1-C2 | F5 |
| E1 | S0.1-F1/F2 | E2, F7 |
| E2 | E1 | F7 |
| E3 | E1 | — |
| E4 | E1, S0.1-F4 | — |
| F1 | S0.1-G1, C1 | F2–F7 |
| F2 | F1, A2, B1 | — |
| F3 | F1, A3, B2, B3 | — |
| F4 | F1, C3, C4 | — |
| F5 | F1, D2, D3 | — |
| F6 | F1, C2 | — |
| F7 | F1, E1, B1 | — |

Parallel opportunities: Group 5 (activity view) is independent of Groups 2–4 and can be built early
against the gateway. Group 4 (revocation) can proceed alongside Group 3 (per-request consent).

---

## 4. Slice-level Definition of Done

S6.1 is complete when **all** of the following hold:

- [ ] Cloud is off until explicitly enabled (P6-2).
- [ ] Every cloud scope defaults to `ask` (P6-3).
- [ ] Enabling inference does not enable voice (P6-4).
- [ ] Enablement shows what leaves the device before any request (P6-5).
- [ ] The per-request prompt is the default path and shows a truthful preview (P6-6).
- [ ] First personal-data egress forces a previewed prompt (P6-7).
- [ ] A new category re-prompts; consent does not silently widen (P6-8).
- [ ] A persistent indicator is visible while personal-data egress is active (P6-9).
- [ ] One-click revoke returns a scope to prompting (P6-10).
- [ ] Revocation is immediate with no restart (P6-11).
- [ ] No field-level redaction controls exist in v1 (P6-13).
- [ ] The activity view lists every egress with decision, categories, and result (P6-22).
- [ ] Disabling cloud returns to fully local with no residual calls (P6-23).
- [ ] All tests run offline against the gateway test double.

---

## 5. Risks and unknowns for this slice

| Risk | Impact | Mitigation |
|---|---|---|
| A scope defaults to `allow` | Silent egress on first use | Ask-each-time default asserted (A2, F2) |
| Personal-data consent silently widens | "Always allow" becomes "allow everything" | Category-bound consent; re-prompt on a new category (C4, F4) |
| Renderer can forge a decision | Consent gate defeated | Main-process enforcement; nonce (C1, F1) |
| Revoked grant served from a cache | Revocation ineffective | No caching; immediate effect (D3, F5) |
| Preview understates what is sent | Consent is not informed | Preview computed from the payload; accuracy asserted (C2) |
| Prompt timeout leaves the request pending | Unexpected later egress | Timeout denies (C1) |
| Activity view mixes audit categories | Clearing egress also clears actions | Category separation in clearing (E3) |
| Persistent indicator absent | User unaware egress is active | Indicator required while personal data flows (C4, F5) |

---

## 6. Traceability

| Phase 6 reference / test | Covered by |
|---|---|
| §2 `CloudConsentUI`, `CloudConsentState` | A1, A3 |
| §2.1 Default consent mode (CL1) | A2 |
| §2.2 Flow A — first-time enablement | B1–B4 |
| §2.3 Flow B — per-request consent | C1–C4 |
| §2.4 Flow C — revocation | D1–D3 |
| §2.5 Flow D — activity view | E1–E4 |
| §2.6 Personal-data policy | C4 |
| §3 Preview display-only (CL2) | C2 |
| P6-2 Cloud default | B1, F2 |
| P6-3 Default mode | A2, F2 |
| P6-4 Per-scope enablement | A3, F3 |
| P6-5 Disclosure | B2, F3 |
| P6-6 Per-request consent | C1, F4 |
| P6-7 Personal-data gate | C4, F4 |
| P6-8 Category-bound consent | C4, F4 |
| P6-9 Persistent indicator | C4, F5 |
| P6-10 One-click revoke | D2, F5 |
| P6-11 Revocation immediacy | D3, F5 |
| P6-13 Display-only | C2, F6 |
| P6-22 Activity view | E1, F7 |
| P6-23 Disable cloud | B1, F7 |
| P6-26 Audit privacy | E1, F7 |

S6.1 output (consent state, flows, activity view) is consumed by S6.2 (cloud providers require
consent to function) and S6.3 (end-to-end privacy verification).
