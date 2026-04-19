import * as THREE from 'three';
import type { AABB, HideZone } from '@phobos/types';
import type { PhobosEntity } from '../game/entities';
import type { Player } from '../game/player';

/**
 * IN-CLUB DEAN HUNT — continuous per-frame chase.
 *
 * Once the player enters a chain club, Dean Eisgruber spawns at the back
 * wall and WALKS TOWARD THEM every frame at ~1.8 m/s. No teleport beats,
 * no fair pauses — he just gets closer. The only way to stop him is to
 * find the document beacon and press E.
 *
 * Beats:
 *   - t = 0s:    spawn at far corner, visibility "peripheral"
 *   - ongoing:   move toward player at chaseSpeed (m/s)
 *   - dist < 10: visibility upgrades to "revealed", growl + heartbeat
 *   - dist < 6:  visibility "close", breath + ambient whisper
 *   - dist < 2.5: SCREAM + face overlay (`onCatch`) — teleport back to
 *                 a corner and resume. The hunt does not end until
 *                 `cancel()` is called (pickup collected).
 *
 * Vocalize: the Dean emits a scare cue every 2-3 seconds regardless of
 * distance (growl / whisper / breath), so the player hears him constantly.
 */
export interface ClubDeanHuntDeps {
  entity: PhobosEntity;
  camera: THREE.Camera;
  player: Player;
  /** Hide zones in the current scene. Player crouched + still inside one = invisible. */
  hideZones: HideZone[];
  /** Called when the Dean closes to <2.5m. Fire scream + overlay. */
  onCatch: () => void;
  /** Distance-based ambient cue. Called every ~2s when active. */
  onVocalize: (distance: number) => void;
  /** Fires when the player ENTERS a hide state. Log + UI prompt. */
  onHideEnter?: () => void;
  /** Fires when the player LEAVES hide state. */
  onHideExit?: () => void;
  /** Room half-extents so the Dean stays inside. */
  roomHalfWidth: number;
  roomHalfDepth: number;
  /** Start delay after scene load, ms. Gives the player a beat. */
  startDelayMs?: number;
  /** Floor Y. */
  floorY?: number;
  /** Chase speed in meters/second. Default 1.8 m/s (player walk=5 m/s, sprint faster). */
  chaseSpeed?: number;
}

export class ClubDeanHunt {
  private deps: ClubDeanHuntDeps;
  private active = false;
  private chasing = false;
  private lastUpdate = 0;
  private startTimer: number | null = null;
  private vocalizeTimer: number | null = null;
  private catchCooldown = 0;
  /** Is the player currently hidden? (crouched + still + inside hide zone) */
  private hiddenPrev = false;
  /**
   * When the player is hidden, the Dean walks toward a random patrol
   * point within the room instead of their position. This makes him
   * wander away — the core tension release of DOORS / Granny hiding.
   */
  private patrolTarget: THREE.Vector3 | null = null;

  constructor(deps: ClubDeanHuntDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.chasing = false;
    this.lastUpdate = performance.now();
    const delay = this.deps.startDelayMs ?? 4000;
    // Spawn at the back wall IMMEDIATELY, visible as peripheral. He's
    // standing there. He hasn't moved yet. Reference: Silent Hill 2,
    // Pyramid Head at the end of a hallway before he starts walking.
    this.spawnAtCorner();
    this.deps.entity.setVisibility('peripheral');
    this.startTimer = window.setTimeout(() => {
      this.chasing = true;
      this.scheduleVocalize();
    }, delay);
  }

  cancel(): void {
    if (!this.active) return;
    this.active = false;
    if (this.startTimer !== null) { clearTimeout(this.startTimer); this.startTimer = null; }
    if (this.vocalizeTimer !== null) { clearTimeout(this.vocalizeTimer); this.vocalizeTimer = null; }
    this.deps.entity.setVisibility('hidden');
  }

