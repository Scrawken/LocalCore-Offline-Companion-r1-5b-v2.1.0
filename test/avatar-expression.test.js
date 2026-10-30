const assert = require('assert');
const {
  expressionForReply,
  resolveMorphTargets,
  MOODS,
  MOOD_TO_EXPRESSION,
  moodForReply,
  moodFromTag,
  stripMoodTag
} = require('../renderer/avatar-expression.js');

assert.strictEqual(expressionForReply("Congratulations, that's exciting!"), 'happy');
assert.strictEqual(expressionForReply("I'm sorry to hear that."), 'sad');
assert.strictEqual(expressionForReply("Wow, what a surprise."), 'surprised');
assert.strictEqual(expressionForReply("Let's take a breath; there's no rush."), 'relaxed');
assert.strictEqual(expressionForReply('Here are the steps you asked for.'), 'neutral');
assert.strictEqual(expressionForReply(null), 'neutral');

// 12-mood vocabulary (ported from the architecture blueprint CompanionMood).
assert.strictEqual(MOODS.length, 12);
for (const mood of MOODS) {
  assert.ok(MOOD_TO_EXPRESSION[mood], 'mood missing expression mapping: ' + mood);
}

// Explicit model mood tag wins over keywords.
assert.strictEqual(moodForReply('[mood:playful] congratulations'), 'playful');
assert.strictEqual(moodFromTag('[mood:curious] tell me more'), 'curious');
assert.strictEqual(moodFromTag('[mood:bogus] hi'), null); // invalid tag rejected
assert.strictEqual(moodFromTag('no tag here'), null);

// Tag stripping so tags are not shown or spoken.
assert.strictEqual(stripMoodTag('[mood:happy] Great news!'), 'Great news!');
assert.strictEqual(stripMoodTag('  [mood:sleepy]  Time for bed.'), 'Time for bed.');
assert.strictEqual(stripMoodTag('no tag'), 'no tag');

// Keyword fallback across the expanded mood set.
assert.strictEqual(moodForReply('I am so sleepy today'), 'sleepy');
assert.strictEqual(moodForReply('Haha, just kidding!'), 'playful');
assert.strictEqual(moodForReply('Interesting, tell me more'), 'curious');
assert.strictEqual(moodForReply('Let me think about that'), 'thinking');
assert.strictEqual(moodForReply('The sky is blue'), 'neutral');

// expressionForReply routes through mood detection then maps to a base expression.
assert.strictEqual(expressionForReply('[mood:curious] what do you mean?'), 'surprised');
assert.strictEqual(expressionForReply('I am sorry for your loss'), 'sad');
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
