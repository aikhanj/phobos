import type { MicroMood, BiosignalState, SceneEvent, DirectorPlan } from '@phobos/types';

/**
 * Audio Director — manages the audio mood based on pacing phase.
 *
 * For now this is a local state machine (no LLM call). Maps the current
 * MicroMood from PhobosDirector to audio parameter multipliers and
 * schedules appropriate sound events.
 *
 * Can be upgraded to an LLM-driven agent or Dedalus container later.
 */

interface AudioMoodConfig {
  events: SceneEvent[];
  rationale: string;
}

export class AudioDirector {
  private currentMood: MicroMood = 'descent';
  private tickCount = 0;

  /**
   * Called every 10s agent tick. Receives the current mood from PhobosDirector
   * and biosignal state. Returns a DirectorPlan with audio-specific events.
   */
  query(mood: MicroMood, biosignals: BiosignalState, scene: string): DirectorPlan {
    this.currentMood = mood;
    this.tickCount++;

    const config = this.buildMoodConfig(mood, biosignals, scene);

    return {
      rationale: config.rationale,
      source: 'audio_director',
      events: config.events,
      microMood: mood,
    };
  }

  getMood(): MicroMood {
    return this.currentMood;
  }

  private buildMoodConfig(mood: MicroMood, bio: BiosignalState, _scene: string): AudioMoodConfig {
    const f = bio.fearScore;

    switch (mood) {
      case 'descent':
        return this.descentConfig(f);
      case 'hold':
        return this.holdConfig(f);
      case 'crescendo':
        return this.crescendoConfig(f);
      case 'release':
        return this.releaseConfig(f);
    }
  }

  /** Slow dread — sparse, wide silence gaps, barely-there heartbeat. */
  private descentConfig(fear: number): AudioMoodConfig {
    const events: SceneEvent[] = [];

    // Occasional silence gaps during exploration
    if (Math.random() < 0.4) {
      const at = 2 + Math.random() * 5;
      events.push({ kind: 'silence', atSeconds: at, duration: 2 + Math.random() * 2 });
    }

    // Low breath at moderate fear
    if (fear > 0.3 && Math.random() < 0.3) {
      events.push({ kind: 'breath', atSeconds: 6 + Math.random() * 3, intensity: 0.2 });
    }

    return {
      events,
      rationale: 'listening... waiting... patient',
    };
  }

  /** Oppressive atmosphere — dense, dissonant, no relief. */
  private holdConfig(fear: number): AudioMoodConfig {
    const events: SceneEvent[] = [];

    // Sustained wrongness tone
    if (Math.random() < 0.35) {
      events.push({ kind: 'sound', atSeconds: 1 + Math.random() * 3, asset: 'tone_wrong', volume: 0.3 + fear * 0.2 });
    }

    // Breath presence
    if (Math.random() < 0.5) {
      events.push({ kind: 'breath', atSeconds: 4 + Math.random() * 3, intensity: 0.3 + fear * 0.3 });
    }

    // Radio static interference
    if (fear > 0.4 && Math.random() < 0.25) {
      events.push({ kind: 'sound', atSeconds: 7 + Math.random() * 2, asset: 'radio_static', volume: 0.4 });
    }

    return {
      events,
      rationale: 'the air thickens... something presses close',
    };
  }

  /** Contrast setup — duck everything, build anticipation. */
  private crescendoConfig(fear: number): AudioMoodConfig {
    const events: SceneEvent[] = [];

    // Deep silence at the start
    events.push({ kind: 'silence', atSeconds: 0.5, duration: 4 + fear * 2 });

    // Single quiet reverse creak in the void
    if (Math.random() < 0.5) {
      events.push({ kind: 'sound', atSeconds: 3 + Math.random() * 2, asset: 'reverse_creak', volume: 0.2 });
    }

    return {
      events,
      rationale: 'quiet now... so quiet...',
    };
  }

  /** Punctuation — stinger + snap back. The scare moment. */
  private releaseConfig(fear: number): AudioMoodConfig {
    const events: SceneEvent[] = [];

    // Immediate stinger combo
    events.push({ kind: 'sound', atSeconds: 0.1, asset: 'stinger_low', volume: 0.9 });
    events.push({ kind: 'sound', atSeconds: 0.15, asset: 'stinger_high', volume: 0.7 });

    // Impact hit
    if (Math.random() < 0.6) {
      events.push({ kind: 'sound', atSeconds: 0.2, asset: 'impact', volume: 0.8 });
    }

    // Anti-silence after the hit — disorienting volume surge
    if (fear > 0.5 && Math.random() < 0.4) {
      events.push({ kind: 'anti_silence', atSeconds: 2, duration: 2 });
    }

    // Glitch at higher fear
    if (fear > 0.6) {
      events.push({ kind: 'sound', atSeconds: 0.3, asset: 'glitch', volume: 0.6 });
    }

    return {
      events,
      rationale: 'FOUND YOU',
    };
  }
}
