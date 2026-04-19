import type { BiosignalState } from '@phobos/types';
import type { FaceExpressionSnapshot } from './faceEmotion';
import type { AudioEnergySnapshot } from './audioEnergy';

export interface FearScoreInputs {
  face: FaceExpressionSnapshot;
  bpm: number;
  baselineBpm: number;
  timeInScene: number;
  /** Optional mic signal — gasps/screams add a fast-decaying boost. */
  audio?: AudioEnergySnapshot;
  /** Was a mic onset consumed this tick? Captures the reactive spike. */
  audioOnset?: boolean;
}

// Sensitivity-tuned weights: face-api's fearful class rarely outputs above 0.7
// even for strongly scared faces, so we overdrive the weights and clamp. Goal:
// a convincingly scared face alone saturates the bar within ~1-2 seconds.
const W_FEARFUL = 1.6;
const W_SURPRISED = 0.9;
const W_DISGUSTED = 0.5;
const W_ANGRY = 0.3;
const W_HR = 0.4;
/** Sustained mic loudness adds a small persistent component. */
const W_AUDIO_LOUDNESS = 0.35;
/** Onset spike is an immediate +contribution — decays over the next tick. */
const W_AUDIO_ONSET = 0.45;

// A +25 BPM delta over baseline maps to 1.0 on the HR axis.
const HR_DELTA_SATURATION = 25;

// Faster EMA so the meter reacts within 1-2 seconds at the 500ms tick rate.
const EMA_ALPHA = 0.55;

// Gamma <1 steepens mid-range response (e.g. raw 0.3 -> 0.48 after gamma 0.75)
const FACE_GAMMA = 0.75;

export class FearScoreCalculator {
  private score = 0;

  calculate(inputs: FearScoreInputs): BiosignalState {
    const { face, bpm, baselineBpm, timeInScene, audio, audioOnset } = inputs;

    const faceRaw = face.detected
      ? W_FEARFUL * face.fearful +
        W_SURPRISED * face.surprised +
        W_DISGUSTED * face.disgusted +
        W_ANGRY * face.angry
      : 0;
    const faceComponent = clamp01(Math.pow(clamp01(faceRaw), FACE_GAMMA));

    const hrComponent =
      baselineBpm > 0 && bpm > 0
        ? W_HR * clamp01((bpm - baselineBpm) / HR_DELTA_SATURATION)
        : 0;

    // Mic: a sustained loudness EMA + a one-tick onset bump. The onset is
    // the signal that the player JUST reacted — gasped, yelped, exhaled.
    const audioLoud = audio && audio.active ? W_AUDIO_LOUDNESS * audio.loudness : 0;
    const audioSpike = audioOnset ? W_AUDIO_ONSET : 0;

    const raw = clamp01(faceComponent + hrComponent + audioLoud + audioSpike);
    this.score = this.score * (1 - EMA_ALPHA) + raw * EMA_ALPHA;

    return {
      fearScore: this.score,
      bpm,
      gazeAversion: 0,
      flinchCount: 0,
      timeInScene,
      lookStillness: 0,
      retreatVelocity: 0,
      gazeDwellMs: {},
      timestamp: Date.now(),
    };
  }

  reset(): void {
    this.score = 0;
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
