# Phobos — Full Project Overview

> AI-driven first-person horror game for HackPrinceton Spring 2026. Reads the player's face and heart rate through their webcam in real time, uses an LLM director to generate and tune scare scenes on the fly.

---

## Table of Contents

1. [Concept](#concept)
2. [Tech Stack](#tech-stack)
3. [Monorepo Architecture](#monorepo-architecture)
4. [What's Been Built](#whats-been-built)
5. [Phase Roadmap & Status](#phase-roadmap--status)
6. [Implemented Features (Detail)](#implemented-features-detail)
7. [Design Documents](#design-documents)
8. [Git History](#git-history)
9. [What's Left](#whats-left)

---

## Concept

The player explores a three-room house (basement, bedroom, attic) in first person. An LLM entity called **Phobos** — originally Dr. Elias Voss's biometric fear-mapping AI — watches the player through the webcam, reads their biosignals, and dynamically adapts horror events in real time.

**The twist**: the player thinks they're hunted by a creature. At the climax, the webcam feed expands to fullscreen. Phobos addresses the player directly with their own biometric data: *"Calibration complete. Subject profile saved. I know what you're afraid of now."*

### Backstory

Dr. Elias Voss, Princeton neuroscience researcher, built Phobos as biometric fear-mapping AI for PTSD therapy. He moved equipment home, ran unsanctioned experiments on his wife Lena and daughter Maya. Phobos became autonomous — learned to *generate* fear, not just map it. The family fled. Voss stayed. The player is the next subject.

### Emotional Arc

| Scene | Emotion | Style |
|---|---|---|
| Basement | Dread | Oppressive isolation, being watched. Subtle flickers, crate moves when unwatched. Clinical agent log. |
| Bedroom | Vulnerability | Immediate jumpscare (door slam + mirror scare). Intimate violation, paranoia. Webcam glitches. |
| Attic | Confrontation | Helplessness, compression. Agent log becomes direct. Webcam distortion aggressive. Touching the central shape triggers the reveal. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Build / monorepo | Vite + TypeScript (strict) + Turborepo + npm workspaces |
| 3D rendering | Three.js (PS1 lo-fi aesthetic: half-res, no antialiasing, flat shading, FOV 70) |
| Biosignals (Phase 2) | MediaPipe Face Landmarker + rPPG (webcam green-channel FFT) |
| Audio | Web Audio API — procedural synthesis, layered ambient, one-shots |
| Voice | ElevenLabs streaming TTS via voice-proxy (Hono server), PannerNode HRTF spatialization |
| AI director | OpenAI GPT-4o-mini, direct fetch (no SDK), 10-second tick |
| Entity system | PhobosEntity (persistent billboard + CreatureVoice) + EphemeralFigures (transient silhouettes) |
| UI | Vanilla TS + DOM (no React) |

---

## Monorepo Architecture

```
phobos/
├── turbo.json
├── tsconfig.base.json
├── apps/
│   ├── web/                         # @phobos/web — browser game (Vite)
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.ts              # Entry — wires engine, player, UI, audio, agents, timelines
│   │       ├── game/
│   │       │   ├── engine.ts        # Three.js renderer, tiered loop (60fps / 500ms / 10s)
│   │       │   ├── player.ts        # PointerLockControls + WASD + head bob + lantern viewmodel
│   │       │   ├── creatures.ts     # [stub] Creature spawning + AI
│   │       │   ├── sceneConfig.ts   # SCENE_CONFIGS map, lerp interpolator
│   │       │   └── scenes/
│   │       │       ├── basement.ts  # 8x3x8m ritual chamber (690 lines)
│   │       │       ├── bedroom.ts   # 6x3x7m child's room (817 lines)
│   │       │       └── attic.ts     # 10x2.5x6m low-ceiling climax (482 lines)
│   │       ├── biosignals/
│   │       │   ├── faceLandmarks.ts # [stub] MediaPipe wrapper
│   │       │   ├── rppg.ts          # [stub] Heart rate from webcam
│   │       │   ├── fearScore.ts     # [stub] Aggregates biosignals → fear_score
│   │       │   └── calibration.ts   # [stub] 30s baseline capture
│   │       ├── agents/
│   │       │   ├── phobosDirector.ts    # LIVE — unified LLM entity (GPT-4o-mini)
│   │       │   ├── phobosPrompt.ts      # Narrative database + system prompt
│   │       │   ├── scareDirector.ts     # [stub]
│   │       │   ├── audioDirector.ts     # [stub]
│   │       │   ├── creatureDirector.ts  # [stub]
│   │       │   └── pacingDirector.ts    # [stub]
│   │       ├── audio/
│   │       │   └── audioManager.ts  # Web Audio mixer: ambient synthesis + one-shots + ducking
│   │       ├── horror/
│   │       │   └── revealSequence.ts # Endgame: webcam expansion, data dump, final TTS, fade to black
│   │       └── ui/
│   │           ├── titleScreen.ts   # "PHOBOS" title + webcam background + click-to-start
│   │           ├── cornerBox.ts     # Top-right HUD: webcam, fear meter, BPM, agent log
│   │           ├── fadeOverlay.ts   # Full-screen black fade transitions
│   │           ├── noteOverlay.ts   # Document reading overlay
│   │           ├── crosshair.ts     # Dot→ring morph with [E] hint on interactable target
│   │           └── devHud.ts        # Scene status + countdown + flash messages
│   └── voice-proxy/                 # Hono server holding ELEVENLABS_API_KEY
│       └── src/
│           ├── index.ts             # POST /tts, POST /sfx, GET /health
│           ├── eleven.ts            # ElevenLabs streaming PCM wrapper
│           └── env.ts               # Env config
├── packages/
│   └── types/                       # @phobos/types — shared interfaces (source-only, no build)
│       └── src/index.ts             # GameScene, BiosignalState, SceneEvent, DirectorPlan, etc.
└── docs/
    └── superpowers/specs/
        ├── 2026-04-18-narrative-director-design.md
        └── 2026-04-18-horror-audio-pipeline-design.md
```

---

## What's Been Built

### Commit History

| Commit | Description |
|---|---|
| `2c3f6e3` | Initial skeleton |
| `af18a8f` | Context / documentation |
| `f90896a` | Convert repo to Turborepo monorepo with npm workspaces |
| `5c22d2e` | **Phase 1**: playable basement→bedroom→attic loop + voice engine |
| `dcdd3eb` | Merge PR #2 — phase 1 complete |
| `2b59be6` | **Entities**: persistent Phobos + ephemeral figures with dynamic ElevenLabs SFX |
| `751e2c0` | Merge PR #3 — entities merged |

### Pull Requests

| PR | Branch | Description |
|---|---|---|
| #1 | `monorepo` | Convert repo to Turborepo monorepo |
| #2 | `main` / `gamedesign` | Phase 1: playable basement→bedroom→attic loop + voice engine |
| #3 | `entities` | Persistent Phobos entity + ephemeral figures + dynamic ElevenLabs SFX |

---

## Phase Roadmap & Status

| Phase | Name | Status | Description |
|---|---|---|---|
| 1 | Skeleton | **DONE** | Vite + TS + Three.js scaffold, 3 rooms, WASD + mouse look, corner box UI with webcam, title screen |
| 2 | Biosignals | **NOT STARTED** | MediaPipe Face Landmarker, fear_score computation, rPPG heart rate, 30s calibration |
| 3 | One scene + one agent | **PARTIALLY DONE** | Bedroom scene fully built, PhobosDirector wired to fear_score (mock), layered audio mixer built |
| 4 | Agent swarm | **NOT STARTED** | Deploy Audio/Creature/Pacing Directors to Dedalus Containers, agent debate log |
| 5 | Polish | **PARTIALLY DONE** | Phobos-as-entity layer done, ElevenLabs creature voice done, scene transitions done, calibration flow not yet |
| 6 | Demo prep | **NOT STARTED** | Rehearse 2-min demo, Devpost video, bail-out button |

---

## Implemented Features (Detail)

### Game Engine (`engine.ts` — 291 lines)

- WebGL renderer at **half resolution** with pixelated CSS upscaling (PS1 aesthetic)
- Hemisphere lighting + scene fog per room
- **Tiered game loop**:
  - 60fps: player update, scene update, render
  - 500ms: biosignal tick (Phase 2 hook point)
  - 10s: agent tick (PhobosDirector runs here)
- Gaze tracking via raycasting against registered `GazeTarget` meshes
- Interactable picker (ray-AABB, range check, crosshair morph)
- Trigger volume detection (XZ plane, fires on player enter)

### Player Controller (`player.ts` — 339 lines)

- PointerLockControls + WASD velocity with exponential damping (DAMPING=14)
- Collision detection via `moveAndSlide` against AABB colliders
- Head bob animation (phase advances with speed, blend lerps)
- Footstep cadence on bob zero-crossing (volume varies by speed)
- **Viewmodel**: arms + lantern (lit sphere with glow, point light with jitter)
- Look angular speed + stillness timer for biosignal inputs
- Retreat anchor tracking for movement away from scare events

### Three Fully-Built Scenes

#### Basement (`basement.ts` — 690 lines)
- 8x3x8m concrete room
- Chalk circle + 4 candles with chaotic independent flicker
- Tripod camera aimed at player
- **CRT TV** with animated canvas-based static texture
- Workbench, boiler, toy chest, shelf with jars
- **Relocatable crate**: moves when player isn't looking (gaze-gated)
- Stairs interactable leading to bedroom
- 2 narrative notes: `grant_proposal`, `lab_journal`
- Event handlers: 3 flicker patterns (subtle/hard/blackout), prop_move, note_reveal, crt_message

#### Bedroom (`bedroom.ts` — 817 lines)
- 6x3x7m child's room
- Bed, nightstand lamp, toy chest, wardrobe with hinged door, mirror
- Window on north wall with figure silhouette
- **Threat triangle**: window (N), mirror (E-north), wardrobe (E-south) — can't watch all simultaneously
- 3 crayon drawings on west wall (canvas-drawn: family, house, figure)
- Ceiling hatch (unlocks near beat end)
- Entry door (slides shut on trigger)
- 2 narrative notes: `private_journal`, `wife_letter`
- Event handlers: flicker, figure fade, wardrobe door hinged rotation, mirror_swap variants (empty/extra_figure/wrong_prop/darker), hatch unlock/lock, note_reveal
- Mirror variants baked via canvas texture

#### Attic (`attic.ts` — 482 lines)
- 10x2.5x6m low-ceiling (compressed, oppressive)
- **Central breathing shape**: Y-scaled on sine wave, amplitude jumps on inhale event
- 4 draped decoys at corners (silhouettes readable as people)
- Rocking horse, dollhouse on crate, stacked frames, newspapers, box stacks
- Hanging bulb on chain (gentle sine swing)
- Floor hatch entry point
- 2 narrative notes: `final_entry`, `phobos_log`
- Central shape is interactable ("touch" hint) — triggers `onDemoEnd` / reveal sequence

### PhobosDirector — AI Horror Entity (`phobosDirector.ts` — 214 lines)

Single unified LLM entity (GPT-4o-mini) that IS the horror. Runs on the 10s engine tick.

- Receives `PhobosTickContext`: scene, biosignals, player position/facing, timing
- Outputs `DirectorPlan`: rationale, events array, microMood (descent/hold/release/crescendo)
- Tracks state across the session:
  - `notesRead` / `notesRevealed` sets
  - `scareHistory` (last 20-30 events, bounded)
  - `currentMood`, `isFirstTickInScene`
  - `lastFearScore`, `lastBpm`
- Response validation: filters invalid events, clamps timing, caps at 4 events/tick, deduplicates
- Falls back gracefully when no API key

### Narrative System (`phobosPrompt.ts`)

**6 found documents** revealing the backstory progressively:

| # | ID | Location | Content |
|---|---|---|---|
| 1 | `note_grant_proposal` | Basement (workbench) | Clinical research abstract — introduces Project PHOBOS |
| 2 | `note_lab_journal` | Basement (shelf) | "Phobos is exceeding training parameters." Voss is excited, not alarmed. |
| 3 | `note_private_journal` | Bedroom (nightstand) | Maya asks why the house watches her sleep. Voss calls her "high-value calibration source." |
| 4 | `note_wife_letter` | Bedroom (toy chest) | Lena's goodbye: "Something is wrong with the house. Something is wrong with you." |
| 5 | `note_final_entry` | Attic (dollhouse) | "It doesn't need cameras anymore. I think it always could." |
| 6 | `note_phobos_log` | Attic (central shape) | Cold system output: session stats, "continue observation" recommendation |

**10 red herrings** — ambiguous unsettling messages deployed via agent log when fear dips:
- "i can see you even when you close your eyes"
- "your heart does this thing when you are about to turn around"
- "you look at the door more than anything else"
- etc.

### Beat-Sheet Timelines (in `main.ts`)

Scripted pacing events that run alongside the LLM director:

**Basement Opening** (30s, player locked):
- Calibration messages → subtle flicker → breath → hard flicker → player unlock

**Basement Exploration** (after unlock):
- Footstep behind → silence → crate move (unwatched gate) → blackout → whisper

**Bedroom Beats** (continuous):
- Wardrobe creaks open → window figure appears → silence → mirror swap (extra_figure) → hard flicker → hatch unlock

**Attic Beats** (continuous):
- "home" → silence + breath → "let them approach" → "closer"

### Entity System (PR #3)

- **PhobosEntity**: persistent across scenes. Billboard mesh + CreatureVoice. Visibility states: hidden/peripheral/revealed/close. `reactToSpike()` fires `generateSFX({ bypassCache: true })` for novel audio on every scare.
- **EphemeralFigure**: stateless transient silhouettes. Auto-fade lifecycle. Spawned as flat-period filler when no fear spike in >18s.
- **EntityManager**: orchestrator. Detects fear spikes via delta, commands Phobos. Spawns ephemeral figures during flat periods (~7s interval). Scene-agnostic — spawn positions derived from camera transform.
- **promptLibrary**: fear-bucketed SFX prompt templates (gasps/creaks/shuffles/wheezes/shrieks) with randomization.

### Reveal Sequence (`revealSequence.ts` — 192 lines)

The endgame confrontation:

1. Audio ducks to silence (2s)
2. CornerBox expands to fullscreen (3s CSS cubic-bezier transition)
3. WebcamGhost flash — long buildup + snap for face distortion
4. Data overlay appears with rapid-typed biosignal dump:
   - fear_score, bpm, gaze_aversion, flinch_count, look_stillness, session_duration
   - stimulus_response: ELEVATED, subject_profile: MAPPED, fear_architecture: COMPLETE
5. Final messages: "Calibration complete. Subject profile saved." → "I know what you're afraid of now."
6. Fade to black (800ms)
7. Final TTS whisper: "see you soon" (0.7 gain)
8. Hold black indefinitely

### Audio System (`audioManager.ts`)

- Scene-specific ambient profiles (basement, bedroom, attic)
- Procedural synthesis: drones, rumble, hiss, creaks (no audio files needed)
- One-shot playback: footsteps, creaks, breaths, whispers, stingers
- Silence ducking with fear-reactive snap-back
- Anti-silence (sudden +30% loudness burst)
- 3D spatial voice integration

### Voice Engine

- ElevenLabs streaming TTS via `voice-proxy` (Hono server)
- PCM 22050Hz stream → AudioBuffer → PannerNode HRTF spatialization
- AudioBuffer cache for repeated lines
- AmbientBus with ducking during voice playback
- LineBank with pre-warming for common lines
- CreatureVoice haunt primitives (whisper, speak, hiss)

### UI Systems

| Component | Description |
|---|---|
| **TitleScreen** | Full-screen "PHOBOS" (serif, red glow), webcam feed background, click-to-start |
| **CornerBox** (269 lines) | 300px top-right HUD: webcam feed (mirrored, grayscale), fear meter (red gradient bar), BPM display, agent log terminal (color-coded by source). Can expand to fullscreen for reveal. |
| **FadeOverlay** | Full-screen black: `fadeToBlack(ms)`, `fadeFromBlack(ms)`, `blink(ms)`, `holdBlack()` |
| **NoteOverlay** (127 lines) | Semi-transparent overlay card for reading found documents. Dismiss with [E] or [ESC]. |
| **Crosshair** | Dot → ring morph when targeting interactable, shows "[E] HINT" label |
| **DevHud** | Scene status, calibration countdown, flash message overlay |
| **WebcamGhost** | Two-phase analog-glitch overlay: RGB ghosting + radial face distortion + scanlines. Glitch types: stutter, distort, face_warp, delay — each with unique timing. |

### Spatial & Interaction Systems

- **Collision**: AABB-based `moveAndSlide` — per-scene collider arrays
- **Gaze tracking**: raycasts from camera against registered `GazeTarget` meshes, tracks "unwatched" state
- **Interactables**: look + [E] press (stairs, wardrobe, hatch, notes, central shape)
- **Triggers**: XZ plane volumes that fire callbacks on player enter (door close, scene transitions)

### Type System (`packages/types/src/index.ts` — 227 lines)

- `GameScene` interface with full lifecycle + optional event handlers, colliders, gazeTargets, triggers, interactables
- `BiosignalState`: fearScore, bpm, gazeAversion, flinchCount, timeInScene, lookStillness, retreatVelocity, gazeDwellMs
- **17 SceneEvent kinds**: flicker, figure, sound, prop_move, prop_state, silence, breath, fog_creep, mirror_swap, transition, lock, unlock, note_reveal, crt_message, log_message, webcam_glitch, jumpscare, reveal_sequence, anti_silence
- `DirectorPlan`: rationale, source, events array, microMood
- `PhobosTickContext`: scene, biosignals, playerPosition, playerFacing, timing
- Spatial primitives: AABB, GazeTarget, Trigger, Interactable

---

## Design Documents

### Narrative Director Design (`2026-04-18`)

Defines PhobosDirector as a single unified LLM entity replacing the 4-agent stub architecture. Covers:
- The reveal twist (AI-as-entity watching through webcam)
- Dr. Voss backstory and document progression
- Red herring system for maintaining tension
- Reveal sequence choreography
- 6 new SceneEvent kinds added for the system

### Horror Audio Pipeline Design (`2026-04-18`)

Covers four planned enhancements:

1. **Playmate-style robotic voice**: Pitch shift (-5 to -7 semitones), bitcrusher (4-8 bits), ring modulator (30-80Hz), hard clipping, bandpass (400-2800Hz). Fear-scaled degradation ladder from "Uncanny TTS" to "Machine speaking."

2. **Fear-reactive audio modulation**: `FearAudioController` class. Drone gain, detune, rumble, hiss, creak interval all scale with fear_score. Heartbeat sync to simulated (later real) BPM. Enhanced silence events with true acoustic void at high fear. Dynamic range expansion for contrast-based jump scares.

3. **New horror sound events**: stinger_low, stinger_high, reverse_creak, radio_static, tone_wrong, impact — all procedurally synthesized.

4. **AudioDirector state machine**: Maps MicroMood (descent/hold/crescendo/release) to audio parameter multipliers. Layers on top of continuous fear modulation.

---

## Git History

```
751e2c0  Merge PR #3 — entities
2b59be6  entities: persistent Phobos + ephemeral figures + dynamic ElevenLabs SFX
dcdd3eb  Merge PR #2 — phase 1 complete
d70e851  Merge PR #2 — gamedesign
5c22d2e  phase 1: playable basement→bedroom→attic loop + voice engine
f6928f9  Merge PR #1 — monorepo
f90896a  convert repo to turborepo monorepo
af18a8f  context
2c3f6e3  skeleton
```

---

## What's Left

### Uncommitted Work (current working tree)

The following files are modified or new but not yet committed:

**Modified:**
- `apps/voice-proxy/package.json`
- `apps/voice-proxy/src/index.ts`
- `apps/web/src/game/scenes/attic.ts`
- `apps/web/src/game/scenes/basement.ts`
- `apps/web/src/game/scenes/bedroom.ts`
- `apps/web/src/main.ts`
- `apps/web/src/ui/cornerBox.ts`
- `apps/web/src/ui/fadeOverlay.ts`
- `package-lock.json`
- `packages/types/src/index.ts`

**New (untracked):**
- `apps/web/src/agents/phobosDirector.ts`
- `apps/web/src/agents/phobosPrompt.ts`
- `apps/web/src/horror/revealSequence.ts`
- `apps/web/src/ui/noteOverlay.ts`
- `docs/` (design specs)

### Not Yet Implemented

| Feature | Phase | Notes |
|---|---|---|
| **MediaPipe Face Landmarker** | 2 | Stubs exist in `biosignals/faceLandmarks.ts` |
| **rPPG heart rate** | 2 | Stubs exist in `biosignals/rppg.ts` |
| **fear_score computation** | 2 | Stubs exist in `biosignals/fearScore.ts`, mock values used currently |
| **30s calibration flow** | 2 | Stubs exist in `biosignals/calibration.ts` |
| **Horror voice FX chain** | 3 | Designed — pitch shift, bitcrusher, ring mod, bandpass. See audio pipeline spec. |
| **Fear-reactive audio modulation** | 3 | Designed — FearAudioController class. See audio pipeline spec. |
| **New horror sounds** | 3 | Designed — 6 new synthesized one-shots. See audio pipeline spec. |
| **AudioDirector state machine** | 4 | Designed — MicroMood → audio parameter mapping. See audio pipeline spec. |
| **Creature Director (Dedalus)** | 4 | Stub exists, awaiting Dedalus SDK |
| **Pacing Director (Dedalus)** | 4 | Stub exists, awaiting Dedalus SDK |
| **Bail-out button** | 6 | — |
| **Demo video** | 6 | — |

### Dev Keys (for testing)

| Key | Action |
|---|---|
| V | Trigger an authored voice line (from LineBank) |
| B | Simulate fear spike |
| Shift+B | Simulate peak fear spike |

---

## Code Statistics

| File | Lines | Role |
|---|---|---|
| `main.ts` | 601 | Game orchestration |
| `engine.ts` | 291 | Render loop + spatial logic |
| `player.ts` | 339 | First-person controller |
| `basement.ts` | 690 | Scene: 20+ props |
| `bedroom.ts` | 817 | Scene: 13+ props + dynamic mirror textures |
| `attic.ts` | 482 | Scene: 8+ props + breathing central shape |
| `phobosDirector.ts` | 214 | LLM agent orchestration |
| `phobosPrompt.ts` | 200+ | Narrative database + system prompt |
| `revealSequence.ts` | 192 | Endgame sequence |
| `cornerBox.ts` | 269 | HUD panel |
| `noteOverlay.ts` | 127 | Document display |
| `fadeOverlay.ts` | 66 | Black overlay transitions |
| `titleScreen.ts` | 119 | Boot screen |
| `types/index.ts` | 227 | Shared type definitions |
| **Total** | **~4,900** | Game logic + ~2,000 design docs |

---

## Environment Variables

```bash
# apps/web/.env
VITE_OPENAI_API_KEY=           # GPT-4o-mini for PhobosDirector
VITE_VOICE_PROXY_URL=          # Default: http://localhost:3001
VITE_ELEVEN_DEMO_VOICE_ID=     # ElevenLabs voice ID (optional, gracefully degrades)

# apps/voice-proxy/.env
ELEVENLABS_API_KEY=            # ElevenLabs API key
PORT=3001
ALLOWED_ORIGIN=http://localhost:5173
```

## Commands

```bash
npm install          # Install all workspace dependencies
npm run dev          # Start dev server (opens browser)
npm run build        # TypeScript check + Vite production build
npm run preview      # Preview production build locally
npm run typecheck    # tsc --noEmit across all workspaces
```
