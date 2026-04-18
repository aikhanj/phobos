import type { VoiceEngine } from './voiceEngine';

export type FearBucket = 'low' | 'medium' | 'high' | 'peak';

/**
 * Curated Granny lines bucketed by player fear state. Rules of thumb:
 * - low     : ambient confusion, not yet aware of the player
 * - medium  : aware, searching, still gentle
 * - high    : tracking, closer proximity, dropping pretense
 * - peak   : confrontation — short, final, arresting
 *
 * Short lines carry better than long ones; favor 3-7 words. Periods/commas
 * produce natural pauses in ElevenLabs Turbo output.
 */
export const GRANNY_LINES: Record<FearBucket, string[]> = {
  low: [
    'where did you go',
    'are you still there, dear',
    'i thought i heard something',
    'little mouse, little mouse',
    'come out and say hello',
  ],
  medium: [
    'i hear you breathing',
    'you left the door open again',
    'come out little one',
    'such a clever hiding place',
    'it is not safe to hide',
    'i have all the time in the world',
  ],
  high: [
    'i see you now',
    'why are you running',
    'there you are',
    'do not turn around',
    'closer than you think',
  ],
  peak: [
    'found you',
    'do not move',
    'look at me',
  ],
};

export class LineBank {
  constructor(
    private readonly engine: VoiceEngine,
    private readonly voiceId: string,
    private readonly lines: Record<FearBucket, string[]> = GRANNY_LINES,
  ) {}

  /**
   * Sequentially speak every line at zero gain so they hit the engine's
   * TTS cache. Serialized because ElevenLabs rate-limits parallel requests.
   * Fire-and-forget from the call site — first V press before completion
   * just pays the normal streaming latency.
   */
  async preWarm(onProgress?: (done: number, total: number) => void): Promise<void> {
    const all = Object.values(this.lines).flat();
    let done = 0;
    for (const text of all) {
      const h = this.engine.speak({ text, voiceId: this.voiceId, gain: 0 });
      await h.done;
      done++;
      onProgress?.(done, all.length);
    }
  }

  pick(bucket: FearBucket, avoid?: string): string {
    const pool = this.lines[bucket];
    if (pool.length === 1 || !avoid) return pool[Math.floor(Math.random() * pool.length)];
    const filtered = pool.filter((l) => l !== avoid);
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  all(): string[] {
    return Object.values(this.lines).flat();
  }
}
