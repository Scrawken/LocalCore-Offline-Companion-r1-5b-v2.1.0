/**
 * MemoryService — Phase 2 S2.2 Retrieval & Memory-Block Assembly
 *
 * retrieve(query, opts) → MemoryContext: semantic vector search over facts (and
 * summaries when present), ranked by similarity × recency × confidence, trimmed
 * to a token budget, and formatted into a single memory block for injection into
 * the persona system-prompt seam.
 *
 * Determinism: identical store state + query produce identical output (ties broken
 * by id). No network — embeddings come from the local MiniLM embedder.
 */

const { createEmbedder } = require('./embedder.js');

// Rough token estimate: ~4 chars per token (matches llama-cpp-provider).
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum; // vectors are L2-normalized, so dot == cosine
}

// Recency score: decays with age, floor at 0.2 so old facts still count.
function recencyScore(createdAt, nowMs) {
  const ageDays = (nowMs - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0.2, Math.exp(-ageDays / 30)); // ~30-day half-life feel
}

function createMemoryService({ factsStore, summariesStore = null, embedder = null }) {
  if (!factsStore) throw new Error('MemoryService requires a factsStore.');
  const emb = embedder || createEmbedder();

  /**
   * retrieve(query, opts) → MemoryContext
   * opts: { topK, categories, tokenBudget, minSimilarity }
   */
  async function retrieve(query, opts = {}) {
    const topK = Math.max(1, opts.topK || 8);
    const tokenBudget = opts.tokenBudget || 400;
    const minSimilarity = opts.minSimilarity ?? 0.25;
    const categories = Array.isArray(opts.categories) && opts.categories.length ? new Set(opts.categories) : null;
    const nowMs = Date.now();

    const queryVector = await emb.embed(query);

    // Score facts.
    const facts = factsStore.list()
      .filter(f => !categories || categories.has(f.category));
    const scored = [];
    for (const fact of facts) {
      let vector = fact.embedding ? Float32Array.from(fact.embedding) : null;
      if (!vector) {
        // Lazily embed and persist facts that predate the embedder.
        vector = await emb.embed(fact.content);
        try { factsStore.setFactEmbedding(fact.id, vector); } catch { /* non-fatal */ }
      }
      const similarity = cosine(queryVector, vector);
      if (similarity < minSimilarity) continue;
      const score = similarity * recencyScore(fact.createdAt, nowMs) * (fact.confidence ?? 1);
      scored.push({ fact, similarity, score });
    }
    // Deterministic ordering: score desc, then id asc.
    scored.sort((a, b) => (b.score - a.score) || (a.fact.id < b.fact.id ? -1 : 1));

    // Budget-aware selection.
    const selected = [];
    let usedTokens = 0;
    for (const item of scored) {
      if (selected.length >= topK) break;
      const line = '- ' + item.fact.content;
      const cost = estimateTokens(line);
      if (usedTokens + cost > tokenBudget) continue;
      selected.push(item);
      usedTokens += cost;
    }

    const memoryBlock = selected.length
      ? 'Things you remember about the user:\n' + selected.map(i => '- ' + i.fact.content).join('\n')
      : '';

    return {
      facts: selected.map(i => ({ ...i.fact, similarity: i.similarity, score: i.score })),
      summaries: [], // populated when a summaries store is wired (S2.4)
      recentTurns: [], // populated by the caller (current conversation)
      tokenEstimate: usedTokens,
      memoryBlock
    };
  }

  return { retrieve };
}

module.exports = { createMemoryService, estimateTokens, cosine, recencyScore };
