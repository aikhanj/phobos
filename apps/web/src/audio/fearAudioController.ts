import type { BiosignalState, MicroMood } from '@phobos/types';
import type { AudioManager } from './audioManager';

/**
 * Maps biosignal state to audio parameter modulation.
 *
 * Two control layers:
 *  1. Fear modulation (500ms tick) — continuous, smooth parameter changes
 *  2. Pacing phase (10s tick from AudioDirector) — strategic mode switching
 *
 * Also manages a heartbeat scheduler that simulates/mirrors the player's
 * heart rate via rhythmic sub-bass pulses.
 */

/** Director phase multipliers applied on top of fear modulation. */
const PHASE_MULTIPLIERS: Record<MicroMood, {
  droneGain: number;
  creakRate: number;
  ambientFloor: number;
}> = {
  descent:   { droneGain: 0.7,  creakRate: 1.5,  ambientFloor: 1.0 },
  hold:      { droneGain: 1.3,  creakRate: 1.0,  ambientFloor: 1.0 },
  crescendo: { droneGain: 0.5,  creakRate: 0.0,  ambientFloor: 0.15 },
  release:   { droneGain: 1.2,  creakRate: 2.0,  ambientFloor: 1.0 },
};

export class FearAudioController {
  private phase: MicroMood = 'descent';
  private heartbeatTimer: number | null = null;
  private currentBpm = 72;

  constructor(private readonly audio: AudioManager) {}

  /**
   * Called every 500ms with the latest biosignal state.
   * Drives continuous fear-reactive audio modulation and heartbeat.
   */
  update(state: BiosignalState): void {
    const fear = state.fearScore;

    // Apply fear modulation to ambient layers
    this.audio.setFearModulation(fear);

    // Update heartbeat rate: 72 BPM at calm, ~110 BPM at max fear
    // If real BPM is available (>0), use it; otherwise simulate
    const targetBpm = state.bpm > 0
      ? state.bpm
      : 72 + fear * 38;

    if (Math.abs(targetBpm - this.currentBpm) > 2) {
      this.currentBpm = targetBpm;
      this.restartHeartbeat(fear);
    }
  }

  /**
   * Called when pacing phase changes (from AudioDirector's 10s tick).
   * Adjusts the ambient baseline for the current horror mode.
   */
  setPhase(phase: MicroMood): void {
    this.phase = phase;
    const mult = PHASE_MULTIPLIERS[phase];

    // Duck ambient for crescendo (building anticipation)
    if (phase === 'crescendo') {
      this.audio.setAmbientGain(mult.ambientFloor, 2.0);
    } else if (phase === 'release') {
      // Snap back loud on release
      this.audio.setAmbientGain(1.2, 0.3);
      // Fire a stinger on release
      this.audio.playOneShot('stinger_low', 0.8);
      // Reset to normal after 5s
      setTimeout(() => this.audio.setAmbientGain(1.0, 1.0), 5000);
    } else {
      this.audio.setAmbientGain(mult.ambientFloor, 1.0);
    }
  }

  getPhase(): MicroMood {
    return this.phase;
  }

  /** Start the heartbeat scheduler. */
  startHeartbeat(): void {
    this.restartHeartbeat(0);
  }

  /** Stop the heartbeat scheduler. */
  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  dispose(): void {
    this.stopHeartbeat();
  }

  private restartHeartbeat(fear: number): void {
    this.stopHeartbeat();
    const intervalMs = 60000 / this.currentBpm;
    // Gain scales with fear: barely audible at calm, prominent at max
    const gain = 0.15 + fear * 0.25;
    this.heartbeatTimer = window.setInterval(() => {
      this.audio.playOneShot('heartbeat', gain);
    }, intervalMs);
  }
}
