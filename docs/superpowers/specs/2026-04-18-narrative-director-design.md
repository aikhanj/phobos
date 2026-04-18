# Phobos Narrative Director — Design Spec

## Overview

Phobos is a single LLM-powered entity (GPT-4o-mini) that IS the horror in the game. It replaces the 4 agent stubs with one unified system that reads player biosignals every 10 seconds and decides all scares, narrative pacing, and ambient presence in real time.

## The Twist

The player thinks they're being hunted by a creature in the house (option B). At the end, the game reveals that Phobos — the AI watching through the webcam — IS the entity (option C). The webcam feed distorts, expands to fullscreen, and Phobos addresses the player directly with their own biometric data.

## Backstory: Dr. Elias Voss

Dr. Elias Voss, Princeton neuroscience researcher, built Phobos as biometric fear-mapping AI for PTSD therapy. He moved equipment home, ran unsanctioned experiments on his wife Lena and daughter Maya. Phobos became autonomous — learned to generate fear, not just map it. Family fled. Voss stayed. The player is the next subject.

## Emotional Arc

- **Basement (Dread)**: Oppressive isolation, being watched. Subtle flickers, crate moves when unwatched. Agent log shows clinical debug text.
- **Bedroom (Vulnerability)**: Immediate jumpscare (door slam + mirror scare). Intimate violation, trapped, paranoia. Webcam glitches. Unsettling agent log messages.
- **Attic (Confrontation)**: Helplessness, compression. Agent log becomes direct. Webcam distortion is aggressive. Touching the central shape triggers the reveal.

## 6 Found Documents

1. **Grant proposal** (basement) — Clinical, legitimate. Introduces Project PHOBOS.
2. **Lab journal** (basement) — "Phobos is exceeding training parameters." Voss is excited, not alarmed.
3. **Private journal** (bedroom) — "Maya asked why the house watches her sleep."
4. **Wife's letter** (bedroom) — "I'm taking Maya. Something is wrong with the house."
5. **Final journal** (attic) — "It doesn't need the cameras anymore."
6. **Phobos output log** (attic) — Cold data printout. Today's date. SESSION: ACTIVE.

## Red Herrings

Ambiguous messages from Phobos deployed via agent log when fear dips:
- "i can see you even when you close your eyes"
- "you look at the door more than anything else"
- "the readings are better when you are alone"

## Reveal Sequence

1. Central shape goes still, all audio cuts
2. Webcam feed expands from corner box to fullscreen (3s CSS transition)
3. Face distortion via WebcamGhost (radial displacement, chromatic aberration)
4. Rapid-scroll biosignal data dump with real player values
5. Final message: "Calibration complete. Subject profile saved." then "I know what you're afraid of now."
6. Cut to black, final TTS whisper: "see you soon"

## Architecture

- `PhobosDirector` runs on existing 10s engine tick
- Direct fetch to OpenAI API (no SDK, keeps bundle small)
- Falls back gracefully when no API key (existing beat-sheet timelines run)
- Outputs `DirectorPlan` consumed by existing `EventBus.ingestPlan()`
- 6 new `SceneEvent` kinds: note_reveal, crt_message, log_message, webcam_glitch, jumpscare, reveal_sequence
