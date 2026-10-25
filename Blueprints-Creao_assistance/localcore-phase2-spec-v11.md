
# LocalCore — Phase 2 Technical Spec: Memory (v1.1, final)

Scope: the four memory layers, the retention/pruning job, and the opt-out transparency controls.

Depends on Phase 0 (Egress Gateway, Resource Governor, app-data layout, encryption) and Phase 1
(turn store, prompt assembly, `seq` ordering). Supersedes v1.0.

---

## 0. Decisions locked in this spec

| # | Decision | Choice |
|---|---|---|
| M1 | Raw-transcript retention | **30 days**, user-adjustable |
| M2 | Pinning | **Supported** — a pinned conversation is exempt from pruning |
| M3 | Fact extraction timing | **After each response, async** (off the critical path) |
| M4 | Embedder | **MiniLM-class ONNX, bundled, CPU-only** |

Phase 2 invariants:
- **No capture before disclosure.** On first run the user sees the memory disclosure before any
  memory write occurs.
- **The transcript layer is the turn store.** No second copy of full transcripts is ever written.
- **Summarize before prune.** Raw turns are deleted only after a verified summary exists.
- **Disabling memory is immediate.** It stops writes and injection without a restart.
- **Every layer is viewable, deletable, and exportable.**
- **Everything is encrypted at rest and never leaves the device.**

---

# 1. The four memory layers

| Layer | Backing store | Lifetime | Encrypted | Used for |
|---|---|---|---|---|
| Session buffer | In-memory only | Current session | n/a | Prompt assembly, recent turns |
| Raw transcripts | **Phase 1 turn store** | Rolling window (30d) unless pinned | Yes | Full-text search, recent context |
| Rolling summaries | Summary store | Long-term until deleted | Yes | Retrieval, long-horizon context |
| Facts | Fact store | Long-term until deleted | Yes | Retrieval, personalization |

## 1.1 Session buffer

- Current session's turns, in memory, for prompt assembly.
- Never persisted beyond what the Phase 1 turn store already writes.
- Cleared on session end; contributes nothing durable.
- Always included in the memory block (subject to budget), because it is the active thread.

## 1.2 Raw transcripts (the turn store)

**The raw transcript layer *is* the Phase 1 turn store.** Phase 2 does not create a parallel
transcript table. Full transcripts are the most sensitive category in the product; writing them
twice would double the exposure surface, the encryption burden, and the retention burden, and
would create two stores that can disagree about what was deleted.

Consequences:
- Retention prunes the Phase 1 turn store, not a copy.
- Search over transcripts covers only turns inside the retention window; older content is reachable
  through summaries.
- Phase 1's "history survives restart" guarantee holds inside the window; beyond it, history is
  represented by summaries plus tombstones.

### Conditional persistence (resolves the opt-out conflict)

Because this layer *is* the Phase 1 turn store, "disabling transcript memory" and "disabling turn
persistence" are the same operation. The rule is:

| Condition | Behaviour |
|---|---|
| Disclosure acknowledged **and** `transcripts` enabled | Turns are persisted; history survives restart |
| Disclosure unacknowledged | **Ephemeral session:** turns live in the session buffer only; nothing is written |
| Memory globally disabled | **Ephemeral session:** turns live in the session buffer only; nothing is written |
| `transcripts` disabled (memory on) | **Ephemeral session for turns;** facts and summaries may still be captured if their categories are enabled |

**Chat always works.** Memory being off never disables conversation — it only means the conversation
is not saved. The session buffer (§1.1) carries the live thread, so the companion stays coherent
within the session; closing it discards the history. The UI must state plainly that history is not
being saved.

This is the same rule stated in Phase 1 §2.5, and it is what the S2.5 capture gate enforces.

## 1.3 Rolling summaries

    interface RollingSummary {
      id: string;
      conversationId: string;
      characterId: string;
      coversFromSeq: number;
      coversToSeq: number;
      content: string;
      createdAt: number;
      tokenCount: number;
      embeddingRef?: string;
    }

- One summary covers a contiguous `seq` range; summaries never overlap.
- Created by the pruning job immediately before the covered raw turns are deleted.
- Kept long-term until deleted.

## 1.4 Facts

    interface Fact {
      id: string;
      characterId: string;
      content: string;                       // e.g. "Prefers concise answers"
      category: "preference" | "identity" | "relationship" | "goal" | "event" | "other";
      sourceTurnIds: string[];               // traceability
      createdAt: number;
      updatedAt: number;
      confidence: number;                    // 0..1
      lastUsedAt?: number;
      userEdited: boolean;                   // protected from auto-overwrite
      embeddingRef?: string;
    }

- The durable, high-signal layer: preferences, identity, relationships, goals, events.
- `sourceTurnIds` gives every fact a traceable origin, exposed in the transparency panel.
- A `userEdited` fact is never silently overwritten; conflicts create a new fact or are surfaced.

## 1.5 Memory block assembly

    interface MemoryContext {
      facts: Fact[];
      summaries: RollingSummary[];
      recentTurns: Turn[];
      tokenEstimate: number;
    }

