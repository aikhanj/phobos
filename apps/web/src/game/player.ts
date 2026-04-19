import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { AABB } from '@phobos/types';
import { moveAndSlide } from './collision';

// Target terminal speeds (metres/second)
const WALK_SPEED = 3.3;
const SPRINT_SPEED = 7.2;
const CROUCH_SPEED = 1.4;
// Time-constant for velocity lerp. Higher = snappier start/stop.
// With τ = 1/DAMPING, ~63% of the way to target in 1/DAMPING seconds.
const DAMPING = 14.0;
const EYE_HEIGHT = 1.6;
const CROUCH_EYE_HEIGHT = 0.7;

// Head bob (camera Y sinusoid while moving)
const BOB_AMP = 0.035;          // metres, peak deviation
const BOB_FREQ_WALK = 5.2;      // rad/s multiplier; combined with speed
const BOB_LATERAL_AMP = 0.015;  // horizontal sway amount

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _slideOut = new THREE.Vector2();

export type ColliderProvider = () => readonly AABB[];
export type FloorHeightProvider = (x: number, z: number) => number;

export class Player {
  readonly controls: PointerLockControls;

  private velocity = new THREE.Vector3();
  private moveState = { forward: false, backward: false, left: false, right: false, sprint: false, crouch: false };
  private eyeHeight = EYE_HEIGHT;
  private getColliders: ColliderProvider = () => [];
  private getFloorHeight: FloorHeightProvider = () => 0;
  private inputEnabled = true;
  /** Current floor height under the player (lerped each frame). */
  private floorY = 0;

  // Viewmodel (first-person arms + lantern) — children of camera
  private viewmodel!: THREE.Group;
  private lanternFlame!: THREE.Mesh;
  private lanternLight!: THREE.PointLight;
  private viewmodelBaseY = -0.35;
  private viewmodelBaseX = 0;

  // Camera-mounted carried light separate from lantern (fills the scene)
  private carriedFill!: THREE.PointLight;

  // Head-bob state
  private bobPhase = 0;
  private bobBlend = 0; // 0..1 (how "walking" we are)

  // Player-behaviour signals surfaced to agents
  private prevLookDir = new THREE.Vector3(0, 0, -1);
  private lookAngularSpeed = 0;
  private stillnessTimer = 0;
  private retreatAnchor: THREE.Vector3 | null = null;
  private lastMoveLenSq = 0;

  // Footstep event (fires on bob zero-crossings while moving)
  onFootstep: ((speed: number) => void) | null = null;
  private prevBobSin = 0;

