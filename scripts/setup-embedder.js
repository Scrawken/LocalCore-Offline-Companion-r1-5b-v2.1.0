// Installs the MiniLM embedder for semantic memory retrieval (Phase 2 S2.1).
// sentence-transformers/all-MiniLM-L6-v2, quantized ONNX (CPU, 384-dim), plus its
// WordPiece tokenizer vocab. All files pinned by SHA-256 from the HuggingFace API.
const path = require('path');
const { ensureDownload, sha256 } = require('./setup-local-model.js');

const ROOT = path.join(__dirname, '..');
const REV = 'main';
const BASE = 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/' + REV;

const FILES = [
  {
    name: 'model_quint8_avx2.onnx',
    url: BASE + '/onnx/model_quint8_avx2.onnx',
    sha256: 'b941bf19f1f1283680f449fa6a7336bb5600bdcd5f84d10ddc5cd72218a0fd21',
    bytes: 23046789,
    path: path.join(ROOT, 'models', 'embeddings', 'minilm-l6-v2_quint8_avx2.onnx')
  },
  {
    name: 'vocab.txt',
    url: BASE + '/vocab.txt',
    // Content SHA-256 (HF API oid for non-LFS files is a git blob SHA-1, not content SHA-256).
    sha256: '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3',
    bytes: 231508,
    path: path.join(ROOT, 'models', 'embeddings', 'vocab.txt')
  },
  {
    name: 'tokenizer_config.json',
    url: BASE + '/tokenizer_config.json',
    sha256: 'acb92769e8195aabd29b7b2137a9e6d6e25c476a4f15aa4355c233426c61576b',
    bytes: 350,
    path: path.join(ROOT, 'models', 'embeddings', 'tokenizer_config.json')
  },
  {
    name: 'config.json',
    url: BASE + '/config.json',
    sha256: '953f9c0d463486b10a6871cc2fd59f223b2c70184f49815e7efbcab5d8908b41',
    bytes: 612,
    path: path.join(ROOT, 'models', 'embeddings', 'config.json')
  }
];

async function setup() {
  if (process.platform !== 'win32') {
    throw new Error('The embedder installer currently targets Windows.');
  }
  console.log('Installing MiniLM embedder (all-MiniLM-L6-v2, quantized ONNX, ~23 MB).');
  for (const file of FILES) {
    await ensureDownload(file.url, file.path, file.sha256, file.bytes);
  }
  console.log('Embedder installed and verified.');
}

setup().catch(error => {
  console.error('Embedder setup failed: ' + error.message);
  process.exitCode = 1;
});
