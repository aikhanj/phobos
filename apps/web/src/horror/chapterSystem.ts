import { CHAPTERS, type ChapterDef } from './chapters';
import type { ChapterCard } from '../ui/chapterCard';
import type { DeanStalker } from './deanStalker';
import type { ScareOverlay } from '../ui/scareOverlay';
import type { VoiceEngine } from '@phobos/voice';
import type { EventBus } from '../game/eventBus';
import type { Player } from '../game/player';

/**
 * Orchestrates the scripted plot. Each advance(slug) call:
 *   1. Locks player input
 *   2. Shows the fullscreen chapter card
 *   3. Fires the chapter's voice line through TTS (if configured)
 *   4. Injects the chapter's agent log lines, staggered
 *   5. Fires a SCREAM + face jumpscare if the chapter demands it
 *   6. Pushes the Dean's target distance closer
 *   7. Unlocks player input
 *
 * Each chapter runs exactly once (tracked in the `fired` set). The
 * prologue fires on first campus load; each club chapter fires on
 * first entry to its club; the finale fires on Charter pickup.
 */
export interface ChapterSystemDeps {
  card: ChapterCard;
  dean: DeanStalker;
  scareOverlay: ScareOverlay;
  voice: VoiceEngine | null;
  voiceId: string | undefined;
  bus: EventBus;
  player: Player;
  log: (source: 'phobos' | 'system' | 'creature_director', text: string) => void;
}

export class ChapterSystem {
  private deps: ChapterSystemDeps;
  private fired = new Set<string>();
  private current: string | null = null;

  constructor(deps: ChapterSystemDeps) {
    this.deps = deps;
  }

  /** Has this chapter already played? */
  hasFired(slug: string): boolean {
    return this.fired.has(slug);
  }

  /** Slug of the most recently fired chapter, or null. */
  get currentSlug(): string | null {
    return this.current;
  }

  /**
   * Fire a chapter. No-op if it already fired. Awaits the full
   * cinematic so callers can sequence it before unlocking gameplay.
   */
  async advance(slug: string): Promise<void> {
    if (this.fired.has(slug)) return;
    const chapter = CHAPTERS[slug];
    if (!chapter) return;
    this.fired.add(slug);
    this.current = slug;
    await this.runCinematic(chapter);
  }

  private async runCinematic(ch: ChapterDef): Promise<void> {
    const { card, dean, scareOverlay, voice, voiceId, bus, player, log } = this.deps;

    player.setInputEnabled(false);

    // Push the Dean closer IMMEDIATELY so when the card comes down the
    // player sees the new proximity on the street. Also start the
    // stalker if it isn't already active — chapters with a non-999
    // distance mean the Dean is now on the street regardless of whether
    // the player has been to a club yet.
    dean.setTargetDistance(ch.deanDistance);
    if (ch.deanDistance < 900) dean.start();

    // Kick the voice line in parallel with the card — the two resolve
    // together. This gives the narrative a feeling of weight.
    const voicePromise: Promise<void> = voice && voiceId
      ? voice.speak({ text: ch.voiceLine, voiceId, gain: 0.88 }).done.catch(() => {})
      : Promise.resolve();

    // Stagger the log lines so they feel like incoming telemetry
    // during the card hold.
    const logStagger = Math.floor(2800 / Math.max(1, ch.logs.length));
    ch.logs.forEach((entry, i) => {
      setTimeout(() => log(entry.source, entry.text), 600 + i * logStagger);
    });

    // Card: fades in, holds ~3.6s, fades out.
    await card.show({
      roman: ch.roman,
      title: ch.title,
      subtitle: ch.subtitle,
      holdMs: 3600,
    });

    // Post-card scream jumpscare — signature moment for the "being hunted" chapters.
    if (ch.scream) {
      bus.fire({ kind: 'sound', asset: 'scream', volume: 1.0 });
      bus.fire({ kind: 'sound', asset: 'stinger_high', volume: 0.85 });
      bus.fire({ kind: 'flicker', duration: 0.5, pattern: 'hard' });
      bus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 1.0, intensity: 1.0 });
      scareOverlay.screamFace(1200);
      // Let the scream resolve before handing control back.
      await sleep(1400);
    }

    // Wait for any trailing voice line to finish so the next gameplay
    // beat doesn't collide with the narration.
    await Promise.race([voicePromise, sleep(2500)]);

    player.setInputEnabled(true);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
