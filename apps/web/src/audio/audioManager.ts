import type { SoundId } from '@phobos/types';

type ScenePreset = 'basement' | 'bedroom' | 'attic' | 'campus' | 'club';

/**
 * Web Audio ambient engine. All sound is synthesized in-browser — no asset
 * files on this branch. The voice engine (which will handle whispers via
 * ElevenLabs) lives on the `voice-engine` branch and will replace the
 * procedural whispers on merge.
 *
 * Graph:
 *
 *   rumble (brown noise) ─┐
 *   hiss   (brown noise) ─┼─► sceneMix ─► silenceGain ─► master ─► destination
 *   drone  (2× sine)     ─┘                   ▲
 *                                              │
 *                                 duck via silence events
 *
 * One-shots are allocated on demand and auto-release.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private silenceGain: GainNode | null = null;
  private sceneMix: GainNode | null = null;

  private rumbleGain: GainNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;
  private hissGain: GainNode | null = null;
  private hissFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;

  private lfo: OscillatorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private creakTimer: number | null = null;
  private currentPreset: ScenePreset = 'basement';
  private fearLevel = 0;
  private creakRateMultiplier = 1;

  // ── Proximity dread bed ──
  // A disembodied-choir-wail layer that swells as the Dean closes in.
  // Two detuned sawtooth stacks routed through a bandpass, so it reads
  // as a tormented human voice, not a synth pad. Gain is driven from
  // outside via setDreadProximity(0..1) — main.ts feeds the nearest
  // Dean distance every frame.
  private dreadGain: GainNode | null = null;
  private dreadFilter: BiquadFilterNode | null = null;
  private dreadOsc1: OscillatorNode | null = null;
  private dreadOsc2: OscillatorNode | null = null;
  private dreadOsc3: OscillatorNode | null = null;
  private dreadLfo: OscillatorNode | null = null;
  private dreadLevel = 0;

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    const ctx = this.ctx;

    // ── master chain ──
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.silenceGain = ctx.createGain();
    this.silenceGain.gain.value = 1;
    this.silenceGain.connect(this.master);

    this.sceneMix = ctx.createGain();
    this.sceneMix.gain.value = 1;
    this.sceneMix.connect(this.silenceGain);

    // ── generate a 5s brown-noise buffer, looped ──
    this.noiseBuffer = makeBrownNoise(ctx, 5);

    // ── rumble layer (deep, felt more than heard) ──
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 120;
    this.rumbleFilter.Q.value = 0.7;

    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.22;

    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = this.noiseBuffer;
    rumbleSrc.loop = true;
    rumbleSrc.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.sceneMix);
    rumbleSrc.start();

    // ── hiss layer (air, distant whisper-like texture) ──
    this.hissFilter = ctx.createBiquadFilter();
    this.hissFilter.type = 'highpass';
    this.hissFilter.frequency.value = 2400;
    this.hissFilter.Q.value = 0.3;

    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0.04;

    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = this.noiseBuffer;
    hissSrc.loop = true;
    hissSrc.connect(this.hissFilter);
    this.hissFilter.connect(this.hissGain);
    this.hissGain.connect(this.sceneMix);
    hissSrc.start();

    // ── drone (two slightly-detuned sines for a faint chord) ──
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.045;
    this.droneGain.connect(this.sceneMix);

    this.droneOsc1 = ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.value = 55; // low A
    this.droneOsc1.connect(this.droneGain);
    this.droneOsc1.start();

    this.droneOsc2 = ctx.createOscillator();
    this.droneOsc2.type = 'sine';
    this.droneOsc2.frequency.value = 82.4; // low E, detuned a hair below
    this.droneOsc2.detune.value = -7;
    this.droneOsc2.connect(this.droneGain);
    this.droneOsc2.start();

    // Gentle LFO on drone gain — slow swell between 0.6x and 1.4x
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.08;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.02;
    this.lfo.connect(lfoDepth).connect(this.droneGain.gain);
    this.lfo.start();

    // ── DREAD BED — proximity-driven choir wail ──
    // Three detuned sawtooths run through a bandpass centered at 420Hz
    // (human-female head-voice range) with slow vibrato LFO. At 0 gain
    // it's inaudible; at proximity 1.0 it's a dominant haunting chord.
    this.dreadFilter = ctx.createBiquadFilter();
    this.dreadFilter.type = 'bandpass';
    this.dreadFilter.frequency.value = 420;
    this.dreadFilter.Q.value = 3.2;

    this.dreadGain = ctx.createGain();
    this.dreadGain.gain.value = 0; // silent by default
    this.dreadFilter.connect(this.dreadGain);
    this.dreadGain.connect(this.sceneMix);

    // Three voices — root, minor third, fifth — slightly detuned
    // so they beat against each other. Low register = threatening.
    const dreadStack: Array<[OscillatorNode | null, number, number]> = [];
    this.dreadOsc1 = ctx.createOscillator();
    this.dreadOsc1.type = 'sawtooth';
    this.dreadOsc1.frequency.value = 110; // A2
    this.dreadOsc1.detune.value = 6;
    this.dreadOsc1.connect(this.dreadFilter);
    this.dreadOsc1.start();
    dreadStack.push([this.dreadOsc1, 110, 6]);

    this.dreadOsc2 = ctx.createOscillator();
    this.dreadOsc2.type = 'sawtooth';
    this.dreadOsc2.frequency.value = 131; // C3 (minor third)
    this.dreadOsc2.detune.value = -4;
    this.dreadOsc2.connect(this.dreadFilter);
    this.dreadOsc2.start();
    dreadStack.push([this.dreadOsc2, 131, -4]);

    this.dreadOsc3 = ctx.createOscillator();
    this.dreadOsc3.type = 'sawtooth';
    this.dreadOsc3.frequency.value = 164.8; // E3 (fifth)
    this.dreadOsc3.detune.value = 11;
    this.dreadOsc3.connect(this.dreadFilter);
    this.dreadOsc3.start();
    dreadStack.push([this.dreadOsc3, 164.8, 11]);

    // Slow vibrato on the filter cutoff — breathing quality.
    this.dreadLfo = ctx.createOscillator();
    this.dreadLfo.type = 'sine';
    this.dreadLfo.frequency.value = 0.22;
    const dreadLfoDepth = ctx.createGain();
    dreadLfoDepth.gain.value = 120;
    this.dreadLfo.connect(dreadLfoDepth).connect(this.dreadFilter.frequency);
    this.dreadLfo.start();

    this.applyPreset('basement', 0);
    this.startCreakScheduler();
  }

  /**
   * Drive the proximity dread bed (0..1). Called every frame from main.ts
   * with `1 - min(deanDistance / 30, 1)` so far = silent, close = wailing.
   * Ramps smoothly; safe to call continuously.
   */
  setDreadProximity(level: number): void {
    if (!this.ctx || !this.dreadGain) return;
    const clamped = Math.max(0, Math.min(1, level));
    this.dreadLevel = clamped;
    const now = this.ctx.currentTime;
    // Exponential feel: almost nothing until 0.4, ramps hard at 0.8+
    const mapped = Math.pow(clamped, 1.8) * 0.22;
    const g = this.dreadGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(mapped, now + 0.15);
    // Also sharpen the filter Q as proximity rises — more vocal edge.
    if (this.dreadFilter) {
      const q = 3.2 + clamped * 4;
      this.dreadFilter.Q.cancelScheduledValues(now);
      this.dreadFilter.Q.linearRampToValueAtTime(q, now + 0.15);
    }
    // LFO speeds up as he closes — faster breath.
    if (this.dreadLfo) {
      const hz = 0.22 + clamped * 0.6;
      this.dreadLfo.frequency.cancelScheduledValues(now);
      this.dreadLfo.frequency.linearRampToValueAtTime(hz, now + 0.2);
    }
  }

  getDreadLevel(): number {
    return this.dreadLevel;
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  /** Shared master bus — voice engine + ambient layers should connect here. */
  getMaster(): GainNode | null {
    return this.master;
  }

  /** Smoothly transition to a scene's ambient profile. */
  setScene(preset: ScenePreset, rampSec = 1.5): void {
    if (!this.ctx) return;
    this.currentPreset = preset;
    this.applyPreset(preset, rampSec);
  }

  /** Duck ambient to `gain` (0..1) over `rampSec` — used by silence events. */
  setAmbientGain(gain: number, rampSec = 0.6): void {
    if (!this.ctx || !this.silenceGain) return;
    const now = this.ctx.currentTime;
    const g = this.silenceGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(gain, now + rampSec);
  }

  /**
   * Continuously modulate ambient parameters based on fear level (0-1).
   * Called from FearAudioController every 500ms.
   *
   * All ramps are 500ms so they settle before the next tick.
   */
  setFearModulation(fear: number): void {
    if (!this.ctx) return;
    this.fearLevel = Math.max(0, Math.min(1, fear));
    const f = this.fearLevel;
    const now = this.ctx.currentTime;
    const end = now + 0.5;

    const base = AMBIENT_PRESETS[this.currentPreset];

    // Drone: 1x→3x gain with fear
    if (this.droneGain) {
      const dg = base.droneGain * (1 + f * 2);
      rampParam(this.droneGain.gain, dg, now, end);
    }
    // Drone detune: -7→-40 cents (increasing dissonance)
    if (this.droneOsc2) {
      const detune = -7 - f * 33;
      rampParam(this.droneOsc2.detune, detune, now, end);
    }
    // Rumble: 1x→2x
    if (this.rumbleGain) {
      rampParam(this.rumbleGain.gain, base.rumbleGain * (1 + f), now, end);
    }
    // Hiss: 1x→0.5x (suffocation)
    if (this.hissGain) {
      rampParam(this.hissGain.gain, base.hissGain * (1 - f * 0.5), now, end);
    }
    // LFO: 0.08→0.3 Hz (anxiety pulse)
    if (this.lfo) {
      const lfoHz = 0.08 + f * 0.22;
      rampParam(this.lfo.frequency, lfoHz, now, end);
    }
    // Master: 0.9→0.7 (headroom before stingers)
    if (this.master) {
      rampParam(this.master.gain, 0.9 - f * 0.2, now, end);
    }
    // Creak rate: 1x→2x faster
    this.creakRateMultiplier = 1 / (1 + f);
  }

  getFearLevel(): number {
    return this.fearLevel;
  }

  /** Anti-silence: everything suddenly louder for `durationSec`, then drops back. */
  antiSilence(durationSec: number): void {
    if (!this.ctx || !this.silenceGain) return;
    this.setAmbientGain(1.3, 0.1);
    this.playOneShot('stinger_low', 0.5);
    window.setTimeout(() => this.setAmbientGain(1.0, 0.8), durationSec * 1000);
  }

  /** Duck to silence for `durationSec`, then restore. Fear-enhanced at high levels. */
  duckForSilence(durationSec: number): void {
    if (!this.ctx) return;
    const f = this.fearLevel;

    // At high fear, duck harder — true void
    const duckTarget = f > 0.5 ? 0.01 : 0.05;
    this.setAmbientGain(duckTarget, 0.4);

    // At high fear, also kill the drone for true silence
    if (f > 0.5 && this.droneGain) {
      const now = this.ctx.currentTime;
      rampParam(this.droneGain.gain, 0.001, now, now + 0.3);
    }

    this.playOneShot('silence_drop', 0.6);

    // Snap-back ramp shortens with fear: 3s→0.4s (more jarring)
    const restoreRamp = 3.0 - f * 2.6;
    window.setTimeout(() => {
      this.setAmbientGain(1.0, restoreRamp);
      // Restore drone
      if (f > 0.5 && this.droneGain && this.ctx) {
        const base = AMBIENT_PRESETS[this.currentPreset];
        const now = this.ctx.currentTime;
        rampParam(this.droneGain.gain, base.droneGain * (1 + f * 2), now, now + restoreRamp);
      }
    }, durationSec * 1000);
  }

  // ── NEW HORROR SOUND LAYER ─────────────────────────────────────
  // Sound design references: Silent Hill radio static, The Ring
  // warped-voice, The Shining choral chord, Inception subsonic slam,
  // Amnesia reversed whisper. All synthesized — no asset files.
  //
  // Each method is self-contained (no shared state) and schedules its
  // nodes against the current AudioContext time. All route through
  // sceneMix so they respond to scene ducking.

  /**
   * SUBSONIC SLAM — the Inception "BWAAAM". Deep sine sweep from 60Hz
   * → 28Hz with long tail + noise burst. Shakes rooms with subwoofers.
   */
  playSubsonicSlam(durationSec = 2.2, volume = 1.0): void {
    if (!this.ctx || !this.sceneMix || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Sub sine sweep.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + durationSec);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.55 * volume, now + 0.08);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(oscGain).connect(this.sceneMix);
    osc.start(now);
    osc.stop(now + durationSec + 0.1);
    // Noise burst (initial transient).
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25 * volume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    noise.connect(lp).connect(noiseGain).connect(this.sceneMix);
    noise.start(now);
    noise.stop(now + 0.45);
  }

  /**
   * REVERSED WHISPER — stretched backward-filtered noise texture with
   * vowel-formant pulses. Reads as a voice played in reverse. The Ring
   * / Twin Peaks signature. `phraseMs` controls the "word" count
   * (longer = more syllables).
   */
  playReversedWhisper(phraseMs = 2500, volume = 0.8): void {
    if (!this.ctx || !this.sceneMix || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Syllable count — 3-5 pulses over phraseMs.
    const syllableCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < syllableCount; i++) {
      const t = now + (i / syllableCount) * (phraseMs / 1000);
      const formantHz = 340 + Math.random() * 600;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = 0.4 + Math.random() * 0.3;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = formantHz;
      bp.Q.value = 5 + Math.random() * 4;
      // Reversed envelope: slow attack, quick release — sounds "backwards."
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22 * volume, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      src.connect(bp).connect(g).connect(this.sceneMix);
      src.start(t);
      src.stop(t + 0.7);
    }
  }

  /**
   * MUSIC BOX — corrupted Old Nassau (Princeton's alma mater), pitched
   * down, detuned, playing a simple melody fragment on a bell-like
   * FM-ish synth. Haunted-nursery texture. Reference: The Conjuring.
   *
   * Old Nassau opens: G-E-D-C-D-E-G-E. We pitch to random close keys
   * and add slight detune + vibrato for "music-box-gone-wrong" feel.
   */
  playMusicBox(volume = 0.7): void {
    if (!this.ctx || !this.sceneMix) return;
    const ctx = this.ctx;
    const baseFreq = 165; // E3 root — low enough to feel like a gravely music box
    // Old Nassau fragment (interval pattern from the tune, transposed).
    const pattern = [
      5, 3, 1, 0, 1, 3, 5, 3, 1, -1, 0, 1, 3,
    ];
    const noteGap = 0.35;
    const start = ctx.currentTime;
    for (let i = 0; i < pattern.length; i++) {
      const t = start + i * noteGap;
      // Bell-like tone: two sines, one at fundamental, one at 2.76x
      // (inharmonic ratio — makes bells feel wrong).
      const f = baseFreq * Math.pow(2, pattern[i] / 12);
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = f;
      osc1.detune.value = (Math.random() - 0.5) * 18;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = f * 2.76;
      osc2.detune.value = (Math.random() - 0.5) * 30;
      const bellGain = ctx.createGain();
      bellGain.gain.setValueAtTime(0.0001, t);
      bellGain.gain.exponentialRampToValueAtTime(0.12 * volume, t + 0.02);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      osc1.connect(bellGain);
      osc2.connect(bellGain);
      bellGain.connect(filter).connect(this.sceneMix);
      osc1.start(t); osc1.stop(t + 1.9);
      osc2.start(t); osc2.stop(t + 1.9);
    }
  }

  /**
   * CHORAL CHORD — a sustained minor chord stack (The Shining / Hereditary).
   * Five slightly-detuned sawtooths in a Dm7 stack through vocal-formant
   * bandpass. Massive, haunting, choir-like.
   */
  playChoralChord(durationSec = 4.5, volume = 0.75): void {
    if (!this.ctx || !this.sceneMix) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Dm7: D3 (146.83) F3 (174.61) A3 (220) C4 (261.63) D4 (293.66)
    const notes = [146.83, 174.61, 220, 261.63, 293.66];
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 2.5;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.2 * volume, now + 0.6);
    bus.gain.setValueAtTime(0.2 * volume, now + durationSec - 0.8);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    filter.connect(bus).connect(this.sceneMix);
    for (const f of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 16;
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + durationSec + 0.2);
    }
  }

  /**
   * RADIO STATIC — Silent Hill's monster-proximity signal. A burst of
   * crackly highpass noise + intermittent squeals. Use as an
   * "something is wrong" overlay cue.
   */
  playRadioStatic(durationSec = 1.6, volume = 0.7): void {
    if (!this.ctx || !this.sceneMix || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Noise bed.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22 * volume, now + 0.04);
    g.gain.setValueAtTime(0.22 * volume, now + durationSec - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    src.connect(hp).connect(g).connect(this.sceneMix);
    src.start(now);
    src.stop(now + durationSec + 0.1);
    // Random squeal spikes (sine chirps) scattered across the duration.
    const squealCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < squealCount; i++) {
      const t = now + Math.random() * durationSec;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const startF = 2400 + Math.random() * 1200;
      osc.frequency.setValueAtTime(startF, t);
      osc.frequency.exponentialRampToValueAtTime(startF * 0.5, t + 0.2);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.12 * volume, t + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(sg).connect(this.sceneMix);
      osc.start(t); osc.stop(t + 0.3);
    }
  }

  /**
   * EVIL LAUGH — a slow, descending cackle. Pitched formants over low
   * subbass sustain. Reads as "the Dean is pleased." Used at medium
   * Dean distances (warning cue).
   */
  playEvilLaugh(volume = 0.8): void {
    if (!this.ctx || !this.sceneMix || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Sustained sub-bass rumble under the laugh — "low voice."
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, now);
    sub.frequency.exponentialRampToValueAtTime(62, now + 1.8);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.2 * volume, now + 0.1);
    subGain.gain.setValueAtTime(0.2 * volume, now + 1.2);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    sub.connect(subGain).connect(this.sceneMix);
    sub.start(now); sub.stop(now + 1.9);

    // Seven "ha" syllables — each is a filtered noise burst through
    // a bandpass, descending in pitch, accelerating rhythm.
    const syllables = 7;
    for (let i = 0; i < syllables; i++) {
      const t = now + 0.08 + i * (0.16 - i * 0.008);
      const formant = 520 - i * 35;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = 0.6 - i * 0.04;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = formant;
      bp.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.26 * volume, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      src.connect(bp).connect(g).connect(this.sceneMix);
      src.start(t); src.stop(t + 0.13);
    }
    // Final "hah" — longer, lower pitch.
    const tailT = now + 1.3;
    const tail = ctx.createBufferSource();
    tail.buffer = this.noiseBuffer;
    tail.playbackRate.value = 0.35;
    const tailBP = ctx.createBiquadFilter();
    tailBP.type = 'bandpass';
    tailBP.frequency.value = 280;
    tailBP.Q.value = 3;
    const tailGain = ctx.createGain();
    tailGain.gain.setValueAtTime(0.0001, tailT);
    tailGain.gain.exponentialRampToValueAtTime(0.28 * volume, tailT + 0.05);
    tailGain.gain.exponentialRampToValueAtTime(0.0001, tailT + 0.45);
    tail.connect(tailBP).connect(tailGain).connect(this.sceneMix);
    tail.start(tailT); tail.stop(tailT + 0.5);
  }

  /**
   * LOW GROWL — predatory, animal. Long attack, sustained, through a
   * lowpass so it reads as "close but not seen." Distance warning cue
   * when the Dean is far (10+m) and approaching.
   */
  playGrowl(durationSec = 2.2, volume = 0.75): void {
    if (!this.ctx || !this.sceneMix || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Two detuned sawtooths for the growl core.
    const core = ctx.createOscillator();
    core.type = 'sawtooth';
    core.frequency.setValueAtTime(72, now);
    core.frequency.linearRampToValueAtTime(88, now + durationSec * 0.7);
    core.frequency.linearRampToValueAtTime(60, now + durationSec);
    core.detune.value = 12;
    const core2 = ctx.createOscillator();
    core2.type = 'sawtooth';
    core2.frequency.setValueAtTime(108, now);
    core2.frequency.linearRampToValueAtTime(128, now + durationSec * 0.6);
    core2.frequency.linearRampToValueAtTime(92, now + durationSec);
    core2.detune.value = -18;
    // Lowpass filter — makes it feel vocal + close.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, now);
    lp.frequency.linearRampToValueAtTime(820, now + durationSec * 0.6);
    lp.frequency.linearRampToValueAtTime(340, now + durationSec);
    lp.Q.value = 4;
    // Vibrato LFO — organic, not synthesized-sounding.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 7.5;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 6;
    lfo.connect(lfoDepth).connect(core.detune);
    lfo.start(now); lfo.stop(now + durationSec + 0.1);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.24 * volume, now + 0.4);
    bus.gain.setValueAtTime(0.24 * volume, now + durationSec - 0.6);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    core.connect(lp);
    core2.connect(lp);
    lp.connect(bus).connect(this.sceneMix);
    core.start(now); core.stop(now + durationSec + 0.1);
    core2.start(now); core2.stop(now + durationSec + 0.1);
  }

  /**
   * CHILD LAUGH — brief, detuned giggle. The classic horror texture
   * (Poltergeist, Sinister). Two formant sines chirping rapidly.
   */
  playChildLaugh(volume = 0.6): void {
    if (!this.ctx || !this.sceneMix) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pattern = [0, 2, 0, -2, 0, 2]; // semitone offsets
    const baseFreq = 540;
    for (let i = 0; i < pattern.length; i++) {
      const t = now + i * 0.12;
      const f = baseFreq * Math.pow(2, pattern[i] / 12);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 3;
      bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12 * volume, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(bp).connect(g).connect(this.sceneMix);
      osc.start(t); osc.stop(t + 0.13);
    }
  }

  /** Trigger Phobos's breath — sub-bass pulse with a slow attack. */
  playBreath(intensity = 0.4): void {
    if (!this.ctx || !this.sceneMix) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(42, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 2.5);

    const gain = ctx.createGain();
    const peak = Math.min(0.5, Math.max(0.05, intensity * 0.5));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);

    osc.connect(gain).connect(this.sceneMix);
    osc.start(now);
    osc.stop(now + 3.2);
  }

  /** Procedural one-shot — envelope-shaped synthesized SFX. */
  playOneShot(id: SoundId, volume = 1.0): void {
    if (!this.ctx || !this.sceneMix || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    switch (id) {
      case 'footstep_behind': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.playbackRate.value = 0.4;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 380;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.35 * volume, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        src.connect(filter).connect(g).connect(this.sceneMix);
        src.start(now);
        src.stop(now + 0.25);
        // A second, softer footstep ~220ms later (two-step cadence)
        window.setTimeout(() => this.playOneShot('footstep_tail' as SoundId, volume * 0.7), 220);
        break;
      }
      case 'footstep_near': {
        // Short muted thump for the player's own footfalls. Randomised playback
        // rate gives variation across steps so the cadence doesn't feel robotic.
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.playbackRate.value = 0.32 + Math.random() * 0.1;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 260 + Math.random() * 60;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.22 * volume, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        src.connect(filter).connect(g).connect(this.sceneMix);
        src.start(now);
        src.stop(now + 0.14);
        break;
      }
      case 'creak_floor':
      case 'creak_door': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const startF = id === 'creak_door' ? 220 : 140;
        osc.frequency.setValueAtTime(startF, now);
        osc.frequency.exponentialRampToValueAtTime(startF * 0.5, now + 0.8);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 420;
        filter.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.18 * volume, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
        osc.connect(filter).connect(g).connect(this.sceneMix);
        osc.start(now);
        osc.stop(now + 0.9);
        break;
      }
      case 'whisper_hold':
      case 'whisper_good':
      case 'whisper_see': {
        // Breathy consonant texture — filtered noise burst with formant hint
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = id === 'whisper_see' ? 3800 : 2600;
        bp.Q.value = 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.22 * volume, now + 0.06);
        g.gain.setValueAtTime(0.22 * volume, now + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        src.connect(bp).connect(g).connect(this.sceneMix);
        src.start(now);
        src.stop(now + 0.6);
        break;
      }
      case 'silence_drop': {
        // Low thump — a sub-bass hit as the ambient ducks
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.35 * volume, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        osc.connect(g).connect(this.sceneMix);
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }
      case 'glitch': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.playbackRate.value = 2.5;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.4 * volume, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        src.connect(hp).connect(g).connect(this.sceneMix);
        src.start(now);
        src.stop(now + 0.16);
        break;
      }
      case 'heartbeat':
      case 'breath_low': {
        this.playBreath(0.4 * volume);
        break;
      }
      case 'stinger_low': {
        // Sub-bass hit — sine sweep 30Hz→15Hz, hard attack
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(30, now);
        osc.frequency.exponentialRampToValueAtTime(15, now + 0.28);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.9 * volume, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
        osc.connect(g).connect(this.sceneMix);
        osc.start(now);
        osc.stop(now + 0.32);
        break;
      }
      case 'stinger_high': {
        // Treble stab — white noise burst through tight bandpass at 4kHz
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.playbackRate.value = 3.0;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 4000;
        bp.Q.value = 8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.7 * volume, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        src.connect(bp).connect(g).connect(this.sceneMix);
        src.start(now);
        src.stop(now + 0.16);
        break;
      }
      case 'reverse_creak': {
        // Uncanny creak — frequency sweeps UP instead of down
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(70, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.8);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 420;
        filter.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.18 * volume, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
        osc.connect(filter).connect(g).connect(this.sceneMix);
        osc.start(now);
        osc.stop(now + 0.9);
        break;
      }
      case 'radio_static': {
        // Digital interference — brown noise × ring mod 120Hz
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1000;
        const ringOsc = ctx.createOscillator();
        ringOsc.type = 'sine';
        ringOsc.frequency.value = 120;
        const ringGain = ctx.createGain();
        ringGain.gain.value = 0;
        ringOsc.connect(ringGain.gain);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5 * volume, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        src.connect(hp).connect(ringGain).connect(g).connect(this.sceneMix);
        ringOsc.start(now);
        ringOsc.stop(now + 0.52);
        src.start(now);
        src.stop(now + 0.52);
        break;
      }
      case 'tone_wrong': {
        // Dissonant minor 2nd — two sines that feel wrong together
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 440;
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 466; // minor 2nd above A4
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.25 * volume, now);
        g.gain.setValueAtTime(0.25 * volume, now + 1.5);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);
        osc1.connect(g);
        osc2.connect(g);
        g.connect(this.sceneMix);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 3.1);
        osc2.stop(now + 3.1);
        break;
      }
      case 'scream': {
        // Human scream — FM synthesis: sawtooth carrier 400Hz → 900Hz
        // sweep (pitch rises in panic), modulated by a 7Hz vibrato. Two
        // detuned voices layered for a "two throats" uncanny edge. High
        // noise layer for breath + vocal cord rasp. 1.2s total: crescendo
        // → hold → quick fade. Loud by default (0.95×volume) — this is
        // the jumpscare climax, not ambient.
        const dur = 1.2;
        // Carrier 1
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(400, now);
        osc1.frequency.exponentialRampToValueAtTime(900, now + 0.25);
        osc1.frequency.setValueAtTime(900, now + 0.7);
        osc1.frequency.exponentialRampToValueAtTime(220, now + dur);
        // Carrier 2 — detuned a fourth up for the shriek harmonic
        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(540, now);
        osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        osc2.frequency.exponentialRampToValueAtTime(300, now + dur);
        osc2.detune.value = 12;
        // Vibrato (7 Hz panic tremor) on both carriers
        const vibrato = ctx.createOscillator();
        vibrato.type = 'sine';
        vibrato.frequency.value = 7;
        const vibratoDepth = ctx.createGain();
        vibratoDepth.gain.value = 40;
        vibrato.connect(vibratoDepth);
        vibratoDepth.connect(osc1.frequency);
        vibratoDepth.connect(osc2.frequency);
        // Formant-ish bandpass to shape toward a vocal "ah"
        const formant = ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.value = 1100;
        formant.Q.value = 3.5;
        // Noise layer — breath + rasp, high-passed so it sits above the sawtooths
        const breathSrc = ctx.createBufferSource();
        breathSrc.buffer = this.noiseBuffer;
        const breathHP = ctx.createBiquadFilter();
        breathHP.type = 'highpass';
        breathHP.frequency.value = 1800;
        const breathGain = ctx.createGain();
        breathGain.gain.setValueAtTime(0, now);
        breathGain.gain.linearRampToValueAtTime(0.22 * volume, now + 0.08);
        breathGain.gain.setValueAtTime(0.22 * volume, now + 0.85);
        breathGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        breathSrc.connect(breathHP).connect(breathGain).connect(this.sceneMix);
        // Main envelope: fast attack, hold, quick release
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.9 * volume, now + 0.05);
        g.gain.setValueAtTime(0.9 * volume, now + 0.75);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc1.connect(formant);
        osc2.connect(formant);
        formant.connect(g).connect(this.sceneMix);
        osc1.start(now);
        osc2.start(now);
        vibrato.start(now);
        breathSrc.start(now);
        osc1.stop(now + dur + 0.05);
        osc2.stop(now + dur + 0.05);
        vibrato.stop(now + dur + 0.05);
        breathSrc.stop(now + dur + 0.05);
        break;
      }
      case 'impact': {
        // Door slam — brown noise through lowpass + hard clipping
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.playbackRate.value = 0.5;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 80;
        lp.Q.value = 1;
        const clip = ctx.createWaveShaper();
        const clipCurve = new Float32Array(new ArrayBuffer(256 * 4));
        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * 2 - 1;
          clipCurve[i] = Math.max(-0.8, Math.min(0.8, x * 2.5));
        }
        clip.curve = clipCurve;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.9 * volume, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        src.connect(lp).connect(clip).connect(g).connect(this.sceneMix);
        src.start(now);
        src.stop(now + 0.12);
        break;
      }
      default: {
        // Unknown id — attach a soft thump so events still register audibly
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 180;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.1 * volume, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        osc.connect(g).connect(this.sceneMix);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    }
  }

  dispose(): void {
    if (this.creakTimer !== null) {
      clearTimeout(this.creakTimer);
      this.creakTimer = null;
    }
    this.droneOsc1?.stop();
    this.droneOsc2?.stop();
    this.ctx?.close();
    this.ctx = null;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internal
  // ───────────────────────────────────────────────────────────────────────

  /** Ramps filter/gain targets per-scene so each room has a distinct feel. */
  private applyPreset(preset: ScenePreset, rampSec: number): void {
    if (!this.ctx || !this.rumbleFilter || !this.rumbleGain || !this.hissFilter || !this.hissGain || !this.droneGain) return;
    const now = this.ctx.currentTime;
    const end = now + rampSec;

    const targets = AMBIENT_PRESETS[preset];

    rampParam(this.rumbleFilter.frequency, targets.rumbleLP, now, end);
    rampParam(this.rumbleGain.gain, targets.rumbleGain, now, end);
    rampParam(this.hissFilter.frequency, targets.hissHP, now, end);
    rampParam(this.hissGain.gain, targets.hissGain, now, end);
    rampParam(this.droneGain.gain, targets.droneGain, now, end);
  }

  /** Random infrequent creaks — reads as a "lived-in" room. Rate scales with fear. */
  private startCreakScheduler(): void {
    const schedule = () => {
      const presetRate = this.currentPreset === 'attic' ? 4
        : this.currentPreset === 'bedroom' ? 7
        : this.currentPreset === 'club' ? 8
        : this.currentPreset === 'campus' ? 14
        : 10;
      // mean inter-arrival presetRate seconds, scaled by fear multiplier
      const scaled = presetRate * this.creakRateMultiplier;
      const next = scaled * 1000 + Math.random() * scaled * 1000;
      this.creakTimer = window.setTimeout(() => {
        if (!this.ctx) return;
        // At high fear, occasionally use reverse_creak for uncanny effect
        let creakId: 'creak_door' | 'creak_floor' | 'reverse_creak';
        if (this.fearLevel > 0.6 && Math.random() < 0.25) {
          creakId = 'reverse_creak';
        } else {
          creakId = Math.random() < 0.4 ? 'creak_door' : 'creak_floor';
        }
        this.playOneShot(creakId, 0.4);
        schedule();
      }, next);
    };
    schedule();
  }
}

