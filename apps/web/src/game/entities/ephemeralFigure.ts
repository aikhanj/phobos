import * as THREE from 'three';
import { billboardToCamera, createFigureMesh, disposeFigure, setFigureOpacity } from './figureMesh';

export interface EphemeralFigureOptions {
  position: { x: number; y: number; z: number };
  /** Peak opacity while alive. Default 0.5. */
  opacity?: number;
  /** Lifetime in seconds. Includes fade-in + hold + fade-out. Default 1.4. */
  ttl?: number;
  /** Fade-in duration (seconds). Default 0.18. */
  fadeIn?: number;
  /** Fade-out duration (seconds). Default 0.35. */
  fadeOut?: number;
}

/**
 * A stateless transient figure. Used as flat-period filler when no fear
 * spike has occurred in a while — keeps Phobos's presence felt without
 * requiring a spike. No voice, no collision, no state beyond `alive`.
 *
 * Built from the same mesh factory as PhobosEntity so transient spawns
 * read visually identical to the persistent granny (distinction is only
 * in duration + audio).
 */
export class EphemeralFigure {
  readonly group: THREE.Group;

  private age = 0;
  private alive = true;
  private readonly ttl: number;
  private readonly peak: number;
  private readonly fadeIn: number;
  private readonly fadeOut: number;

  constructor(opts: EphemeralFigureOptions) {
    this.group = createFigureMesh();
    this.group.position.set(opts.position.x, opts.position.y, opts.position.z);
    this.group.visible = true;
    this.peak = opts.opacity ?? 0.5;
    this.ttl = opts.ttl ?? 1.4;
    this.fadeIn = opts.fadeIn ?? 0.18;
    this.fadeOut = opts.fadeOut ?? 0.35;
    setFigureOpacity(this.group, 0);
  }

  isAlive(): boolean { return this.alive; }

  update(dt: number, camera: THREE.Camera): void {
    if (!this.alive) return;
    this.age += dt;

    let o: number;
    if (this.age < this.fadeIn) {
      o = (this.age / this.fadeIn) * this.peak;
    } else if (this.age < this.ttl - this.fadeOut) {
      o = this.peak;
    } else if (this.age < this.ttl) {
      const t = (this.ttl - this.age) / this.fadeOut;
      o = Math.max(0, t) * this.peak;
    } else {
      o = 0;
      this.alive = false;
    }
    setFigureOpacity(this.group, o);
    if (this.alive) billboardToCamera(this.group, camera);
  }

  dispose(): void {
    disposeFigure(this.group);
    this.group.removeFromParent();
  }
}
