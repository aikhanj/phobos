import * as THREE from 'three';
import type { BiosignalState, EntityVisibility, FearSpike } from '@phobos/types';
import { PhobosEntity } from './phobosEntity';
import { EphemeralFigure } from './ephemeralFigure';

export interface EntityManagerOptions {
  /** Container added to the main Three.js scene; the manager parents all entity groups here. */
  scene: THREE.Scene;
  camera: THREE.Camera;
  phobos: PhobosEntity;
  /** Log tap so the director's decisions show up in the corner box. */
  log?: (source: 'creature_director' | 'system', message: string) => void;
}

interface EntityManagerTuning {
  /** Minimum fear-score delta between biosignal ticks to register as a spike. */
  spikeDelta: number;
  /** Seconds since last spike before we start firing transient fillers. */
  flatPeriodSeconds: number;
  /** Seconds between successive transient filler spawns during a flat period. */
  fillerIntervalSeconds: number;
  /** Meters offset from player for peripheral spawns. */
  peripheralRadius: number;
}

const DEFAULT_TUNING: EntityManagerTuning = {
  spikeDelta: 0.15,
  flatPeriodSeconds: 18,
  fillerIntervalSeconds: 7,
  peripheralRadius: 6,
};

/**
 * Orchestrates the persistent Phobos + a pool of ephemeral figures.
 *
 *   per biosignal tick (~500ms):
 *     - Detect fear spike via delta threshold → phobos.reactToSpike()
 *     - If no spike for N seconds, occasionally spawn an ephemeral filler
 *
 *   per frame:
 *     - Update phobos (opacity lerp, billboard)
 *     - Update ephemerals, cull dead ones
 *
 * Scene-agnostic: positions are derived from the camera transform, so this
 * works in basement/bedroom/attic without any scene-specific anchor config.
 */
export class EntityManager {
  readonly phobos: PhobosEntity;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly log?: EntityManagerOptions['log'];
  private readonly tuning: EntityManagerTuning;

  private ephemerals: EphemeralFigure[] = [];
  private lastFearScore = 0;
  private lastSpikeAt = 0;
  private lastFillerAt = 0;
  private now = 0;

  constructor(opts: EntityManagerOptions, tuning: Partial<EntityManagerTuning> = {}) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.phobos = opts.phobos;
    this.log = opts.log;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };

    this.scene.add(this.phobos.group);
  }

  /** Advance the world clock (seconds since start). Drives flat-period timing. */
  tickTime(dt: number): void {
    this.now += dt;
  }

  /**
   * Called from the biosignal tick in main.ts. Handles spike detection +
   * flat-period filler dispatch. Safe to call with stub biosignals (fearScore=0).
   */
  onBiosignal(state: BiosignalState): void {
    const delta = state.fearScore - this.lastFearScore;
    this.lastFearScore = state.fearScore;

    if (delta >= this.tuning.spikeDelta) {
      const spike: FearSpike = {
        score: state.fearScore,
        delta,
        bpm: state.bpm,
        timestamp: state.timestamp,
      };
      this.triggerSpike(spike);
      return;
    }

    // No spike. Check if we're in a flat period long enough to warrant filler.
    const silence = this.now - this.lastSpikeAt;
    const sinceFiller = this.now - this.lastFillerAt;
    if (
      silence >= this.tuning.flatPeriodSeconds &&
      sinceFiller >= this.tuning.fillerIntervalSeconds
    ) {
      this.spawnFillerTransient();
      this.lastFillerAt = this.now;
    }
  }

  /**
   * Fire a fear spike manually. Used by the B-key simulator until biosignals
   * are wired, and will also be invoked by director agents in Phase 4.
   */
  triggerSpike(spike: FearSpike): void {
    this.lastSpikeAt = this.now;
    this.lastFillerAt = this.now; // reset filler timer so we don't double up
    this.log?.('creature_director', `spike ${spike.score.toFixed(2)} Δ${spike.delta.toFixed(2)}`);

    // Reveal Phobos close-ish to the player before the SFX plays.
    const pos = this.peripheralSpawnPosition(spike.score >= 0.7 ? 3.2 : 4.8);
    this.phobos.setPosition(pos);
    this.phobos.setVisibility(visibilityForScore(spike.score));

    void this.phobos.reactToSpike(spike).then(() => {
      // Fade back after the beat so she doesn't linger visible.
      setTimeout(() => {
        if (this.phobos.getVisibility() !== 'hidden') {
          this.phobos.setVisibility('peripheral');
        }
      }, 900);
      setTimeout(() => {
        if (this.phobos.getVisibility() === 'peripheral') {
          this.phobos.setVisibility('hidden');
        }
      }, 2400);
    });
  }

  /** Ephemeral filler — a silhouette at the edge of view that fades out. */
  private spawnFillerTransient(): void {
    const pos = this.peripheralSpawnPosition(this.tuning.peripheralRadius);
    const fig = new EphemeralFigure({ position: pos, opacity: 0.38, ttl: 1.6 });
    this.scene.add(fig.group);
    this.ephemerals.push(fig);
    this.log?.('creature_director', 'filler.');
  }

  /** Per-frame update. Called from engine.onUpdate via main.ts. */
  update(dt: number): void {
    this.tickTime(dt);
    this.phobos.update(dt, this.camera);
    for (let i = this.ephemerals.length - 1; i >= 0; i--) {
      const f = this.ephemerals[i];
      f.update(dt, this.camera);
      if (!f.isAlive()) {
        f.dispose();
        this.ephemerals.splice(i, 1);
      }
    }
  }

  /**
   * Compute a spawn position at `radius` from the camera, offset to the side
   * so it reads as peripheral vision rather than directly ahead. Always on
   * the ground plane (y=0) — scene floors are at 0 throughout the demo.
   */
  private peripheralSpawnPosition(radius: number): { x: number; y: number; z: number } {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();

    // Right = forward × up, on XZ plane.
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    // Random angle biased toward the player's sides (±55° off forward).
    const angle = (Math.random() - 0.5) * (Math.PI * 0.6); // [-54°, +54°]
    const dir = new THREE.Vector3()
      .addScaledVector(forward, Math.cos(angle))
      .addScaledVector(right, Math.sin(angle))
      .normalize();

    return {
      x: this.camera.position.x + dir.x * radius,
      y: 0,
      z: this.camera.position.z + dir.z * radius,
    };
  }

  dispose(): void {
    this.phobos.dispose();
    for (const f of this.ephemerals) f.dispose();
    this.ephemerals = [];
  }
}

function visibilityForScore(s: number): EntityVisibility {
  if (s >= 0.85) return 'close';
  if (s >= 0.6) return 'revealed';
  return 'peripheral';
}
