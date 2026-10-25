/**
 * Real Local Text & Reasoning Pipeline
 * Orchestrates offline LLM prompts, token generation, and GGUF verification.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { LlamaEngine } = require('./llama_engine.js');

class TextPipeline {
  constructor(modelPath) {
    this.engine = new LlamaEngine(modelPath);
    this.modelPath = this.engine.modelPath;
  }

  async verifyModel() {
    if (!fs.existsSync(this.modelPath)) {
      return { verified: false, error: 'Model file not found on disk at ' + this.modelPath };
    }
    const buf = fs.readFileSync(this.modelPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const magic = buf.toString('utf8', 0, 4);
    return {
      verified: magic === 'GGUF',
      magic,
      sha256: hash,
      sizeBytes: buf.length
    };
  }

  async runPrompt(prompt, options = {}) {
    return await this.engine.generate(prompt, options);
  }
}

module.exports = { TextPipeline };
