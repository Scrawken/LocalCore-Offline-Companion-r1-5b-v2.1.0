(function exposeAvatarExpression(root) {
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

  function expressionForReply(text) {
    const reply = typeof text === 'string' ? text.toLowerCase() : '';
    if (/\b(congratulations|glad to hear|that's exciting|wonderful news|great job|happy to help)\b/.test(reply)) {
      return 'happy';
    }
    if (/\b(i'm sorry|i am sorry|sorry to hear|unfortunately|my condolences|that's difficult)\b/.test(reply)) {
      return 'sad';
    }
    if (/\b(wow|surprisingly|unexpectedly|what a surprise|i didn't expect)\b/.test(reply)) {
      return 'surprised';
    }
    if (/\b(let's take a breath|take your time|no rush|at ease)\b/.test(reply)) {
      return 'relaxed';
    }
    return 'neutral';
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

  const api = { expressionForReply, morphNamesByExpression, resolveMorphTargets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.localCoreAvatarExpression = api;
})(globalThis);
