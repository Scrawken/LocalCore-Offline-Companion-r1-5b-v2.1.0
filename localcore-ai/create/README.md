# LocalCore-Create (Model B)

**Capabilities:** Image generation · video generation (staged)
**Base model:** FLUX.1-schnell — [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) (commercially safe)
**Training method:** LoRA (image stage); architecture extension (video stage)
**Status:** Scaffold — training queued until 24GB+ GPU available

---

## Why This Base

FLUX.1-schnell is already our production image model, is Apache 2.0, and generates in 4 steps — ideal for an interactive desktop app. Fine-tuning it gives LocalCore its own visual style and character consistency. **FLUX.1-dev is excluded** (non-commercial weights).

## Replaces (eventually)

| Current model | Role | Note |
|---|---|---|
| FLUX.1-schnell (stock) | Image generation | Same architecture — we fine-tune our own identity onto it |
| SVD-XT-1.1 | Video generation (demo) | ⚠️ Stability non-commercial license — must be replaced, not distilled, for commercial launch |

## Staged Plan

- **Stage 1 — Image identity (24GB+ GPU):** LoRA fine-tune on a curated LocalCore style/character dataset. Goal: consistent avatar-adjacent character art and UI-appropriate styles without prompt gymnastics.
- **Stage 2 — Video (24GB+ GPU, later):** Video models are image models plus temporal layers — this is an architecture extension of Stage 1, not a separate model. Base selection for the video stage is **TBD** because SVD-XT's license is non-commercial; candidates will be evaluated when Stage 1 ships.

## Data Recipe

See [data/README.md](data/README.md). Summary:

- Style dataset: curated images in target styles with detailed captions (caption teacher: Qwen2.5-VL-3B, Apache 2.0 — distillation-safe).
- Character consistency set: multi-angle/multi-expression sets per recurring character.
- All images either self-generated (from our own FLUX runs under Apache 2.0), human-made, or verifiably license-clean. No scraped copyrighted artwork.

## Training Plan

Reference config: [configs/flux-lora.yaml](configs/flux-lora.yaml)

- LoRA rank 16–32 on attention layers; 4-step schnell distillation preserved (do not train away the speed).
- Train at 1024px with aspect-ratio bucketing.
- **Do not attempt on the RTX 3060** — 12GB is technically possible with heavy offloading but impractically slow. Queued for 24GB+.

## Evals (gate for replacing stock FLUX)

1. Style consistency: fixed prompt set produces on-style results ≥ teacher baseline (human review).
2. Character consistency: same character recognizable across 5 prompts/angles.
3. Speed: still ≤ 4 steps at 1024px on RTX 3060 inference.
4. VRAM: inference footprint no larger than stock schnell.

## Open Questions

- Video-stage base model (commercially safe) — research task when Stage 1 nears completion.
- Do we want a ControlNet-style pose/depth path for avatar-driven generation, or keep the first version text-to-image only?
