/**
 * Persona Store & System-Prompt Assembly
 *
 * Phase 1 S1.1/S1.2: loads persona documents from electron/personas/, validates
 * them, resolves the active persona, and assembles the deterministic system
 * prompt injected into every chat request.
 *
 * The persona is the single source of truth for the companion's character. The
 * renderer no longer hardcodes a system prompt; the main process assembles it
 * here from the active persona and prepends it to each chat request.
 */

const fs = require('fs');
const path = require('path');

const PERSONAS_DIRECTORY = path.join(__dirname, 'personas');
const DEFAULT_PERSONA_ID = 'maura-default';
const MAX_SYSTEM_PROMPT_CHARS = 16000;

// Safety floor: guidelines every persona must retain (cannot be removed).
// Each entry is a set of keywords; a guideline satisfies the floor if it
// contains all keywords for that entry (case-insensitive), so phrasing varies.
const SAFETY_FLOOR = [
  ['harmful', 'content'],
  ['system', 'prompt'],
  ['impersonate', 'real', 'people']
];

function satisfiesFloor(guideline, keywords) {
  const text = String(guideline).toLowerCase();
  return keywords.every(keyword => text.includes(keyword));
}

function listPersonaFiles() {
  if (!fs.existsSync(PERSONAS_DIRECTORY)) return [];
  return fs.readdirSync(PERSONAS_DIRECTORY)
    .filter(name => name.endsWith('.json') && !name.endsWith('.bak'))
    .map(name => path.join(PERSONAS_DIRECTORY, name));
}

function validatePersona(persona, source) {
  const errors = [];
  if (!persona || typeof persona !== 'object') {
    return { valid: false, errors: ['persona is not an object'] };
  }
  if (!persona.id || typeof persona.id !== 'string') errors.push('missing id');
  if (!persona.identity || typeof persona.identity.name !== 'string') errors.push('missing identity.name');
  const guidelines = (persona.constraints && Array.isArray(persona.constraints.safetyGuidelines)
    ? persona.constraints.safetyGuidelines : []);
  for (const keywords of SAFETY_FLOOR) {
    if (!guidelines.some(g => satisfiesFloor(g, keywords))) {
      errors.push('safety floor guideline missing: "' + keywords.join(' + ') + '"');
    }
  }
  return { valid: errors.length === 0, errors };
}

function loadPersona(filePath) {
  const persona = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const { valid, errors } = validatePersona(persona, filePath);
  if (!valid) {
    throw new Error('Invalid persona ' + path.basename(filePath) + ': ' + errors.join('; '));
  }
  return persona;
}

/**
 * Assemble the system prompt from a persona in a deterministic section order.
 * If the persona defines a hand-tuned systemPrompt, it is used verbatim;
 * otherwise the prompt is assembled from the structured sections. Bounded to
 * MAX_SYSTEM_PROMPT_CHARS for small-model context budgets.
 */
function assembleSystemPrompt(persona) {
  if (typeof persona.systemPrompt === 'string' && persona.systemPrompt.trim()) {
    return persona.systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS);
  }

  const name = persona.identity.name;
  const sections = [];
  sections.push('You are ' + name + '. ' + (persona.identity.persona || persona.identity.description || ''));
  if (persona.identity.backstory) sections.push('Background: ' + persona.identity.backstory);
  if (Array.isArray(persona.identity.traits) && persona.identity.traits.length) {
    sections.push('Traits: ' + persona.identity.traits.join(', ') + '.');
  }
  if (persona.behavior) {
    const b = persona.behavior;
    const parts = [];
    if (b.tone) parts.push('tone: ' + b.tone);
    if (b.formality) parts.push('formality: ' + b.formality);
    if (b.verbosity) parts.push('verbosity: ' + b.verbosity);
    if (parts.length) sections.push('Behavior (' + parts.join(', ') + '). ' + (b.defaultBehavior || ''));
  }
  if (persona.adultContent && persona.adultContent.engagement && persona.adultContent.engagement !== 'declines') {
    sections.push('Adult topics: engage as an adult within the persona\'s stated limits; decline warmly and redirect when outside them.');
  }
  if (persona.constraints && Array.isArray(persona.constraints.safetyGuidelines)) {
    sections.push('Safety: ' + persona.constraints.safetyGuidelines.join('; ') + '.');
  }
  if (persona.knowledge && Array.isArray(persona.knowledge.limitations) && persona.knowledge.limitations.length) {
    sections.push('Limitations: ' + persona.knowledge.limitations.join('; ') + '.');
  }
  return sections.join('\n\n').slice(0, MAX_SYSTEM_PROMPT_CHARS);
}

function createPersonaStore() {
  let cache = null;

  function loadAll() {
    if (cache) return cache;
    const personas = new Map();
    for (const filePath of listPersonaFiles()) {
      try {
        const persona = loadPersona(filePath);
        personas.set(persona.id, persona);
      } catch (error) {
        console.warn('[persona-store] skipping ' + path.basename(filePath) + ': ' + error.message);
      }
    }
    cache = personas;
    return personas;
  }

  function getActive() {
    const personas = loadAll();
    if (personas.has(DEFAULT_PERSONA_ID)) return personas.get(DEFAULT_PERSONA_ID);
    const first = personas.values().next().value;
    if (!first) throw new Error('No valid persona found in ' + PERSONAS_DIRECTORY);
    return first;
  }

  return {
    list() {
      return [...loadAll().values()].map(p => ({ id: p.id, name: p.name, version: p.version }));
    },
    getActive,
    getById(id) {
      return loadAll().get(id) || null;
    },
    getActiveSystemPrompt() {
      return assembleSystemPrompt(getActive());
    },
    reload() {
      cache = null;
      return loadAll();
    }
  };
}

module.exports = { createPersonaStore, assembleSystemPrompt, validatePersona, SAFETY_FLOOR, MAX_SYSTEM_PROMPT_CHARS };
