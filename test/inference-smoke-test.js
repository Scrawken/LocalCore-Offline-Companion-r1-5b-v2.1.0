const assert = require('assert');

async function run() {
  const { TextPipeline } = require('../pipelines/text_pipeline.js');
  const pipeline = new TextPipeline();
  const result = await pipeline.runPrompt('What is 2 plus 2? Answer in one short sentence.', {
    maxTokens: 128,
    temperature: 0.1,
    gpuLayers: 0
  });
  assert(result.mode === 'native', 'native llama.cpp inference must run');
  assert(result.model === require('../config/local-ai.config.json').activeModel.fileName, 'configured active chat model must be used');
  const answer = result.answer.trim();
  assert(answer.length > 0, 'native model must return a user-facing answer');
  assert(!answer.toLowerCase().includes('prototype demo response'), 'response must not be simulated fallback text');
  console.log('Native local inference smoke test passed.');
  console.log('Model: ' + result.model);
  console.log('Answer: ' + answer.slice(-400));
}

run().catch(error => {
  console.error('Native local inference smoke test failed: ' + error.message);
  process.exitCode = 1;
});
