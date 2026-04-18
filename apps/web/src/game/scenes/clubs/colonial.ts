import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce, makePilaster,
  makeRug, makeExitDoor, makeWindow, makeFramedPicture,
} from './_shared';

/**
 * COLONIAL CLUB INTERIOR — bright, airy classical dining room with tall
 * rectangular windows, white classical pilasters, simple coffered/beamed
 * ceiling, classical mantel fireplace. Greek Revival discipline: everything
 * symmetrical, everything white.
 */
export class ColonialInterior implements GameScene {
  readonly name = 'colonial';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 2.8);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.colonial;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    this.bounds = buildShell(this.group, w, h, d, { floor: 0x6a4c30, ceiling: 0xf0e4c8, walls: 0xf4e8cc });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Six pilasters symmetrically placed on side walls.
    for (const wx of [-hw + 0.05, hw - 0.05]) {
      for (const wz of [-2.3, 0, 2.3]) {
        makePilaster(this.group, wx, wz, h, wx < 0 ? 1 : -1, 0xeee2c8);
      }
    }

    // Simple coffered ceiling with dark wood beams.
    for (const bx of [-3.5, -1, 1.5, 3.5]) {
      this.group.add(makeBox(0.2, 0.16, d - 0.2, new THREE.Vector3(bx, h - 0.1, 0), 0x3a2818));
    }
    // Decorative entablature at wall/ceiling join.
    this.group.add(makeBox(w - 0.1, 0.22, 0.12, new THREE.Vector3(0, h - 0.12, -hd + 0.12), 0xdad0b0));
    this.group.add(makeBox(w - 0.1, 0.22, 0.12, new THREE.Vector3(0, h - 0.12, hd - 0.12), 0xdad0b0));

    // North wall: white classical mantel fireplace (small, elegant).
    const fpW = 1.8, fpH = 1.7, fpD = 0.4;
    this.group.add(makeBox(fpW, 0.25, fpD, new THREE.Vector3(0, fpH - 0.125, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(0.28, fpH, fpD, new THREE.Vector3(-fpW / 2 + 0.14, fpH / 2, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(0.28, fpH, fpD, new THREE.Vector3(fpW / 2 - 0.14, fpH / 2, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(fpW - 0.56, 0.15, fpD, new THREE.Vector3(0, 0.075, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeEmissive(fpW - 0.56, fpH - 0.4, 0.04, new THREE.Vector3(0, 0.15 + (fpH - 0.4) / 2, -hd + fpD - 0.15), 0x0a0604));
    this.group.add(makeEmissive(fpW - 0.86, 0.12, 0.22, new THREE.Vector3(0, 0.3, -hd + fpD - 0.25), 0xff7a28));
    this.fireGlow = new THREE.PointLight(0xff8040, 0.65, 5, 2.0);
    this.fireGlow.position.set(0, 0.8, -hd + 0.4);
    this.group.add(this.fireGlow);
    // Framed oval mirror above the mantel.
    this.group.add(makeBox(0.9, 1.2, 0.03, new THREE.Vector3(0, 2.6, -hd + 0.07), 0xa08838));
    this.group.add(makeEmissive(0.75, 1.0, 0.02, new THREE.Vector3(0, 2.6, -hd + 0.05), 0x28324a));

    // Tall rectangular windows — 6 total, 3 per side, regularly spaced.
    for (const wz of [-2.3, 0, 2.3]) {
      makeWindow(this.group, hw, 2.6, wz, 1.1, 2.4, -1, 0x9c9066, 0x3a2a18);
      makeWindow(this.group, -hw, 2.6, wz, 1.1, 2.4, 1, 0x9c9066, 0x3a2a18);
    }

    // Long dining table.
    makeDiningTable(this.group, 0, 0, 6.2, 1.2, 0x2e1c0c, 0x1a0e06, this.bounds);

    // Sconces at each pilaster.
    for (const wx of [-hw + 0.12, hw - 0.12]) {
      for (const wz of [-2.3, 0, 2.3]) {
        makeSconce(this.group, wx, 2.9, wz, wx < 0 ? 1 : -1, 0xffe0a0, 0.6, 4);
      }
    }
    // Central chandelier (simple spherical brass).
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 }),
    );
    bulb.position.set(0, h - 1.0, 0);
    this.group.add(bulb);
    const stem = makeBox(0.04, 1.0, 0.04, new THREE.Vector3(0, h - 0.5, 0), 0xa08838);
    this.group.add(stem);
    const chandLight = new THREE.PointLight(0xfff0c8, 1.2, 8, 2.0);
    chandLight.position.set(0, h - 1.0, 0);
    this.group.add(chandLight);

    // Presidential portraits.
    makeFramedPicture(this.group, -hw, 3.0, 0, 1.1, 1.5, 1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, hw, 3.0, 0, 1.1, 1.5, -1, 0x3a2814, 0xa08838);

    makeRug(this.group, 0, 0, 3.6, 6.5, 0x4a2420, 0x6a3830);

    makeExitDoor(this.group, 0, hd - 0.05, 1.6, 2.5, -1, 0x3a2818, 0xb09848);
    this.triggerBoxes.push({
      id: 'exit_to_campus',
      box: aabbFromCenter(0, 1.0, hd - 0.8, 1.4, 1.2, 0.7),
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
    if (this.fireGlow) this.fireGlow.intensity = 0.65 + Math.sin(this.time * 9) * 0.04;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
