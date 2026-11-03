const assert = require('assert');
const { detectToolCall } = require('../engine/tool-call-detector.js');

// Image generation intent.
let r = detectToolCall('Could you generate an image of a sunset over mountains?');
assert.ok(r, 'image intent detected');
assert.strictEqual(r.toolId, 'generate-image');
assert.strictEqual(r.scope, 'generate:image');
assert.ok(r.input.prompt.toLowerCase().includes('sunset'), 'prompt extracted');

r = detectToolCall('Draw a picture of a cat wearing a hat');
assert.ok(r && r.toolId === 'generate-image', 'draw-a-picture intent detected');

r = detectToolCall('Show me an image of a robot');
assert.ok(r && r.toolId === 'generate-image', 'show-me-an-image intent detected');

// Video generation intent.
r = detectToolCall('Create a video of waves crashing');
assert.ok(r && r.toolId === 'generate-video', 'video intent detected');
assert.strictEqual(r.scope, 'generate:video');

r = detectToolCall('Make an animation of a spinning globe');
assert.ok(r && r.toolId === 'generate-video', 'animation intent detected');

// No false positives.
assert.strictEqual(detectToolCall('What is offline inference?'), null, 'no intent for a question');
assert.strictEqual(detectToolCall('Tell me about images in general'), null, 'no intent for discussion');
assert.strictEqual(detectToolCall(''), null, 'empty input');
assert.strictEqual(detectToolCall(null), null, 'null input');

console.log('Tool-call detector tests passed.');
