import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const SPEED = 5.0;
const DAMPING = 8.0;
const EYE_HEIGHT = 1.6;

export class Player {
  readonly controls: PointerLockControls;

  private velocity = new THREE.Vector3();
  private moveState = { forward: false, backward: false, left: false, right: false };

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.controls = new PointerLockControls(camera, domElement);

    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('keyup', this.boundKeyUp);
  }

  lock(): void {
    this.controls.lock();
  }

  unlock(): void {
    this.controls.unlock();
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  update(dt: number): void {
    if (!this.controls.isLocked) return;

    // Compute desired movement direction
    const dir = new THREE.Vector3();
    if (this.moveState.forward) dir.z -= 1;
    if (this.moveState.backward) dir.z += 1;
    if (this.moveState.left) dir.x -= 1;
    if (this.moveState.right) dir.x += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize();
      this.velocity.x += dir.x * SPEED * dt;
      this.velocity.z += dir.z * SPEED * dt;
    }

    // Apply damping
    const decay = Math.exp(-DAMPING * dt);
    this.velocity.x *= decay;
    this.velocity.z *= decay;

    // Move via PointerLockControls (projects onto XZ plane)
    this.controls.moveForward(-this.velocity.z * dt);
    this.controls.moveRight(this.velocity.x * dt);

    // Clamp Y to eye height
    this.controls.object.position.y = EYE_HEIGHT;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('keyup', this.boundKeyUp);
    this.controls.dispose();
  }

  private onKeyDown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.moveState.forward = true; break;
      case 'KeyS': case 'ArrowDown':  this.moveState.backward = true; break;
      case 'KeyA': case 'ArrowLeft':  this.moveState.left = true; break;
      case 'KeyD': case 'ArrowRight': this.moveState.right = true; break;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.moveState.forward = false; break;
      case 'KeyS': case 'ArrowDown':  this.moveState.backward = false; break;
      case 'KeyA': case 'ArrowLeft':  this.moveState.left = false; break;
      case 'KeyD': case 'ArrowRight': this.moveState.right = false; break;
    }
  }
}