  /** Distance from Dean to player on the XZ plane. */
  distanceToPlayer(): number {
    const p = this.deps.entity.getPosition();
    const c = this.deps.camera.position;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Per-frame tick. Must be called from engine.onUpdate. */
  update(): void {
    if (!this.active) return;
    const now = performance.now();
    const dtMs = now - this.lastUpdate;
    this.lastUpdate = now;
    if (this.catchCooldown > 0) this.catchCooldown = Math.max(0, this.catchCooldown - dtMs);

    // During the pre-chase hold, the Dean stands at the corner. Don't
    // move him; just keep him visible so the player can notice him.
    if (!this.chasing) return;

    // ── HIDE CHECK ──
    // Player is hidden if: crouched AND inside any HideZone AND moving
    // slowly. If hidden, the Dean loses the player and starts wandering
    // to a random patrol target instead of chasing.
    const hidden = this.isPlayerHidden();
    if (hidden !== this.hiddenPrev) {
      this.hiddenPrev = hidden;
      if (hidden) {
        this.deps.onHideEnter?.();
        // Pick a random patrol target away from the player so the Dean
        // wanders off. Patrol target is a corner of the room.
        const side = Math.random() < 0.5 ? -1 : 1;
        this.patrolTarget = new THREE.Vector3(
          side * this.deps.roomHalfWidth * 0.7,
          0,
          -this.deps.roomHalfDepth * 0.7 * (Math.random() < 0.5 ? -1 : 1),
        );
      } else {
        this.deps.onHideExit?.();
        this.patrolTarget = null;
      }
    }

    // Move toward the player — OR toward the patrol target if hidden.
    const phobosPos = this.deps.entity.getPosition();
    const camPos = this.deps.camera.position;
    const chaseTargetX = hidden && this.patrolTarget ? this.patrolTarget.x : camPos.x;
    const chaseTargetZ = hidden && this.patrolTarget ? this.patrolTarget.z : camPos.z;
    const dx = chaseTargetX - phobosPos.x;
    const dz = chaseTargetZ - phobosPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Idle state while still offstage (position hasn't been set yet).
    if (dist > 9000) return;

    // DEAD SILENCE — sprinting is noise. The Dean accelerates to catch
    // sprinting footsteps, so players who mash shift get caught faster.
    // Crouching + still = completely invisible (hide zones); walking =
    // base chase speed; sprinting = +60% chase speed. Encourages slow,
    // deliberate movement. Reference: Dead Silence / Alien Isolation.
    const baseSpeed = this.deps.chaseSpeed ?? 1.8;
    const noiseBoost = this.deps.player.isSprinting() ? baseSpeed * 0.6 : 0;
    const speed = baseSpeed + noiseBoost;
    const step = speed * (dtMs / 1000);

    let nextX = phobosPos.x;
    let nextZ = phobosPos.z;
    if (dist > 0.2) {
      nextX += (dx / dist) * step;
      nextZ += (dz / dist) * step;
    }

    // Clamp inside the room.
    const hw = this.deps.roomHalfWidth - 0.6;
    const hd = this.deps.roomHalfDepth - 0.6;
    if (nextX > hw) nextX = hw;
    if (nextX < -hw) nextX = -hw;
    if (nextZ > hd) nextZ = hd;
    if (nextZ < -hd) nextZ = -hd;

    this.deps.entity.setPosition({ x: nextX, y: this.deps.floorY ?? 0, z: nextZ });

    // Visibility escalates with proximity.
    const newDist = Math.sqrt(
      (camPos.x - nextX) * (camPos.x - nextX) +
      (camPos.z - nextZ) * (camPos.z - nextZ),
    );
    // If hidden, the Dean can't catch the player even at 0m. The
    // player MUST move / stand up to be catchable again.
    if (hidden) {
      this.deps.entity.setVisibility('revealed');
      return;
    }

    if (newDist < 2.5 && this.catchCooldown <= 0) {
      // Long cooldown — a catch is a MAJOR beat. After it, the Dean
      // retreats and the player gets 6-8 seconds of near-silence to
      // actually find the beacon. Without this, catches stack and
      // become noise. Anticipation > frequency.
      this.catchCooldown = 8000;
      this.deps.entity.setVisibility('close');
      this.deps.onCatch();
      window.setTimeout(() => {
        if (this.active) this.spawnAtCorner();
      }, 1800);
      return;
    } else if (newDist < 6) {
      this.deps.entity.setVisibility('close');
    } else if (newDist < 12) {
      this.deps.entity.setVisibility('revealed');
    } else {
      this.deps.entity.setVisibility('peripheral');
    }
  }

  /**
   * Test if the player is currently hidden. Conditions (all required):
   *   - player.isCrouched() === true
   *   - player's position is inside any HideZone AABB
   *   - player's current speed < 0.6 m/s (crouch-walking is fine)
   */
  private isPlayerHidden(): boolean {
    if (!this.deps.player.isCrouched()) return false;
    if (this.deps.player.currentSpeed() > 0.6) return false;
    const cp = this.deps.camera.position;
    for (const zone of this.deps.hideZones) {
      if (pointInAABB(cp.x, cp.y, cp.z, zone.aabb)) return true;
    }
    return false;
  }

  private spawnAtCorner(): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (this.deps.roomHalfWidth * 0.6);
    const z = -this.deps.roomHalfDepth * 0.7;
    const y = this.deps.floorY ?? 0;
    this.deps.entity.setPosition({ x, y, z });
    this.deps.entity.setVisibility('peripheral');
  }

  // (helpers)
  // Note: pointInAABB is defined at module scope below.

  private scheduleVocalize(): void {
    if (!this.active) return;
    const dist = this.distanceToPlayer();
    // PACED vocalize: 4-7s up close (he's breathing on you, one dread
    // cue per beat), 9-16s far (distant creaks + presence). Reference
    // Amnesia: fewer cues, each cue carries weight. The silence
    // between is the horror.
    const intervalMs = dist < 6
      ? 4000 + Math.random() * 3000
      : 9000 + Math.random() * 7000;
    this.vocalizeTimer = window.setTimeout(() => {
      if (!this.active) return;
      this.deps.onVocalize(this.distanceToPlayer());
      this.scheduleVocalize();
    }, intervalMs);
  }
}

/** AABB point-test used for hide-zone membership. */
function pointInAABB(x: number, y: number, z: number, b: AABB): boolean {
  return (
    x >= b.min[0] && x <= b.max[0] &&
    y >= b.min[1] && y <= b.max[1] &&
    z >= b.min[2] && z <= b.max[2]
  );
}
