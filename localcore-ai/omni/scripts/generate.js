// Omni distillation pipeline, stage 1: generate.
// Runs a persona's self-instruct seeds through a local teacher model and writes
// raw conversations to localcore-ai/omni/data/raw/ (git-ignored).
//
// Usage:
//   npm run omni:generate                          (default persona, 5 per seed)
//   node generate.js --persona <file> --count 10
//   node generate.js --server-url http://127.0.0.1:11435   (attach to a running teacher)
const fs = require('fs');
const path = require('path');
const { startTeacherServer, stopTeacherServer, chatCompletion, TEACHER } = require('./teacher-server.js');

const OMNI_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(OMNI_ROOT, '..', '..');
const RAW_DIRECTORY = path.join(OMNI_ROOT, 'data', 'raw');

const USER_MOODS = ['cheerful', 'tired', 'stressed', 'bored', 'playful', 'anxious', 'curious', 'quiet'];
const LENGTHS = [
  { label: 'short', messages: 4 },
  { label: 'medium', messages: 6 },
  { label: 'long', messages: 10 }
];
const SETTINGS = ['morning coffee', 'lunch break', 'late at night', 'weekend afternoon', 'after work', 'middle of a project'];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function loadPersona(personaPath) {
  const resolved = personaPath || path.join(REPO_ROOT, 'localcore-ai', 'personas', 'default.persona.json');
  const persona = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!persona.training || !Array.isArray(persona.training.selfInstructSeeds) || persona.training.selfInstructSeeds.length === 0) {
    throw new Error('Persona ' + resolved + ' has no training.selfInstructSeeds.');
  }
  return { persona, resolved };
}

function loadStyleExamples(persona, personaPath) {
  const examplesFile = persona.training && persona.training.exampleConversationsFile;
  if (!examplesFile) return [];
  const examplesPath = path.join(path.dirname(personaPath), examplesFile);
  if (!fs.existsSync(examplesPath)) return [];
  return fs.readFileSync(examplesPath, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim())
    .slice(0, 3)
    .map(line => JSON.parse(line));
}

function formatConversation(messages) {
  return messages.map(m => m.role.toUpperCase() + ': ' + m.content).join('\n');
}

function voiceRules(persona) {
  const rules = [];
  const v = persona.voice || {};
  const b = persona.behavior || {};
  if (v.humorStyle) rules.push('Humor: ' + v.humorStyle + '.');
  if (Array.isArray(v.quirks)) for (const quirk of v.quirks) rules.push('Quirk: ' + quirk + '.');
  if (b.onDisagreement) rules.push('When disagreeing: ' + b.onDisagreement + '.');
  if (b.onUserDistress) rules.push('When the user is distressed: ' + b.onUserDistress + ' — do NOT jump to fixing.');
  if (b.onUnknown) rules.push('When not knowing something: ' + b.onUnknown + '.');
  if (Array.isArray(v.verbalTics) && v.verbalTics.length) {
    rules.push('Rare verbal habits (use AT MOST once per conversation, and only when genuinely fitting — never as a default opener): ' + v.verbalTics.join('; ') + '.');
  }
  if (Array.isArray(v.neverSays) && v.neverSays.length) {
    rules.push('NEVER say any of these, in any punctuation or casing: ' + v.neverSays.map(p => '"' + p + '"').join(', ') + '.');
  }
  rules.push('Never use generic assistant filler: "I\'m here to help", "I\'m here to listen", "How can I assist you", "Certainly", "Of course", "I understand".');
  rules.push('Vary your sentence openers. Do NOT start consecutive assistant messages the same way.');
  rules.push('The assistant is ' + persona.identity.name + '. The USER is a different person. Never address the user as ' + persona.identity.name + '.');
  return rules;
}

function buildMetaPrompt(persona, seed, styleExamples) {
  const variation = { mood: pick(USER_MOODS), length: pick(LENGTHS), setting: pick(SETTINGS) };
  const styleBlock = styleExamples.length
    ? 'Here is how the ASSISTANT talks. Match this voice exactly — its rhythm, directness, and warmth. Do NOT copy the content:\n\n' +
      styleExamples.map((example, i) => '--- Voice example ' + (i + 1) + ' ---\n' + formatConversation(example.messages.filter(m => m.role !== 'system'))).join('\n\n')
    : '';
  const rules = voiceRules(persona);
  const prompt = [
    'You are a training-data writer. Write one realistic conversation between a USER and an ASSISTANT named ' + persona.identity.name + '.',
    '',
    styleBlock,
    '',
    'ASSISTANT voice rules (follow every one):',
    ...rules.map(r => '- ' + r),
    '',
    'ASSISTANT character background:',
    persona.systemPrompt,
    '',
    'Scenario: ' + seed,
    'User mood: ' + variation.mood,
    'Setting: ' + variation.setting,
    'Target length: about ' + variation.length.messages + ' messages.',
    '',
    'Rules:',
    '- Messages alternate, start with the user, end with the assistant.',
    '- The assistant must stay fully in character per the voice rules and background above.',
    '- The user is an adult talking to their personal companion; write them as a believable person, not a questionnaire.',
    '- SELF-CHECK before finishing: read each assistant line. If any line could have been said by a generic customer-service chatbot, rewrite it in ' + persona.identity.name + '\'s voice.',
    '- Output ONLY a JSON array, no commentary: [{"role":"user","content":"..."},{"role":"assistant","content":"..."}, ...]'
  ].join('\n');
  return { prompt, variation };
}

