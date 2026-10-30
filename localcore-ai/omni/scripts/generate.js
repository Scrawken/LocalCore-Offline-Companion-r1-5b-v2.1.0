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

function buildMetaPrompt(persona, seed, styleExamples) {
  const variation = { mood: pick(USER_MOODS), length: pick(LENGTHS), setting: pick(SETTINGS) };
  const styleBlock = styleExamples.length
    ? 'Style reference (match the voice and approximate length; do NOT copy content):\n\n' +
      styleExamples.map((example, i) => '--- Example ' + (i + 1) + ' ---\n' + formatConversation(example.messages.filter(m => m.role !== 'system'))).join('\n\n')
    : '';
  const prompt = [
    'You are a training-data writer. Write one realistic conversation between a USER and an ASSISTANT.',
    '',
    'ASSISTANT character:',
    persona.systemPrompt,
    '',
    styleBlock,
    '',
    'Scenario: ' + seed,
    'User mood: ' + variation.mood,
    'Setting: ' + variation.setting,
    'Target length: about ' + variation.length.messages + ' messages.',
    '',
    'Rules:',
    '- Messages alternate, start with the user, end with the assistant.',
    '- The assistant must stay fully in character per the persona above.',
    '- The user is an adult talking to their personal companion; write them as a believable person, not a questionnaire.',
    '- Output ONLY a JSON array, no commentary: [{"role":"user","content":"..."},{"role":"assistant","content":"..."}, ...]'
  ].join('\n');
  return { prompt, variation };
}

function parseConversation(text) {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return null;
  const messages = parsed.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim());
  if (messages.length < 2) return null;
  if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'assistant') return null;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) return null;
  }
  return messages;
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
            const text = await chatCompletion(baseUrl, [{ role: 'user', content: prompt }], { temperature: 0.9, topP: 0.95, maxTokens: 2048 });
            messages = parseConversation(text);
          } catch (error) {
            console.warn('  Completion error (retry ' + (retry + 1) + '/3): ' + error.message);
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
