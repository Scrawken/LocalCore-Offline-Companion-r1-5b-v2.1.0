# LocalCore Personas — Authoring Framework

**Status:** Scaffold
**Purpose:** Define, author, and train the characters that LocalCore-Omni plays.

---

## How It Works

This folder is the **authoring layer** for personas. It extends the runtime persona schema defined in [PHASE1_PERSONA_SCHEMA.md](../../PHASE1_PERSONA_SCHEMA.md) with training-specific sections. The flow:

```
persona.template.json  ──copy & fill──▶  <name>.persona.json  ──build──▶  two outputs
                                              │
                                              ├─▶ runtime persona JSON  (app loads this; Phase 1 schema)
                                              └─▶ training data         (examples/*.jsonl → omni/data/generated/)
```

- **Runtime:** the app loads persona JSON from `%APPDATA%\LocalCore\personas\` (Phase 1 S1.1). Users can inspect, edit, import, export.
- **Training:** each persona's `training` section + hand-written examples feed the Omni distillation pipeline, so the model *learns* the character rather than only being prompted with it.

## Files

| File | Role |
|---|---|
| [persona.template.json](persona.template.json) | The fill-in template. Every decision point has `// OPTIONS:` comments — pick from the menu or write custom. |
| [default.persona.json](default.persona.json) | The shipped default companion: **Maura**. |
| [examples/default.examples.jsonl](examples/default.examples.jsonl) | Hand-written example conversations for the default persona. The highest-value training data in the project. |

## Creating a New Persona

1. Copy `persona.template.json` to `<name>.persona.json`.
2. Fill every section. Anything left as a `TODO` fails validation.
3. Write at least 10 example conversations in `examples/<name>.examples.jsonl` (schema in the template's `training` section).
4. Validate: `npm run persona:validate <name>` *(script pending — Phase 1 S1.1 deliverable)*.
5. Add to the training manifest in [../omni/data/README.md](../omni/data/README.md).

## Design Rules

- **Personas are characters, not jailbreaks.** Every persona inherits the base safety floor (no real-person impersonation, no system-prompt revelation, no illegal content). The `constraints` section can *add* limits but never remove the floor.
- **Adult content is a dial, not a switch.** The `adultContent.explicitness` field is user-adjustable at runtime: `explicit` (default) → `suggestive` → `off`. Personas declare their *maximum* engagement level; the user's dial can only turn it down from there. See the template for the full model.
- **One file per persona.** Self-contained, exportable, shareable.
- **Examples beat adjectives.** Ten real conversations teach the model more than fifty trait words. Traits guide; examples define.