Assembly order: facts → relevant summaries → recent turns. Budget from Phase 1 §1.5 (floor ≤400,
mid ≤800, high ≤1200). Selection is budget-aware: facts ranked by similarity × recency ×
confidence; summaries by similarity × recency. Over budget → drop lowest-ranked summaries first,
then facts; never drop the persona block or the current user message.

---

# 2. Retention & pruning job

## 2.1 Policy (per M1, M2)

| Layer | Default retention | Configurable |
|---|---|---|
| Session buffer | Session lifetime | No |
| Raw transcripts | **30 days** | Yes, user-adjustable |
| Raw transcripts (pinned conversation) | **Exempt** | Yes, by unpinning |
| Rolling summaries | Until deleted | n/a |
| Facts | Until deleted | n/a |

Pinning is a deliberate override of the retention window. Because it keeps raw transcripts beyond
the default window, the memory panel must show which conversations are pinned and how much raw
transcript they are retaining, so the override is visible rather than hidden.

## 2.2 Job interface

    interface PruningJob {
      run(opts?: { dryRun?: boolean }): Promise<PruneReport>;
      schedule(cron: string): void;
      cancel(): void;
    }

    interface PruneReport {
      startedAt: number;
      finishedAt: number;
      conversationsProcessed: number;
      conversationsSkippedPinned: number;
      turnsSummarized: number;
      turnsPruned: number;
      bytesReclaimed: number;
      skipped: Array<{ reason: string; count: number }>;
      errors: Array<{ ref: string; message: string }>;
    }

Scheduling: on app start and periodically (default every 6 hours); runnable on demand from the
memory panel. Never runs during an active generation; runs as an idle-maintenance pipeline at the
lowest governor priority.

## 2.3 Algorithm (safety-ordered)

For each conversation that is **not pinned** and **not the active session**:

1. Compute the cutoff from the retention window.
2. Find turns older than the cutoff that have not yet been summarized.
3. If none, skip.
4. Summarize the batch into a `RollingSummary` covering `[fromSeq, toSeq]`.
5. **Verify** the summary is persisted and non-empty.
6. Only then delete the raw turn content for that range.
7. Write memory-write-log entries (`summarized`, `pruned`).
8. If summarization fails: **skip the batch, do not prune**, record the error, retry next run.

## 2.4 Safety invariants

- **Summarize before prune, always.** If a summary cannot be produced and verified, the raw turns
  are kept. Losing data to a failed summarization is unacceptable; retaining it is merely late.
- **Tombstones, not silent holes.** After pruning, a minimal tombstone (seq range + summary link)
  keeps the conversation coherent and lets the UI show "earlier conversation summarized."
- **Idempotent and resumable.** Re-running processes only unsummarized, unpruned turns.
- **Never prune the active session.**
- **Never prune a pinned conversation.**
- **Auditable.** Every summarize and prune is recorded in the memory write log.

## 2.5 Resource Governor integration

Summarization, fact extraction, and embedding run at the lowest priority and are deferred while
the LLM is in use, so they never compete with a live conversation. If deferred past a bound, the
job runs later; retention lateness is preferable to interaction latency.

---

# 3. Extraction & summarization pipelines

## 3.1 Fact extraction (per M3)

- Runs **after each response is delivered**, asynchronously, off the critical path.
- Constrained extraction: the model returns a structured schema (candidate facts + category +
  confidence), validated before storage. Small models are weak extractors, so the validator is
  strict and the confidence threshold is enforced.
- Deduplication: near-duplicates are merged or superseded, not accumulated.
- `userEdited` facts are protected from auto-overwrite.
- Deferred by the governor whenever generation is active; the queue is durable across restarts so
  an unprocessed turn is extracted later rather than dropped.

## 3.2 Summarization

- Incremental: a summary covers a contiguous `seq` range and never overlaps another.
- Generated immediately before the covered raw turns are pruned.
- Stored with a token count for budget assembly.

## 3.3 Embeddings (per M4)

- **MiniLM-class ONNX sentence-embedder (all-MiniLM-L6-v2 or equivalent), bundled, CPU-only,
  384-dim.**
- Rationale for the floor tier: it is ~90MB and runs in-process, so it does not load a second model
  into Ollama and therefore does not force a model swap under `OLLAMA_MAX_LOADED_MODELS=1`. It
  occupies no LLM slot and adds no process.
- Classified as a **light** pipeline in the governor (small footprint, short bursts), not a heavy
  one.
- Embeddings stored encrypted alongside the record; deleted with it.
- Used for fact and summary retrieval only.

---

# 4. Opt-out transparency controls

Because memory is on by default, these controls are the safety mechanism, not optional polish.

## 4.1 First-run disclosure (capture gate)
Shown on first run before any memory write. States: memory is on; it stores facts and full
transcripts locally; transcripts are kept 30 days then summarized; here is how to change or
disable it. Capture does not begin until the user acknowledges.

## 4.2 Persistent indicator
Visible at all times while memory is active; reflects enabled categories and recent writes.

