# LocalCore-Omni — Data Recipe

Raw and generated datasets live here at runtime but are **git-ignored**. Only this recipe, schemas, and manifests are committed.

## Directory Layout (runtime)

```
data/
  raw/                 ← teacher outputs, unfiltered (git-ignored)
  generated/           ← curated training files (git-ignored)
  manifests/           ← committed: one JSON per dataset version
```

## Datasets

### 1. `persona_sft_v1` — text persona & instruction (Stage 1)

**Teacher:** Dolphin 3.0 Llama 3.1 8B. This is license-legal because the Omni text core is a **Llama 3.1 derivative** — the Llama Community License permits using Llama-model outputs to improve other Llama models. **Never use Dolphin outputs to train the Qwen vision/speech encoders or any non-Llama model.**

Allowed sources, in priority order:

1. **Hand-written** persona definition and example conversations (highest value, ours outright);
2. **Self-instruct:** Dolphin 3.0 8B generates conversations conditioned on our hand-written persona/system prompts (the persona is *ours*, not copied from Dolphin's tuning);
3. **Apache-2.0 instruction datasets** (record exact dataset name + version in the manifest).

**Format (JSONL, chat template):**
```json
{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}], "source": "self_instruct|handwritten|apache_dataset", "tags": ["persona", "companion-tone"]}
```

**Target size:** 3k–10k conversations for Stage 1.

### 2. `vision_pairs_v1` — image understanding (Stage 2)

Teacher: Qwen2.5-VL-3B-Instruct (Apache 2.0 — distillation-safe). Run it over license-clean images (CC0/own photos/own FLUX generations) and record its descriptions as targets.

```json
{"image": "raw/images/000123.png", "question": "Describe this image.", "answer": "...", "teacher": "Qwen2.5-VL-3B-Instruct", "teacher_license": "Apache-2.0"}
```

### 3. `speech_pairs_v1` — ASR/TTS alignment (Stage 3)

- ASR teacher: Whisper small.en (MIT) — audio → transcript pairs.
- TTS reference: Piper en_US-lessac-medium — text → audio targets. **Check the upstream voice model's terms before redistribution** (same rule the main README already applies to Piper).

## Manifest Format (`manifests/<name>.json`)

```json
{
  "dataset": "persona_sft_v1",
  "created": "YYYY-MM-DD",
  "sources": [{"name": "...", "license": "...", "teacher": "...", "count": 0}],
  "filters": ["dedup", "length>=32chars", "pii-scrub"],
  "reviewed": false,
  "notes": ""
}
```

## Curation Rules

- Deduplicate aggressively; self-instruct data collapses without it.
- PII-scrub everything (aligns with app `privacy.piiScrubbing`).
- Human-review a 5% sample of every dataset before training; set `reviewed: true` in the manifest.
- If a source's license is ever in doubt, it comes out. Provenance beats volume.
