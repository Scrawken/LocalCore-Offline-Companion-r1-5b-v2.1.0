/**
 * Conversation Summarizer — Phase 2 S2.4
 *
 * Condenses a contiguous range of conversation turns into a durable summary via
 * the local model (never a side channel). Summaries preserve user-relevant
 * content: preferences, decisions, events, people mentioned.
 *
 * The summarizer is model-agnostic: it takes a `generate(prompt)` function so it
 * can run against the app's inference server or a test double.
 */

const SUMMARY_PROMPT_VERSION = 'v1';

function buildSummaryPrompt(turns) {
  const transcript = turns
    .map(t => (t.role === 'user' ? 'User: ' : 'Assistant: ') + t.content)
    .join('\n');
  return [
    'Summarize the following conversation concisely, preserving only what is worth remembering long-term:',
    '- user preferences, dislikes, and personal facts',
    '- decisions made and plans formed',
    '- significant events or topics discussed',
    '- people the user mentioned',
    '',
    'Write 2-4 sentences in third person ("The user..."). Do not include greetings, filler, or small talk.',
    '',
    'Conversation:',
    transcript,
    '',
    'Summary:'
  ].join('\n');
}

function createSummarizer({ generate, summariesStore, maxInputChars = 6000 }) {
  if (typeof generate !== 'function') throw new Error('Summarizer requires a generate(prompt) function.');
  if (!summariesStore) throw new Error('Summarizer requires a summariesStore.');

  return {
    promptVersion: SUMMARY_PROMPT_VERSION,

    /**
     * Summarize a contiguous range of turns for a conversation and store it.
     * turns: array of { role, content, seq } in seq order.
     * Returns { added, summary } from the store.
     */
    async summarizeRange(conversationId, turns, characterId = null) {
      if (!Array.isArray(turns) || !turns.length) throw new Error('No turns to summarize.');
      const fromSeq = turns[0].seq;
      const toSeq = turns[turns.length - 1].seq;

      // Bound the input to the model's context.
      let bounded = turns;
      let totalChars = turns.reduce((s, t) => s + t.content.length, 0);
      while (totalChars > maxInputChars && bounded.length > 1) {
        bounded = bounded.slice(1); // drop oldest turns first
        totalChars = bounded.reduce((s, t) => s + t.content.length, 0);
      }

      const prompt = buildSummaryPrompt(bounded);
      const content = (await generate(prompt)).trim();
      if (!content) throw new Error('The summarizer returned an empty summary.');

      return summariesStore.addSummary({
        conversationId,
        coversFromSeq: fromSeq,
        coversToSeq: toSeq,
        content,
        characterId
      });
    }
  };
}

module.exports = { createSummarizer, buildSummaryPrompt, SUMMARY_PROMPT_VERSION };
