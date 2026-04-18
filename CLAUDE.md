# Phobos — AI Context

## What is this?

Phobos is a web-based first-person horror game built for HackPrinceton Spring 2026 (36-hour hackathon). It reads the player's face and heart rate through their webcam in real time and uses an LLM-driven agent swarm to generate and tune scare scenes on the fly.

## Quick start

```
npm install
npm run dev
```

Opens in browser. Title screen → click to start → dark basement with WASD + mouse look. Corner box overlay shows live webcam feed + biosignal readouts.

## Build phases & current status

The project is built in 6 sequential phases. **Do not skip ahead.**

- [x] **Phase 1 (Skeleton)** — Vite + TS + Three.js scaffold, single dark room, WASD + mouse look, corner box UI with webcam, title screen
- [ ] **Phase 2 (Biosignals)** — MediaPipe Face Landmarker, fear_score computation, rPPG heart rate, 30s calibration
- [ ] **Phase 3 (One scene + one agent)** — Bedroom scene fully built, Scare Director wired to fear_score, layered audio mixer
- [ ] **Phase 4 (Agent swarm)** — Deploy Audio/Creature/Pacing Directors to Dedalus Containers, agent debate log, add Basement + Attic scenes
- [ ] **Phase 5 (Polish)** — Phobos-as-entity layer, ElevenLabs creature voice, scene transitions, calibration flow
- [ ] **Phase 6 (Demo prep)** — Rehearse 2-min demo, Devpost video, bail-out button

## Tech stack

- **Vite + TypeScript** (strict mode)
- **Three.js** for 3D rendering (PS1 lo-fi aesthetic: half-res, no antialiasing, flat shading)
- **MediaPipe Face Landmarker** (`@mediapipe/tasks-vision`) for facial expression + gaze (Phase 2)
- **rPPG** — webcam-based heart rate via green-channel FFT on cheek ROI (Phase 2)
- **Web Audio API** for layered ambient audio + creature voice (Phase 3)
- **OpenAI API** (`gpt-4` / `gpt-4o`) for the 4 LLM director agents (Phase 4)
- **Dedalus Containers** for hosting the 3 sub-director agents (Phase 4 — SDK available Saturday morning from sponsor booth)

## Architecture

### Monorepo layout

Turborepo with npm workspaces. Root scripts delegate to `turbo run <task>`.

```
phobos/
├── turbo.json                # pipeline config: build, dev, preview, typecheck
├── tsconfig.base.json        # shared TS compiler options
├── apps/
│   └── web/                  # @phobos/web — browser game (Vite)
│       ├── vite.config.ts
│       ├── index.html
│       ├── .env.example      # VITE_OPENAI_API_KEY, VITE_DEDALUS_*_URL
│       └── src/
│           ├── main.ts              # Entry, wires everything together
│           ├── game/
│           │   ├── engine.ts        # Three.js renderer, tiered game loop (60fps + 500ms + 10s)
│           │   ├── player.ts        # PointerLockControls + WASD velocity
│           │   ├── creatures.ts     # [stub] Creature spawning + AI
│           │   ├── sceneConfig.ts   # SCENE_CONFIGS map, lerp interpolator
│           │   └── scenes/
│           │       ├── basement.ts  # 6-wall room, flickering light, props
│           │       ├── bedroom.ts   # [stub] Primary demo scene
│           │       └── attic.ts     # [stub]
│           ├── biosignals/
│           │   ├── faceLandmarks.ts # [stub] MediaPipe wrapper
│           │   ├── rppg.ts          # [stub] Heart rate from webcam
│           │   ├── fearScore.ts     # [stub] Aggregates biosignals → fear_score
│           │   └── calibration.ts   # [stub] 30s baseline capture
│           ├── agents/
│           │   ├── scareDirector.ts    # [stub] Local orchestrator
│           │   ├── audioDirector.ts    # [stub] Dedalus client
│           │   ├── creatureDirector.ts # [stub] Dedalus client
│           │   └── pacingDirector.ts   # [stub] Dedalus client
│           ├── audio/
│           │   └── audioManager.ts  # [stub] Web Audio API mixer
│           └── ui/
│               ├── titleScreen.ts   # "PHOBOS" title + webcam bg + click-to-start
│               └── cornerBox.ts     # Top-right HUD: webcam, fear, BPM, agent log
└── packages/
    └── types/                # @phobos/types — shared interfaces (source-only, no build step)
        └── src/index.ts      # GameScene, SceneConfig, BiosignalState, AgentLogEntry
```

