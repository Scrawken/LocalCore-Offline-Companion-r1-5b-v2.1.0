const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMemorySummariesStore } = require('../electron/memory-summaries-store.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-summaries-test-'));

try {
  const store = createMemorySummariesStore(dir);

  // Add a summary covering seq 0-9.
  const r1 = store.addSummary({ conversationId: 'conv-1', coversFromSeq: 0, coversToSeq: 9, content: 'Discussed hiking plans.' });
  assert.strictEqual(r1.added, true, 'summary added');
  assert.strictEqual(r1.summary.tokenCount > 0, true, 'tokenCount populated');

  // Non-overlapping range for the same conversation is allowed.
  const r2 = store.addSummary({ conversationId: 'conv-1', coversFromSeq: 10, coversToSeq: 19, content: 'Talked about work.' });
  assert.strictEqual(r2.added, true, 'contiguous non-overlapping summary added');

  // Overlapping range is rejected.
  const overlap = store.addSummary({ conversationId: 'conv-1', coversFromSeq: 5, coversToSeq: 15, content: 'overlap' });
  assert.strictEqual(overlap.added, false, 'overlapping summary rejected');
  assert.strictEqual(overlap.reason, 'overlap');

  // Same range for a DIFFERENT conversation is fine.
  const other = store.addSummary({ conversationId: 'conv-2', coversFromSeq: 0, coversToSeq: 9, content: 'Different conversation.' });
  assert.strictEqual(other.added, true, 'same range allowed for a different conversation');

  // Validation.
  assert.throws(() => store.addSummary({ conversationId: 'c', coversFromSeq: 5, coversToSeq: 2, content: 'x' }), /from <= to/);
  assert.throws(() => store.addSummary({ conversationId: 'c', coversFromSeq: 0, coversToSeq: 1, content: '' }), /content is required/);

  // Coverage reporting.
  const coverage = store.coverage('conv-1');
  assert.deepStrictEqual(coverage, [{ from: 0, to: 9 }, { from: 10, to: 19 }], 'coverage reports ranges in order');

  // Persistence across instances.
  const store2 = createMemorySummariesStore(dir);
  assert.strictEqual(store2.list('conv-1').length, 2, 'summaries persist across instances');

  // Delete.
  assert.strictEqual(store2.deleteSummary(r1.summary.id), true, 'deleteSummary removes a summary');
  assert.strictEqual(store2.list('conv-1').length, 1);

  // deleteForConversation.
  assert.strictEqual(store2.deleteForConversation('conv-2'), 1, 'deleteForConversation removes its summaries');

  console.log('Memory summaries store tests passed.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
