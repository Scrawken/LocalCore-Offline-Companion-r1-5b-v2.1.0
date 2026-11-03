/**
 * MiniLM Embedder — Phase 2 S2.1
 *
 * Local, CPU-only sentence embeddings via all-MiniLM-L6-v2 (quantized ONNX,
 * 384-dim). Runs in-process through onnxruntime-node. No network access at
 * runtime — the model and vocab are installed by scripts/setup-embedder.js.
 *
 * Includes a minimal BERT WordPiece tokenizer (vocab.txt driven) so no Python
 * or transformers.js dependency is needed.
 *
 * Usage:
 *   const embedder = createEmbedder();
 *   const vector = await embedder.embed('some text'); // Float32Array(384), L2-normalized
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODEL_PATH = path.join(ROOT, 'models', 'embeddings', 'minilm-l6-v2_quint8_avx2.onnx');
const VOCAB_PATH = path.join(ROOT, 'models', 'embeddings', 'vocab.txt');
const MAX_TOKENS = 128;
const EMBEDDING_DIM = 384;

// --- WordPiece tokenizer (BERT) ------------------------------------------------

const SPECIAL = { CLS: '[CLS]', SEP: '[SEP]', UNK: '[UNK]', PAD: '[PAD]' };

function loadVocab(vocabPath) {
  const lines = fs.readFileSync(vocabPath, 'utf8').split(/\r?\n/).filter(l => l.length);
  const tokenToId = new Map();
  lines.forEach((token, index) => tokenToId.set(token, index));
  return tokenToId;
}

function basicTokenize(text) {
  // Lowercase, split on whitespace and punctuation.
  return text
    .toLowerCase()
    .replace(/([^\w\s])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
}

function wordPiece(token, tokenToId, unkId) {
  // Greedy longest-match-first WordPiece.
  const chars = [...token];
  const subTokens = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let found = null;
    while (start < end) {
      let piece = chars.slice(start, end).join('');
      if (start > 0) piece = '##' + piece;
      if (tokenToId.has(piece)) {
        found = piece;
        break;
      }
      end--;
    }
    if (found === null) return [unkId]; // whole token -> UNK
    subTokens.push(tokenToId.get(found));
    start = end;
  }
  return subTokens;
}

function tokenize(text, tokenToId) {
  const clsId = tokenToId.get(SPECIAL.CLS);
  const sepId = tokenToId.get(SPECIAL.SEP);
  const unkId = tokenToId.get(SPECIAL.UNK);
  const ids = [clsId];
  for (const token of basicTokenize(text)) {
    for (const id of wordPiece(token, tokenToId, unkId)) {
      ids.push(id);
      if (ids.length >= MAX_TOKENS - 1) break;
    }
    if (ids.length >= MAX_TOKENS - 1) break;
  }
  ids.push(sepId);
  // Pad to MAX_TOKENS.
  const padId = tokenToId.get(SPECIAL.PAD);
  const attentionMask = ids.map(() => 1);
  while (ids.length < MAX_TOKENS) {
    ids.push(padId);
    attentionMask.push(0);
  }
  return { inputIds: ids, attentionMask };
}

// --- Embedder ------------------------------------------------------------------

function createEmbedder(options = {}) {
  const modelPath = options.modelPath || MODEL_PATH;
  const vocabPath = options.vocabPath || VOCAB_PATH;
  let session = null;
  let tokenToId = null;

  async function ensureLoaded() {
    if (session) return;
    if (!fs.existsSync(modelPath) || !fs.existsSync(vocabPath)) {
      throw new Error('Embedder model or vocab missing. Run "npm run setup:embedder".');
    }
    const ort = require('onnxruntime-node');
    session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
    tokenToId = loadVocab(vocabPath);
  }

  function meanPool(lastHiddenState, attentionMask, seqLen) {
    // lastHiddenState: Float32Array [seqLen * dim]
    const pooled = new Float32Array(EMBEDDING_DIM);
    let count = 0;
    for (let i = 0; i < seqLen; i++) {
      if (!attentionMask[i]) continue;
      for (let d = 0; d < EMBEDDING_DIM; d++) {
        pooled[d] += lastHiddenState[i * EMBEDDING_DIM + d];
      }
      count++;
    }
    if (count > 0) for (let d = 0; d < EMBEDDING_DIM; d++) pooled[d] /= count;
    return pooled;
  }

  function l2Normalize(vec) {
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
    return out;
  }

  return {
    async embed(text) {
      await ensureLoaded();
      const ort = require('onnxruntime-node');
      const { inputIds, attentionMask } = tokenize(String(text), tokenToId);
      const tokenTypeIds = new Array(MAX_TOKENS).fill(0);
      const feeds = {
        input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, MAX_TOKENS]),
        attention_mask: new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, MAX_TOKENS]),
        token_type_ids: new ort.Tensor('int64', BigInt64Array.from(tokenTypeIds.map(BigInt)), [1, MAX_TOKENS])
      };
      const results = await session.run(feeds);
      const output = results[Object.keys(results)[0]];
      const pooled = meanPool(output.data, attentionMask, MAX_TOKENS);
      return l2Normalize(pooled);
    },
    dimension: EMBEDDING_DIM,
    modelPath
  };
}

module.exports = { createEmbedder, EMBEDDING_DIM, MAX_TOKENS };
