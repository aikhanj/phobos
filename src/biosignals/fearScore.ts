import type { BiosignalState } from '../types';

// Phase 2: Fuse face landmarks + rPPG into rolling fear score 0-1
export class FearScoreCalculator {
  calculate(): BiosignalState {
    return {
      fearScore: 0,
      bpm: 0,
      gazeAversion: 0,
      flinchCount: 0,
      timeInScene: 0,
      timestamp: Date.now(),
    };
  }
}
