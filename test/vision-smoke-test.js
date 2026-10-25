const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeImage } = require('../engine/local-vision.js');

async function run() {
  await assert.rejects(
    () => analyzeImage('Describe this', new Uint8Array([1, 2, 3]), 'image/png'),
    /valid PNG, JPEG, or WebP/
  );
  const imagePath = path.join(__dirname, '../output/images/vision-benchmark.png');
  const imageBytes = new Uint8Array(fs.readFileSync(imagePath));
  const temporaryImagesBefore = fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('localcore-vision-'));
  const startedAt = Date.now();
  const answer = await analyzeImage(
    'What color is the large rectangle on the left? Answer with the color only.',
    imageBytes,
    'image/png'
  );
  assert(/\bred\b/i.test(answer), 'vision model must identify the red rectangle');
  const temporaryImagesAfter = fs.readdirSync(os.tmpdir())
    .filter(name => name.startsWith('localcore-vision-') && !temporaryImagesBefore.includes(name));
  assert.strictEqual(temporaryImagesAfter.length, 0, 'temporary image input is removed after inference');
  console.log('Local vision smoke test passed.');
  console.log('Answer: ' + answer);
  console.log('Latency: ' + ((Date.now() - startedAt) / 1000).toFixed(2) + ' seconds');
}

run().catch(error => {
  console.error('Local vision smoke test failed: ' + error.message);
  process.exitCode = 1;
});
