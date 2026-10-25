# LocalCore Offline Multimodal AI Desktop (WINDOWS)

An offline-first Windows desktop prototype for local chat and multimodal creation.

## Current Prototype Status

The chat uses a local Dolphin 3.0 Llama 3.1 8B Q4_K_M GGUF model through llama.cpp. It is configured to discuss adult sexuality and non-explicit nudity without treating the topics themselves as off-limits. Still-image understanding and optional speech input/output are integrated into chat. The app now has a first 3D avatar foundation: import a rigged VRM file, choose an available expression, see subtle idle motion, and animate mouth opening from local Piper playback. The avatar is stored under the app's local user-data directory. It does not generate character models, infer expressions beyond simple reply-word cues, or provide a live audio/video call yet. The image, music, and video creation tabs remain procedural demos.

## Talking Avatar Foundation

- Select **Import VRM character** in chat to load a rigged `.vrm` file. The character stays on this device and is restored at startup; no model is downloaded.
- The renderer uses Three.js and `@pixiv/three-vrm`, bundled locally at startup. Runtime rendering works offline after dependencies are installed.
- The avatar is automatically centered and framed to fit; use **Torso view** or **Full-body view**, drag to rotate, and use the mouse wheel to zoom. Idle head/body motion is included.
- Only expressions supported by the active model are enabled in the menu. Some VRM files advertise standard expressions without binding them to facial shapes; for those, the renderer also checks a set of named facial morphs. Models without matching bindings or morphs cannot visibly change expression.
- **Flat torso preview** is an opt-in, temporary material override for recognized torso skin meshes. It replaces their texture with a uniform preview color; uncheck it to restore the original. It never edits the stored VRM.
- **Face detail preview** is an opt-in, temporary texture swap for VRMs whose main face material appears to use a shadow mask as its color map. It uses the embedded facial-detail texture to reveal features, but does not repair a missing or incorrect underlying skin texture; a proper fix requires repairing and re-exporting the VRM. Uncheck it to restore the original material. It never edits the stored VRM.
- When local Piper replies are enabled, the VRM `aa` mouth expression and recognized mouth morphs follow the audio signal. Mouth motion still depends on the model having compatible facial controls.
- A usable, properly rigged VRM asset is still required. The current procedural image demo cannot produce a rigged 3D character.

## Local Vision & Speech

Local vision and speech are integrated into the desktop chat, but their models are installed separately from the text model:

- **Vision:** Qwen2.5-VL-3B-Instruct Q4_K_M with its F16 projector. Chat accepts PNG, JPEG, and WebP attachments up to 8 MB, analyzes them locally, and passes the visual description to the text model. Images are saved with their conversation when remembering is enabled. The vision CLI exits after each request to release its GPU allocation.
- **GPU headroom:** On an RTX 3060 12 GB, with the chat model resident and idle, the vision fixture took about 5.4 seconds and total observed GPU use peaked near 10.7 GiB, leaving about 1.6 GiB. This is not a test of simultaneous chat generation; avoid treating the remaining memory as guaranteed headroom.
- **Dolphin coexistence check:** The vision fixture still passed while Dolphin 8B was loaded in the chat server. This confirms sequential on-demand vision analysis works with both models resident, not simultaneous chat generation; no concurrent peak VRAM measurement was captured.
- **Speech recognition:** Whisper `small.en` transcribed the 4.82-second local Piper voice fixture in 2.80 seconds on CPU (1.72x real time) and correctly recognized “Local core voice benchmark.” `base.en` took 0.95 seconds (5.07x real time) but rendered that phrase less accurately.
- **Speech synthesis:** Piper Lessac medium on CPU generated the 4.82-second fixture in 2.32 seconds (2.08x real time).

These are single-machine feasibility measurements, not quality guarantees. The image and speech models/runtimes are installed by `npm run setup:multimodal`, not `npm run setup:local-model`. Run `npm run test:vision` and `npm run test:speech` for local smoke tests.

