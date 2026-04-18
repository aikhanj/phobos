import type { FearBucket } from '@phobos/voice';

export interface BeatContext {
  /** Wall-clock timestamp when the beat is fired. */
  time: number;
  /** The fear bucket the director thinks we're in. */
  fearBucket: FearBucket;
  /** Optional additional payload the beat may use. */
  [extra: string]: unknown;
}

export interface Beat {
  id: string;
  /** Fear buckets this beat is eligible to fire in. */
  tiers: FearBucket[];
  /** Minimum ms between fires (per beat). */
  cooldownMs: number;
  /** Optional predicate for per-fire gating (e.g. "only if creature is off-screen"). */
  prereq?: (ctx: BeatContext) => boolean;
  fire: (ctx: BeatContext) => Promise<void> | void;
}

/**
 * Lightweight registry that fulfills the "director picks a beat" role.
 * It is intentionally agnostic about *how* the director chooses — it just
 * enforces cooldowns, tier eligibility, and novelty weighting when asked.
 *
 * Phase 4's LLM-driven Scare Director can wrap this by:
 *   1. Calling available(bucket) to get the candidate set
 *   2. Choosing one (via LLM or heuristic)
 *   3. Calling fireById(id, ctx) — the registry handles bookkeeping
 */
export class BeatRegistry {
  private readonly beats = new Map<string, Beat>();
  private readonly lastFired = new Map<string, number>();

  register(beat: Beat): void {
    this.beats.set(beat.id, beat);
  }

  get(id: string): Beat | undefined {
    return this.beats.get(id);
  }

  list(): Beat[] {
    return Array.from(this.beats.values());
  }

  /** Beats eligible given the current fear bucket, cooldowns, and prereqs. */
  available(ctx: BeatContext): Beat[] {
    return this.list().filter((b) => this.isEligible(b, ctx));
  }

  /**
   * Pick a random eligible beat, weighted toward beats that haven't fired
   * recently (novelty bias). Returns null if none available.
   */
  pickWeighted(ctx: BeatContext): Beat | null {
    const pool = this.available(ctx);
    if (pool.length === 0) return null;

    const now = ctx.time;
    const weights = pool.map((b) => {
      const last = this.lastFired.get(b.id) ?? 0;
      const sinceMs = last === 0 ? Infinity : now - last;
      // Newer beats (not-fired-recently) weight higher.
      return Math.min(10, 1 + sinceMs / 5000);
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  async fireById(id: string, ctx: BeatContext): Promise<boolean> {
    const b = this.beats.get(id);
    if (!b || !this.isEligible(b, ctx)) return false;
    this.lastFired.set(id, ctx.time);
    await b.fire(ctx);
    return true;
  }

  async fire(beat: Beat, ctx: BeatContext): Promise<void> {
    this.lastFired.set(beat.id, ctx.time);
    await beat.fire(ctx);
  }

  private isEligible(b: Beat, ctx: BeatContext): boolean {
    if (!b.tiers.includes(ctx.fearBucket)) return false;
    const last = this.lastFired.get(b.id) ?? 0;
    if (ctx.time - last < b.cooldownMs) return false;
    if (b.prereq && !b.prereq(ctx)) return false;
    return true;
  }
}
