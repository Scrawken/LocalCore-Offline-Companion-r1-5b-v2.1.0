// Placeholder installer for the real image-generation model (FLUX.1-schnell).
//
// The generation engine (engine/local-generation.js) currently uses a
// procedural offline placeholder. When you are ready for real FLUX image
// generation, this script will download and pin the model. FLUX.1-schnell is
// ~4 GB quantized and needs ~8-10 GB VRAM — it runs alongside the chat model
// via the Resource Governor (load on demand, unload when idle).
//
// FLUX.1-schnell is Apache 2.0 (commercially safe). FLUX.1-dev is NOT
// (non-commercial) — never substitute it.
//
// TODO: pin the exact ONNX/GGUF artifact URL + SHA-256 when the FLUX runtime
// path (ONNX DirectML vs. llama.cpp-style) is decided in the Create project.
const path = require('path');

const MODEL_DIR = path.join(__dirname, '..', 'models', 'image_generation');

async function setup() {
  console.log('Image model setup is not yet wired to a real FLUX download.');
  console.log('The generation engine currently uses a procedural offline placeholder.');
  console.log('Real FLUX.1-schnell integration is tracked in the LocalCore-Create project');
  console.log('(localcore-ai/create). Model directory: ' + MODEL_DIR);
}

setup().catch(error => {
  console.error('Image model setup failed: ' + error.message);
  process.exitCode = 1;
});
