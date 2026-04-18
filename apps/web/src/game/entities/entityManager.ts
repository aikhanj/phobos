import * as THREE from 'three';
import type { AABB, BiosignalState, EntityVisibility, FearSpike } from '@phobos/types';
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

  // ── stalking + gaze state ──
  private gazeOnPhobosAccum = 0;
  private gazeReactedThisCycle = false;
  /** When true, Phobos stays at peripheral between scenes instead of hiding. */
  persistent = false;
  /** If false, STALK drift is paused. Scene-scoped stalkers (e.g. Colonial) can take over. */
  stalkingEnabled = true;
  /** XZ-projected AABBs the stalker routes around during STALK drift. */
  avoidanceBoxes: AABB[] = [];
  /** Fired after a stare-punish vanish completes. Scene stalkers use this to reanchor. */
  onVanish?: () => void;
  /**
   * If set, `triggerSpike` delegates the audio-generating react call to this
   * handler instead of `phobos.reactToSpike`. Positioning + visibility +
   * fade-out still happen here. Scene stalkers use this to inject
   * LLM-authored SFX prompts while reusing the rest of the spike machinery.
   */
  spikeHandler?: (spike: FearSpike) => Promise<void>;

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

    const react = this.spikeHandler
      ? this.spikeHandler(spike)
      : this.phobos.reactToSpike(spike);
    void react.then(() => {
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
    this.updateGazeReaction(dt);
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
   * Stalking + gaze reaction. Three behaviors:
   *
   * 1. STALK: When visible and player NOT looking → drift toward player at
   *    ~0.8 m/s. Stops within 1.5m. Continuous, every frame.
   *
   * 2. FREEZE: When player IS looking → stop instantly. Classic horror.
   *
   * 3. STARE PUNISHMENT: Stare >2s → Phobos reacts with SFX then vanishes.
   */
  private updateGazeReaction(dt: number): void {
    const vis = this.phobos.getVisibility();
    if (vis === 'hidden') {
      this.gazeOnPhobosAccum = 0;
      this.gazeReactedThisCycle = false;
      return;
    }

    const phobosPos = this.phobos.group.position;
    const camPos = this.camera.position;
    const dx = phobosPos.x - camPos.x;
    const dz = phobosPos.z - camPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.5) return;

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const dot = (forward.x * dx + forward.z * dz) / dist;
    const isLooking = dot > Math.cos(30 * Math.PI / 180); // 30° cone

    if (isLooking) {
      // FREEZE — player is looking. Don't move. Accumulate stare time.
      this.gazeOnPhobosAccum += dt;

      if (this.gazeOnPhobosAccum > 2 && !this.gazeReactedThisCycle) {
        // STARE PUNISHMENT
        this.gazeReactedThisCycle = true;
        this.log?.('creature_director', 'it sees you looking.');
        void this.phobos.reactToSpike({ score: 0.5, delta: 0.2, bpm: 80, timestamp: Date.now() });
        setTimeout(() => {
          this.phobos.setVisibility('hidden');
          // Give the opacity lerp a beat to finish, then let the scene stalker reanchor.
          setTimeout(() => this.onVanish?.(), 900);
        }, 800);
      }
    } else {
      // STALK — player not looking. Drift toward them.
      this.gazeOnPhobosAccum = 0;

      if (this.stalkingEnabled && dist > 1.5) {
        const speed = 0.8; // m/s — slow, deliberate
        const step = speed * dt;
        const nx = -dx / dist; // normalized direction toward player
        const nz = -dz / dist;
        const nextX = phobosPos.x + nx * step;
        const nextZ = phobosPos.z + nz * step;
        // Route around obstacle AABBs (e.g. the Colonial dining table).
        // If forward step enters a box, try a perpendicular slide; else hold.
        if (!this.blocksAt(nextX, nextZ)) {
          this.phobos.setPosition({ x: nextX, y: 0, z: nextZ });
        } else {
          const perpX = phobosPos.x + -nz * step;
          const perpZ = phobosPos.z + nx * step;
          if (!this.blocksAt(perpX, perpZ)) {
            this.phobos.setPosition({ x: perpX, y: 0, z: perpZ });
          }
        }
      }

      // Upgrade visibility as it gets closer
      if (dist < 3 && vis === 'peripheral') {
        this.phobos.setVisibility('revealed');
      } else if (dist < 2 && vis === 'revealed') {
        this.phobos.setVisibility('close');
      }
    }
  }

  /** Reset gaze state (call on scene change). */
  resetGazeState(): void {
    this.gazeOnPhobosAccum = 0;
    this.gazeReactedThisCycle = false;
    // If persistent mode, keep Phobos at peripheral
    if (this.persistent) {
      const pos = this.peripheralSpawnPosition(7);
      this.phobos.setPosition(pos);
      this.phobos.setVisibility('peripheral');
    }
  }

  /**
   * Spawn multiple dark figures in a loose semicircle around the player.
   * Uses EphemeralFigure — they fade in, linger, fade out. No AI, just presence.
   */
  spawnDoppelgangers(count: number): void {
    this.log?.('creature_director', `${count} of them now.`);
    for (let i = 0; i < count; i++) {
      const radius = 3.5 + Math.random() * 3;
      const pos = this.peripheralSpawnPosition(radius);
      const opacity = 0.3 + Math.random() * 0.35;
      const ttl = 3 + Math.random() * 4;
      const fig = new EphemeralFigure({ position: pos, opacity, ttl, fadeIn: 0.6, fadeOut: 1.2 });
      this.scene.add(fig.group);
      this.ephemerals.push(fig);
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

  /** XZ point-in-AABB test against scene obstacle boxes. */
  private blocksAt(x: number, z: number): boolean {
    const pad = 0.35; // figure half-width plus slop
    for (const b of this.avoidanceBoxes) {
      if (x >= b.min[0] - pad && x <= b.max[0] + pad &&
          z >= b.min[2] - pad && z <= b.max[2] + pad) {
        return true;
      }
    }
    return false;
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
