import * as THREE from 'three';
import type { VoiceEngine, CreatureVoice, FearBucket } from '@phobos/voice';
import type { EntityVisibility, FearSpike } from '@phobos/types';
import { billboardToCamera, createFigureMesh, disposeFigure, setFigureOpacity } from './figureMesh';
import { pickPrompt, type PromptSpec } from './promptLibrary';

const OPACITY_BY_VISIBILITY: Record<EntityVisibility, number> = {
  hidden: 0,
  peripheral: 0.45,
  revealed: 0.8,
  close: 0.95,
};

const LERP_SPEED = 4.5; // per-second opacity lerp (faster = more startling)

/**
 * Persistent embodied presence. One instance per game session, follows the
 * player across scene transitions. Combines a billboard mesh, a positional
 * AABB-less presence (collisions are intentionally off — she can stand inside
 * geometry, the fog hides it), and a `CreatureVoice` for audio theater.
 *
 * The director manipulates her via:
 *   setVisibility()        // slot her into the world
 *   setPosition()          // where she stands
 *   reactToSpike(spike)    // dynamic ElevenLabs SFX on a biosignal spike
 *   speakAs(bucket)        // authored whisper from the line bank
 *
 * Every spike produces a brand-new SFX via `generateSFX({ bypassCache: true })`
 * — no two scares sound identical over a session.
 */
export class PhobosEntity {
  readonly group: THREE.Group;

  private visibility: EntityVisibility = 'hidden';
  private targetOpacity = 0;
  private currentOpacity = 0;
  private fearBucket: FearBucket = 'low';
  private lastTemplateIndex: number | undefined;
  private reactInFlight = false;

  constructor(
    private readonly voice: VoiceEngine | null,
    private readonly creatureVoice: CreatureVoice | null,
  ) {
    this.group = createFigureMesh();
  }

  getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  setPosition(v: THREE.Vector3 | { x: number; y: number; z: number }): void {
    this.group.position.set(v.x, v.y, v.z);
    this.creatureVoice?.setPosition({ x: v.x, y: v.y + 1.4, z: v.z });
  }

  getVisibility(): EntityVisibility {
    return this.visibility;
  }

  setVisibility(v: EntityVisibility): void {
    if (this.visibility === v) return;
    this.visibility = v;
    this.targetOpacity = OPACITY_BY_VISIBILITY[v];
    // Show the group immediately when transitioning away from hidden so the
    // opacity lerp has something to act on.
    if (v !== 'hidden') this.group.visible = true;
  }

  setFearBucket(b: FearBucket): void {
    this.fearBucket = b;
    this.creatureVoice?.setFearBucket(b);
  }

  /**
   * React to a biosignal fear spike with a dynamically-generated SFX. Bucket
   * is derived from the spike's absolute score. Bypasses the engine cache so
   * every spike produces fresh audio.
   *
   * No-ops if a reaction is already in flight — we don't want to stack
   * gasps on top of each other. The director can still schedule a whisper
   * via speakAs() concurrently.
   */
  async reactToSpike(spike: FearSpike): Promise<void> {
    return this.reactToSpikeWithPrompt(spike);
  }

  /**
   * Same as reactToSpike but accepts an optional override PromptSpec. Scene
   * stalkers use this to inject LLM-authored, scene-specific SFX prompts
   * while preserving the template-bank fallback on the default path.
   */
  async reactToSpikeWithPrompt(spike: FearSpike, override?: PromptSpec): Promise<void> {
    if (this.reactInFlight) return;
    this.reactInFlight = true;
    try {
      const bucket = bucketForScore(spike.score);
      this.setFearBucket(bucket);

      // Voice-less mode: visuals still fire via setVisibility/setPosition
      // upstream — only the dynamic TTS SFX is skipped here.
      if (!this.voice) return;

      let spec: PromptSpec;
      if (override) {
        spec = override;
      } else {
        const picked = pickPrompt(bucket, this.lastTemplateIndex);
        this.lastTemplateIndex = picked.templateIndex;
        spec = picked.spec;
      }

      const p = this.group.position;
      const buffer = await this.voice.generateSFX({
        text: spec.text,
        durationSeconds: spec.durationSeconds,
        promptInfluence: spec.promptInfluence,
        bypassCache: true,
      });
      this.voice.playBuffer(buffer, {
        position: { x: p.x, y: p.y + 1.4, z: p.z },
        gain: 0.85,
      });
    } catch (e) {
      console.warn('[phobos] reactToSpike failed:', (e as Error).message);
    } finally {
      this.reactInFlight = false;
    }
  }

  /** Authored line from the current fear bucket, spatialized at the entity. */
  async speakAs(bucket: FearBucket, textOverride?: string): Promise<void> {
    if (!this.creatureVoice) return;
    const prev = this.fearBucket;
    this.setFearBucket(bucket);
    try {
      await this.creatureVoice.whisper(textOverride);
    } finally {
      this.setFearBucket(prev);
    }
  }

  /** Per-frame: lerp opacity toward target, billboard to camera. */
  update(dt: number, camera: THREE.Camera): void {
    if (this.currentOpacity !== this.targetOpacity) {
      const delta = this.targetOpacity - this.currentOpacity;
      const step = LERP_SPEED * dt;
      if (Math.abs(delta) <= step) this.currentOpacity = this.targetOpacity;
      else this.currentOpacity += Math.sign(delta) * step;
      setFigureOpacity(this.group, this.currentOpacity);

      if (this.currentOpacity <= 0.01 && this.visibility === 'hidden') {
        this.group.visible = false;
      }
    }
    if (this.group.visible) billboardToCamera(this.group, camera);
  }

  dispose(): void {
    disposeFigure(this.group);
    this.group.removeFromParent();
  }
}

function bucketForScore(s: number): FearBucket {
  if (s >= 0.85) return 'peak';
  if (s >= 0.65) return 'high';
  if (s >= 0.4) return 'medium';
  return 'low';
}