interface AmbientProfile {
  rumbleLP: number;
  rumbleGain: number;
  hissHP: number;
  hissGain: number;
  droneGain: number;
}

const AMBIENT_PRESETS: Record<ScenePreset, AmbientProfile> = {
  basement: { rumbleLP: 120, rumbleGain: 0.24, hissHP: 2400, hissGain: 0.05, droneGain: 0.04 },
  bedroom:  { rumbleLP: 90,  rumbleGain: 0.14, hissHP: 3200, hissGain: 0.07, droneGain: 0.065 },
  attic:    { rumbleLP: 70,  rumbleGain: 0.08, hissHP: 4000, hissGain: 0.05, droneGain: 0.08 },
  // Campus: the street at night. Prior preset was too quiet — players
  // reported no scary music at all outdoors. Drone bumped to 0.09 (above
  // club), rumble to 0.20 for deep felt-bass, hiss narrowed to 1200Hz for
  // that "cold air through trees" texture. This is now the loudest
  // ambient bed in the game — the street is meant to feel surveilled.
  campus:   { rumbleLP: 60,  rumbleGain: 0.20, hissHP: 1200, hissGain: 0.11, droneGain: 0.09 },
  club:     { rumbleLP: 100, rumbleGain: 0.18, hissHP: 2800, hissGain: 0.06, droneGain: 0.055 },
};

function rampParam(param: AudioParam, target: number, now: number, end: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, end);
}

function makeBrownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}
