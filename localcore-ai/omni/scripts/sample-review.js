// Omni distillation pipeline, stage 3: sample-review.
// Pulls a random sample of a curated dataset into data/review/ for human review,
// and flips the dataset manifest to reviewed:true once --approve is given.
//
// Usage:
//   npm run omni:review                          (sample 5% of persona_sft_v1)
//   node sample-review.js --dataset persona_sft_v1 --rate 0.05
//   node sample-review.js --dataset persona_sft_v1 --approve
const fs = require('fs');
const path = require('path');

const OMNI_ROOT = path.join(__dirname, '..');
const GENERATED_DIRECTORY = path.join(OMNI_ROOT, 'data', 'generated');
const MANIFESTS_DIRECTORY = path.join(OMNI_ROOT, 'data', 'manifests');
const REVIEW_DIRECTORY = path.join(OMNI_ROOT, 'data', 'review');

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function main() {
  const dataset = argValue('--dataset') || 'persona_sft_v1';
  const manifestPath = path.join(MANIFESTS_DIRECTORY, dataset + '.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('No manifest for dataset "' + dataset + '". Run "npm run omni:curate" first.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (process.argv.includes('--approve')) {
    const reviewPath = path.join(REVIEW_DIRECTORY, dataset + '-review.jsonl');
    if (!fs.existsSync(reviewPath)) {
      throw new Error('No review sample found for "' + dataset + '". Run without --approve first and review the sample.');
    }
    manifest.reviewed = true;
    manifest.reviewedAt = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('Dataset "' + dataset + '" marked reviewed:true in ' + manifestPath);
    return;
  }

  const dataPath = path.join(GENERATED_DIRECTORY, dataset + '.jsonl');
  if (!fs.existsSync(dataPath)) {
    throw new Error('No curated data for dataset "' + dataset + '". Run "npm run omni:curate" first.');
  }
  const rate = Math.min(1, Math.max(0.01, Number(argValue('--rate')) || 0.05));
  const lines = fs.readFileSync(dataPath, 'utf8').split(/\r?\n/).filter(line => line.trim());
  const sampleSize = Math.max(1, Math.ceil(lines.length * rate));
  const indices = new Set();
  while (indices.size < Math.min(sampleSize, lines.length)) {
    indices.add(Math.floor(Math.random() * lines.length));
  }
  fs.mkdirSync(REVIEW_DIRECTORY, { recursive: true });
  const reviewPath = path.join(REVIEW_DIRECTORY, dataset + '-review.jsonl');
  const sample = [...indices].sort((a, b) => a - b).map(index => {
    const record = JSON.parse(lines[index]);
    return JSON.stringify({ reviewIndex: index, ...record });
  });
  fs.writeFileSync(reviewPath, sample.join('\n') + '\n');
  console.log('Wrote ' + sample.length + ' of ' + lines.length + ' conversations (' + Math.round(rate * 100) + '%) to:');
  console.log('  ' + reviewPath);
  console.log('Read them. If the voice is right, approve the dataset:');
  console.log('  node localcore-ai/omni/scripts/sample-review.js --dataset ' + dataset + ' --approve');
}

try {
  main();
} catch (error) {
  console.error('Review sampling failed: ' + error.message);
  process.exitCode = 1;
}