- **Push-to-talk speech input:** Microphone capture starts only after selecting **Start microphone**, is limited to 60 seconds, and uses Whisper `small.en` on CPU. The device selector prefers the **Razer Seiren X** when available; otherwise the system default or a user-selected input is used. Use **Refresh devices** after granting permission if device names are initially hidden. The transcript is inserted into the prompt for review; it is not sent until the user presses **Send to Local Model**. Recorded audio is held temporarily in memory and a temporary WAV file for transcription, then removed; it is not added to conversation memory.
- **Opt-in face-to-face vision:** Camera capture is off by default. Enabling the camera opens a local preview using the selected device (preferring **HD Webcam eMeet C960** when available); one still frame is captured only when sending a chat message, analyzed locally, and passed as context to the same text model. Use **Refresh devices** after granting permission if device names are initially hidden. Unchecking the camera control stops all camera tracks. The frame is saved with the conversation only when remembering is enabled.
- **Opt-in spoken replies:** The **Speak replies automatically** checkbox is off by default. When enabled, Piper synthesizes and plays each assistant reply locally; when remembering is enabled, the WAV is saved with its conversation.

The downloaded Qwen, Whisper, and Piper model files are pinned by revision and SHA-256. The Piper runtime archive has a locally recorded SHA-256 because the release does not publish a checksum. Check the upstream voice model's terms before redistributing it.

## Prepare a Real Text-Inference Test Run

1. Install Node.js 20 or newer and run `npm install`.
2. Run `npm run setup:local-model` while online. It downloads the pinned Windows x64 CUDA 12.4 runtime and verifies its SHA-256 checksum.
3. Run `npm run setup:chat-model` while online. It installs Dolphin 3.0 Llama 3.1 8B Q4_K_M (about 4.58 GiB) and verifies the pinned SHA-256.
4. Run `npm run setup:multimodal` while online to install the pinned vision and speech models/runtimes (about 3.8 GB of model weights plus runtime archives). Downloads are checked against pinned SHA-256 values before installation.
5. Run `npm start`. The app starts the local llama.cpp server bound to `127.0.0.1`, offloads the text model to CUDA, and stores conversations locally.
6. Run `npm run test:inference`, `npm run test:chat-model`, `npm run test:chat-context`, `npm run test:vision`, and `npm run test:speech` for model smoke tests. Run `npm test` for the core checks and `npm run test:memory` for local history persistence.

After the required setup commands, inference works offline. If setup is interrupted, rerun the relevant setup command; it verifies existing files and retries incomplete downloads. The CPU runtime remains available under `runtime/llama/` for comparison. The packaged `.exe` files and older stubs are not rebuilt by these commands; use the npm development launch for this test run.

## Local Conversation Memory

- Conversations and generated demo files are saved under Electron's per-user application data directory in `memory/`.
- Each saved conversation is associated with the chat model that created it. Switching models starts a fresh chat context; older conversations remain available in Memory but are not sent as prompt history to a different model.
- The Memory tab lets you search and reopen saved conversations and preview or download their generated items.
- Use the remembering checkbox in the chat tab to pause or resume saving. Existing records are retained while remembering is paused.
- Deleting a conversation also deletes its generated files.
- Saved conversations are associated with a `default` avatar identifier to support adding multiple avatars later.
- Run `npm run test:memory` to validate persistence, pause/resume behavior, asset retrieval, and deletion.
- Saved local data is not encrypted.

## Project Files & Commands

- `LocalCore.bat` and the included `.exe` files are legacy launch/installer artifacts from an earlier version; they are not rebuilt for the current model setup and should be removed or regenerated.
- `npm run setup:local-model` installs and verifies the native Windows CUDA runtime.
- `npm run setup:chat-model` installs and verifies the only supported chat model. It is covered by Meta's Llama 3.1 Community License; review that license before redistributing it.
- `npm run setup:multimodal` installs and verifies local vision/speech models and Windows runtimes.
- `installer/stage-assets.bat` and `npm run stage:assets` stage local model/runtime assets to `%APPDATA%\LocalCore`.
- `pipelines/image_pipeline.js`, `pipelines/music_pipeline.js`, and `pipelines/video_pipeline.js` create procedural demo PNG, WAV, and GIF files in `output/`. These are placeholder implementations and will be replaced with permissioned desktop tools in Phase 5.
- Development run: `npm start` (requires installed project dependencies).
- Windows distribution build: `npm run dist:win`.

## Quick Start
- **First-time setup** (online): `npm run setup:local-model`, `npm run setup:chat-model`, then `npm run setup:multimodal`.
- **Run the real local chat** (offline after setup): `npm start`.
- **Test model inference**: `npm run test:inference`.
- The existing executable launchers and installer are not rebuilt or verified for this model setup.
