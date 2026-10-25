
# LocalCore — Phase 5 Technical Spec: Desktop Tools with Permissions (v1.1, final)

Scope: the tool registry with declared scopes, the Action Broker, the approval UX showing exact
target/command/diff, scoped filesystem roots, and the audit log.

Depends on Phase 0 (Permission & Consent, Audit log, app-data layout) and Phase 1 (ChatEngine).
Supersedes v1.0. Extends the Permission service with action scopes.

Governing principle: **the model can propose actions but can never authorize them.**

---

## 0. Decisions locked in this spec

| # | Decision | Choice |
|---|---|---|
| T1 | v1 tool set | **Files + clipboard** (no shell, no screen in the default set) |
| T2 | Shell | **Opt-in capability, full shell, always per-action approval** |
| T3 | Delete | **Quarantine by default, recoverable** |
| T4 | Undo | **Ships in v1** for reversible actions |
| T5 | Model access | **Read-only tools on by default; write/delete require enabling** |

Invariants:
- **Every consequential action crosses the Action Broker.** No tool executes directly.
- **Deny by default.** No granted scope means no action.
- **The model is untrusted input.** A model-proposed action is never auto-authorized.
- **Approval shows the exact effect** — target path, command, or diff — never a paraphrase.
- **Destructive actions are never persistently auto-approved.**
- **Filesystem access is confined to user-granted roots**, with traversal and symlink escapes
  rejected.
- **Revocation is immediate.**
- **Every action is audited**, approved or denied.

---

# 1. Component overview

    Model / UI / automation
            |
            v
      ActionBroker  <-- ToolPermissionService (scopes, roots, grants, capability tiers)
        |      \
        |       +--> ApprovalUI (main-process-enforced)
        |
        +--> ToolRegistry --> Tool.execute(ToolContext with scoped handles)
        |
        +--> ActionAuditLog

---

# 2. Tool registry & declared scopes

## 2.1 Scope vocabulary

    type ToolScope =
      | "fs:read" | "fs:write" | "fs:delete" | "fs:move"
      | "shell:execute"           // defined but NOT shipped in v1 (see §9)
      | "process:launch"          // defined but not shipped in v1
      | "clipboard:read" | "clipboard:write"
      | "screen:capture"          // defined but not shipped in v1
      | "app:control"
      | "network:external";       // still routed through the Egress Gateway

    type RiskLevel = "low" | "moderate" | "high" | "destructive";

## 2.2 Tool definition

    interface ToolDefinition {
      id: string;
      name: string;
      description: string;
      version: string;
      scopes: ToolScope[];
      inputSchema: JSONSchema;
      risk: RiskLevel;
      reversible: boolean;
      dryRun(input: unknown): Promise<ActionPreview>;   // REQUIRED
      execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
    }

    interface ToolContext {
      fs?: ScopedFileSystem;            // scoped handles only
      signal: AbortSignal;
      auditId: string;
    }

    interface ToolRegistry {
      register(tool: ToolDefinition): void;
      get(id: string): ToolDefinition | undefined;
      list(): ToolDefinition[];
    }

Rules:
- `dryRun` is mandatory; a tool that cannot describe its exact effect cannot be registered.
- `inputSchema` is validated before `dryRun` and again before `execute`.
- A tool receives only scoped handles for its declared scopes, never raw OS access.

---

# 3. Scoped filesystem roots

    interface FsRoot { path: string; mode: "read" | "read-write"; }

    interface ScopedFileSystem {
      read(path: string): Promise<Buffer>;
      write(path: string, data: Buffer): Promise<void>;
      list(path: string): Promise<DirEntry[]>;
      move(from: string, to: string): Promise<void>;
      delete(path: string): Promise<void>;      // quarantine
      restore(quarantineId: string): Promise<void>;
    }

Enforcement:
- **Root confinement:** every path is canonicalized and must resolve inside a granted root.
- **Traversal rejection:** `..` escapes are rejected, not normalized away.
- **Symlink resolution:** the **final target** must be inside a root; a symlink pointing outside is
  rejected.
- **Read-only roots:** write/move/delete rejected.
- **Protected paths:** app-data secrets, OS directories, and other system locations are deny-listed
  even under a broad root.
