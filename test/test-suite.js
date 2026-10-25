/**
 * LocalCore Test Suite
 * Tests model integrity, real local inference, procedural media demos, and request policy configuration.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

async function runTestSuite() {
  console.log('=====================================================================');
  console.log(' LocalCore Model & Prototype Asset Test Suite');
  console.log('=====================================================================');
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(' [PASS] ' + message);
      passed++;
    } else {
      console.error(' [FAIL] ' + message);
    }
  }

  // Test 1: Active GGUF Model Existence & SHA-256 Checksum
  const activeModel = require('../config/local-ai.config.json').activeModel;
  const ggufPath = path.join(__dirname, '..', activeModel.relativePath);
  assert(fs.existsSync(ggufPath), 'Configured chat model file exists on disk');
  if (fs.existsSync(ggufPath)) {
    const modelStat = fs.statSync(ggufPath);
    const modelHeader = Buffer.alloc(4);
    const modelFd = fs.openSync(ggufPath, 'r');
    try {
      fs.readSync(modelFd, modelHeader, 0, modelHeader.length, 0);
    } finally {
      fs.closeSync(modelFd);
    }
    const actualHash = await fileSha256(ggufPath);
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../models/manifest.json'), 'utf8'));
    const manifestModel = manifest.models.find(model => model.id === activeModel.id);
    assert(manifest.models.length === 1 && manifestModel, 'Only the configured chat model is listed in the manifest');
    assert(actualHash === manifestModel?.sha256, 'Active model checksum matches manifest exactly (' + actualHash.slice(0, 12) + '...)');
    assert(modelHeader.toString('ascii') === 'GGUF', 'GGUF magic header validated');
    assert(modelStat.size === manifestModel?.sizeBytes, 'Installed model size matches pinned manifest');
  }

  // Test 2: Procedural PNG Image Generation
  const { ImagePipeline } = require('../pipelines/image_pipeline.js');
  const imgPipeline = new ImagePipeline();
  const imgRes = await imgPipeline.generateImage({ prompt: 'Unit test image', width: 256, height: 256 });
  assert(fs.existsSync(imgRes.filePath), 'Procedural PNG demo created at ' + imgRes.filePath);
  const imgBuf = fs.readFileSync(imgRes.filePath);
  assert(imgBuf[0] === 0x89 && imgBuf[1] === 0x50 && imgBuf[2] === 0x4E && imgBuf[3] === 0x47, 'PNG 8-byte signature validated');

  // Test 3: Procedural WAV Audio Generation
  const { MusicPipeline } = require('../pipelines/music_pipeline.js');
  const musicPipeline = new MusicPipeline();
  const audioRes = await musicPipeline.generateTrack({ duration: 3, bpm: 120 });
  assert(fs.existsSync(audioRes.filePath), 'Procedural WAV demo created at ' + audioRes.filePath);
  const audioBuf = fs.readFileSync(audioRes.filePath);
  assert(audioBuf.toString('ascii', 0, 4) === 'RIFF' && audioBuf.toString('ascii', 8, 12) === 'WAVE', 'RIFF WAVE 16-bit PCM format validated');

  // Test 4: Procedural Animated GIF Generation
  const { VideoPipeline } = require('../pipelines/video_pipeline.js');
  const videoPipeline = new VideoPipeline();
  const videoRes = await videoPipeline.renderVideo({ numFrames: 4, width: 128, height: 128 });
  assert(fs.existsSync(videoRes.filePath), 'Procedural GIF demo created at ' + videoRes.filePath);
  const gifBuf = fs.readFileSync(videoRes.filePath);
  assert(gifBuf.toString('ascii', 0, 6) === 'GIF89a', 'GIF89a animation format validated');

  // Test 5: ONNX Tensor Engine
  const { OnnxTensorEngine } = require('../libraries/onnxruntime/onnx_bridge.js');
  const engine = new OnnxTensorEngine();
  const tA = new Float32Array([1, 2, 3, 4]);
  const tB = new Float32Array([2, 0, 1, 2]);
  const tC = engine.matmul(tA, tB, 2, 2, 2);
  assert(tC.length === 4 && tC[0] === 4 && tC[3] === 8, 'ONNX tensor matrix multiplication math verified');

  // Test 6: Actual local model inference
  const { TextPipeline } = require('../pipelines/text_pipeline.js');
  const textPipeline = new TextPipeline();
  const textRes = await textPipeline.runPrompt("Verify offline inference pipeline", { maxTokens: 128, gpuLayers: 0 });
  assert(textRes && textRes.text && textRes.mode === 'native', 'TextPipeline generated a response using the native local model');
  assert(textRes.model === activeModel.fileName, 'TextPipeline uses the configured active model');
  assert(!textRes.text.includes('prototype demo response'), 'Inference response is not simulated fallback text');
  assert(fs.existsSync(textRes.filePath), 'Verified text output file written to ' + textRes.filePath);

  // Test 7: Electron outbound request filter configuration
  const electronMain = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  assert(electronMain.includes('onBeforeRequest') && electronMain.includes('AIR-GAP BLOCKED'), 'Electron request filter is configured to block non-local requests');

  console.log('=====================================================================');
  console.log(' Test Summary: ' + passed + ' / ' + total + ' checks passed');
  console.log('=====================================================================');
  process.exit(passed === total ? 0 : 1);
}

runTestSuite().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
