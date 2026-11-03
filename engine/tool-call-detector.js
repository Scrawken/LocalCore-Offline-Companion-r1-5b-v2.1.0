/**
 * Tool-Call Detector — links chat to the Action Broker (Phase 5).
 *
 * Detects when a user message is asking for a tool action (image/video
 * generation, file read, etc.) and produces a tool proposal the broker can
 * preview/invoke. The model proposes; the broker authorizes (or the user
 * approves). This is the seam between "Maura chats" and "Maura acts."
 *
 * v1: deterministic intent detection for generation tools. A model-driven
 * tool-call (the model emitting a structured [tool:...] tag) slots in later.
 */

const GENERATION_INTENTS = [
  {
    toolId: 'generate-image',
    scope: 'generate:image',
    // "generate/draw/create/make/show me an image/picture of X"
    pattern: /\b(?:generate|create|make|draw|show me|produce|render)\b[^.]*?\b(?:image|picture|pic|photo|drawing|art|artwork)\b[^.]*?\b(?:of|for|showing)?\b(.+)/i,
    extractPrompt: match => match[1].trim()
  },
  {
    toolId: 'generate-video',
    scope: 'generate:video',
    pattern: /\b(?:generate|create|make|render|show me)\b[^.]*?\b(?:video|animation|gif|clip|motion)\b[^.]*?\b(?:of|for|showing)?\b(.+)/i,
    extractPrompt: match => match[1].trim()
  }
];

/**
 * Detect a tool call in a user message. Returns { toolId, scope, input } or null.
 */
function detectToolCall(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  for (const intent of GENERATION_INTENTS) {
    const match = text.match(intent.pattern);
    if (match) {
      const prompt = intent.extractPrompt(match);
      if (prompt.length >= 3) {
        return { toolId: intent.toolId, scope: intent.scope, input: { prompt } };
      }
    }
  }
  return null;
}

module.exports = { detectToolCall, GENERATION_INTENTS };