- **Windows path quirks** (case-insensitivity, UNC, junctions) normalized before the containment
  check.

Roots are user-configured; the app never grants a root on its own.

---

# 4. Action Broker

    interface ActionBroker {
      invoke(req: ActionRequest): Promise<ActionResult>;
      preview(req: ActionRequest): Promise<ActionPreview>;
      cancel(actionId: string): Promise<void>;
    }

    interface ActionRequest {
      toolId: string;
      input: unknown;
      origin: "user" | "model" | "automation";
      conversationId?: string;
      turnId?: string;
    }

    interface ActionPreview {
      toolId: string;
      summary: string;
      exactTarget: string;              // full file path / URL / resource
      command?: string;                 // exact shell command, if any
      diff?: DiffPreview;               // for file writes/edits
      effects: string[];                // explicit consequences
      risk: RiskLevel;
      reversible: boolean;
      requiresApproval: boolean;
      scopeUsed: ToolScope[];
    }

    interface DiffPreview {
      kind: "create" | "modify" | "delete" | "move";
      unifiedDiff?: string;
      beforeSize?: number;
      afterSize?: number;
      preview?: string;
    }

    interface ActionResult {
      status: "executed" | "denied" | "cancelled" | "failed" | "pending-approval";
      output?: unknown;
      error?: string;
      auditId: string;
      undoRef?: string;
    }

## 4.1 Broker flow

1. Validate `input` against `inputSchema`.
2. Check every declared scope is granted; otherwise return `denied`.
3. Run `dryRun` to produce an `ActionPreview`.
4. Determine approval requirement from risk, scope, origin, and standing grants.
5. If required, present the approval UI (main-process-enforced); **timeout defaults to deny**.
6. On approval, build `ToolContext` with scoped handles and call `execute`.
7. Record the action and result in the audit log.

## 4.2 Approval determination

| Condition | Approval |
|---|---|
| `low`/`moderate` risk, matching **same-origin** standing grant | May run under the grant |
| `low`/`moderate` risk, no matching grant | Approval required |
| `high` risk, origin `user`, matching user-origin grant | May run under the grant |
| `high` risk, origin `model` or `automation` | **Always fresh per-action approval** |
| `destructive` risk, any origin | **Always fresh per-action approval; never a standing grant** |
| Scope not granted | Denied outright |

**Origin matching (resolves an earlier ambiguity).** A standing grant is scoped to
(tool, scope, root) **and origin**, and applies only to actions of the origin it was created under.
A grant the user created while performing their own action therefore **never** covers a
model-proposed action. Only the user can create a grant, and only in response to a prompt that
displayed the origin. The model can never create, widen, or reuse one.

---

# 5. Approval UX

The dialog shows, verbatim:
- **Exact target** — full path, URL, or resource.
- **Exact command** — for shell/process actions, the literal command line.
- **Diff** — unified diff for modifications; content/size preview for create/delete.
- **Effects** — explicit bullets ("overwrites 1 file", "moves 3 files").
- **Risk and reversibility.**
- **Scope used.**

Controls:
- **Deny** (default focus), **Allow once**, **Allow for session**, **Always allow** (scoped).
- **Always allow is bounded:** per tool + per scope + per root **+ origin**, category-bound,
  recorded as a grant and listed in permissions. A grant applies only to actions of the origin it
  was created under.
- **The dialog always displays the origin** (`user`, `model`, or `automation`), so the user knows
  whether they are approving their own action or a model-proposed one.
- **`high`-risk model-origin actions always prompt** and cannot be covered by a standing grant.
- **`destructive` actions are never covered by a standing grant**, for any origin.
- **Destructive actions** cannot be "always allowed"; per-action confirmation with a distinct
  affordance.
- **Enforced in the main process.** The renderer displays the dialog but cannot auto-approve; the
  decision carries a per-request nonce validated in the main process.
- **Timeout defaults to deny.**

---

# 6. Permission model, capability tiers & revocation

## 6.1 Capability tiers (per T5)

| Tier | Default | Provides | Additional gates |
|---|---|---|---|
| Read-only | **On** | `fs:read` tools | Granted roots still required |
| Write | Off — user enables | `fs:write`, `fs:move` | Roots + approval |
| Delete | Off — user enables | `fs:delete` (quarantine) | Roots + always per-action |
| Clipboard | Off — user enables | `clipboard:read`, `clipboard:write` | Approval |
| Shell | **Not shipped in v1** | — | Adding it requires OS-level network containment (see §9) |
| Screen | Not shipped in v1 | — | — |

