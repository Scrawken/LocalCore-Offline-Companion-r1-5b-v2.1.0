const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { synthesizeSpeech, transcribeAudio } = require('../engine/local-speech.js');

async function run() {
  const fixturePath = path.join(__dirname, '../output/audio/localcore-tts-benchmark.wav');
  const audioBytes = new Uint8Array(fs.readFileSync(fixturePath));
  const temporaryAudioBefore = fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('localcore-speech-'));
  await assert.rejects(
    () => transcribeAudio(new Uint8Array([1, 2, 3])),
    /WAV file is incomplete/
  );
  const transcript = await transcribeAudio(audioBytes);
  assert(/local core voice benchmark/i.test(transcript), 'Whisper small.en must recognize the known fixture phrase');
  const temporaryAudioAfter = fs.readdirSync(os.tmpdir())
    .filter(name => name.startsWith('localcore-speech-') && !temporaryAudioBefore.includes(name));
  assert.strictEqual(temporaryAudioAfter.length, 0, 'temporary recorded audio is removed after transcription');
  const temporarySpeechBefore = fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('localcore-tts-'));
  const speech = await synthesizeSpeech('LocalCore voice synthesis smoke test.');
  assert.strictEqual(speech.toString('ascii', 0, 4), 'RIFF', 'Piper returns a WAV file');
  assert.strictEqual(speech.toString('ascii', 8, 12), 'WAVE', 'Piper output has a WAVE header');
  const temporarySpeechAfter = fs.readdirSync(os.tmpdir())
    .filter(name => name.startsWith('localcore-tts-') && !temporarySpeechBefore.includes(name));
  assert.strictEqual(temporarySpeechAfter.length, 0, 'temporary synthesized audio is removed after returning its bytes');
  console.log('Local speech recognition smoke test passed.');
  console.log('Transcript: ' + transcript);
  console.log('Local speech synthesis smoke test passed.');
}

run().catch(error => {
  console.error('Local speech recognition smoke test failed: ' + error.message);
  process.exitCode = 1;
});