Import shared types as `import type { BiosignalState } from '@phobos/types'`. The types package exports TS source directly (no `tsc` build); Vite/esbuild consume it natively and tsc resolves it through npm workspace symlinks.

Files marked `[stub]` have typed interfaces but no implementation yet. They're wired into the engine's tick system and ready for Phase 2-4.

**When to add a new workspace:** when a Dedalus container agent becomes runnable (Phase 4), create `apps/audio-director/`, etc. They import `@phobos/types` for shared wire-format interfaces. Add browser-side shared helpers (e.g. a future audio mixer used by multiple apps) under `packages/`.

### Game loop

The engine runs a tiered loop via `renderer.setAnimationLoop`:

- **60fps**: `player.update(dt)`, `currentScene.update(dt)`, `renderer.render()`
- **Every 500ms** (accumulator): `onBiosignalTick()` — Phase 2 will wire face landmarks + rPPG here
- **Every 10s** (accumulator): `onAgentTick()` — Phase 4 will wire the Scare Director here

Hook into these via `engine.onUpdate`, `engine.onBiosignalTick`, `engine.onAgentTick`.

### Scene system

Each scene implements `GameScene` interface from `@phobos/types`:
- `load()` builds geometry into `this.group` (a `THREE.Group`)
- `unload()` disposes all geometry/materials and clears the group
- `update(dt)` runs per-frame logic (light flicker, creature AI, etc.)
- Engine does `scene.add(room.group)` / `scene.remove(room.group)` to swap

### Agent swarm (Phase 4)

4 LLM agents:
1. **Scare Director** (browser, local OpenAI calls) — orchestrator, receives biosignal telemetry every 10s, queries the 3 sub-directors, synthesizes final `SceneConfig`
2. **Audio Director** (Dedalus container) — horror sound design decisions
3. **Creature Director** (Dedalus container) — creature spawning/behavior decisions
4. **Pacing Director** (Dedalus container) — scene flow + escalation timing

Agent clients use HTTP interfaces with env-configured URLs (`VITE_DEDALUS_*_URL`). Before Dedalus SDK is available, mock by calling OpenAI directly with identical interfaces.

### Corner box overlay

Top-right 300px panel always visible during gameplay:
- Live webcam feed (mirrored, grayscale+contrast)
- FEAR meter (red gradient bar, 0-1)
- BPM display
- Agent log terminal (color-coded by source, auto-scroll, monospace green text)

This is the primary demo differentiator for judges — shows the AI reading the player in real time.

## Key design decisions

- **No React** — vanilla TS + DOM for all UI. No framework overhead for a hackathon.
- **PS1 aesthetic** — render at half resolution with `image-rendering: pixelated`, `antialias: false`, `MeshLambertMaterial` with `flatShading: true`, FOV 70. This is intentional and stylistic.
- **Room geometry** — 6 separate `PlaneGeometry` walls per room (not inverted BoxGeometry). Allows per-surface materials and easy modification.
- **Velocity-based movement** — exponential damping (`SPEED=5`, `DAMPING=8`), not instant position snaps. Feels smooth and cinematic.
- **Webcam stream shared** — title screen requests `getUserMedia` once, passes `MediaStream` to corner box on game start. Never re-request.

## Environment variables

Copy `apps/web/.env.example` to `apps/web/.env`:
```
VITE_OPENAI_API_KEY=           # OpenAI API key for agent LLM calls
VITE_DEDALUS_AUDIO_URL=        # Dedalus container URL for Audio Director
VITE_DEDALUS_CREATURE_URL=     # Dedalus container URL for Creature Director
VITE_DEDALUS_PACING_URL=       # Dedalus container URL for Pacing Director
```

## What NOT to build

Do not build unless Phase 1-5 are complete:
- User accounts, auth, save states
- Multiplayer, mobile support
- Procedural 3D asset generation
- AI-generated ambient audio
- Physics beyond walking + collision
- More than 3 scenes
- Death state, win state, leaderboards, settings menu

## Commands

All commands run at the repo root; Turbo fans them out to workspaces.

- `npm run dev` — Start dev server (opens browser)
- `npm run build` — TypeScript check + Vite production build
- `npm run preview` — Preview production build locally
- `npm run typecheck` — `tsc --noEmit` across all workspaces
- `npm run dev --workspace=@phobos/web` — Run a task in a single workspace (bypass turbo)
