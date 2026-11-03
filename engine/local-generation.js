/**
 * Local Generation Engine — image & video generation for the Action Broker.
 *
 * Phase 5 tools call into this engine. The current implementation uses the
 * procedural pipelines (lightweight, offline, no download). FLUX.1-schnell
 * (image) and SVD-XT (video) slot into the same generate() interface when the
 * real models are installed via setup:image-model / setup:video-model.
 *
 * The engine is the seam: tools never touch the pipelines directly, so swapping
 * in a real diffusion model later changes only this file.
 */

const { generatePngBuffer } = require('../pipelines/image_pipeline.js');
const { generateGifBuffer } = require('../pipelines/video_pipeline.js');

function createGenerationEngine() {
  return {
    /**
     * Generate an image. Returns { bytes, mimeType, width, height, model }.
     * TODO(S2.4/Create): route to FLUX.1-schnell when models/image_generation
     * holds a real model; the procedural generator is the offline placeholder.
     */
    async generateImage({ prompt, width = 512, height = 512, seed = null }) {
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('An image prompt is required.');
      const w = Math.min(1024, Math.max(64, width | 0));
      const h = Math.min(1024, Math.max(64, height | 0));
      const bytes = generatePngBuffer(w, h, prompt.trim(), seed ?? Date.now());
      return { bytes, mimeType: 'image/png', width: w, height: h, model: 'procedural-placeholder' };
    },

    /**
     * Generate a video (animated GIF). Returns { bytes, mimeType, width, height, frames, model }.
     * TODO(Create): route to SVD-XT when models/video_generation holds a real model.
     */
    async generateVideo({ prompt, width = 256, height = 256, frames = 8 }) {
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('A video prompt is required.');
      const w = Math.min(512, Math.max(64, width | 0));
      const h = Math.min(512, Math.max(64, height | 0));
      const f = Math.min(48, Math.max(2, frames | 0));
      const bytes = generateGifBuffer(w, h, f);
      return { bytes, mimeType: 'image/gif', width: w, height: h, frames: f, model: 'procedural-placeholder' };
    }
  };
}

module.exports = { createGenerationEngine };
