import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce, makeArmchair,
  makeBookshelf, makeRug, makeExitDoor, makeWindow, makeFramedPicture,
  addAbandonment,
} from './_shared';

/**
 * TERRACE CLUB INTERIOR — Cotswold Tudor pub-like living room with a very
 * large stone fireplace, low beamed ceiling, exposed wood trusses.
 * Wrought-iron light fixtures. Warmer, more informal than the other Gothic
 * clubs — closer to a country-house study than a hall.
 *
 * Dimensions: 22w × 16d × 5h (doubled from 12×8×3.6).
 */
export class TerraceInterior implements GameScene {
  readonly name = 'terrace';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

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

    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'wallpaper' });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Exposed wood trusses — heavy Cotswold-style, wider spacing for 22w room.
    const beam = 'wood_dark' as const;
    for (const bx of [-8.5, -5.0, -1.5, 2.0, 5.5, 9.0]) {
      // Main truss.
      this.group.add(makeBox(0.25, 0.3, d - 0.1, new THREE.Vector3(bx, h - 0.16, 0), beam));
      // Brace diagonals.
      const b1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 1.1, 0.15),
        new THREE.MeshLambertMaterial({ color: 0x1a0c04, flatShading: true }),
      );
      b1.position.set(bx, h - 0.55, -hd + 0.6);
      b1.rotation.x = -0.55;
      this.group.add(b1);
      const b2 = b1.clone();
      b2.position.set(bx, h - 0.55, hd - 0.6);
      b2.rotation.x = 0.55;
      this.group.add(b2);
    }
    // Cross-ties — more for deeper room.
    for (const bz of [-5.5, -2.0, 1.5, 5.0]) {
      this.group.add(makeBox(w - 0.1, 0.22, 0.22, new THREE.Vector3(0, h - 0.5, bz), beam));
    }

    // VERY large stone fireplace — defining feature, on north wall.
    const fpW = 5.0, fpH = 2.8, fpD = 0.9;
    const stone = 0x7e7060;
    // Mantel top.
    this.group.add(makeBox(fpW + 0.6, 0.38, fpD + 0.22, new THREE.Vector3(0, fpH - 0.19, -hd + fpD / 2), stone));
    // Supports.
    this.group.add(makeBox(0.55, fpH, fpD, new THREE.Vector3(-fpW / 2 + 0.275, fpH / 2, -hd + fpD / 2), stone));
    this.group.add(makeBox(0.55, fpH, fpD, new THREE.Vector3(fpW / 2 - 0.275, fpH / 2, -hd + fpD / 2), stone));
    // Hearth.
    this.group.add(makeBox(fpW + 1.2, 0.22, fpD + 0.5, new THREE.Vector3(0, 0.11, -hd + fpD / 2 + 0.25), 0x5a4e42));
    // Firebox.
    this.group.add(makeEmissive(fpW - 1.1, fpH - 0.65, 0.04, new THREE.Vector3(0, 0.2 + (fpH - 0.65) / 2, -hd + fpD - 0.28), 0x0a0604));
    // Burning logs.
    this.group.add(makeEmissive(fpW - 1.6, 0.28, 0.38, new THREE.Vector3(0, 0.35, -hd + fpD - 0.38), 0xff7028));
    this.fireGlow = new THREE.PointLight(0xff7a38, 1.3, 8, 2.0);
    this.fireGlow.position.set(0, 0.8, -hd + 0.8);
    this.group.add(this.fireGlow);

    // Rustic casement windows — 5 per side, evenly spaced along 16d walls.
    for (const wz of [-5.5, -2.5, 0.5, 3.5, 6.0]) {
      makeWindow(this.group, -hw, 2.1, wz, 1.0, 1.4, 1, 0x40301a, 0x1a0e06);
      makeWindow(this.group, hw, 2.1, wz, 1.0, 1.4, -1, 0x40301a, 0x1a0e06);
    }

    // Dining table — larger for 22w room.
    makeDiningTable(this.group, 0, -0.5, 7.0, 1.2, 0x2a1a0c, 0x180c06, this.bounds);

    // Pair of leather armchairs in front of the fireplace.
    makeArmchair(this.group, -2.5, -hd + 2.8, 0x3a2018, this.bounds);
    makeArmchair(this.group, 2.5, -hd + 2.8, 0x3a2018, this.bounds);
    // Extra armchairs at the south end.
    makeArmchair(this.group, -hw + 1.5, hd - 2.5, 0x3a2018, this.bounds);
    makeArmchair(this.group, hw - 1.5, hd - 2.5, 0x3a2018, this.bounds);
    // Side table between south armchairs.
    this.group.add(makeBox(0.7, 0.55, 0.7, new THREE.Vector3(0, 0.275, hd - 2.5), 'wood_dark'));
    this.bounds.push(aabbFromCenter(0, 0.275, hd - 2.5, 0.35, 0.275, 0.35));

    // Bookshelves — one in south-east corner, one near fireplace.
    makeBookshelf(this.group, hw - 0.04, hd - 0.05, 2.8, h - 0.5, -1, 0x2e1a0e, this.bounds);
    makeBookshelf(this.group, -hw + 0.04, -hd + 0.05, 2.4, h - 0.5, 1, 0x2e1a0e, this.bounds);

    // Wrought-iron pendants — 5 for the wider room.
    for (const px of [-6.0, -3.0, 0, 3.0, 6.0]) {
      const pendantStem = makeBox(0.04, 0.6, 0.04, new THREE.Vector3(px, h - 0.6, 0), 0x140802);
      this.group.add(pendantStem);
      const lantern = makeBox(0.35, 0.4, 0.35, new THREE.Vector3(px, h - 1.1, 0), 0x0a0402);
      this.group.add(lantern);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffa860 }),
      );
      bulb.position.set(px, h - 1.1, 0);
      this.group.add(bulb);
      const light = new THREE.PointLight(0xffa860, 0.7, 5.5, 2);
      light.position.copy(bulb.position);
      this.group.add(light);
    }

    // Sconces near fireplace and on side walls.
    makeSconce(this.group, -3.0, 2.2, -hd + 0.1, 1, 0xff9870, 0.7, 4.5);
    makeSconce(this.group, 3.0, 2.2, -hd + 0.1, 1, 0xff9870, 0.7, 4.5);
    for (const wz of [-4.0, 1.0, 5.0]) {
      makeSconce(this.group, -hw + 0.1, 2.2, wz, 1, 0xff9870, 0.5, 4);
      makeSconce(this.group, hw - 0.1, 2.2, wz, -1, 0xff9870, 0.5, 4);
    }

    // Landscape paintings on side walls — more for longer walls.
    makeFramedPicture(this.group, -hw, 2.5, -3.5, 1.2, 0.8, 1, 0x4a3820, 0x140802);
    makeFramedPicture(this.group, -hw, 2.5, 1.5, 1.2, 0.8, 1, 0x4a3820, 0x140802);
    makeFramedPicture(this.group, hw, 2.5, -3.5, 1.2, 0.8, -1, 0x4a3820, 0x140802);
    makeFramedPicture(this.group, hw, 2.5, 1.5, 1.2, 0.8, -1, 0x4a3820, 0x140802);

    // Earth-tone patterned rug in front of fireplace.
    makeRug(this.group, 0, -1.5, 5.0, 3.5, 0x3a2214, 0x5a3a24);
    // Secondary rug near south seating.
    makeRug(this.group, 0, hd - 2.5, 4.0, 2.5, 0x3a2214, 0x5a3a24);

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.2, -1, 0x1a0e06, 0x3a2818);
    this.triggerBoxes.push({
      id: 'exit_to_campus',
      box: aabbFromCenter(0, 1.0, hd - 0.25, 1.2, 1.2, 0.35),
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