- Read-only tools are available to the model by default, **but only within user-granted roots** —
  the roots remain the gate even for reads.
- Write, delete, and clipboard require explicit enablement in addition to roots and approval.
- Enabling a tier is a user action, never a model action.

## 6.2 Service

    interface ToolPermissionService {
      request(toolId: string, scopes: ToolScope[], context: RequestContext): Promise<PermissionDecision>;
      grant(grant: PermissionGrant): Promise<void>;
      revoke(grantId: string): Promise<void>;
      list(): PermissionGrant[];
      setTier(tier: CapabilityTier, enabled: boolean): Promise<void>;
      getTiers(): Record<CapabilityTier, boolean>;
      setRoots(roots: FsRoot[]): Promise<void>;
      getRoots(): FsRoot[];
    }

    interface PermissionGrant {
      id: string;
      toolId: string;                   // or "*" for a tool family
      scopes: ToolScope[];
      roots?: string[];
      mode: "session" | "persistent";
      grantedAt: number;
      expiresAt?: number;
      categoryBound: true;              // widening invalidates the grant
    }

- **Modes:** ask-always, once-per-session, always-allow, deny.
- **Category-bound:** a later action needing an uncovered scope or root invalidates the grant and
  re-prompts.
- **Revocation is immediate:** next action denied. In-flight actions cancelled where supported;
  otherwise they complete and are logged, and no further actions proceed.

---

# 7. Audit log

    interface ActionAuditEntry {
      auditId: string;
      timestamp: number;
      toolId: string;
      origin: "user" | "model" | "automation";
      conversationId?: string;
      turnId?: string;
      scopeUsed: ToolScope[];
      exactTarget: string;
      command?: string;
      decision: "approved" | "denied" | "cancelled" | "auto-approved";
      approvalMode: "once" | "session" | "always" | "policy" | "n/a";
      result: "success" | "failure" | "partial";
      error?: string;
      bytesAffected?: number;
      reversible: boolean;
      undoRef?: string;
      durationMs: number;
    }

- Append-only, encrypted at rest, user-viewable, clearable.
- Shares the Phase 0 audit infrastructure, distinguished by category (`egress` / `action` / `memory`).
- Every action, approved or denied, produces exactly one entry with a matching result.

---

# 8. Safety properties

## 8.1 Prompt injection defense
- Tool results and retrieved memory are **untrusted data, never instructions**.
- Model-proposed actions always cross the Broker and the approval gate.
- No tool can be invoked from memory, transcripts, or tool output — only from the chat turn, the UI,
  or an explicit user-configured automation.
- Consequential actions require approval regardless of origin.

## 8.2 Reversibility & quarantine (per T3, T4)
- Reversible actions (write with backup, move) record an `undoRef`; **undo ships in v1**.
- **Deletes are quarantined**: the target moves into an app-data quarantine with a retention
  window, recoverable via `restore(quarantineId)`.
- Permanent deletion is a separate, explicitly destructive action, never persistently auto-approved.

## 8.3 No self-authorization
- The model cannot grant itself scopes, enable a tier, widen a root, or approve its own action.
- Approval decisions are validated in the main process with a nonce the renderer cannot forge.
- **A standing grant is a user pre-authorization, not a model authorization.** Grants are
  origin-matched and can only be created by the user in response to a prompt. A model-origin action
  can therefore never reuse a grant the user created for their own actions.
- `high`-risk model-origin actions and all `destructive` actions always require fresh per-action
  approval.

---

# 9. v1 tool set (per T1)

**Shipped and available by default (read-only tier):**

| Tool | Scopes | Risk | Reversible | Approval |
|---|---|---|---|---|
| List directory | `fs:read` | low | n/a | standing grant ok |
| Read file | `fs:read` | low | n/a | standing grant ok |
| Search files (name/content) | `fs:read` | low | n/a | standing grant ok |

**Shipped but requiring enablement:**

