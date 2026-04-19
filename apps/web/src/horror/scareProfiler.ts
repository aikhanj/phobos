/**
 * ScareProfiler — experimentation + amplification loop.
 *
 * Every scare technique the game fires (audio stinger, webcam glitch,
 * entity reveal, whisper, jumpscare, etc.) goes through this profiler.
 * We register the fire, wait 3s, sample the fear_score delta + HR
 * delta + mic onset flag, and use that to score how much the PLAYER
 * personally reacted to that category of stimulus.
 *
 * Two gameplay loops fall out of this:
 *
 * 1. EXPERIMENTATION — early-game (first ~2 clubs): the director cycles
 *    through every category evenly, regardless of past effectiveness.
 *    The profiler is filling in the blanks of what scares THIS player.
 *
 * 2. AMPLIFICATION — mid/late game: `pickWeighted` biases selection
 *    toward categories the player reacted to strongly, and the LLM
 *    director receives a compact `summary()` it can use to target.
 *
 * The profiler also tells the plot layer what the player's DOMINANT
 * scare vector is — that's piped into the reveal sequence + charter
 * arrival so the endgame reads differently for someone who flinched
 * at audio stingers vs. someone who gasped at entity reveals.
 */

export type ScareCategory =
  | 'audio_stinger'   // loud transient: stinger_high, stinger_low, impact
  | 'audio_ambient'   // creak_floor, reverse_creak, tone_wrong, heartbeat
  | 'visual_flicker'  // light flicker, blackout
  | 'entity_reveal'   // Phobos entity appearing at various distances
  | 'webcam_glitch'   // face_warp, stutter, distort, delay
  | 'spatial_audio'   // footsteps, whispers, breath from a direction
  | 'jumpscare'       // static_burst, mirror_flash, mirror_swap
  | 'personalized';   // whisper interpolating profile tokens

const ALL_CATEGORIES: ScareCategory[] = [
  'audio_stinger',
  'audio_ambient',
  'visual_flicker',
  'entity_reveal',
  'webcam_glitch',
  'spatial_audio',
  'jumpscare',
  'personalized',
];

interface PendingObservation {
  category: ScareCategory;
  firedAt: number;
  fearAtFire: number;
  bpmAtFire: number;
}

interface CategoryStats {
  fires: number;
  /** EMA-smoothed effectiveness 0-1. Higher = more reactive. */
  effectiveness: number;
  /** Sum of observed fear deltas (for debug). */
  cumulativeDelta: number;
  /** Count of mic onsets observed within window. */
  onsets: number;
  lastFiredAt: number;
}

/** How long after a fire to sample the reaction window. */
const WINDOW_MS = 3000;
/** Baseline effectiveness for unseen categories — starts at 0.2 so they
 *  get some weight during experimentation but don't dominate. */
const INITIAL_EFFECTIVENESS = 0.2;
/** Experimentation mode: until this many total fires, we ignore weights. */
const EXPERIMENTATION_THRESHOLD = 12;
/** Cooldown per category (ms) so we don't re-fire the same stimulus rapid-fire. */
const CATEGORY_COOLDOWN_MS = 6000;

export interface ScareProfileSummary {
  totalFires: number;
  isExperimenting: boolean;
  /** Categories sorted by effectiveness desc. */
  ranked: Array<{ category: ScareCategory; effectiveness: number; fires: number }>;
  /** The top category, or null if no fires yet. */
  dominant: ScareCategory | null;
  /** Top 2 dominant vector families — grouped. */
  dominantVector: DominantVector;
}

export type DominantVector =
  | 'auditory'   // any audio_* category dominates
  | 'visual'     // flicker or jumpscare
  | 'presence'   // entity_reveal or spatial_audio
  | 'personal'   // personalized whispers
  | 'mixed'      // no clear winner yet
  | 'none';      // no data

export class ScareProfiler {
  private stats: Map<ScareCategory, CategoryStats> = new Map();
  private pending: PendingObservation[] = [];
  private totalFires = 0;

  constructor() {
    for (const c of ALL_CATEGORIES) {
      this.stats.set(c, {
        fires: 0,
        effectiveness: INITIAL_EFFECTIVENESS,
        cumulativeDelta: 0,
        onsets: 0,
        lastFiredAt: 0,
      });
    }
  }

  /**
   * Register that a scare technique just fired. Pass the current fear/bpm
   * so we can measure delta after the reaction window.
   */
  register(category: ScareCategory, fearScore: number, bpm: number): void {
    const now = Date.now();
    this.pending.push({ category, firedAt: now, fearAtFire: fearScore, bpmAtFire: bpm });
    this.totalFires++;
    const s = this.stats.get(category);
    if (s) {
      s.fires++;
      s.lastFiredAt = now;
    }
  }

