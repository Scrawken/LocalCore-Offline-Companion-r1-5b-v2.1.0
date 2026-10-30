(function exposeAvatarExpression(root) {
  // 12-mood vocabulary ported from the LocalCore architecture blueprint
  // (CompanionMood). Moods are the high-level companion state; each maps onto
  // the VRM's lower-level expression/morph set via MOOD_TO_EXPRESSION below.
  const MOODS = [
    'neutral', 'happy', 'cheerful', 'curious', 'empathetic', 'playful',
    'focused', 'thinking', 'surprised', 'sleepy', 'speaking', 'dance'
  ];

  // Base expressions the runtime knows how to drive on a VRM. These are the
  // morph/binding targets; moods resolve to one of these.
  const BASE_EXPRESSIONS = ['neutral', 'happy', 'sad', 'angry', 'relaxed', 'surprised'];

  // Map each mood onto a base expression. Moods without a distinct VRM binding
  // reuse the closest supported expression so every mood produces a visible
  // change on any rig.
  const MOOD_TO_EXPRESSION = {
    neutral: 'neutral',
    happy: 'happy',
    cheerful: 'happy',
    playful: 'happy',
    curious: 'surprised',
    surprised: 'surprised',
    empathetic: 'sad',
    sad: 'sad',
    focused: 'neutral',
    thinking: 'relaxed',
    sleepy: 'relaxed',
    speaking: 'neutral',
    dance: 'happy',
    angry: 'angry',
    relaxed: 'relaxed'
  };

  const morphNamesByExpression = {
    neutral: ['Eye_Default'],
    happy: ['Mouth_Smile01', 'Brow_Smily_L', 'Brow_Smily_R'],
    sad: ['Brow_Trouble_L', 'Brow_Trouble_R', 'Eye_Wail'],
    angry: ['Brow_Angry_L', 'Brow_Angry_R', 'Mouth_Angry01'],
    relaxed: ['なごみ'],
    surprised: ['Brow_Up_L', 'Brow_Up_R', 'Mouth_Open01', 'Eye_Ha'],
    mouth: ['Mouth_A01', 'Mouth_Open01'],
    blink: ['Eye_WinkA_L', 'Eye_WinkA_R', 'Eye_WinkB_L', 'Eye_WinkB_R', 'Eye_WinkC_L', 'Eye_WinkC_R']
  };

  // Keyword fallback for mood detection (decision 2c: used when the model does
  // not emit an explicit [mood:X] tag). Ordered most-specific first.
  const MOOD_KEYWORDS = [
    ['dance', /\b(let's dance|dance with me|party time|turn up the music)\b/],
    ['sleepy', /\b(i'm tired|so sleepy|going to bed|good night|can't keep my eyes open|drowsy)\b/],
    ['playful', /\b(haha|lol|just kidding|teasing|you're fun|wanna play|let's play)\b/],
    ['cheerful', /\b(amazing news|best day|so excited|fantastic|yay|woohoo)\b/],
    ['happy', /\b(congratulations|glad to hear|that's exciting|wonderful news|great job|happy to help|well done|proud of you)\b/],
    ['empathetic', /\b(i'm sorry|i am sorry|sorry to hear|unfortunately|my condolences|that's difficult|i understand how|that must be hard|i'm here for you)\b/],
    ['curious', /\b(interesting|tell me more|how does that work|what do you mean|curious|i wonder)\b/],
    ['thinking', /\b(let me think|hmm|good question|considering|on the one hand|it depends)\b/],
    ['focused', /\b(let's focus|concentrate|step by step|first we need|the plan is)\b/],
    ['surprised', /\b(wow|surprisingly|unexpectedly|what a surprise|i didn't expect|no way|really\?)\b/],
    ['relaxed', /\b(let's take a breath|take your time|no rush|at ease|calm down|relax)\b/]
  ];

  // Parse an explicit mood tag the model may emit, e.g. "[mood:happy] ...".
  // Returns the mood or null. Validated against the known vocabulary.
  function moodFromTag(text) {
    if (typeof text !== 'string') return null;
    const match = text.match(/\[\s*mood\s*:\s*([a-z-]+)\s*\]/i);
    if (!match) return null;
    const mood = match[1].toLowerCase();
    return MOODS.includes(mood) ? mood : null;
  }

  // Strip a leading mood tag from reply text so it is not shown/spoken.
  function stripMoodTag(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/^\s*\[\s*mood\s*:\s*[a-z-]+\s*\]\s*/i, '');
  }

  // Detect the mood of a reply: explicit model tag first, keyword fallback.
  function moodForReply(text) {
    const tagged = moodFromTag(text);
    if (tagged) return tagged;
    const reply = typeof text === 'string' ? text.toLowerCase() : '';
    for (const [mood, pattern] of MOOD_KEYWORDS) {
      if (pattern.test(reply)) return mood;
    }
    return 'neutral';
  }

  // Backwards-compatible: the old API returned a base expression directly.
  // Now route through mood detection, then map mood -> base expression.
  function expressionForReply(text) {
    return MOOD_TO_EXPRESSION[moodForReply(text)] || 'neutral';
  }

  function resolveMorphTargets(meshes, expression) {
    const candidates = morphNamesByExpression[expression] || [];
    const normalizedCandidates = new Set(candidates.map(name => name.toLowerCase()));
    const targets = [];
    for (const mesh of meshes || []) {
      if (!mesh.morphTargetDictionary || !Array.isArray(mesh.morphTargetInfluences)) continue;
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        if (normalizedCandidates.has(name.toLowerCase())) targets.push({ mesh, index, name });
      }
    }
    return targets;
  }

  // ---------------------------------------------------------------------------
  // Emotion controller (Phase 4): cue priority, anti-flicker dwell, decay.
  //
  // Cue priority (highest first): explicit model tag > event cue > sentiment
  // keyword. Anti-flicker: a new emotion must hold for minDwellMs before it can
  // be replaced by a lower-or-equal-priority cue. Decay: after decayMs with no
  // new cue, the emotion returns to neutral.
  const CUE_PRIORITY = { tag: 3, event: 2, sentiment: 1 };

  function createEmotionController(options = {}) {
    const minDwellMs = options.minDwellMs ?? 1500;
    const decayMs = options.decayMs ?? 30000;
    const neutralMood = 'neutral';
    // Injectable clock for testing; defaults to Date.now.
    const clock = typeof options.now === 'function' ? options.now : () => Date.now();

    let current = neutralMood;
    let currentPriority = 0;
    let lastChangeAt = clock();
    let lastCueAt = clock();

    function now() {
      return clock();
    }

    function toExpression(mood) {
      return MOOD_TO_EXPRESSION[mood] || neutralMood;
    }

    // cue: { mood, source: 'tag' | 'event' | 'sentiment' }
    function push(cue) {
      if (!cue || !MOODS.includes(cue.mood)) return { mood: current, expression: toExpression(current), changed: false };
      const priority = CUE_PRIORITY[cue.source] || 0;
      const t = now();
      lastCueAt = t;
      const dwellElapsed = t - lastChangeAt;
      const canReplace =
        cue.mood === current ||
        priority > currentPriority ||
        (priority === currentPriority && dwellElapsed >= minDwellMs) ||
        (priority < currentPriority && dwellElapsed >= minDwellMs);
      if (!canReplace) {
        return { mood: current, expression: toExpression(current), changed: false };
      }
      const changed = cue.mood !== current;
      current = cue.mood;
      currentPriority = priority;
      if (changed) lastChangeAt = t;
      return { mood: current, expression: toExpression(current), changed };
    }

    // Call each frame/tick; decays to neutral after decayMs of no cues.
    function tick() {
      const t = now();
      if (current !== neutralMood && t - lastCueAt >= decayMs) {
        current = neutralMood;
        currentPriority = 0;
        lastChangeAt = t;
        return { mood: current, expression: toExpression(current), changed: true, decayed: true };
      }
      return { mood: current, expression: toExpression(current), changed: false };
    }

    function reset() {
      current = neutralMood;
      currentPriority = 0;
      lastChangeAt = now();
      lastCueAt = now();
    }

    return {
      push,
      tick,
      reset,
      get mood() { return current; },
      get expression() { return toExpression(current); }
    };
  }

  const api = {
    MOODS,
    BASE_EXPRESSIONS,
    MOOD_TO_EXPRESSION,
    CUE_PRIORITY,
    createEmotionController,
    moodForReply,
    moodFromTag,
    stripMoodTag,
    expressionForReply,
    morphNamesByExpression,
    resolveMorphTargets
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.localCoreAvatarExpression = api;
})(globalThis);
