import * as THREE from 'three';
import type { EventBus } from '../game/eventBus';
import type { ScareOverlay } from '../ui/scareOverlay';
import type { Player } from '../game/player';

/**
 * RUSH — the DOORS-signature dash scare, Princeton-themed as a
 * screaming ancestral Dean-specter that tears down Prospect Avenue.
 *
 * Loop:
 *   1. Idle (25-45s) — silence, just ambient.
 *   2. WARN (3s) — low rumble swells. Eyes flicker in distant window.
 *      HUD flashes "HIDE — CROUCH NOW". The player has 3 seconds to
 *      crouch still to survive.
 *   3. DASH (1.8s) — fullscreen scream, a dark silhouette mesh hurtles
 *      past the camera along the avenue.
 *   4. CATCH — if the player was NOT crouched during the dash, fire
 *      jumpscare + brief "death" overlay + teleport them back to the
 *      avenue spawn. No progress is lost — it's a punishment, not a
 *      fail state. If the player WAS crouched, nothing happens.
 *   5. Return to idle.
 */
export interface RushEntityDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  bus: EventBus;
  overlay: ScareOverlay;
  player: Player;
  /** Called when Rush catches the player. Main.ts respawns + logs. */
  onCatch: () => void;
  /** Called to log warning. */
  log: (source: 'creature_director' | 'phobos' | 'system', text: string) => void;
}

export class RushEntity {
  private deps: RushEntityDeps;
  private active = false;
  private phase: 'idle' | 'warn' | 'dash' | 'cooldown' = 'idle';
  private phaseEndMs = 0;
  private dashMesh: THREE.Group | null = null;
  private dashStart = new THREE.Vector3();
  private dashEnd = new THREE.Vector3();
  private dashProgress = 0;
  private dashDurationMs = 1800;
  private nextIdleMs = 0;

  constructor(deps: RushEntityDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.phase = 'idle';
    this.nextIdleMs = performance.now() + 25000 + Math.random() * 20000;
    this.buildDashMesh();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.phase = 'idle';
    if (this.dashMesh) {
      this.deps.scene.remove(this.dashMesh);
      this.dashMesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      this.dashMesh = null;
    }
  }

  /** Per-frame tick. Call from engine.onUpdate when on campus. */
  update(dt: number): void {
    if (!this.active) return;
    const now = performance.now();

    if (this.phase === 'idle') {
      if (now >= this.nextIdleMs) this.beginWarn();
      return;
    }

    if (this.phase === 'warn') {
      if (now >= this.phaseEndMs) this.beginDash();
      return;
    }

    if (this.phase === 'dash') {
      this.dashProgress = Math.min(1, (now - (this.phaseEndMs - this.dashDurationMs)) / this.dashDurationMs);
      if (this.dashMesh) {
        this.dashMesh.position.lerpVectors(this.dashStart, this.dashEnd, this.dashProgress);
      }
      if (now >= this.phaseEndMs) this.endDash();
      return;
    }

    if (this.phase === 'cooldown') {
      if (now >= this.phaseEndMs) {
        this.phase = 'idle';
        this.nextIdleMs = now + 25000 + Math.random() * 25000;
      }
    }

    void dt;
  }

  private beginWarn(): void {
    this.phase = 'warn';
    this.phaseEndMs = performance.now() + 3000;
    this.deps.log('creature_director', 'RUSH · HIDE · crouch now [C]');
    this.deps.bus.fire({ kind: 'sound', asset: 'heartbeat', volume: 0.8 });
    this.deps.bus.fire({ kind: 'sound', asset: 'reverse_creak', volume: 0.85 });
    this.deps.bus.fire({ kind: 'flicker', duration: 0.25, pattern: 'subtle' });
    // Full-screen warning text via scareOverlay's red flash + a specific
    // message. We piggyback on peakCombo() which renders a big center
    // title. RUSH uses red so it's unmistakable.
    this.deps.overlay.peakCombo('RUSH — CROUCH');
  }

  private beginDash(): void {
    this.phase = 'dash';
    this.phaseEndMs = performance.now() + this.dashDurationMs;
    this.dashProgress = 0;
    // Pick dash origin/end: a long sweep along the avenue (X axis),
    // passing through the player's current Z. Randomize direction.
    const camPos = this.deps.camera.position;
    const fromWest = Math.random() < 0.5;
    const startX = fromWest ? -60 : 60;
    const endX = fromWest ? 60 : -60;
    this.dashStart.set(startX, 0, camPos.z);
    this.dashEnd.set(endX, 0, camPos.z);
    if (this.dashMesh) {
      this.dashMesh.position.copy(this.dashStart);
      this.dashMesh.visible = true;
    }
    // Loud dash noise.
    this.deps.bus.fire({ kind: 'sound', asset: 'scream', volume: 1.0 });
    this.deps.bus.fire({ kind: 'sound', asset: 'stinger_high', volume: 0.95 });
    this.deps.bus.fire({ kind: 'webcam_glitch', effect: 'face_warp', durationS: 1.4, intensity: 1.0 });
    this.deps.bus.fire({ kind: 'flicker', duration: 0.6, pattern: 'hard' });
  }

  private endDash(): void {
    if (this.dashMesh) this.dashMesh.visible = false;

    // Did the player survive? Criteria: crouched + speed < 1.2 m/s.
    const safe = this.deps.player.isCrouched() && this.deps.player.currentSpeed() < 1.2;

    if (!safe) {
      // Caught. Fire the overlay + hand control to main.ts.
      this.deps.overlay.screamFace(1400);
      this.deps.overlay.redFlash(650, 0.85);
      this.deps.log('creature_director', 'RUSH CAUGHT YOU · try again');
      this.deps.onCatch();
    } else {
      this.deps.log('creature_director', 'you hid. he passed.');
      this.deps.bus.fire({ kind: 'breath', intensity: 1.0 });
    }

    this.phase = 'cooldown';
    // Short cooldown — the next Rush is scheduled in idle anyway, but
    // we need a visual/audio beat of quiet before the next scare cycle.
    this.phaseEndMs = performance.now() + 3500;
  }

  /**
   * Build the dashing silhouette — tall robed figure with red eyes
   * and a motion-blur trail. Group is positioned by update().
   */
  private buildDashMesh(): void {
    if (this.dashMesh) return;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshBasicMaterial({
      color: 0x020001,
      transparent: true,
      opacity: 0.98,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.5, 0.2), bodyMat);
    body.position.y = 2.25;
    group.add(body);
    // Princeton-orange stole — this is Dean Eisgruber's apparition.
    const stoleMat = new THREE.MeshBasicMaterial({ color: 0xe77500 });
    const lStole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.05), stoleMat);
    lStole.position.set(-0.22, 2.2, 0.12);
    group.add(lStole);
    const rStole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.05), stoleMat);
    rStole.position.set(0.22, 2.2, 0.12);
    group.add(rStole);
    // Glowing eyes.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2010 });
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.05), eyeMat);
    leftEye.position.set(-0.25, 3.8, 0.12);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.05), eyeMat);
    rightEye.position.set(0.25, 3.8, 0.12);
    group.add(rightEye);
    // Trailing cloak behind him.
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x020001,
      transparent: true,
      opacity: 0.6,
    });
    const trail = new THREE.Mesh(new THREE.BoxGeometry(3, 4.0, 0.1), trailMat);
    trail.position.set(-1.8, 2.0, -0.05);
    group.add(trail);
    group.visible = false;
    this.dashMesh = group;
    this.deps.scene.add(group);
  }
}
