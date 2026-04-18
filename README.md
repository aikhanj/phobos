# PHOBOS

**A web-based horror game that reads your face and heart rate through your webcam, runs an AI agent swarm of scare directors, and rewrites itself in real time to find the exact thing that scares you.**

Built for HackPrinceton Spring 2026.

## Try it

```bash
npm install
npm run dev
```

Opens in Chrome. Allow webcam access. Click to start.

**Controls:** WASD to move, mouse to look, Escape to pause.

## How it works

1. Your webcam captures your face at 30fps via MediaPipe Face Landmarker
2. A biosignal pipeline extracts fear indicators: flinch rate, gaze aversion, heart rate (via rPPG), freeze response
3. Every 10 seconds, a swarm of 4 LLM agents (Scare Director + Audio/Creature/Pacing sub-directors) debates how to tune the scene
4. The game engine smoothly interpolates 15+ scene parameters — lighting, audio layers, creature behavior, pacing — to match the agents' decisions
5. The corner-box overlay shows it all live: your face with landmarks, fear score, heart rate, and the agents talking to each other

## The game

Three scenes inside a single house:

- **Basement** — total darkness, flashlight with dying battery, audio-only threat
- **Bedroom** — dim light, something under the bed, something in the closet, reflections
- **Attic** — wooden creaks, thing in the rafters, figures in peripheral vision

10-minute playthrough, no death state. Walking sim with escalating dread. The Pacing Director decides scene order based on your biometric reactions.

## The agent swarm

| Agent | Role | Personality |
|-------|------|-------------|
| Scare Director | Orchestrator — synthesizes final scene config | Clinical, data-driven |
| Audio Director | Horror sound design | "Silence builds more dread than noise" |
| Creature Director | Entity behavior | "Fear comes from anticipation, not confrontation" |
| Pacing Director | Scene flow + escalation | "Know the difference between tension and exhaustion" |

## Tech stack

- Vite + TypeScript
- Three.js (PS1 lo-fi aesthetic)
- MediaPipe Face Landmarker
- rPPG (webcam heart rate via green-channel FFT)
- Web Audio API
- OpenAI API (gpt-4o)
- Dedalus Containers (sub-director hosting)

## Team

Built in 36 hours at HackPrinceton Spring 2026.
