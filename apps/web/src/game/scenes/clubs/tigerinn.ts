import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce, makeArmchair,
  makeRug, makeExitDoor, makeWindow, makeFramedPicture,
} from './_shared';

/**
 * TIGER INN INTERIOR — the taproom/great room. Dark, low-ceilinged, with
 * heavy exposed oak beams, plank floors, a big brick hearth, and walls
 * dense with tiger paraphernalia. Reads as a country pub, not a formal
 * dining room. The most "lived-in" feeling club interior.
 */
export class TigerInnInterior implements GameScene {
  readonly name = 'tigerinn';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 2.8);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.tigerinn;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // Deliberately low ceiling — taproom feel.
    this.bounds = buildShell(this.group, w, h, d, { floor: 0x2e1a0c, ceiling: 0x1a0e06, walls: 0x3a2414 });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Plank floor lines (visible board seams).
    for (let bz = -hd + 0.5; bz < hd; bz += 0.8) {
      this.group.add(makeBox(w - 0.1, 0.005, 0.03, new THREE.Vector3(0, 0.015, bz), 0x140802));
    }

    // Heavy exposed oak beams — DENSE (Tiger Inn has visible beams everywhere).
    const beamColor = 0x0a0402;
    for (const bx of [-3.5, -2.0, -0.5, 1.0, 2.5, 3.8]) {
      this.group.add(makeBox(0.22, 0.28, d - 0.1, new THREE.Vector3(bx, h - 0.14, 0), beamColor));
    }
    // Cross beams too.
    for (const bz of [-2.0, 0, 2.0]) {
      this.group.add(makeBox(w - 0.1, 0.2, 0.22, new THREE.Vector3(0, h - 0.45, bz), beamColor));
    }

    // Half-timbered wall accents — vertical and diagonal dark timbers on stucco.
    // North wall.
    for (let px = -hw + 0.8; px < hw - 0.8; px += 1.2) {
      this.group.add(makeBox(0.12, 1.2, 0.04, new THREE.Vector3(px, h - 1.1, -hd + 0.05), beamColor));
    }

    // Massive brick hearth on north wall — THE central feature.
    const fpW = 3.2, fpH = 2.2, fpD = 0.7;
    this.group.add(makeBox(fpW, fpH, fpD, new THREE.Vector3(0, fpH / 2, -hd + fpD / 2), 0x5a2e1a));
    // Firebox (dark opening).
    this.group.add(makeEmissive(fpW - 1.2, fpH - 0.8, 0.04, new THREE.Vector3(0, 0.2 + (fpH - 0.8) / 2, -hd + fpD - 0.05), 0x0a0604));
    // Ember glow.
    this.group.add(makeEmissive(fpW - 1.5, 0.2, 0.3, new THREE.Vector3(0, 0.3, -hd + fpD - 0.3), 0xff7a28));
    this.fireGlow = new THREE.PointLight(0xff7a40, 1.1, 6, 2.0);
    this.fireGlow.position.set(0, 0.9, -hd + 0.5);
    this.group.add(this.fireGlow);
    // Rough wooden mantel shelf (big heavy timber).
    this.group.add(makeBox(fpW + 0.4, 0.22, fpD + 0.2, new THREE.Vector3(0, fpH - 0.11, -hd + fpD / 2), 0x1a0802));
    // Fire irons (small tools leaning beside the hearth).
    this.group.add(makeBox(0.04, 0.9, 0.04, new THREE.Vector3(fpW / 2 + 0.1, 0.45, -hd + 0.2), 0x1a1a1a));
    this.group.add(makeBox(0.04, 0.9, 0.04, new THREE.Vector3(fpW / 2 + 0.2, 0.45, -hd + 0.2), 0x1a1a1a));

    // Tiger-head mount over the mantel — tiger silhouette via orange rectangles.
    this.group.add(makeEmissive(0.6, 0.5, 0.1, new THREE.Vector3(0, 2.7, -hd + 0.08), 0xc0600a));
    this.group.add(makeEmissive(0.12, 0.05, 0.1, new THREE.Vector3(-0.15, 2.75, -hd + 0.03), 0x000000));
    this.group.add(makeEmissive(0.12, 0.05, 0.1, new THREE.Vector3(0.15, 2.75, -hd + 0.03), 0x000000));

    // Leaded casement windows — small, low.
    for (const wz of [-2.2, 0, 2.2]) {
      makeWindow(this.group, -hw, 2.0, wz, 0.9, 1.2, 1, 0x2a2810, 0x1a0e06);
      makeWindow(this.group, hw, 2.0, wz, 0.9, 1.2, -1, 0x2a2810, 0x1a0e06);
    }

    // Dining / pub table (shorter, rougher).
    makeDiningTable(this.group, 0, 0, 4.8, 1.0, 0x1a0e06, 0x0a0402, this.bounds);

    // A couple of leather-looking armchairs in a corner.
    makeArmchair(this.group, -hw + 1.0, hd - 1.5, 0x3a1a0e, this.bounds);
    makeArmchair(this.group, hw - 1.0, hd - 1.5, 0x3a1a0e, this.bounds);
    // A small side table between them.
    this.group.add(makeBox(0.8, 0.65, 0.8, new THREE.Vector3(0, 0.325, hd - 1.5), 0x1a0e06));
    this.bounds.push(aabbFromCenter(0, 0.325, hd - 1.5, 0.4, 0.325, 0.4));

    // Warm wall sconces (low-intensity, clustered near hearth).
    makeSconce(this.group, -2.0, 2.3, -hd + 0.1, 1, 0xff9040, 0.8, 4);
    makeSconce(this.group, 2.0, 2.3, -hd + 0.1, 1, 0xff9040, 0.8, 4);
    for (const wz of [-2.0, 2.0]) {
      makeSconce(this.group, -hw + 0.1, 2.1, wz, 1, 0xff9040, 0.6, 3.5);
      makeSconce(this.group, hw - 0.1, 2.1, wz, -1, 0xff9040, 0.6, 3.5);
    }

    // Tiger-themed framed photos on walls.
    makeFramedPicture(this.group, -hw, 2.5, -1.0, 0.6, 0.8, 1, 0x4a2814, 0x0a0604);
    makeFramedPicture(this.group, -hw, 2.5, 1.0, 0.6, 0.8, 1, 0x4a2814, 0x0a0604);
    makeFramedPicture(this.group, hw, 2.5, -1.0, 0.6, 0.8, -1, 0x4a2814, 0x0a0604);
    makeFramedPicture(this.group, hw, 2.5, 1.0, 0.6, 0.8, -1, 0x4a2814, 0x0a0604);

    // Rich orange/black rug — tiger-stripe evocation.
    makeRug(this.group, 0, 0, 3.0, 5.5, 0x1a0a06, 0x8a3a10);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.2, -1, 0x140802, 0x2a1a0e);
    this.triggerBoxes.push({
      id: 'exit_to_campus',
      box: aabbFromCenter(0, 1.0, hd - 0.8, 1.2, 1.2, 0.7),
      onEnter: () => this.onExit(),
      once: true,
    });
  }

  unload(): void {
    this.group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    this.group.clear();
    this.bounds.length = 0;
    this.triggerBoxes.length = 0;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.fireGlow) this.fireGlow.intensity = 1.05 + Math.sin(this.time * 12) * 0.08;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
