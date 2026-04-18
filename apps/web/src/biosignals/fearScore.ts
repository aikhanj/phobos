import type { BiosignalState } from '@phobos/types';

// Phase 2: Fuse face landmarks + rPPG into rolling fear score 0-1
export class FearScoreCalculator {
  calculate(): BiosignalState {
    return {
      fearScore: 0,
      bpm: 0,
      gazeAversion: 0,
      flinchCount: 0,
      timeInScene: 0,
      lookStillness: 0,
      retreatVelocity: 0,
      gazeDwellMs: {},
      timestamp: Date.now(),
    };
  }
}
