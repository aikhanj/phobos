import * as THREE from 'three';
import type { FearSpike } from '@phobos/types';
import type { FearBucket } from '@phobos/voice';
import type { EntityManager } from './entityManager';
import type { ColonialInterior } from '../scenes/clubs/colonial';
import { authorScenePrompt } from '../../agents/sfxPromptAuthor';

/**
 * Scene-scoped stalker for the Colonial Club. Does NOT replace the generic
 * EntityManager behaviors — it composes with them:
 *
 *   - STALK + FREEZE + STARE-PUNISHMENT are still driven by EntityManager.
 *   - This class seeds the figure at Colonial-specific anchors (pilasters,
 *     fireplace, end of dining table, bookshelf corners) so the first sight
 *     of her feels placed rather than random.
 *   - When she vanishes (stare-punish or explicit hide), EntityManager fires
 *     onVanish → we reanchor her somewhere behind or peripheral to the
 *     player so the "she's always somewhere else now" loop continues.
 *   - Collecting the laptop triggers a close-range reveal + LLM-authored
 *     SFX spike — the narrative beat where the room turns against you.
 *
 * All visible actions emit a short Phobos-voice log line BEFORE the action,
 * so the corner box reads as causation (L3 of the gameplay loop pitch).
 */

type Anchor = {
  name: string;
  pos: [number, number];
  /** Short Phobos-voice rationale shown in corner box when she appears here. */
  rationale: string;
};

// Room is 22w × 16d; hw=11, hd=8. North wall at z=-8 (fireplace), south at z=+8 (exit).
// Anchors sit on the floor, clear of the dining table (AABB x±5, z±0.7).
const ANCHORS: Anchor[] = [
  { name: 'fireplace_right',    pos: [ 1.8, -7.3], rationale: 'by the mantel. he liked it warm.' },
  { name: 'fireplace_left',     pos: [-1.8, -7.3], rationale: 'at the hearth. still waiting.' },
  { name: 'table_head_north',   pos: [ 0.0, -2.2], rationale: 'at the head of the table.' },
  { name: 'table_end_south',    pos: [ 0.0,  2.2], rationale: 'at the far seat.' },
  { name: 'pilaster_w_north',   pos: [-9.8, -5.5], rationale: 'behind the column.' },
  { name: 'pilaster_w_mid',     pos: [-9.8,  0.5], rationale: 'the west wall. watching.' },
  { name: 'pilaster_e_mid',     pos: [ 9.8,  0.5], rationale: 'the east wall. watching.' },
  { name: 'pilaster_e_south',   pos: [ 9.8,  3.5], rationale: 'between the windows.' },
  { name: 'armchair_east',      pos: [ 3.5, -5.5], rationale: 'in the armchair. like he used to.' },
  { name: 'bookshelf_sw',       pos: [-9.8,  6.8], rationale: 'the corner. behind the books.' },
  { name: 'bookshelf_se',       pos: [ 9.8,  6.8], rationale: 'in the far corner.' },
];

export interface ColonialStalkerOptions {
  em: EntityManager;
  scene: ColonialInterior;
  camera: THREE.Camera;
  apiKey: string;
  log: (source: 'phobos' | 'creature_director' | 'system', msg: string) => void;
}

export class ColonialStalker {
  private readonly em: EntityManager;
  private readonly scene: ColonialInterior;
  private readonly camera: THREE.Camera;
  private readonly apiKey: string;
  private readonly log: ColonialStalkerOptions['log'];

  private active = false;
  private lastAnchorName = '';
  private pickupSeen = false;
  private anchorTimer = 0;
  /** Hard ceiling on reanchor cadence — prevents her from teleport-spamming. */
  private minReanchorInterval = 6;

  constructor(opts: ColonialStalkerOptions) {
    this.em = opts.em;
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.apiKey = opts.apiKey;
    this.log = opts.log;
  }

  /**
   * Seat her behind the east pilaster, peripheral. Player spawns at the
   * south end facing north — the first glance down the room plants her
   * before they know what they're looking at.
   */
  start(): void {
    this.active = true;
    this.em.avoidanceBoxes = this.scene.getStalkerAvoidance();
    this.em.persistent = true;
    this.em.onVanish = () => this.onVanish();
    this.em.spikeHandler = (spike) => this.onSpike(spike);

    const seed = ANCHORS.find((a) => a.name === 'pilaster_e_mid') ?? ANCHORS[0];
    this.log('phobos', seed.rationale);
    this.placeAt(seed);
    this.em.phobos.setVisibility('peripheral');
  }

