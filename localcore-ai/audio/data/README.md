# LocalCore-Audio — Data Recipe

Raw and generated datasets live here at runtime but are **git-ignored**. Only this recipe, schemas, and manifests are committed.

## Directory Layout (runtime)

```
data/
  raw/                 ← unfiltered audio pools (git-ignored)
  generated/           ← curated training sets with metadata (git-ignored)
  manifests/           ← committed: one JSON per dataset version
```

## Datasets

### 1. `music_beds_v1` — loopable companion music

**Allowed sources only:**

- Self-recorded or self-synthesized audio;
- CC0 / public-domain libraries (e.g., the CC0 subset of Freesound — record source URL per file);
- Our own procedural generation.

**No copyrighted music. No MusicGen outputs** — MusicGen weights are CC-BY-NC, and a non-commercial teacher taints a commercial-bound student.

**Format:** 44.1kHz stereo WAV, 10–30s, loudness-normalized to companion-appropriate levels, with a `metadata.jsonl` beside the files:

```json
{"file": "bed_0001.wav", "prompt": "calm ambient electronic bed, soft pads, no drums", "mood": "calm", "intensity": 0.2, "loopable": true, "duration_s": 20.0, "source": "cc0-freesound", "source_url": "...", "license": "CC0"}
```

**Target size:** 500–2,000 clips for the first LoRA.

**Caption/tagging teacher:** Qwen2.5-Omni audio understanding (Apache 2.0) once Omni Stage 1 is running; until then, hand-tag. Mood and intensity tags are required on every clip — the evals test prompt adherence against them.

### 2. SFX (deferred)

UI sounds and avatar foley are an open question in [../README.md](../README.md). Not in scope for v1.

## Manifest Format (`manifests/<name>.json`)

```json
{
  "dataset": "music_beds_v1",
  "created": "YYYY-MM-DD",
  "sources": [{"name": "cc0-freesound", "license": "CC0", "count": 0}],
  "tagging": "hand|qwen-omni",
  "reviewed": false,
  "notes": ""
}
```

## Curation Rules

- Loop check: every `loopable: true` clip must pass an automated seam check before inclusion.
- Clipping/silence check: reject clips with digital clipping or > 20% silence.
- License provenance per file, not just per dataset — one bad file poisons the set.
- Human listen-check a 10% sample.
