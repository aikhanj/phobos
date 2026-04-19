import * as THREE from 'three';
import type { PhobosEntity } from '../game/entities';

/**
 * DEAN EISGRUBER — the stalking antagonist of Prospect Ave.
 *
 * Not a creature — a figure. The president in a dean's robe, pulled out
 * of the Nassau Hall sub-basement by the system that runs bicker. Shows
 * up on the street after the player visits Tower and never leaves. Every
 * chapter pulls him closer. Every 12-18s he vocalizes — a low growl,
 * a distant scream, a whispered line with the player's name. When he
 * closes to less than 6 units, he triggers a SCREAM + face jumpscare
 * automatically.
 *
 * Mechanically he rides on top of the existing PhobosEntity used for
 * club peripheral reveals — same mesh, different behavior. On campus,
 * this class owns its position and visibility; on club entry, `stop()`
 * returns the entity to the entity manager's control.
 */
export interface DeanStalkerDeps {
  entity: PhobosEntity;
  camera: THREE.Camera;
  /** Log into the corner box. */
  log: (source: 'phobos' | 'creature_director' | 'system', text: string) => void;
  /** Called when the Dean is close enough to jumpscare — main.ts fires scream+face. */
  onCloseHit: () => void;
  /** Called every 12-18s for a distant vocalization. */
  onVocalize: (distance: number) => void;
}

export class DeanStalker {
  private deps: DeanStalkerDeps;
  private active = false;
  /**
   * Target distance from the player. Chapter advances push this down —
   * Ch I: 55, Ch II: 35, Ch III: 18, Ch IV: 10, Ch V: 4. The Dean
   * approaches this target smoothly over time regardless of where the
   * player walks.
   */
  private targetDistance = 999;
  /** Current actual distance (smoothed toward targetDistance). */
  private currentDistance = 999;
  /** Radians around the player — Dean circles slightly so he's not always dead behind. */
  private angleAroundPlayer = Math.PI; // behind by default
  private angleDrift = 0.0003; // rad/ms
  private lastUpdate = performance.now();
  private vocalizeTimer: number | null = null;
  private closeHitArmed = true;

  constructor(deps: DeanStalkerDeps) {
    this.deps = deps;
  }

  /** Begin stalking. Call on campus load after Chapter I. */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.lastUpdate = performance.now();
    this.scheduleVocalize();
    this.deps.log('creature_director', 'dean eisgruber is on the street.');
  }

  /** Stop and release the entity — used on club entry + game end. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.vocalizeTimer !== null) {
      clearTimeout(this.vocalizeTimer);
      this.vocalizeTimer = null;
    }
    this.deps.entity.setVisibility('hidden');
  }

  /** Push the target distance down when a chapter advances. */
  setTargetDistance(d: number): void {
    this.targetDistance = d;
    if (d >= 999) {
      this.deps.entity.setVisibility('hidden');
      return;
    }
    // Re-arm the close-hit so he can scream again on the next approach
    if (d > 8) this.closeHitArmed = true;
  }

  /**
   * Per-frame update. Smoothly close current→target distance, then
   * position the entity on a circle around the camera at (distance,
   * angle). Triggers onCloseHit once when distance drops under 6 units.
   */
  update(): void {
    if (!this.active) return;
    const now = performance.now();
    const dtMs = now - this.lastUpdate;
    this.lastUpdate = now;

    // Smoothly close toward target — fast and aggressive.
    // When the Dean is above target, he CLOSES at up to 5 m/s. When
    // below (after a close-hit reset), he retreats more slowly. This
    // is what makes the street feel hunted, not just atmospheric.
    const gap = this.targetDistance - this.currentDistance;
    const approaching = gap < 0;
    const speed = approaching
      ? Math.max(2.0, Math.abs(gap) * 0.25) // hunt speed
      : Math.max(0.4, Math.abs(gap) * 0.06);
    const delta = speed * (dtMs / 1000);
    if (gap > 0) this.currentDistance = Math.min(this.targetDistance, this.currentDistance + delta);
    else         this.currentDistance = Math.max(this.targetDistance, this.currentDistance - delta);

    // Drift the angle slowly so the Dean isn't always dead behind — gives
    // the player a chance to catch him in peripheral vision.
    this.angleAroundPlayer += this.angleDrift * dtMs;

    // Compute world position: orbit the camera on XZ at the current distance.
    const cam = this.deps.camera;
    const camPos = new THREE.Vector3();
    cam.getWorldPosition(camPos);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);

    const offX = Math.cos(this.angleAroundPlayer) * this.currentDistance;
    const offZ = Math.sin(this.angleAroundPlayer) * this.currentDistance;
    // Blend forward/right basis for a less robotic path
    const worldX = camPos.x + fwd.x * offX + right.x * offZ;
    const worldZ = camPos.z + fwd.z * offX + right.z * offZ;

    this.deps.entity.setPosition({ x: worldX, y: 0, z: worldZ });

    // Visibility ladder by distance.
    if (this.currentDistance > 60) {
      this.deps.entity.setVisibility('hidden');
    } else if (this.currentDistance > 22) {
      this.deps.entity.setVisibility('peripheral');
    } else if (this.currentDistance > 8) {
      this.deps.entity.setVisibility('revealed');
    } else {
      this.deps.entity.setVisibility('close');
      // Within 6 units: trigger the close-hit scream+face ONCE.
      // Re-arms when setTargetDistance pushes him back beyond 8 units
      // (e.g., the chapter doesn't usually re-arm, so this fires once
      // per chapter worth of approach — exactly what we want).
      if (this.currentDistance < 6 && this.closeHitArmed) {
        this.closeHitArmed = false;
        this.deps.onCloseHit();
      }
    }
  }

  /**
   * Schedule the next distant vocalization. PACED: 8-20s intervals.
   * Scary horror is quiet horror — the player should hear their own
   * footsteps and breathing between Dean cues. Rare cues land.
   *
   * Close (<20u): 8-12s between cues (breathing, short growls).
   * Far: 14-24s between cues (distant creaks, a single far scream).
   */
  private scheduleVocalize(): void {
    if (!this.active) return;
    const close = this.currentDistance < 20;
    const baseMs = close ? 8000 : 14000;
    const jitter = close ? 4000 : 10000;
    const next = baseMs + Math.random() * jitter;
    this.vocalizeTimer = window.setTimeout(() => {
      if (this.active) {
        this.deps.onVocalize(this.currentDistance);
        this.scheduleVocalize();
      }
    }, next);
  }
}