  /**
   * Must be called from the biosignal tick (every 500ms). Samples the
   * current fear+bpm+onset and closes out any pending observations whose
   * reaction windows have elapsed.
   */
  observe(fearScore: number, bpm: number, micOnset: boolean): void {
    const now = Date.now();
    const remaining: PendingObservation[] = [];
    for (const p of this.pending) {
      if (now - p.firedAt < WINDOW_MS) {
        // Window still open. Register mic onset credit immediately if it
        // happened inside the window — onsets are the clearest reaction.
        if (micOnset) {
          const s = this.stats.get(p.category);
          if (s) s.onsets++;
        }
        remaining.push(p);
        continue;
      }
      // Window expired — compute effectiveness contribution.
      const fearDelta = Math.max(0, fearScore - p.fearAtFire);
      const bpmDelta = Math.max(0, bpm - p.bpmAtFire);
      // Fear delta dominates; bpm gives a secondary signal; mic onsets in
      // window count as a strong bonus (captured directly on this.stats).
      const observed = Math.min(1, fearDelta * 2.2 + bpmDelta / 40);
      const s = this.stats.get(p.category);
      if (s) {
        // EMA toward the observed reaction. Faster update when fires are
        // still rare — so the profile converges during experimentation.
        const alpha = s.fires < 3 ? 0.6 : 0.3;
        s.effectiveness = s.effectiveness * (1 - alpha) + observed * alpha;
        s.cumulativeDelta += fearDelta;
      }
    }
    this.pending = remaining;
  }

  /**
   * Should the director pick randomly (experimentation) or weighted
   * by effectiveness (amplification)?
   */
  get isExperimenting(): boolean {
    return this.totalFires < EXPERIMENTATION_THRESHOLD;
  }

  /**
   * Pick a category from the candidate set, honoring cooldowns. In
   * experimentation mode: favor UNDER-fired categories to build coverage.
   * In amplification mode: weight by effectiveness^2.
   */
  pickWeighted(candidates: ScareCategory[]): ScareCategory | null {
    const now = Date.now();
    const eligible = candidates.filter((c) => {
      const s = this.stats.get(c);
      if (!s) return true;
      return now - s.lastFiredAt > CATEGORY_COOLDOWN_MS;
    });
    if (eligible.length === 0) return null;

    if (this.isExperimenting) {
      // Favor less-fired categories. weight = 1 / (1 + fires).
      const weights = eligible.map((c) => 1 / (1 + (this.stats.get(c)?.fires ?? 0)));
      return sampleWeighted(eligible, weights);
    }

    // Amplification: weight by effectiveness^2 with a floor so we still
    // occasionally probe other categories (don't over-fit).
    const weights = eligible.map((c) => {
      const eff = this.stats.get(c)?.effectiveness ?? INITIAL_EFFECTIVENESS;
      return 0.05 + eff * eff;
    });
    return sampleWeighted(eligible, weights);
  }

  /** Snapshot for director prompts + HUD display. */
  summary(): ScareProfileSummary {
    const ranked = Array.from(this.stats.entries())
      .map(([category, s]) => ({ category, effectiveness: s.effectiveness, fires: s.fires }))
      .sort((a, b) => b.effectiveness - a.effectiveness);

    const dominant = ranked[0]?.effectiveness > INITIAL_EFFECTIVENESS + 0.05
      ? ranked[0].category
      : null;

    return {
      totalFires: this.totalFires,
      isExperimenting: this.isExperimenting,
      ranked,
      dominant,
      dominantVector: this.computeDominantVector(ranked),
    };
  }

  /**
   * Roll up categories into one of four high-level vectors — this is what
   * the plot layer keys off. Returns 'mixed' if the top categories span
   * multiple families, 'none' if there's no real data.
   */
  private computeDominantVector(
    ranked: Array<{ category: ScareCategory; effectiveness: number }>,
  ): DominantVector {
    const top = ranked.filter((r) => r.effectiveness > INITIAL_EFFECTIVENESS + 0.05);
    if (top.length === 0) return 'none';

    const bucket: Record<DominantVector, number> = {
      auditory: 0, visual: 0, presence: 0, personal: 0, mixed: 0, none: 0,
    };
    for (const r of top) {
      bucket[vectorOf(r.category)] += r.effectiveness;
    }
    const entries = (Object.entries(bucket) as Array<[DominantVector, number]>)
      .filter(([k]) => k !== 'mixed' && k !== 'none')
      .sort((a, b) => b[1] - a[1]);
    const [first, second] = entries;
    if (!first || first[1] === 0) return 'none';
    // Clear winner if it's more than 1.5x the runner-up.
    if (!second || first[1] > second[1] * 1.5) return first[0];
    return 'mixed';
  }

  /**
   * Compact one-line summary for the LLM director prompt. Omits noise —
   * only the top-3 categories by effectiveness.
   */
  promptDigest(): string {
    const s = this.summary();
    if (s.totalFires === 0) return 'scare_profile: [no fires yet]';
    const top = s.ranked.slice(0, 3)
      .map((r) => `${r.category}=${r.effectiveness.toFixed(2)}/${r.fires}f`)
      .join(', ');
    const phase = s.isExperimenting ? 'EXPERIMENTING' : 'AMPLIFYING';
    const vec = s.dominantVector;
    return `scare_profile: phase=${phase} vector=${vec} top=[${top}]`;
  }

  reset(): void {
    this.pending = [];
    this.totalFires = 0;
    for (const c of ALL_CATEGORIES) {
      this.stats.set(c, {
        fires: 0,
        effectiveness: INITIAL_EFFECTIVENESS,
        cumulativeDelta: 0,
        onsets: 0,
        lastFiredAt: 0,
      });
    }
  }
}

function vectorOf(c: ScareCategory): DominantVector {
  switch (c) {
    case 'audio_stinger':
    case 'audio_ambient':
      return 'auditory';
    case 'visual_flicker':
    case 'jumpscare':
    case 'webcam_glitch':
      return 'visual';
    case 'entity_reveal':
    case 'spatial_audio':
      return 'presence';
    case 'personalized':
      return 'personal';
  }
}

function sampleWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
