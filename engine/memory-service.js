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
  const SUMMARY_LABEL = 'Past conversation';

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
      // Identity facts (name, people) are always included regardless of
      // similarity — who the user IS should always be available to the model.
      const alwaysInclude = fact.category === 'name' || fact.category === 'people';
      if (!alwaysInclude && similarity < minSimilarity) continue;
      const score = alwaysInclude
        ? Number.MAX_SAFE_INTEGER // pin identity facts to the top
        : similarity * recencyScore(fact.createdAt, nowMs) * (fact.confidence ?? 1);
      scored.push({ fact, similarity, score, alwaysInclude });
    }
    // Score summaries (similarity x recency; no confidence factor).
    const scoredSummaries = [];
    if (summariesStore) {
      for (const summary of summariesStore.list()) {
        let vector = summary.embedding ? Float32Array.from(summary.embedding) : null;
        if (!vector) {
          vector = await emb.embed(summary.content);
          try { summariesStore.setSummaryEmbedding && summariesStore.setSummaryEmbedding(summary.id, vector); } catch { /* non-fatal */ }
        }
        const similarity = cosine(queryVector, vector);
        if (similarity < minSimilarity) continue;
        const score = similarity * recencyScore(summary.createdAt, nowMs);
        scoredSummaries.push({ summary, similarity, score });
      }
      scoredSummaries.sort((a, b) => (b.score - a.score) || (a.summary.id < b.summary.id ? -1 : 1));
    }

    // Deterministic ordering: score desc, then id asc.
    scored.sort((a, b) => (b.score - a.score) || (a.fact.id < b.fact.id ? -1 : 1));

    // Budget-aware selection. Each line is labeled by category so the model
    // knows WHAT each fact refers to (e.g. user's name vs. user's friend) —
    // bare unlabeled facts cause identity confusion.
    const CATEGORY_LABELS = {
      name: "User's name",
      people: 'Person in the user\'s life',
      preference: 'User likes',
      dislike: 'User dislikes',
      fact: 'About the user',
      goal: 'User wants to'
    };
    function formatFact(fact) {
      const label = CATEGORY_LABELS[fact.category] || 'About the user';
      return '- ' + label + ': ' + fact.content;
    }
    const selected = [];
    let usedTokens = 0;
    for (const item of scored) {
      if (selected.length >= topK) break;
      const line = formatFact(item.fact);
      const cost = estimateTokens(line);
      if (usedTokens + cost > tokenBudget) continue;
      selected.push(item);
      usedTokens += cost;
    }

    // Budget-aware selection of summaries (after facts; facts are higher value).
    const selectedSummaries = [];
    for (const item of scoredSummaries) {
      const line = '- ' + SUMMARY_LABEL + ': ' + item.summary.content;
      const cost = estimateTokens(line);
      if (usedTokens + cost > tokenBudget) continue;
      selectedSummaries.push(item);
      usedTokens += cost;
    }

    const lines = [
      ...selected.map(i => formatFact(i.fact)),
      ...selectedSummaries.map(i => '- ' + SUMMARY_LABEL + ': ' + i.summary.content)
    ];
    const memoryBlock = lines.length
      ? 'What you remember about the user (use these to answer accurately; do not confuse the user with people they mention):\n' + lines.join('\n')
      : '';

    return {
      facts: selected.map(i => ({ ...i.fact, similarity: i.similarity, score: i.score })),
      summaries: selectedSummaries.map(i => ({ ...i.summary, similarity: i.similarity, score: i.score })),
      recentTurns: [], // populated by the caller (current conversation)
      tokenEstimate: usedTokens,
      memoryBlock
    };
  }

  return { retrieve };
}

module.exports = { createMemoryService, estimateTokens, cosine, recencyScore };
