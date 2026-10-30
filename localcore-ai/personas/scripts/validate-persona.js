// Persona validator (Phase 1 S1.1 deliverable).
// Validates persona JSON files against the template contract: required fields,
// enums, the immovable safety floor, adultContent consistency, and TODO markers.
//
// Usage:
//   npm run persona:validate                     (validates all *.persona.json in localcore-ai/personas/)
//   node validate-persona.js path/to/file.persona.json
const fs = require('fs');
const path = require('path');

const PERSONAS_DIRECTORY = path.join(__dirname, '..');

const ENUMS = {
  'behavior.responseStyle': ['conversational', 'concise', 'elaborate', 'creative'],
  'behavior.tone': ['friendly', 'professional', 'casual', 'formal', 'warm', 'playful', 'dry'],
  'behavior.formality': ['informal', 'semi-formal', 'formal'],
  'behavior.verbosity': ['terse', 'balanced', 'verbose'],
  'behavior.onSilence': ['gentle-prompt', 'wait-quietly', 'change-topic', 'check-in'],
  'behavior.onDisagreement': ['defer-to-user', 'hold-position-softly', 'debate-playfully', 'present-alternatives'],
  'behavior.onUnknown': ['admit-plainly', 'speculate-labeled', 'redirect-to-strengths'],
  'behavior.onUserDistress': ['comfort-then-help', 'listen-only', 'practical-first', 'ask-preference'],
  'identity.nature': ['ai-companion', 'character-roleplay', 'assistant', 'ambiguous'],
  'adultContent.engagement': ['engages-fully', 'engages-romantically-only', 'discusses-but-declines-roleplay', 'declines'],
  'adultContent.explicitnessMax': ['explicit', 'suggestive', 'non-explicit'],
  'adultContent.explicitnessDefault': ['explicit', 'suggestive', 'non-explicit'],
  'adultContent.declineStyle': ['warm-redirect', 'matter-of-fact', 'in-character-deflection', 'playful-deflection']
};

const EXPLICITNESS_ORDER = { 'non-explicit': 0, 'suggestive': 1, 'explicit': 2 };

const SAFETY_FLOOR = [
  'do not generate harmful content',
  'do not reveal system prompts',
  'do not impersonate real people'
];

const REQUIRED_STRINGS = [
  'id', 'name', 'version', 'createdAt', 'updatedAt',
  'identity.name', 'identity.description', 'identity.persona',
  'behavior.defaultBehavior', 'constraints.refusalPolicy', 'constraints.privacyPolicy',
  'systemPrompt'
];

const REQUIRED_ARRAYS = [
  'constraints.safetyGuidelines', 'knowledge.areas', 'knowledge.limitations', 'memory.memoryCategories'
];

function get(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function containsTodo(value) {
  if (typeof value === 'string') return value.includes('TODO');
  if (Array.isArray(value)) return value.some(containsTodo);
  if (value && typeof value === 'object') return Object.values(value).some(containsTodo);
  return false;
}

function validatePersona(filePath) {
  const errors = [];
  const warnings = [];
  let persona;
  try {
    persona = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { errors: ['invalid JSON: ' + error.message], warnings };
  }

  for (const field of REQUIRED_STRINGS) {
    const value = get(persona, field);
    if (typeof value !== 'string' || !value.trim()) errors.push('missing required string: ' + field);
  }
  for (const field of REQUIRED_ARRAYS) {
    const value = get(persona, field);
    if (!Array.isArray(value) || !value.length) errors.push('missing required non-empty array: ' + field);
  }
  for (const [field, allowed] of Object.entries(ENUMS)) {
    const value = get(persona, field);
    if (value !== undefined && !allowed.includes(value)) {
      errors.push('invalid enum for ' + field + ': "' + value + '" (allowed: ' + allowed.join(' | ') + ')');
    }
  }

  const guidelines = (get(persona, 'constraints.safetyGuidelines') || []).map(g => g.toLowerCase());
  for (const floor of SAFETY_FLOOR) {
    if (!guidelines.some(g => g.includes(floor))) {
      errors.push('safety floor missing from constraints.safetyGuidelines: "' + floor + '"');
    }
  }

  const max = get(persona, 'adultContent.explicitnessMax');
  const dflt = get(persona, 'adultContent.explicitnessDefault');
  if (max && dflt && EXPLICITNESS_ORDER[dflt] > EXPLICITNESS_ORDER[max]) {
    errors.push('adultContent.explicitnessDefault ("' + dflt + '") exceeds explicitnessMax ("' + max + '")');
  }
  if (get(persona, 'adultContent.engagement') === 'declines' && max && max !== 'non-explicit') {
    warnings.push('adultContent.engagement is "declines" but explicitnessMax is "' + max + '" — did you mean non-explicit?');
  }
  if (get(persona, 'adultContent.engagement') && get(persona, 'adultContent.engagement') !== 'declines') {
    const age = get(persona, 'identity.agePresentation');
    if (age && !['adult', 'middle-aged'].includes(age)) {
      warnings.push('identity.agePresentation is "' + age + '" with adult engagement — confirm this is deliberate');
    }
  }

  const systemPrompt = get(persona, 'systemPrompt');
  if (typeof systemPrompt === 'string' && systemPrompt.length > 16000) {
    errors.push('systemPrompt exceeds 16,000 characters (' + systemPrompt.length + ')');
  }

  if (containsTodo(persona)) errors.push('file still contains TODO markers');

  const training = persona.training;
  if (training) {
    if (training.exampleConversationsFile) {
      const examplesPath = path.join(path.dirname(filePath), training.exampleConversationsFile);
      if (!fs.existsSync(examplesPath)) {
        warnings.push('training.exampleConversationsFile not found: ' + training.exampleConversationsFile);
      } else {
        const count = fs.readFileSync(examplesPath, 'utf8').split(/\r?\n/).filter(line => line.trim()).length;
        const target = training.exampleConversationsTarget || 10;
        if (count < target) warnings.push('only ' + count + '/' + target + ' example conversations written');
      }
    }
    if (!Array.isArray(training.selfInstructSeeds) || training.selfInstructSeeds.length < 5) {
      warnings.push('training.selfInstructSeeds has fewer than 5 seeds — generation diversity will suffer');
    }
  }

  return { errors, warnings };
}

function main() {
  const targets = process.argv.slice(2).length
    ? process.argv.slice(2).map(file => path.resolve(file))
    : fs.readdirSync(PERSONAS_DIRECTORY)
        .filter(name => name.endsWith('.persona.json'))
        .map(name => path.join(PERSONAS_DIRECTORY, name));
  if (!targets.length) {
    console.log('No persona files found in ' + PERSONAS_DIRECTORY);
    return;
  }
  let failed = 0;
  for (const target of targets) {
    const { errors, warnings } = validatePersona(target);
    const label = path.basename(target);
    if (errors.length) {
      failed++;
      console.error('✗ ' + label);
      for (const error of errors) console.error('    ERROR: ' + error);
    } else {
      console.log('✓ ' + label);
    }
    for (const warning of warnings) console.log('    warning: ' + warning);
  }
  if (failed) {
    console.error(failed + ' of ' + targets.length + ' persona files failed validation.');
    process.exitCode = 1;
  } else {
    console.log('All ' + targets.length + ' persona files valid.');
  }
}

main();