| Tool | Scopes | Risk | Reversible | Approval |
|---|---|---|---|---|
| Write/create file | `fs:write` | high | yes (backup) | per action or scoped grant |
| Move/rename | `fs:move` | high | yes | per action or scoped grant |
| Delete file (quarantine) | `fs:delete` | destructive | yes (quarantine) | always per action |
| Clipboard read/write | `clipboard:*` | moderate | no | per action or session |
| Open URL | `app:control` | moderate | no | per action or session |

**Not shipped in v1:** screen capture, and **shell execution**.

Notes:
- `network:external` tools route through the Egress Gateway and inherit its consent rules.
- **Shell is excluded from v1.** A shell can spawn arbitrary child processes that open sockets, and
  neither approval nor command inspection can prevent that. Enforceable containment — running the
  entire shell process tree inside an AppContainer or equivalent with no network capability — would
  break legitimate local commands and is a substantial capability in its own right. Because the
  single-egress path is the product's core invariant, shell is excluded rather than shipped with an
  unverifiable claim.
- **Adding shell later** requires, as a separately gated capability: OS-level network containment of
  the entire shell process tree; a distinct consent scope for shell network access; and verification
  that no unapproved egress occurs. Until then, `shell:execute` is defined but not shipped.

---

# 10. Acceptance tests

| # | Test | Expected |
|---|---|---|
| P5-1 | Unapproved action | Blocked, not executed, surfaced |
| P5-2 | Exact target shown | Full path/URL, not a paraphrase |
| P5-3 | Exact command shown | Literal command line for shell |
| P5-4 | Diff shown | Unified diff for modify; preview for create/delete |
| P5-5 | Allow once | Executes once; next prompts again |
| P5-6 | Allow session | Valid for session; cleared on quit |
| P5-7 | Always allow | Scoped per tool+scope+root; listed; revocable |
| P5-8 | Grant widening | New scope/root invalidates grant and re-prompts |
| P5-9 | Destructive | Never persistently auto-approved |
| P5-10 | Revocation | Next action denied immediately; in-flight handled and logged |
| P5-11 | Audit completeness | One matching entry per action, approved or denied |
| P5-12 | Path traversal | `..` escapes rejected |
| P5-13 | Symlink escape | Symlink outside a root rejected |
| P5-14 | Read-only root | Writes rejected |
| P5-15 | Protected paths | Secrets/system dirs denied under a broad root |
| P5-16 | Quarantine | Deletes recoverable within retention |
| P5-17 | Undo | Reversible actions expose a working undo |
| P5-18 | Model origin | Model-proposed action always crosses the approval gate |
| P5-19 | Injection | Memory/tool output cannot trigger an action |
| P5-20 | Timeout | Approval timeout results in denial |
| P5-21 | Renderer forgery | Renderer cannot auto-approve; nonce validated in main |
| P5-22 | Shell excluded | `shell:execute` is not shipped; no shell tool can be registered in v1 |
| P5-23 | Read-only default | Read tools work by default within granted roots |
| P5-24 | Write gating | Write/delete tools denied until the user enables the tier |
| P5-25 | Tier is user-only | The model cannot enable a tier |
| P5-26 | Schema validation | Invalid input rejected before dryRun and execute |
| P5-27 | dryRun required | A tool without dryRun cannot be registered |

---

# 11. Status

All Phase 5 decisions are locked (T1–T5). No open items remain. The spec is ready to implement on
top of Phases 0–4.
</Artifact>

Two things worth holding onto:

**The capability-tier gate is what makes "read-only by default" meaningful.** It isn't enough that write tools require approval — a user who never enables the write tier should never see a write approval prompt at all, because the tool simply isn't available. That keeps the default surface small and makes the model's action vocabulary reflect what the user has actually opened up.

**The filesystem root grant remains the primary gate even for reads.** Read-only tools being on by default could sound like the companion can browse the machine; it can't. It can read only inside folders the user explicitly granted, and the containment rules (traversal, symlink, protected paths) hold for reads exactly as they do for writes.

You now have six implementation-ready specs: Phase 0 (guardrails), Phase 1 (character & chat), Phase 2 (memory), Phase 3 (voice), Phase 4 (avatar), and Phase 5 (desktop tools). Phase 6 (optional cloud & extended presence) is the last one, and it's the one that finally exercises the Egress Gateway's consent UI end to end.