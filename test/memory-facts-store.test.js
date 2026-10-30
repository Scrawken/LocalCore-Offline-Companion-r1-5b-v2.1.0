const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMemoryFactsStore } = require('../electron/memory-facts-store.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-facts-test-'));

(async () => {
  const store = createMemoryFactsStore(dir);

  // addFact + validation + dedupe
  const r1 = store.addFact({ category: 'preference', content: 'coffee over tea' });
  assert.strictEqual(r1.added, true, 'fact added');
  const dup = store.addFact({ category: 'preference', content: 'coffee over tea' });
  assert.strictEqual(dup.added, false, 'exact duplicate rejected');
  const dupCase = store.addFact({ category: 'preference', content: 'Coffee  over   TEA!' });
  assert.strictEqual(dupCase.added, false, 'normalized duplicate rejected');

  assert.throws(() => store.addFact({ category: '', content: 'x' }), /category is required/);
  assert.throws(() => store.addFact({ category: 'x', content: '' }), /content is required/);

  // confidence clamped
  const r2 = store.addFact({ category: 'goal', content: 'learn piano', confidence: 5 });
  assert.strictEqual(r2.fact.confidence, 1, 'confidence clamped to 1');

  // extraction from a user message
  const added = await store.extractFromMessage('I really like hiking on weekends. My name is Alex.');
  const categories = added.map(f => f.category).sort();
  assert.ok(categories.includes('preference'), 'extracts a preference');
  assert.ok(categories.includes('name'), 'extracts a name');
  assert.ok(added.every(f => f.confidence === 0.7), 'extracted facts carry scaffold confidence');

  // extraction dedupes against existing
  const again = await store.extractFromMessage('I really like hiking on weekends.');
  assert.strictEqual(again.length, 0, 're-extraction dedupes');

  // list + category filter
  const all = store.list();
  assert.ok(all.length >= 3, 'facts listed');
  assert.ok(store.list('preference').every(f => f.category === 'preference'), 'category filter works');

  // persistence across instances
  const store2 = createMemoryFactsStore(dir);
  assert.strictEqual(store2.list().length, all.length, 'facts persist across store instances');

  // delete + clear
  assert.strictEqual(store2.deleteFact(all[0].id), true, 'deleteFact removes a fact');
  assert.strictEqual(store2.deleteFact('missing'), false, 'deleteFact returns false for missing id');
  store2.clear();
  assert.strictEqual(store2.list().length, 0, 'clear empties the store');

  console.log('Memory facts store tests passed.');
})().catch(error => {
  console.error('Memory facts store test failed:', error);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
