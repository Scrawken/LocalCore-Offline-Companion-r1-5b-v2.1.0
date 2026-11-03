// Placeholder installer for the real video-generation model (SVD-XT).
//
// The generation engine currently uses a procedural offline placeholder. SVD-XT
// is ~10 GB and needs ~12+ GB VRAM — it will NOT fit alongside the chat model
// on a 12 GB card, so it runs on-demand via the Resource Governor (unload chat,
// or CPU/offload). Expect minutes per clip on an RTX 3060.
//
// NOTE: SVD-XT's license is non-commercial. For the commercial-bound LocalCore
// it must be replaced by a commercially-safe video base (tracked in
// localcore-ai/create). This installer is a scaffold for that future model.
const path = require('path');

const MODEL_DIR = path.join(__dirname, '..', 'models', 'video_generation');

async function setup() {
  console.log('Video model setup is not yet wired to a real SVD-XT download.');
  console.log('The generation engine currently uses a procedural offline placeholder.');
  console.log('Real video generation is tracked in the LocalCore-Create project');
  console.log('(localcore-ai/create). Model directory: ' + MODEL_DIR);
  console.log('NOTE: SVD-XT is non-commercial; a commercially-safe base is required.');
}

setup().catch(error => {
  console.error('Video model setup failed: ' + error.message);
  process.exitCode = 1;
});