  /**
   * Teardown on Colonial exit. Hide her, clear scene-specific state on the
   * EntityManager so the generic stalker resumes wherever she goes next.
   */
  stop(): void {
    this.active = false;
    this.em.onVanish = undefined;
    this.em.spikeHandler = undefined;
    this.em.avoidanceBoxes = [];
    this.em.phobos.setVisibility('hidden');
    // persistent + stalkingEnabled remain on — EntityManager reuses her elsewhere.
  }

  /** Called from engine.onUpdate while Colonial is loaded. */
  update(dt: number): void {
    if (!this.active) return;
    this.anchorTimer += dt;

    // Pickup escalation: player just grabbed the laptop. She closes in.
    if (!this.pickupSeen && this.scene.isPickupCollected()) {
      this.pickupSeen = true;
      this.onPickup();
    }
  }

  /** Fear spike handler — LLM-authored prompt in context, template fallback. */
  async onSpike(spike: FearSpike): Promise<void> {
    if (!this.active) return;
    const bucket = bucketForScore(spike.score);
    const spec = await authorScenePrompt(this.apiKey, {
      scene: 'colonial club dining room, abandoned Princeton eating club, dust, dead fireplace, long table',
      bucket,
      context: this.pickupSeen
        ? 'the player just took the laptop from the side table by the fireplace'
        : 'the player is exploring the dining room, has not found the pickup yet',
    });
    this.log('phobos', spec ? 'she wrote this one herself.' : 'an old voice again.');
    await this.em.phobos.reactToSpikeWithPrompt(spike, spec ?? undefined);
  }

  /** Stare-punish vanish completed. Drop her somewhere peripheral and resume. */
  private onVanish(): void {
    if (!this.active) return;
    this.anchorTimer = 0;
    const anchor = this.pickPeripheralAnchor();
    if (!anchor) return;
    this.log('phobos', anchor.rationale);
    this.placeAt(anchor);
    this.em.phobos.setVisibility('peripheral');
  }

  /** Big beat: laptop grabbed. Teleport close + ahead, reveal, scare, vanish. */
  private onPickup(): void {
    const cam = this.camera.position;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();

    // Place her 2.5m ahead of the camera, clamped inside the room.
    const hw = 10.5, hd = 7.5;
    const tx = Math.max(-hw, Math.min(hw, cam.x + fwd.x * 2.5));
    const tz = Math.max(-hd, Math.min(hd, cam.z + fwd.z * 2.5));

    this.log('phobos', 'you took it. i saw you take it.');
    this.em.phobos.setPosition({ x: tx, y: 0, z: tz });
    this.em.phobos.setVisibility('close');

    const spike: FearSpike = {
      score: 0.9,
      delta: 0.4,
      bpm: 0,
      timestamp: Date.now(),
    };
    void this.onSpike(spike);

    // Hold close through the note overlay read (~2-3s), then vanish.
    // EntityManager.onVanish will reanchor us somewhere peripheral.
    setTimeout(() => {
      if (!this.active) return;
      this.em.phobos.setVisibility('hidden');
      // Manually trigger reanchor since hiding this way doesn't go through stare-punish.
      setTimeout(() => this.onVanish(), 900);
    }, 3500);
  }

  // ── internals ──

  private placeAt(anchor: Anchor): void {
    this.lastAnchorName = anchor.name;
    this.em.phobos.setPosition({ x: anchor.pos[0], y: 0, z: anchor.pos[1] });
  }

  /**
   * Pick an anchor that's outside the player's forward 60° cone and at least
   * 3m away, skipping the last anchor we used. Falls back to any anchor if
   * the filter returns nothing (small rooms or corner spawn positions).
   */
  private pickPeripheralAnchor(): Anchor | null {
    const cam = this.camera.position;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();

    const candidates: Anchor[] = [];
    for (const a of ANCHORS) {
      if (a.name === this.lastAnchorName) continue;
      const dx = a.pos[0] - cam.x;
      const dz = a.pos[1] - cam.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3 || dist > 16) continue;
      const dot = (fwd.x * dx + fwd.z * dz) / dist;
      if (dot > Math.cos(Math.PI / 3)) continue; // skip anchors in the front 60° cone
      candidates.push(a);
    }
    const pool = candidates.length > 0
      ? candidates
      : ANCHORS.filter((a) => a.name !== this.lastAnchorName);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Expose for dev keys/debug — use sparingly. */
  get anchorIntervalReady(): boolean {
    return this.anchorTimer >= this.minReanchorInterval;
  }
}

function bucketForScore(s: number): FearBucket {
  if (s >= 0.85) return 'peak';
  if (s >= 0.65) return 'high';
  if (s >= 0.4) return 'medium';
  return 'low';
}
