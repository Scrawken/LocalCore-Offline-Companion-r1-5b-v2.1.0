# LocalCore-Omni (Model A)

**Capabilities:** Text chat · image understanding · speech input (ASR) · speech output (TTS)
**Architecture:** Hybrid — Llama 3.1 text core + Qwen2.5-Omni encoders for vision/speech
**Text base model:** Llama 3.1 8B Instruct — [Llama 3.1 Community License](https://www.llama.com/llama3_1/license/) (commercially usable; distillation from Dolphin permitted)
**Vision/speech base:** Qwen2.5-Omni-3B encoders — [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
**Training method:** QLoRA (4-bit) — text core fits RTX 3060 12GB
**Status:** Scaffold

---

## Why a Hybrid

The original plan was Qwen2.5-Omni-3B end-to-end. Iteration on real generated data showed a hard ceiling: a 3B teacher cannot sustain a persona across turns (verbal tics metastasize, role confusion, generic-assistant collapse). The fix is to use the strongest conversational model we already own — Dolphin 3.0 Llama 3.1 8B — as the text teacher. That is only license-legal if the text *student* is a Llama derivative, so the text core becomes Llama 3.1 8B Instruct. Vision and speech stay on Qwen2.5-Omni encoders (Apache 2.0, distillation-safe teachers).

## Replaces (eventually)

| Current teacher | Role | Teacher license | Distillation-safe? |
|---|---|---|---|
| Dolphin 3.0 Llama 3.1 8B | Text chat / persona | Llama 3.1 Community | ✅ **Yes** — student is a Llama derivative |
| Qwen2.5-VL-3B-Instruct | Image understanding | Apache 2.0 | ✅ Yes |
| Whisper small.en | Speech recognition | MIT | ✅ Yes |
| Piper en_US-lessac-medium | Speech synthesis | MIT (runtime); voice data varies | ✅ Runtime yes; check voice terms before redistributing |

## Data Rules (read before generating anything)

- **Text persona/behavior data:** Dolphin 3.0 8B is the teacher. This is permitted because the Omni text core is a Llama 3.1 derivative — the Llama Community License allows using Llama-model outputs to improve other Llama models. The persona itself is *ours* (hand-written in [../personas/](../personas/)), not copied from Dolphin's tuning.
- **Do NOT use Dolphin outputs to train non-Llama models.** The vision/speech encoders (Qwen) must be trained only on Apache/MIT-teacher data.
- Vision, ASR, and TTS teachers are distillation-safe per the table above.
- Every dataset gets a manifest recording teacher, license, generation date, and filters applied. See [data/README.md](data/README.md).

## Distillation Pipeline

Three-stage tooling in [scripts/](scripts/), wired as npm scripts. Runs entirely on the RTX 3060 — no training involved at this stage.

```bash
npm run setup:teacher-model   # one-time: verifies the Dolphin 3.0 8B text teacher (same file as chat model)
npm run persona:validate      # validate persona files before generating from them
npm run omni:generate         # self-instruct: persona seeds -> data/raw/ (spawns teacher on port 11435)
npm run omni:curate           # filter, PII-scrub, dedup -> data/generated/ + manifest
npm run omni:review           # 5% human-review sample -> data/review/
node localcore-ai/omni/scripts/sample-review.js --approve   # flip manifest to reviewed:true
```

- **generate.js** loads a persona (default: [../personas/default.persona.json](../personas/default.persona.json)), runs each `training.selfInstructSeeds` scenario through the teacher with randomized mood/length/setting variations, and uses the persona's hand-written examples as style reference. `--persona <file>`, `--count N`, `--server-url <url>` to attach to an existing server.
- **curate.js** enforces the persona contract: rejects conversations containing `voice.neverSays` phrases, non-alternating/short/oversized conversations, exact and near duplicates (Jaccard ≥ 0.8 on word 3-grams), and scrubs emails/phones/URLs/IPs. Writes the manifest with per-source license provenance.
- **sample-review.js** requires human approval before any dataset is training-eligible; `--approve` only works after a review sample exists.

The teacher server runs on port **11435** so it never collides with the app's llama.cpp server on 11434.

## Training Plan

- **Stage 1 (RTX 3060):** QLoRA on the Llama 3.1 8B text core using persona + instruction data distilled from Dolphin. Validate chat quality against `npm run test:chat-model` fixtures.
- **Stage 2 (RTX 3060):** Add vision-description pairs (teacher: Qwen2.5-VL-3B) so image understanding matches current behavior.
- **Stage 3 (RTX 3060, if VRAM allows; else deferred):** Speech pairs (teacher: Whisper for ASR alignment; Piper audio as TTS reference targets).
- **Stage 4 (24GB+ GPU):** Full omni integration — wire the Llama text core to the Qwen2.5-Omni vision/speech encoders; consider larger variants.

Reference config: [configs/qlora-3b.yaml](configs/qlora-3b.yaml) *(text-core config; update base_model to the Llama 3.1 8B Instruct path before the first run)*

## Evals (gate for replacing teachers)

1. Passes existing `test:chat-model`, `test:chat-context`, `test:vision`, `test:speech` fixtures.
2. Persona consistency eval: fixed probe set, human-reviewed.
3. VRAM footprint ≤ current Dolphin + Qwen2.5-VL combined residency (~10.7 GiB observed peak on RTX 3060).
4. Streaming latency on RTX 3060 no worse than current llama.cpp pipeline.

## Open Questions

- Does Qwen2.5-Omni-3B speech-out quality meet the bar Piper sets, or do we keep Piper as a fallback voice?
- GGUF/llama.cpp export path for the omni model vs. running it via a different runtime — affects `engine/llama-cpp-provider.js` and the ModelProvider interface.
