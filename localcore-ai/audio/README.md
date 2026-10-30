# LocalCore-Audio (Model C)

**Capabilities:** Music and audio generation
**Base model:** Stable Audio Open Small — Stability Community License (free for organizations < $1M annual revenue)
**Training method:** LoRA / fine-tune via stable-audio-tools
**Status:** Scaffold — training queued until 24GB+ GPU available

---

## Why This Base

Music generation is architecturally different from image/video diffusion — it is audio-token generation, closer to a language model than to FLUX. That is why music gets its own project instead of being forced into Create.

Stable Audio Open Small is the only commercially-usable open music model that fits consumer GPUs. It is weaker than MusicGen — accepted trade-off. **MusicGen is excluded as a base** (CC-BY-NC non-commercial weights).

## Replaces (eventually)

| Current model | Role | Note |
|---|---|---|
| MusicGen-small-Q8 | Music generation (demo) | ⚠️ Non-commercial weights — stays in production for now, must be replaced before commercial launch |

## Risk Register

- **Base-model risk:** Stable Audio Open Small quality < MusicGen. If a better commercial-safe base appears before our training run, we switch bases — this project is the most likely of the three to change foundations. The data pipeline and evals are base-agnostic, so a switch costs little.
- **License ceiling:** Stability Community License requires a paid license past $1M annual revenue. Revisit at that threshold (a good problem to have).

## Data Recipe

See [data/README.md](data/README.md). Summary:

- Prompt → audio pairs: text descriptions mapped to loopable music beds and ambient SFX suitable for a companion app (short loops, mood tags, intensity tags).
- Sources: self-recorded/synthesized audio, public-domain and CC0 libraries (e.g., Freesound CC0 subset), and our own procedural generation. **No copyrighted music. No MusicGen outputs** (non-commercial teacher → taints a commercial student).
- Caption teacher for tagging: Qwen2.5-Omni's audio understanding (Apache 2.0) once Omni Stage 1 is running.

## Training Plan

Reference config: [configs/stable-audio-lora.yaml](configs/stable-audio-lora.yaml)

- LoRA on the diffusion transformer; keep the base's 44.1kHz stereo output.
- Target: 10–30 second loopable beds at companion-appropriate loudness.
- **Do not attempt on the RTX 3060.** Queued for 24GB+ GPU.

## Evals (gate for replacing MusicGen)

1. Loop seamlessness: no audible seam on 10s loop (automated check + human review).
2. Prompt adherence: mood/intensity tags reflected in output (human review panel).
3. Speed: 10s clip in ≤ 30s on RTX 3060 inference.
4. Quality floor: blind A/B vs MusicGen-small — must not be rated "much worse" by a majority of reviewers.

## Open Questions

- Do we also want sound-effect generation (UI sounds, avatar foley) in scope for v1, or music beds only?
- Is the $1M Stability license ceiling acceptable long-term, or do we budget for a paid license / alternative base at that point?
