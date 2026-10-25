/**
 * Real Local Music & Audio Pipeline
 * Synthesizes genuine 32kHz 16-bit PCM WAV audio files offline.
 */
const fs = require('fs');
const path = require('path');

function generateWavBuffer(durationSeconds = 10, bpm = 120, prompt = "Ambient") {
  const sampleRate = 32000;
  const numChannels = 1;
  const bytesPerSample = 2;
  const totalSamples = Math.round(durationSeconds * sampleRate);
  const dataSize = totalSamples * numChannels * bytesPerSample;
  
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 4, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 4, 'ascii');
  buffer.write('fmt ', 12, 4, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 4, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  const scale = [110, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66];
  const beatInterval = Math.round((60 / bpm) * sampleRate);

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(i / beatInterval);
    const beatPhase = (i % beatInterval) / beatInterval;
    const noteFreq = scale[beatIndex % scale.length];

    const noteEnv = Math.exp(-beatPhase * 3.5);
    const tone = Math.sin(2 * Math.PI * noteFreq * t) * 0.45 * noteEnv;
    const bass = Math.sin(2 * Math.PI * 55 * t) * 0.2;
    const kick = Math.sin(2 * Math.PI * (120 - 70 * beatPhase) * t) * 0.3 * Math.exp(-beatPhase * 25);

    const sample = Math.max(-1, Math.min(1, tone + bass + kick));
    buffer.writeInt16LE(Math.round(sample * 32767), offset);
    offset += 2;
  }
  return buffer;
}

class MusicPipeline {
  async generateTrack(params = {}) {
    const { duration = 10, bpm = 120, prompt = "Lo-Fi Beats" } = params;
    const wavBuf = generateWavBuffer(duration, bpm, prompt);

    const outDir = path.join(__dirname, '../output/audio');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const fileName = 'generated_audio_' + Date.now() + '.wav';
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, wavBuf);

    return {
      status: 'COMPLETE',
      filePath,
      format: 'wav',
      durationSeconds: duration,
      sampleRate: 32000,
      fileSize: wavBuf.length,
      dataUri: 'data:audio/wav;base64,' + wavBuf.toString('base64')
    };
  }
}

module.exports = { MusicPipeline, generateWavBuffer };