  // E-press while pointer-locked. Wired to Engine.tryInteract() from main.ts.
  onInteractKey: (() => void) | null = null;

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.controls = new PointerLockControls(camera, domElement);

    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);

    this.buildViewmodel(camera);
  }

  lock(): void { this.controls.lock(); }
  unlock(): void { this.controls.unlock(); }
  get isLocked(): boolean { return this.controls.isLocked; }

  setColliderProvider(fn: ColliderProvider): void { this.getColliders = fn; }
  setFloorHeightProvider(fn: FloorHeightProvider): void { this.getFloorHeight = fn; }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.moveState.forward = this.moveState.backward = this.moveState.left = this.moveState.right = this.moveState.sprint = false;
      this.velocity.set(0, 0, 0);
    }
  }

  setRetreatAnchor(pos: THREE.Vector3 | null): void {
    this.retreatAnchor = pos ? pos.clone() : null;
  }

  get position(): THREE.Vector3 { return this.controls.object.position; }
  get lookStillness(): number { return Math.max(0, 1 - this.lookAngularSpeed / 2); }
  get retreatVelocity(): number {
    if (!this.retreatAnchor) return 0;
    const toAnchor = new THREE.Vector3().subVectors(this.retreatAnchor, this.position).normalize();
    const vel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const speed = vel.length();
    if (speed < 0.05) return 0;
    return -vel.normalize().dot(toAnchor) * speed;
  }
  get secondsStill(): number { return this.stillnessTimer; }

  update(dt: number): void {
    if (!this.controls.isLocked) return;

    // ── input → desired local direction ──
    const local = new THREE.Vector3();
    if (this.moveState.forward) local.z -= 1;
    if (this.moveState.backward) local.z += 1;
    if (this.moveState.left) local.x -= 1;
    if (this.moveState.right) local.x += 1;

    // ── camera-relative forward/right on XZ plane ──
    this.controls.object.getWorldDirection(_forward);
    _forward.y = 0;
    _forward.normalize();
    _right.crossVectors(_forward, this.controls.object.up).normalize();

    // Smooth crouch — eye height lerps between standing + crouched.
    // This is the ADD-ON above the current floor; floor itself lerps
    // separately below so stairs feel smooth instead of snapping.
    const targetEye = this.moveState.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 10);

    // Target velocity — crouch is slowest, sprint is fastest. Crouch
    // overrides sprint (can't both crouch and sprint).
    const targetSpeed = this.moveState.crouch
      ? CROUCH_SPEED
      : this.moveState.sprint ? SPRINT_SPEED : WALK_SPEED;
    let targetX = 0, targetZ = 0;
    if (local.lengthSq() > 0) {
      local.normalize();
      targetX = (_forward.x * -local.z + _right.x * local.x) * targetSpeed;
      targetZ = (_forward.z * -local.z + _right.z * local.x) * targetSpeed;
    }

    // Lerp velocity toward target. alpha = 1 - e^(-k*dt); stable across framerates.
    const alpha = 1 - Math.exp(-DAMPING * dt);
    this.velocity.x += (targetX - this.velocity.x) * alpha;
    this.velocity.z += (targetZ - this.velocity.z) * alpha;

    // ── collision resolution ──
    const colliders = this.getColliders();
    const pos = this.controls.object.position;
    const desiredDX = this.velocity.x * dt;
    const desiredDZ = this.velocity.z * dt;

    // Y-filter colliders against the player's current vertical band
    // (feet on current floor + head = feet + eye-height). Multi-floor
    // levels need this so upper-floor walls don't block ground traffic.
    const feetY = this.floorY;
    const headY = feetY + EYE_HEIGHT + 0.1;
    moveAndSlide(pos.x, pos.z, desiredDX, desiredDZ, colliders, _slideOut, undefined, feetY, headY);
    pos.x = _slideOut.x;
    pos.z = _slideOut.y;

    // ── head bob + footstep cadence ──
    const hSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    const speedNorm = Math.min(1, hSpeed / SPRINT_SPEED);
    // Blend toward 1 while moving, toward 0 while still. Fast attack, slow release.
    const targetBlend = speedNorm;
    this.bobBlend += (targetBlend - this.bobBlend) * Math.min(1, dt * 8);
    // Phase advances proportional to actual horizontal speed.
    this.bobPhase += hSpeed * BOB_FREQ_WALK * 0.25 * dt;

    const bobSin = Math.sin(this.bobPhase);
    const bobY = bobSin * BOB_AMP * this.bobBlend;
    const bobX = Math.sin(this.bobPhase * 0.5) * BOB_LATERAL_AMP * this.bobBlend;

    // Floor height — lerp toward the scene's reported floor Y for the
    // player's (x, z). Lets scenes raise the player up stairs + onto
    // upper floors. Lerp rate is tuned so a step-rise of 0.32m feels
    // smooth at walking speed but snappy enough to climb multi-step
    // staircases without rubber-banding.
    const targetFloor = this.getFloorHeight(pos.x, pos.z);
    this.floorY += (targetFloor - this.floorY) * Math.min(1, dt * 12);
    pos.y = this.floorY + this.eyeHeight + bobY;

    // Viewmodel counter-bobs slightly (opposite phase, softer) — gives it inertia.
    if (this.viewmodel) {
      this.viewmodel.position.y = this.viewmodelBaseY - bobY * 0.6;
      this.viewmodel.position.x = this.viewmodelBaseX - bobX * 1.5;
      // Lantern flame gently jitters always (even stationary).
      if (this.lanternFlame) {
        this.lanternFlame.scale.y = 1 + Math.sin(performance.now() * 0.02) * 0.12 + (Math.random() - 0.5) * 0.08;
      }
      if (this.lanternLight) {
        this.lanternLight.intensity = 1.05 + Math.sin(performance.now() * 0.025) * 0.08 + (Math.random() - 0.5) * 0.06;
      }
    }

    // Footstep fires on bob going from positive to negative (foot plant).
    if (this.bobBlend > 0.35 && this.prevBobSin > 0 && bobSin <= 0) {
      this.onFootstep?.(hSpeed);
    }
    this.prevBobSin = bobSin;

    // ── book-keeping ──
    this.lastMoveLenSq = desiredDX * desiredDX + desiredDZ * desiredDZ;
    const lookDir = _forward.clone();
    const angle = Math.acos(Math.min(1, Math.max(-1, lookDir.dot(this.prevLookDir))));
    this.lookAngularSpeed = angle / Math.max(0.001, dt);
    this.prevLookDir.copy(lookDir);

    if (this.lastMoveLenSq < 0.0001 && this.lookAngularSpeed < 0.2) {
      this.stillnessTimer += dt;
    } else {
      this.stillnessTimer = 0;
    }
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    this.controls.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────
  // First-person viewmodel (arms + lantern, attached to camera)
  // ─────────────────────────────────────────────────────────────────────

  private buildViewmodel(camera: THREE.PerspectiveCamera): void {
    const vm = new THREE.Group();
    vm.position.set(this.viewmodelBaseX, this.viewmodelBaseY, -0.45);
    camera.add(vm);
    this.viewmodel = vm;

    // Sleeve materials (pale, desaturated — like a dusty smock under fog)
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x2a2430, flatShading: true });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xa89080, flatShading: true });

    // ── LEFT ARM (empty hand) ──────────────────────────────────────────
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.2, -0.05, 0);
    // slight inward angle so hands come into view naturally
    leftArm.rotation.z = 0.35;
    leftArm.rotation.x = -0.1;
    vm.add(leftArm);

    // sleeve (upper forearm block, tapered-ish by offsetting two boxes)
    const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), sleeveMat);
    leftSleeve.position.set(0, -0.1, 0);
    leftArm.add(leftSleeve);
    // cuff (darker rim at the wrist)
    const leftCuff = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.025, 0.085), new THREE.MeshLambertMaterial({ color: 0x0e0a10, flatShading: true }));
    leftCuff.position.set(0, -0.23, 0);
    leftArm.add(leftCuff);
    // hand (pale skin, slightly smaller than sleeve)
    const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.085), skinMat);
    leftHand.position.set(0, -0.28, 0);
    leftArm.add(leftHand);

    // ── RIGHT ARM (holds lantern) ──────────────────────────────────────
    const rightArm = new THREE.Group();
    rightArm.position.set(0.2, -0.05, 0);
    rightArm.rotation.z = -0.35;
    rightArm.rotation.x = -0.2;
    vm.add(rightArm);

    const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), sleeveMat);
    rightSleeve.position.set(0, -0.1, 0);
    rightArm.add(rightSleeve);
    const rightCuff = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.025, 0.085), new THREE.MeshLambertMaterial({ color: 0x0e0a10, flatShading: true }));
    rightCuff.position.set(0, -0.23, 0);
    rightArm.add(rightCuff);
    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.085), skinMat);
    rightHand.position.set(0, -0.28, 0);
    rightArm.add(rightHand);

    // ── LANTERN (held in right hand, forward and slightly down) ────────
    const lantern = new THREE.Group();
    lantern.position.set(0, -0.38, 0);
    rightArm.add(lantern);

    // Top cap (swinging eye / handle ring)
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.03, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x1a1612, flatShading: true }),
    );
    cap.position.set(0, 0.09, 0);
    lantern.add(cap);
    // Hanging handle (thin ring across the top)
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.03, 0.005, 4, 8, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0x080606, flatShading: true }),
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.12, 0);
    lantern.add(handle);

    // Glass cage — 4 thin vertical struts
    const strutMat = new THREE.MeshLambertMaterial({ color: 0x140e0a, flatShading: true });
    for (const [sx, sz] of [[-0.045, -0.045], [0.045, -0.045], [-0.045, 0.045], [0.045, 0.045]] as const) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.18, 0.01), strutMat);
      strut.position.set(sx, 0, sz);
      lantern.add(strut);
    }
    // Top and bottom rims
    const topRim = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.11), new THREE.MeshLambertMaterial({ color: 0x0a0606, flatShading: true }));
    topRim.position.set(0, 0.07, 0);
    lantern.add(topRim);
    const bottomRim = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.11), new THREE.MeshLambertMaterial({ color: 0x1a1410, flatShading: true }));
    bottomRim.position.set(0, -0.08, 0);
    lantern.add(bottomRim);
    // Base plate (wider, grounds the object visually)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.13), new THREE.MeshLambertMaterial({ color: 0x0a0604, flatShading: true }));
    plate.position.set(0, -0.1, 0);
    lantern.add(plate);

    // The flame inside (unlit bright sphere)
    // ── depthWrite fix ──────────────────────────────────────────────
    // Transparent materials must set `depthWrite: false` so they don't
    // write to the depth buffer. Without this, a semi-transparent
    // fragment "claims" its depth slot and can occlude geometry behind
    // it — even though the player can see through it. The halo below
    // (line ~300) already had this set correctly; the flame was missing
    // it, causing occasional artifacts where the glass struts behind
    // the flame would disappear for a frame.
    this.lanternFlame = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.lanternFlame.position.set(0, -0.01, 0);
    lantern.add(this.lanternFlame);
    // Inner glow halo (slightly bigger, lower opacity)
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9450, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    halo.position.set(0, -0.01, 0);
    lantern.add(halo);

    // Lantern point light — bright warm, attached to the flame so it moves with view-bob
    this.lanternLight = new THREE.PointLight(0xffb070, 1.1, 6.5, 2);
    this.lanternLight.position.set(0, 0, 0);
    lantern.add(this.lanternLight);

    // A weaker "carry fill" directly at the camera so backs of props aren't pitch-black.
    this.carriedFill = new THREE.PointLight(0x887066, 0.25, 3.5, 2);
    this.carriedFill.position.set(0, 0, 0);
    camera.add(this.carriedFill);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.inputEnabled) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.moveState.forward = true; break;
      case 'KeyS': case 'ArrowDown':  this.moveState.backward = true; break;
      case 'KeyA': case 'ArrowLeft':  this.moveState.left = true; break;
      case 'KeyD': case 'ArrowRight': this.moveState.right = true; break;
      case 'ShiftLeft': this.moveState.sprint = true; break;
      // DOORS-style hide: C toggles crouch. While crouched + still
      // inside a HideZone, stalkers lose sight (main.ts gates the
      // hunt's target on this).
      case 'KeyC':
      case 'ControlLeft':
        this.moveState.crouch = true;
        break;
      case 'KeyE':
        if (this.controls.isLocked) this.onInteractKey?.();
        break;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.moveState.forward = false; break;
      case 'KeyS': case 'ArrowDown':  this.moveState.backward = false; break;
      case 'KeyA': case 'ArrowLeft':  this.moveState.left = false; break;
      case 'KeyD': case 'ArrowRight': this.moveState.right = false; break;
      case 'ShiftLeft': this.moveState.sprint = false; break;
      case 'KeyC':
      case 'ControlLeft':
        this.moveState.crouch = false;
        break;
    }
  }

  /** Public — game systems need this to check hide state. */
  isCrouched(): boolean {
    return this.moveState.crouch;
  }

  /** Public — used by noise-detection (sprint = loud). */
  isSprinting(): boolean {
    return this.moveState.sprint && !this.moveState.crouch;
  }

  /** Current horizontal speed in m/s. */
  currentSpeed(): number {
    return Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
  }

  /**
   * Clean respawn — used on Rush catch, death screens, or any forced
   * teleport. Resets:
   *   - world position to `pos`
   *   - camera rotation to `yawRad` (looking down -Z by default)
   *   - velocity (no slide into walls after the teleport)
   *   - floorY (starts fresh, next frame's floorHeightAt query sets it)
   *   - eyeHeight (standing)
   *   - crouch / sprint / movement inputs
   *   - head-bob state
   *   - stillness + retreat tracking
   *
   * Without this, a teleport mid-sprint leaves the velocity intact and
   * the player slides into geometry the collision loop can't catch.
   */
  respawnAt(pos: THREE.Vector3, yawRad = -Math.PI / 2): void {
    this.controls.object.position.copy(pos);
    this.controls.object.rotation.set(0, yawRad, 0);
    this.velocity.set(0, 0, 0);
    this.floorY = 0;
    this.eyeHeight = EYE_HEIGHT;
    this.moveState.forward = false;
    this.moveState.backward = false;
    this.moveState.left = false;
    this.moveState.right = false;
    this.moveState.sprint = false;
    this.moveState.crouch = false;
    this.bobPhase = 0;
    this.bobBlend = 0;
    this.prevBobSin = 0;
    this.stillnessTimer = 0;
    this.retreatAnchor = null;
    this.lastMoveLenSq = 0;
    this.prevLookDir.set(0, 0, -1);
    this.lookAngularSpeed = 0;
  }
}
