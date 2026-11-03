const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMemorySummariesStore } = require('../electron/memory-summaries-store.js');
const { createMemoryFactsStore } = require('../electron/memory-facts-store.js');
const { createMemoryService } = require('../engine/memory-service.js');
const { createSummarizer, buildSummaryPrompt } = require('../engine/summarizer.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-summ-test-'));

(async () => {
  // --- Summarizer with a test-double generate() ---
  const summariesStore = createMemorySummariesStore(dir);
  const summarizer = createSummarizer({
    summariesStore,
    generate: async prompt => {
      assert.ok(prompt.includes('Conversation:'), 'prompt includes the transcript');
      assert.ok(prompt.includes('User:'), 'prompt includes user turns');
      return 'The user discussed hiking and mentioned their friend Riley.';
    }
  });

  const turns = [
    { role: 'user', content: 'I went hiking last weekend', seq: 0 },
    { role: 'assistant', content: 'Nice! Where did you go?', seq: 1 },
    { role: 'user', content: 'The ridge trail with Riley', seq: 2 }
  ];
  const result = await summarizer.summarizeRange('conv-1', turns);
  assert.strictEqual(result.added, true, 'summary stored');
  assert.strictEqual(result.summary.coversFromSeq, 0, 'covers from seq 0');
  assert.strictEqual(result.summary.coversToSeq, 2, 'covers to seq 2');
  assert.ok(result.summary.content.includes('hiking'), 'summary content stored');

  // buildSummaryPrompt format
  const prompt = buildSummaryPrompt(turns);
  assert.ok(prompt.includes('User: I went hiking'), 'prompt formats user turns');
  assert.ok(prompt.includes('Assistant:'), 'prompt formats assistant turns');

  // --- Retrieval includes summaries ---
  const factsStore = createMemoryFactsStore(fs.mkdtempSync(path.join(os.tmpdir(), 'localcore-summ-facts-')));
  const service = createMemoryService({ factsStore, summariesStore });
  const ctx = await service.retrieve('What outdoor activity did the user do?', {});
  assert.ok(ctx.summaries.length > 0, 'retrieval surfaces summaries');
  assert.ok(ctx.memoryBlock.includes('Past conversation:'), 'memory block labels summaries');
  assert.ok(ctx.memoryBlock.includes('hiking'), 'summary content in memory block');

  console.log('Memory summarization tests passed.');
})().catch(error => {
  console.error('Memory summarization test failed:', error);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
