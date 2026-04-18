import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce, makeArmchair,
  makeBookshelf, makeRug, makeExitDoor, makeWindow, makeFramedPicture,
} from './_shared';

/**
 * TERRACE CLUB INTERIOR — Cotswold Tudor pub-like living room with a very
 * large stone fireplace, low beamed ceiling, exposed wood trusses.
 * Wrought-iron light fixtures. Warmer, more informal than the other Gothic
 * clubs — closer to a country-house study than a hall.
 */
export class TerraceInterior implements GameScene {
  readonly name = 'terrace';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 2.8);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.terrace;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    this.bounds = buildShell(this.group, w, h, d, { floor: 0x2a1a0e, ceiling: 0x1a120a, walls: 0x786858 });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Exposed wood trusses — heavy Cotswold-style.
    const beam = 0x1a0c04;
    for (const bx of [-4, -1.5, 1.5, 4]) {
      // Main truss.
      this.group.add(makeBox(0.25, 0.3, d - 0.1, new THREE.Vector3(bx, h - 0.16, 0), beam));
      // Brace diagonals (short ones toward ceiling peaks — illusion of trussed roof).
      const b1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 1.1, 0.15),
        new THREE.MeshLambertMaterial({ color: beam, flatShading: true }),
      );
      b1.position.set(bx, h - 0.55, -hd + 0.6);
      b1.rotation.x = -0.55;
      this.group.add(b1);
      const b2 = b1.clone();
      b2.position.set(bx, h - 0.55, hd - 0.6);
      b2.rotation.x = 0.55;
      this.group.add(b2);
    }
    // Cross-ties.
    for (const bz of [-2, 0, 2]) {
      this.group.add(makeBox(w - 0.1, 0.22, 0.22, new THREE.Vector3(0, h - 0.5, bz), beam));
    }

    // VERY large stone fireplace — defining feature. Takes up most of north wall.
    const fpW = 4.0, fpH = 2.5, fpD = 0.8;
    const stone = 0x7e7060;
    // Mantel top.
    this.group.add(makeBox(fpW + 0.5, 0.35, fpD + 0.2, new THREE.Vector3(0, fpH - 0.175, -hd + fpD / 2), stone));
    // Supports.
    this.group.add(makeBox(0.5, fpH, fpD, new THREE.Vector3(-fpW / 2 + 0.25, fpH / 2, -hd + fpD / 2), stone));
    this.group.add(makeBox(0.5, fpH, fpD, new THREE.Vector3(fpW / 2 - 0.25, fpH / 2, -hd + fpD / 2), stone));
    // Hearth.
    this.group.add(makeBox(fpW + 1.0, 0.2, fpD + 0.4, new THREE.Vector3(0, 0.1, -hd + fpD / 2 + 0.2), 0x5a4e42));
    // Firebox.
    this.group.add(makeEmissive(fpW - 1.0, fpH - 0.6, 0.04, new THREE.Vector3(0, 0.2 + (fpH - 0.6) / 2, -hd + fpD - 0.25), 0x0a0604));
    // Burning logs.
    this.group.add(makeEmissive(fpW - 1.5, 0.25, 0.35, new THREE.Vector3(0, 0.33, -hd + fpD - 0.35), 0xff7028));
    this.fireGlow = new THREE.PointLight(0xff7a38, 1.3, 7, 2.0);
    this.fireGlow.position.set(0, 0.8, -hd + 0.7);
    this.group.add(this.fireGlow);

    // A few rustic casement windows.
    for (const wz of [-2.5, 0, 2.5]) {
      makeWindow(this.group, -hw, 1.9, wz, 1.0, 1.3, 1, 0x40301a, 0x1a0e06);
      makeWindow(this.group, hw, 1.9, wz, 1.0, 1.3, -1, 0x40301a, 0x1a0e06);
    }

    // Dining table but smaller — this feels more like a living hall.
    makeDiningTable(this.group, 0, -0.3, 3.8, 1.1, 0x2a1a0c, 0x180c06, this.bounds);

    // Pair of leather armchairs in front of the fireplace.
    makeArmchair(this.group, -1.6, hd - 1.8, 0x3a2018, this.bounds);
    makeArmchair(this.group, 1.6, hd - 1.8, 0x3a2018, this.bounds);
    // A small book-cart / side bookshelf.
    makeBookshelf(this.group, hw - 0.04, 2.5, 2.4, 2.0, -1, 0x2e1a0e, this.bounds);

    // Wrought-iron pendants suspended from the trusses.
    for (const px of [-2.5, 0, 2.5]) {
      const stem = makeBox(0.04, 0.6, 0.04, new THREE.Vector3(px, h - 0.6, 0), 0x140802);
      this.group.add(stem);
      const lantern = makeBox(0.35, 0.4, 0.35, new THREE.Vector3(px, h - 1.1, 0), 0x0a0402);
      this.group.add(lantern);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffa860 }),
      );
      bulb.position.set(px, h - 1.1, 0);
      this.group.add(bulb);
      const light = new THREE.PointLight(0xffa860, 0.7, 5, 2);
      light.position.copy(bulb.position);
      this.group.add(light);
    }

    // Sconces near fireplace.
    makeSconce(this.group, -2.3, 2.0, -hd + 0.1, 1, 0xff9870, 0.7, 4);
    makeSconce(this.group, 2.3, 2.0, -hd + 0.1, 1, 0xff9870, 0.7, 4);

    // Landscape paintings on side walls.
    makeFramedPicture(this.group, -hw, 2.3, -0.5, 1.2, 0.8, 1, 0x4a3820, 0x140802);
    makeFramedPicture(this.group, hw, 2.3, 1.5, 1.2, 0.8, -1, 0x4a3820, 0x140802);

    // Earth-tone patterned rug in front of fireplace.
    makeRug(this.group, 0, -1.0, 3.6, 2.4, 0x3a2214, 0x5a3a24);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.2, -1, 0x1a0e06, 0x3a2818);
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
    if (this.fireGlow) this.fireGlow.intensity = 1.25 + Math.sin(this.time * 10) * 0.08;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