## 4.3 Unified memory panel
One panel showing facts, summaries, and raw transcripts. Every fact shows its source turns; every
summary shows its `seq` range; **pinned conversations and their retained transcript volume are
shown explicitly.** Searchable.

## 4.4 Per-layer deletion
Delete a single fact, summary, transcript turn, or whole conversation. Deletion removes the record
**and** its embedding.

## 4.5 One-click wipe-all
Clears every layer within one turn, after one confirmation, and reports what was removed.

## 4.6 Memory write log

    interface MemoryWriteEntry {
      id: string;
      timestamp: number;
      layer: "fact" | "summary" | "transcript";
      action: "created" | "updated" | "deleted" | "pruned" | "summarized" | "pinned" | "unpinned";
      refId: string;
      sourceTurnIds?: string[];
      reason?: string;              // "extracted" | "retention" | "user-delete" | ...
      summaryOfChange?: string;
    }

Append-only, user-viewable, clearable.

## 4.7 Encryption at rest
All layers encrypted via Windows DPAPI / Electron safeStorage; embeddings encrypted with their
records; the key is protected by the OS user context.

## 4.8 Category toggles, global switch, and pinning

    type MemoryCategory = "facts" | "transcripts" | "summaries";

    interface MemoryService {
      enable(): Promise<void>;
      disable(): Promise<void>;                 // immediate: stops writes AND injection
      isEnabled(): boolean;
      setCategoryEnabled(cat: MemoryCategory, enabled: boolean): Promise<void>;

      bufferTurn(turn: Turn): void;
      clearSession(): void;

      retrieve(query: string, opts?: RetrieveOptions): Promise<MemoryContext>;

      listFacts(filter?: FactFilter): Promise<Fact[]>;
      addFact(input: FactInput): Promise<Fact>;
      updateFact(id: string, patch: Partial<Fact>): Promise<Fact>;
      deleteFact(id: string): Promise<void>;

      listSummaries(conversationId?: string): Promise<RollingSummary[]>;
      deleteSummary(id: string): Promise<void>;

      listTranscripts(conversationId: string): Promise<Turn[]>;
      deleteTurn(id: string): Promise<void>;

      setPinned(conversationId: string, pinned: boolean): Promise<void>;
      isPinned(conversationId: string): boolean;
      listPinned(): Promise<string[]>;

      wipeAll(): Promise<WipeReport>;
      export(): Promise<MemoryExport>;
      import(data: MemoryExport): Promise<void>;

      setRetention(days: number): Promise<void>;
      getRetention(): number;
      runPruning(opts?: { dryRun?: boolean }): Promise<PruneReport>;

      writeLog(): Promise<MemoryWriteEntry[]>;
    }

- Global disable stops writes and injection immediately, no restart.
- Category toggles allow, e.g., facts without transcripts.
- Disabled categories are neither written nor returned by `retrieve`.
- **Chat continues as an ephemeral session** when memory is disabled or `transcripts` is off: turns
  stay in the session buffer and are never written (see §1.2). Disabling memory never disables
  conversation.
- Pinning/unpinning is itself logged in the write log.

---

# 5. Acceptance tests

| # | Test | Expected |
|---|---|---|
| P2-1 | First run | Disclosure before any write; no capture until acknowledged |
| P2-2 | Indicator | Visible at all times while memory is active |
| P2-3 | Unified panel | Facts, summaries, transcripts listed with source traces |
| P2-4 | Delete fact | Gone from retrieval within one turn; embedding removed |
| P2-5 | Delete transcript turn | Gone from store and search; embedding removed |
| P2-6 | Wipe-all | All layers cleared within one turn; report accurate |
| P2-7 | Retention aging | Turns past 30 days are summarized then pruned |
| P2-8 | Summarize-before-prune | If summarization fails, raw turns are kept |
| P2-9 | Tombstones | Pruned ranges remain coherent via summary link |
| P2-10 | Idempotent pruning | Re-run after interruption processes only remaining turns |
| P2-11 | Active session | Never pruned |
| P2-12 | Pinned conversation | Exempt from pruning; pin shown in panel with retained volume |
| P2-13 | Unpin | Conversation becomes eligible for pruning on the next run |
| P2-14 | Disable memory | No writes and no injection immediately, no restart; chat continues as an ephemeral session |
| P2-15 | Category toggle | Disabled category neither written nor retrieved |
| P2-16 | Export / import | Round trip restores equivalent retrieval behaviour |
| P2-17 | Encryption at rest | Store and embeddings unreadable without the OS user context |
| P2-18 | Write log | Accurately records all actions incl. pin/unpin with reasons |
| P2-19 | User-edited fact | Never silently overwritten by extraction |
| P2-20 | Budget assembly | Memory block respects tier budget; persona never dropped |
| P2-21 | Governor deferral | Extraction/summarization never concurrent with live generation on floor |
| P2-22 | No duplicate transcripts | Exactly one on-disk copy of transcript content exists |
| P2-23 | Embedder footprint | ONNX embedder loads without evicting the chat model |

---

# 6. Status

All Phase 2 decisions are locked (M1–M4). No open items remain. The spec is ready to implement
on top of Phases 0 and 1.
