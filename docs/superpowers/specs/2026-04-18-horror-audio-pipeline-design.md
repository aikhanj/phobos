# Horror Audio Pipeline Design

## Context

Phobos's audio synthesis engine (AudioManager) and voice system (VoiceEngine + CreatureVoice) are fully implemented, but the sound design has two gaps: it's **not scary enough** (narrow dynamic range, no stingers, no contrast) and **not reactive enough** (audio doesn't respond to biosignals/fear_score). Additionally, the entity voice should sound like Minecraft's Playmate mod — flat, robotic, digitally degraded, and increasingly inhuman as fear rises.

This spec covers four changes: Playmate-style voice processing, fear-reactive audio modulation, new horror sound events, and AudioDirector implementation.

---

## 1. Playmate-Style Robotic Horror Voice

### 1a. ElevenLabs voice_settings

The voice-proxy's `streamTTS()` (`apps/voice-proxy/src/eleven.ts:22`) currently sends bare `{ text, model_id }` with no voice settings. Add `voice_settings` to flatten prosody:

```json
{
  "voice_settings": {
    "stability": 0.92,
    "similarity_boost": 0.35,
    "style": 0.0,
    "use_speaker_boost": false
  }
}
```

These should be passable from the client request body through the proxy, so the game can modulate them by fear level. The proxy passes them through to ElevenLabs if present, otherwise uses the defaults above.

**Files to modify:**
- `apps/voice-proxy/src/eleven.ts` — accept and forward `voice_settings`
- `apps/voice-proxy/src/index.ts` — parse `voice_settings` from request body
- `packages/voice/src/client.ts` — include `voice_settings` in TTS requests
- `packages/voice/src/types.ts` — add `VoiceSettings` type to `VoiceOptions`

### 1b. Web Audio post-processing chain

After PCM decoding in `VoiceEngine.speak()`, route audio through a distortion chain before the spatial node:

```
PCM source → PitchShift (-5 semitones, playbackRate ~0.75)
           → Bitcrusher (quantize to 6-bit — harsh digital crunch)
           → RingModulator (50Hz sine × signal — permanent metallic buzz)
           → WaveShaper (hard clipping sigmoid — grit/saturation)
           → BandpassFilter (400-2800Hz — muffled intercom quality)
           → spatial node → destination
```

Implementation details:
- **Pitch shift**: Set `AudioBufferSourceNode.playbackRate` to ~0.75. Cheap, no AudioWorklet needed. Slightly stretches duration, which is creepier.
- **Bitcrusher**: `WaveShaperNode` with a staircase curve quantizing to N levels: `curve[i] = Math.round(value * levels) / levels` where `levels = 2^bits`.
- **Ring modulator**: `OscillatorNode` (sine, 50Hz) connected to a `GainNode` that modulates the voice signal. The oscillator output multiplies the voice amplitude, adding metallic harmonics.
- **WaveShaper (clipping)**: Sigmoid transfer curve `f(x) = x / (1 + |x|)` for mild saturation, or hard clip `f(x) = max(-0.8, min(0.8, x * 1.5))` for aggressive grit.
- **Bandpass**: `BiquadFilterNode`, type `bandpass`, frequency 1200Hz, Q 0.8 (passes 400-2800Hz).

Create a new file `packages/voice/src/horrorFx.ts` that exports a `HorrorVoiceFX` class. This class:
- Takes an `AudioContext` and a fear level (0-1)
- Creates the node chain
- Exposes `input` and `output` AudioNodes for insertion into the VoiceEngine graph
- Has `setFear(level: number)` to update distortion parameters in real-time

### 1c. Fear-scaled voice degradation

`HorrorVoiceFX.setFear(level)` smoothly ramps parameters:

| fear_score | Pitch (semitones) | Bitcrush (bits) | Ring Mod (Hz) | Clipping | Perceptual |
|---|---|---|---|---|---|
| 0.0-0.3 | -4 | 8 | 30 | mild | "Uncanny TTS" |
| 0.3-0.6 | -5 | 6 | 45 | medium | "Broken radio" |
| 0.6-0.8 | -6 | 5 | 60 | hard | "Corrupted signal" |
| 0.8-1.0 | -7 | 4 | 80 | severe | "Machine speaking" |

Interpolation is linear between breakpoints, ramped over 300ms to avoid clicks.

**Files to create:**
- `packages/voice/src/horrorFx.ts` — `HorrorVoiceFX` class

**Files to modify:**
- `packages/voice/src/voiceEngine.ts` — insert `HorrorVoiceFX` into speak() chain before spatial node
- `packages/voice/src/creature.ts` — pass fear level to HorrorVoiceFX on each whisper
- `packages/voice/src/types.ts` — add `horrorFx?: boolean` to `VoiceOptions`
- `packages/voice/src/index.ts` — re-export `HorrorVoiceFX`

---

## 2. Fear-Reactive Audio Modulation

### 2a. FearAudioController

New class in `apps/web/src/audio/fearAudioController.ts`. Sits between biosignals and AudioManager, called on the 500ms biosignal tick.

```typescript
class FearAudioController {
  constructor(audio: AudioManager) {}
  /** Called every 500ms with latest biosignal state. */
  update(state: BiosignalState): void {}
  /** Called when pacing phase changes (from AudioDirector). */
  setPhase(phase: MicroMood): void {}
}
```

Ambient modulation targets (all smoothly ramped via `linearRampToValueAtTime`, no clicks):

| Parameter | fear=0 (calm) | fear=1 (terrified) | Mechanism |
|---|---|---|---|
| Drone gain | scene preset | 3x preset | Felt vibration builds dread |
| Drone detune | -7 cents | -40 cents | Increasing dissonance |
| Rumble gain | scene preset | 2x preset | Oppressive low-end |
| Hiss gain | scene preset | 0.5x preset | Less air = suffocation |
| Creak interval | scene preset | 0.5x preset (2x faster) | World closing in |
| LFO speed | 0.08 Hz | 0.3 Hz | Faster pulsing = anxiety |
| Master gain | 0.9 | 0.7 | Headroom before stingers |

This requires exposing the internal audio nodes from AudioManager. Add accessor methods:
- `getDroneOscillators(): [OscillatorNode, OscillatorNode] | null`
- `getCreakInterval(): number` + `setCreakInterval(ms: number): void`
- `getLFO(): OscillatorNode | null`

Alternatively, add a single `setFearModulation(fear: number)` method directly to AudioManager that handles all internal parameter changes. This is cleaner — keeps the nodes private.

**Recommended approach**: Add `setFearModulation(fear: number)` to `AudioManager`. The `FearAudioController` becomes a thin wrapper that also handles pacing phase logic and calls `audio.setFearModulation()`.

### 2b. Heartbeat sync

When BPM data becomes available (Phase 2), re-time `heartbeat` one-shots to match the player's actual heart rate. Until then, simulate:
- Default: 72 BPM baseline
- Scale with fear_score: `bpm = 72 + fear * 38` (up to ~110 BPM at fear=1)
- Play `heartbeat` one-shot on each beat via `setInterval`, adjusting interval as fear changes
- The heartbeat is a constant undertone that the player eventually realizes mirrors their own

Implementation: `FearAudioController` manages a heartbeat scheduler internally. It fires `audio.playOneShot('heartbeat', gain)` where gain scales 0.15→0.4 with fear.

### 2c. Enhanced silence events

Current `duckForSilence` drops to 0.05 gain. Enhance based on fear level:

- **fear > 0.5**: Silence events also stop the drone oscillators (via `droneGain.gain → 0`), creating *true* acoustic void — not just quiet, but empty
- **Fear-scaled restoration**: Snap-back ramp shortens with fear: `rampSec = 3.0 - fear * 2.6` (ranges 3.0s→0.4s). Higher fear = more jarring return
- **New event: `anti_silence`**: Everything suddenly gets 30% louder for 2 seconds, then drops back. Disorienting — the world briefly screams, then pretends nothing happened

Add `duckForSilence(duration: number, fear: number)` overload to AudioManager. Add new `SceneEvent` kind `'anti_silence'` to types.

### 2d. Dynamic range expansion

Currently ambient sits in 0.04-0.24 gain range. Fear-reactive mode widens this:
- Quiet floor drops to 0.01 during dread phases
- Stingers hit 0.8-1.0 gain
- The *contrast itself* is the jump scare mechanism — not just loud sounds, but loud-after-quiet

This is managed by the FearAudioController setting the ambient baseline lower during high-fear periods, creating more headroom for stingers.

**Files to create:**
- `apps/web/src/audio/fearAudioController.ts` — `FearAudioController` class

**Files to modify:**
- `apps/web/src/audio/audioManager.ts` — add `setFearModulation()`, enhance `duckForSilence()`, expose heartbeat scheduling
- `apps/web/src/main.ts` — instantiate FearAudioController, wire to biosignal tick
- `packages/types/src/index.ts` — add `'anti_silence'` to `SceneEvent` union

---

## 3. New Horror Sound Events

Expand `SoundId` in `packages/types/src/index.ts` and implement synthesis in `AudioManager.playOneShot()`:

| SoundId | Synthesis | Duration | Purpose |
|---|---|---|---|
| `stinger_low` | Sine 30Hz→15Hz exponential sweep, gain attack 0→0.9 in 10ms | 300ms | Jump scare bass hit |
| `stinger_high` | White noise burst → bandpass 4kHz Q=8, gain 0→0.7 in 5ms | 150ms | Sharp treble stab |
| `reverse_creak` | Same as creak but frequency sweeps UP (70→140Hz) | 850ms | Uncanny "wrong" version |
| `radio_static` | Brown noise × ring mod 120Hz sine, highpass 1kHz | 500ms | Digital interference |
| `tone_wrong` | Two sines at dissonant minor 2nd (440Hz + 466Hz), slow fade | 3000ms | Sustained wrongness |
| `impact` | Brown noise lowpass 80Hz + hard-clip waveshaper, gain 0.9 | 100ms | Door slam / physical hit |

**Files to modify:**
- `packages/types/src/index.ts` — add new SoundIds to the union type
- `apps/web/src/audio/audioManager.ts` — add cases to `playOneShot()` switch

---

## 4. AudioDirector Implementation

The stubbed `apps/web/src/agents/audioDirector.ts` gets real logic. Since Dedalus isn't available yet, it runs as a local LLM call (same pattern as PhobosDirector).

### Role

Receives pacing phase (MicroMood) from PhobosDirector and manages the *audio mood* — deciding which horror audio mode to activate:

| MicroMood | Audio Mode | Behavior |
|---|---|---|
| `descent` | Slow dread | Sparse creaks (1.5x interval), wide silence gaps, drone at 0.7x gain, heartbeat barely audible |
| `hold` | Oppressive atmosphere | Dense drone (1.3x gain), dissonant detune (-25 cents), hiss rises, no silence events |
| `crescendo` | Contrast setup | Duck everything quiet (ambient to 0.15), stop creaks, prep stinger — building anticipation |
| `release` | Punctuation | Fire stinger + voice line + snap ambient back to 1.2x normal, resume creaks at 2x rate for 5s |

### Integration

The AudioDirector doesn't replace fear-reactive modulation — it layers on top:
- **Fear modulation** is continuous (500ms tick, smooth parameter changes)
- **AudioDirector** is strategic (10s tick, mode switching and event scheduling)
- **FearAudioController** applies both: `finalValue = fearModulated(baseValue) * directorMultiplier`

The AudioDirector emits `DirectorPlan` events that the FearAudioController interprets as multipliers on top of fear-driven values.

### Implementation approach

For now (pre-Dedalus), the AudioDirector is a simple state machine driven by the MicroMood from PhobosDirector — no LLM call needed. It maps mood to parameter multipliers and schedules appropriate events. This can be upgraded to an LLM-driven agent later.

**Files to modify:**
- `apps/web/src/agents/audioDirector.ts` — implement mood-to-audio mapping
- `apps/web/src/audio/fearAudioController.ts` — accept director multipliers via `setPhase()`

---

## File Summary

### New files
| File | Purpose |
|---|---|
| `packages/voice/src/horrorFx.ts` | `HorrorVoiceFX` — Web Audio distortion chain for voice |
| `apps/web/src/audio/fearAudioController.ts` | `FearAudioController` — biosignal→audio parameter mapping |

### Modified files
| File | Changes |
|---|---|
| `apps/voice-proxy/src/eleven.ts` | Accept + forward `voice_settings` to ElevenLabs |
| `apps/voice-proxy/src/index.ts` | Parse `voice_settings` from request body |
| `packages/voice/src/client.ts` | Include `voice_settings` in TTS requests |
| `packages/voice/src/types.ts` | Add `VoiceSettings` type, `horrorFx` option |
| `packages/voice/src/voiceEngine.ts` | Insert HorrorVoiceFX into speak() chain |
| `packages/voice/src/creature.ts` | Pass fear level to HorrorVoiceFX |
| `packages/voice/src/index.ts` | Re-export HorrorVoiceFX |
| `packages/types/src/index.ts` | New SoundIds, `anti_silence` event, VoiceSettings |
| `apps/web/src/audio/audioManager.ts` | `setFearModulation()`, enhanced silence, new one-shots |
| `apps/web/src/agents/audioDirector.ts` | Implement mood-to-audio state machine |
| `apps/web/src/main.ts` | Wire FearAudioController to biosignal tick |

---

## Verification

1. **Voice processing**: Run `npm run dev`, trigger a voice line (V key or wait for agent tick). Voice should sound flat, pitched down, with audible digital distortion. Adjust fear_score mock value in main.ts to verify degradation ladder.
2. **Fear modulation**: With dev tools, manually set `lastFearScore` to 0.0, 0.5, 1.0 and observe ambient changes: drone should get louder and more dissonant, creaks should accelerate, heartbeat should appear and speed up.
3. **New sounds**: Trigger each new SoundId via the agent log / event bus and verify they synthesize correctly (no clicks, appropriate volume, correct duration).
4. **Silence events**: Trigger silence at different fear levels — low fear should be a gentle duck, high fear should be total void with jarring snap-back.
5. **AudioDirector**: Observe pacing phase transitions in the corner box log. Audio mood should shift perceptibly between descent/hold/crescendo/release.
6. **Full loop**: Play through basement→bedroom→attic with the Phobos director running. Audio should feel dynamic — quiet exploration punctuated by terrifying voice + stinger moments, with ambient continuously reflecting the player's (simulated) fear state.
