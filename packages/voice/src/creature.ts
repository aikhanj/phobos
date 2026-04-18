import type { VoiceEngine } from './voiceEngine';
import type { LineBank, FearBucket } from './lineBank';
import type { AmbientBus } from './ambientBus';
import type { Vec3 } from './types';

export interface CreatureVoiceOptions {
  footstepSFXPrompt?: string;
  breathSFXPrompt?: string;
}

const DEFAULT_FOOTSTEP_PROMPT =
  'single soft shuffling footstep on creaking wooden floorboards, dry, close mic, no music, very short';
const DEFAULT_BREATH_PROMPT =
  'slow wheezy breathing of an elderly woman, dry, raspy, close mic, 6 seconds, no music, no speech';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function offset(p: Vec3, dx: number, dz: number, dy = 0): Vec3 {
  return { x: p.x + dx, y: p.y + dy, z: p.z + dz };
}

/**
 * An embodied creature voice. Composes the engine's primitives (speak,
 * playSFX, playBuffer) into audio theater: multi-line whispers with
 * repositioning, spatialized footstep paths, breathing loops, and a
 * fully-scripted `haunt()` encounter.
 *
 * The creature has a position in world space. Update it via setPosition()
 * before each beat — the scare director will do this once it's driving.
 */
export class CreatureVoice {
  private position: Vec3 = { x: 0, y: 0, z: 0 };
  private fearBucket: FearBucket = 'medium';
  private lastLine: string | undefined;
  private footstepBuffer: AudioBuffer | null = null;
  private breathBuffer: AudioBuffer | null = null;

  constructor(
    private readonly engine: VoiceEngine,
    private readonly bank: LineBank,
    private readonly bus: AmbientBus,
    private readonly opts: CreatureVoiceOptions = {},
  ) {}

  setPosition(p: Vec3): void { this.position = { ...p }; }
  getPosition(): Vec3 { return { ...this.position }; }
  setFearBucket(b: FearBucket): void { this.fearBucket = b; }

  /** Ensure footstep + breath buffers are generated. Safe to call repeatedly. */
  async preloadSFX(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    if (!this.footstepBuffer) {
      tasks.push(
        this.engine
          .generateSFX({ text: this.opts.footstepSFXPrompt ?? DEFAULT_FOOTSTEP_PROMPT, durationSeconds: 1, promptInfluence: 0.8 })
          .then((b) => { this.footstepBuffer = b; }),
      );
    }
    if (!this.breathBuffer) {
      tasks.push(
        this.engine
          .generateSFX({ text: this.opts.breathSFXPrompt ?? DEFAULT_BREATH_PROMPT, durationSeconds: 6, promptInfluence: 0.7 })
          .then((b) => { this.breathBuffer = b; }),
      );
    }
    await Promise.all(tasks);
  }

  async whisper(textOverride?: string, duckSeconds = 3): Promise<void> {
    const text = textOverride ?? this.bank.pick(this.fearBucket, this.lastLine);
    this.lastLine = text;
    this.bus.duck(duckSeconds);
    const h = this.engine.speak({ text, position: this.position });
    await h.done;
  }

  /**
   * N whispers, each from a random position on a ring of `radius` around
   * the creature's current position. Small pauses between so the player
   * notices the reposition. Feels like something is circling them.
   */
  async whisperSequence(count = 3, radius = 1.5, gapMs = 600): Promise<void> {
    const anchor = { ...this.position };
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.position = {
        x: anchor.x + Math.cos(angle) * radius,
        y: anchor.y,
        z: anchor.z + Math.sin(angle) * radius,
      };
      await this.whisper(undefined, 2.5);
      if (i < count - 1) await sleep(gapMs + Math.random() * 500);
    }
    this.position = anchor;
  }

  /** Spatialized one-shot footstep at a specific position. */
  playFootstep(position: Vec3, gain = 0.6): void {
    if (!this.footstepBuffer) return;
    this.engine.playBuffer(this.footstepBuffer, { position, gain });
  }

  /**
   * Schedule `steps` footsteps along the line from current position to target.
   * Each step advances the creature's position so subsequent beats happen at
   * the new location. Returns when the last step's audio would have played.
   */
  async footstepsToward(target: Vec3, steps = 4, stepMs = 450): Promise<void> {
    if (!this.footstepBuffer) return;
    const from = { ...this.position };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pos = {
        x: from.x + (target.x - from.x) * t,
        y: from.y + (target.y - from.y) * t,
        z: from.z + (target.z - from.z) * t,
      };
      this.playFootstep(pos);
      await sleep(stepMs);
    }
    this.position = target;
  }

  /** Loop breathing buffer at current position for `seconds`, then fade out. */
  async breathe(seconds = 4, gain = 0.4): Promise<void> {
    if (!this.breathBuffer) return;
    const h = this.engine.playBuffer(this.breathBuffer, {
      position: this.position,
      gain,
      loop: true,
    });
    await sleep(seconds * 1000);
    h.stop();
  }

  /**
   * Scripted ~10-12s encounter around a listener position. Demonstrates
   * the layered orchestration: whisper behind → circling footsteps →
   * whisper from the side → footsteps crossing → peak whisper close.
   *
   * Heading is the listener's forward direction (unit Vec3 on XZ plane).
   * All positions are computed relative to listener + heading, so the
   * encounter is oriented around where the player is facing.
   */
  async haunt(listener: Vec3, heading: Vec3): Promise<void> {
    // Basis: forward (heading), right (heading rotated -90° on XZ)
    const fx = heading.x, fz = heading.z;
    const rx = fz, rz = -fx;

    const behind = offset(listener, -fx * 2.2, -fz * 2.2);
    const left = offset(listener, -rx * 3, -rz * 3);
    const right = offset(listener, rx * 2.5, rz * 2.5);
    const close = offset(listener, fx * 0.8, fz * 0.8);

    const prevBucket = this.fearBucket;

    this.setPosition(behind);
    this.setFearBucket('medium');
    await this.whisper(undefined, 4);
    await sleep(600);

    await this.footstepsToward(left, 4, 400);
    await sleep(250);

    this.setFearBucket('high');
    await this.whisper(undefined, 3);
    await sleep(400);

    await this.footstepsToward(right, 5, 380);
    await sleep(300);

    // breath overlap — starts under the peak whisper
    const breathPromise = this.breathBuffer ? this.breathe(3.5, 0.5) : Promise.resolve();
    this.setPosition(close);
    this.setFearBucket('peak');
    await this.whisper(undefined, 3.5);
    await breathPromise;

    this.setFearBucket(prevBucket);
  }
}