// Extract the first balanced JSON array from arbitrary text (handles leading
// commentary and code fences). Returns the array string or null.
function extractJsonArray(text) {
  const start = text.indexOf('[');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unbalanced — likely truncated
}

// Salvage a conversation from USER:/ASSISTANT: plain-text format.
function parseTextFormat(text) {
  const lines = text.split(/\r?\n/);
  const messages = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^(USER|ASSISTANT|User|Assistant|user|assistant)\s*:\s*(.*)$/);
    if (match) {
      if (current) messages.push(current);
      current = { role: match[1].toLowerCase() === 'user' ? 'user' : 'assistant', content: match[2] };
    } else if (current && line.trim()) {
      current.content += ' ' + line.trim();
    }
  }
  if (current) messages.push(current);
  return messages.length >= 2 ? messages : null;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 2) return null;
  const cleaned = messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim());
  if (cleaned.length < 2) return null;
  if (cleaned[0].role !== 'user') return null;
  if (cleaned[cleaned.length - 1].role !== 'assistant') cleaned.pop();
  if (cleaned.length < 2) return null;
  for (let i = 1; i < cleaned.length; i++) {
    if (cleaned[i].role === cleaned[i - 1].role) return null;
  }
  return cleaned;
}

function parseConversation(text) {
  // 1. Try to pull a balanced JSON array from anywhere in the output.
  const arrayText = extractJsonArray(text);
  if (arrayText) {
    try {
      const parsed = JSON.parse(arrayText);
      const valid = validateMessages(parsed);
      if (valid) return valid;
    } catch {}
  }
  // 2. Truncated JSON: cut at the last complete object and close the array.
  const start = text.indexOf('[');
  if (start >= 0) {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > start) {
      try {
        const parsed = JSON.parse(text.slice(start, lastBrace + 1) + ']');
        const valid = validateMessages(parsed);
        if (valid) return valid;
      } catch {}
    }
  }
  // 3. Plain-text USER:/ASSISTANT: fallback.
  return validateMessages(parseTextFormat(text));
}

async function main() {
  const count = Math.max(1, Number(argValue('--count')) || 5);
  const serverUrl = argValue('--server-url');
  const { persona, resolved: personaPath } = loadPersona(argValue('--persona'));
  const styleExamples = loadStyleExamples(persona, personaPath);
  const seeds = persona.training.selfInstructSeeds;

  console.log('Persona: ' + persona.name + ' (' + persona.id + ')');
  console.log('Seeds: ' + seeds.length + ', conversations per seed: ' + count);
  console.log('Style examples loaded: ' + styleExamples.length);

  let server = null;
  const baseUrl = serverUrl || (server = await startTeacherServer()).baseUrl;
  if (server) console.log('Teacher server started on ' + baseUrl + ' (' + server.modelPath + ')');
  else console.log('Attaching to teacher server at ' + baseUrl);

  fs.mkdirSync(RAW_DIRECTORY, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(RAW_DIRECTORY, 'persona_sft_' + stamp + '.jsonl');
  const out = fs.createWriteStream(outPath, { flags: 'a' });

  let written = 0;
  let failed = 0;
  try {
    for (const seed of seeds) {
      for (let attempt = 0; attempt < count; attempt++) {
        const { prompt, variation } = buildMetaPrompt(persona, seed, styleExamples);
        let messages = null;
        for (let retry = 0; retry < 3 && !messages; retry++) {
          try {
            const text = await chatCompletion(baseUrl, [{ role: 'user', content: prompt }], { temperature: 0.9, topP: 0.95, maxTokens: 8192 });
            messages = parseConversation(text);
            if (!messages && process.env.LOCALCORE_DEBUG) {
              console.warn('  [debug] unparseable output (first 400 chars): ' + text.slice(0, 400).replace(/\n/g, '\\n'));
            }
          } catch (error) {
            // Truncated output (finish_reason=length) carries partial content —
            // try to salvage complete messages from it before retrying.
            if (error.truncated && error.partial) {
              messages = parseConversation(error.partial);
              if (!messages && process.env.LOCALCORE_DEBUG) {
                console.warn('  [debug] truncated and unsalvageable (first 300 chars): ' + error.partial.slice(0, 300).replace(/\n/g, '\\n'));
              }
            } else if (!error.truncated) {
              console.warn('  Completion error (retry ' + (retry + 1) + '/3): ' + error.message);
            }
          }
        }
        if (!messages) {
          failed++;
          console.warn('  Skipped seed "' + seed.slice(0, 50) + '" after 3 unparseable completions.');
          continue;
        }
        out.write(JSON.stringify({
          messages,
          source: 'self_instruct',
          teacher: TEACHER.id,
          teacherLicense: TEACHER.license,
          personaId: persona.id,
          seed,
          variation,
          generatedAt: new Date().toISOString(),
          tags: persona.training.tags || []
        }) + '\n');
        written++;
        if (written % 10 === 0) console.log('  ' + written + ' conversations written...');
      }
    }
  } finally {
    out.end();
    if (server) stopTeacherServer(server);
  }

  console.log('Done. Wrote ' + written + ' conversations' + (failed ? ' (' + failed + ' seeds failed)' : '') + ' to:');
  console.log('  ' + outPath);
  console.log('Next: npm run omni:curate');
}

main().catch(error => {
  console.error('Generation failed: ' + error.message);
  process.exitCode = 1;
});
