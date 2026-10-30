// Omni distillation pipeline, stage 2: curate.
// Reads raw self-instruct output from data/raw/, applies filters (structure,
// length, persona neverSays contract, PII scrub, exact + near dedup), and writes
// the training file to data/generated/ plus a provenance manifest.
//
// Usage:
//   npm run omni:curate
//   node curate.js --persona <file> --dataset persona_sft_v1 --in data/raw/persona_sft_....jsonl
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OMNI_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(OMNI_ROOT, '..', '..');
const RAW_DIRECTORY = path.join(OMNI_ROOT, 'data', 'raw');
const GENERATED_DIRECTORY = path.join(OMNI_ROOT, 'data', 'generated');
const MANIFESTS_DIRECTORY = path.join(OMNI_ROOT, 'data', 'manifests');

const MIN_ASSISTANT_CHARS = 20;
const MAX_CONVERSATION_CHARS = 8000;
const NEAR_DUP_THRESHOLD = 0.8;

const PII_PATTERNS = [
  { name: 'email', regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '[email]' },
  { name: 'phone', regex: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, replacement: '[phone]' },
  { name: 'url', regex: /https?:\/\/[^\s)"']+/g, replacement: '[url]' },
  { name: 'ip', regex: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, replacement: '[ip]' }
];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function shingles(text, n = 3) {
  const words = normalize(text).split(' ').filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) {
    set.add(words.slice(i, i + n).join(' '));
  }
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function scrubPii(text, hits) {
  let cleaned = text;
  for (const pattern of PII_PATTERNS) {
    cleaned = cleaned.replace(pattern.regex, () => {
      hits[pattern.name] = (hits[pattern.name] || 0) + 1;
      return pattern.replacement;
    });
  }
  return cleaned;
}

function conversationText(messages) {
  return messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');
}

function validateStructure(messages) {
  if (messages.length < 2) return 'too few messages';
  if (messages[0].role !== 'user') return 'does not start with user';
  if (messages[messages.length - 1].role !== 'assistant') return 'does not end with assistant';
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) return 'non-alternating roles';
  }
  return null;
}

function main() {
  const personaPath = argValue('--persona') || path.join(REPO_ROOT, 'localcore-ai', 'personas', 'default.persona.json');
  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf8'));
  const dataset = argValue('--dataset') || 'persona_sft_v1';
  const neverSays = (persona.voice && persona.voice.neverSays || []).map(phrase => phrase.toLowerCase());

  const inputFiles = argValue('--in')
    ? [path.resolve(argValue('--in'))]
    : fs.readdirSync(RAW_DIRECTORY).filter(name => name.endsWith('.jsonl')).map(name => path.join(RAW_DIRECTORY, name));
  if (!inputFiles.length) {
    throw new Error('No raw input found in ' + RAW_DIRECTORY + '. Run "npm run omni:generate" first.');
  }

  const stats = {
    inputs: inputFiles.map(file => path.basename(file)),
    read: 0,
    rejectedStructure: 0,
    rejectedLength: 0,
    rejectedNeverSays: 0,
    rejectedExactDup: 0,
    rejectedNearDup: 0,
    piiHits: {},
    kept: 0
  };
  const seenHashes = new Set();
  const keptShingles = [];
  const kept = [];

  for (const file of inputFiles) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      stats.read++;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        stats.rejectedStructure++;
        continue;
      }
      const messages = record.messages;
      if (!Array.isArray(messages)) {
        stats.rejectedStructure++;
        continue;
      }
      if (validateStructure(messages)) {
        stats.rejectedStructure++;
        continue;
      }
      const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
      const shortestAssistant = Math.min(...messages.filter(m => m.role === 'assistant').map(m => m.content.length));
      if (totalChars > MAX_CONVERSATION_CHARS || shortestAssistant < MIN_ASSISTANT_CHARS) {
        stats.rejectedLength++;
        continue;
      }
      const assistantText = conversationText(messages).toLowerCase();
      if (neverSays.some(phrase => assistantText.includes(phrase))) {
        stats.rejectedNeverSays++;
        continue;
      }
      const hash = crypto.createHash('sha256').update(normalize(conversationText(messages))).digest('hex');
      if (seenHashes.has(hash)) {
        stats.rejectedExactDup++;
        continue;
      }
      const shingleSet = shingles(conversationText(messages));
      if (keptShingles.some(other => jaccard(shingleSet, other) >= NEAR_DUP_THRESHOLD)) {
        stats.rejectedNearDup++;
        continue;
      }
      const scrubbed = messages.map(m => ({ role: m.role, content: scrubPii(m.content, stats.piiHits) }));
      seenHashes.add(hash);
      keptShingles.push(shingleSet);
      kept.push({
        messages: [{ role: 'system', content: persona.systemPrompt }, ...scrubbed],
        source: record.source || 'self_instruct',
        tags: record.tags || []
      });
    }
  }

  stats.kept = kept.length;
  fs.mkdirSync(GENERATED_DIRECTORY, { recursive: true });
  fs.mkdirSync(MANIFESTS_DIRECTORY, { recursive: true });
  const outPath = path.join(GENERATED_DIRECTORY, dataset + '.jsonl');
  fs.writeFileSync(outPath, kept.map(record => JSON.stringify(record)).join('\n') + '\n');

  const manifest = {
    dataset,
    created: new Date().toISOString().slice(0, 10),
    personaId: persona.id,
    sources: [...new Set(kept.map(record => record.source))].map(name => ({
      name,
      license: name === 'self_instruct' ? 'Apache-2.0 (teacher: ' + (argValue('--teacher') || 'qwen2.5-3b-instruct-q4_k_m') + ')' : 'see raw records',
      count: kept.filter(record => record.source === name).length
    })),
    filters: ['structure', 'length', 'persona-neverSays', 'pii-scrub', 'exact-dedup', 'near-dedup(jaccard>=' + NEAR_DUP_THRESHOLD + ')'],
    stats,
    reviewed: false,
    notes: ''
  };
  const manifestPath = path.join(MANIFESTS_DIRECTORY, dataset + '.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log('Curation complete for dataset "' + dataset + '":');
  console.log('  read ' + stats.read + ', kept ' + stats.kept);
  console.log('  rejected: structure ' + stats.rejectedStructure + ', length ' + stats.rejectedLength +
    ', neverSays ' + stats.rejectedNeverSays + ', exact-dup ' + stats.rejectedExactDup + ', near-dup ' + stats.rejectedNearDup);
  const piiSummary = Object.entries(stats.piiHits).map(([name, count]) => name + ' ' + count).join(', ');
  console.log('  PII scrubbed: ' + (piiSummary || 'none'));
  console.log('  Training file: ' + outPath);
  console.log('  Manifest: ' + manifestPath);
  console.log('Next: npm run omni:review');
}

try {
  main();
} catch (error) {
  console.error('Curation failed: ' + error.message);
  process.exitCode = 1;
}
