import type { SessionHistoryEvent, SessionHistoryEventKind } from '@phobos/types';

/**
 * Rolling log of high-signal moments in a play session. The director reads
 * the tail every 10s tick so later scares can reference earlier ones ("your
 * fear spiked 0.42 at tower. doing it again."). Bounded so the LLM prompt
 * never blows up.
 */
const MAX_EVENTS = 40;
const TAIL_FOR_LLM = 6;

class SessionHistory {
  private events: SessionHistoryEvent[] = [];
  private sessionStart = performance.now();

  reset(): void {
    this.events = [];
    this.sessionStart = performance.now();
  }

  push(kind: SessionHistoryEventKind, scene: string, detail?: {
    fearScore?: number;
    delta?: number;
    bpm?: number;
    label?: string;
  }): void {
    this.events.push({
      kind,
      scene,
      timestamp: Date.now(),
      fearScore: detail?.fearScore,
      delta: detail?.delta,
      bpm: detail?.bpm,
      label: detail?.label,
    });
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }
  }

  /** Tail of the log — shaped for the director's user message. */
  tail(n = TAIL_FOR_LLM): SessionHistoryEvent[] {
    return this.events.slice(-n);
  }

  all(): SessionHistoryEvent[] {
    return this.events.slice();
  }

  /** Peak fear score seen this session. */
  peakFear(): number {
    let peak = 0;
    for (const e of this.events) {
      if (typeof e.fearScore === 'number' && e.fearScore > peak) peak = e.fearScore;
    }
    return peak;
  }

  /** Time since session start in seconds. */
  elapsed(): number {
    return (performance.now() - this.sessionStart) / 1000;
  }

  /** Human-readable mm:ss stamp relative to session start for log copy. */
  stamp(tsMs: number = Date.now()): string {
    const sec = Math.max(0, Math.floor((performance.now() - this.sessionStart - (Date.now() - tsMs)) / 1000));
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
}

export const sessionHistory = new SessionHistory();
