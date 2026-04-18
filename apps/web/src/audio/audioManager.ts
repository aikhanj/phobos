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

    this.applyPreset('basement', 0);
    this.startCreakScheduler();
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
  campus:   { rumbleLP: 60,  rumbleGain: 0.10, hissHP: 1800, hissGain: 0.09, droneGain: 0.025 },
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
