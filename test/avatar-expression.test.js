const assert = require('assert');
const { expressionForReply, resolveMorphTargets } = require('../renderer/avatar-expression.js');

assert.strictEqual(expressionForReply("Congratulations, that's exciting!"), 'happy');
assert.strictEqual(expressionForReply("I'm sorry to hear that."), 'sad');
assert.strictEqual(expressionForReply("Wow, what a surprise."), 'surprised');
assert.strictEqual(expressionForReply("Let's take a breath; there's no rush."), 'relaxed');
assert.strictEqual(expressionForReply('Here are the steps you asked for.'), 'neutral');
assert.strictEqual(expressionForReply(null), 'neutral');
const qiqiFace = {
  morphTargetDictionary: {
    Eye_Default: 0,
    Mouth_Smile01: 1,
    Brow_Trouble_L: 2,
    Brow_Angry_R: 3,
    Brow_Up_L: 4,
    Mouth_Open01: 5,
    なごみ: 6
  },
  morphTargetInfluences: new Array(7).fill(0)
};
assert.deepStrictEqual(
  resolveMorphTargets([qiqiFace], 'happy').map(target => target.name),
  ['Mouth_Smile01']
);
assert.deepStrictEqual(
  resolveMorphTargets([qiqiFace], 'sad').map(target => target.name),
  ['Brow_Trouble_L']
);
assert.deepStrictEqual(
  resolveMorphTargets([qiqiFace], 'angry').map(target => target.name),
  ['Brow_Angry_R']
);
assert.deepStrictEqual(
  resolveMorphTargets([qiqiFace], 'surprised').map(target => target.name),
  ['Brow_Up_L', 'Mouth_Open01']
);
assert.strictEqual(resolveMorphTargets([qiqiFace], 'relaxed')[0].name, 'なごみ');
console.log('Avatar expression mapping tests passed.');
