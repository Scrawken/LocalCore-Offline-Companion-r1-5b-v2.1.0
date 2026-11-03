const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMemoryFactsStore } = require('../electron/memory-facts-store.js');
const { createMemoryService } = require('../engine/memory-service.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-retrieval-test-'));

(async () => {
  const factsStore = createMemoryFactsStore(dir);
  const service = createMemoryService({ factsStore });

  // Seed facts about the user.
  factsStore.addFact({ category: 'preference', content: 'likes hiking on weekends', confidence: 0.9 });
  factsStore.addFact({ category: 'preference', content: 'prefers coffee over tea', confidence: 0.8 });
  factsStore.addFact({ category: 'fact', content: 'works as a software developer', confidence: 1.0 });
  factsStore.addFact({ category: 'goal', content: 'wants to learn piano', confidence: 0.7 });

  // Semantic retrieval: a query about outdoor activity should surface hiking,
  // not the stock-unrelated facts, even without keyword overlap.
  const ctx = await service.retrieve('What outdoor activities does the user enjoy?', {});
  assert.ok(ctx.facts.length > 0, 'retrieves at least one fact');
  const contents = ctx.facts.map(f => f.content);
  assert.ok(contents.some(c => c.includes('hiking')), 'hiking fact retrieved for outdoor query');
  assert.ok(ctx.memoryBlock.includes('What you remember about the user'), 'memory block formatted');
  assert.ok(ctx.memoryBlock.includes('User likes:'), 'memory block labels facts by category');
  assert.ok(ctx.tokenEstimate > 0, 'token estimate reported');

  // Determinism: same query twice → identical ordering.
  const again = await service.retrieve('What outdoor activities does the user enjoy?', {});
  assert.deepStrictEqual(again.facts.map(f => f.id), ctx.facts.map(f => f.id), 'retrieval is deterministic');

  // Category gating.
  const onlyGoals = await service.retrieve('What does the user want to learn?', { categories: ['goal'] });
  assert.ok(onlyGoals.facts.every(f => f.category === 'goal'), 'category gating restricts results');

  // Budget trimming.
  const tight = await service.retrieve('Tell me about the user', { tokenBudget: 10, topK: 50 });
  assert.ok(tight.tokenEstimate <= 10, 'respects token budget');

  // Empty store → empty block, not an error.
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-retrieval-empty-'));
  const emptyService = createMemoryService({ factsStore: createMemoryFactsStore(emptyDir) });
  const emptyCtx = await emptyService.retrieve('anything', {});
  assert.strictEqual(emptyCtx.memoryBlock, '', 'empty store yields empty memory block');
  fs.rmSync(emptyDir, { recursive: true, force: true });

  console.log('Memory service (retrieval) tests passed.');
})().catch(error => {
  console.error('Memory service test failed:', error);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
