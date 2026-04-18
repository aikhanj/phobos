import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce,
  makeRug, makeExitDoor, makeWindow, makeFramedPicture, makePilaster,
  makeBookshelf, makeArmchair, addAbandonment,
} from './_shared';

/**
 * COTTAGE CLUB INTERIOR — the grandest clubhouse interior on Prospect.
 * Double-height white-paneled Great Hall with Corinthian pilasters, coffered
 * plaster ceiling, Adamesque plaster garlands, marble fireplace, tall
 * arched windows, crystal chandelier. Designed by McKim, Mead & White.
 *
 * Dimensions: 26w x 18d x 6.5h
 */
export class CottageInterior implements GameScene {
  readonly name = 'cottage';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private chandelierBulbs: THREE.Mesh[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.cottage;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // Crisp white walls, parquet floor, cream ceiling.
    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'plaster' });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Parquet pattern on floor (darker chevron strips).
    for (let zz = -hd + 0.5; zz < hd; zz += 1.0) {
      this.group.add(makeBox(w - 0.4, 0.005, 0.05, new THREE.Vector3(0, 0.015, zz), 0x3a2414));
    }

    // Corinthian pilasters around the perimeter — more for the larger room.
    for (const xx of [-hw + 0.05, hw - 0.05]) {
      for (const zz of [-5.0, -1.5, 1.5, 5.0]) {
        makePilaster(this.group, xx, zz, h, xx < 0 ? 1 : -1, 0xeee2c8);
      }
    }
    // Two on north wall flanking fireplace.
    makePilaster(this.group, -2.2, -hd + 0.05, h, 1, 0xeee2c8);
    makePilaster(this.group, 2.2, -hd + 0.05, h, 1, 0xeee2c8);
    // Two on south wall flanking door.
    makePilaster(this.group, -2.2, hd - 0.05, h, -1, 0xeee2c8);
    makePilaster(this.group, 2.2, hd - 0.05, h, -1, 0xeee2c8);

    // Coffered plaster ceiling grid — scaled for larger room.
    for (let bx = -hw + 1.8; bx <= hw - 1.8; bx += 2.6) {
      this.group.add(makeBox(0.14, 0.12, d - 0.3, new THREE.Vector3(bx, h - 0.08, 0), 0xdad0b0));
    }
    for (const bz of [-5.5, -2.8, 0, 2.8, 5.5]) {
      this.group.add(makeBox(w - 0.3, 0.12, 0.14, new THREE.Vector3(0, h - 0.08, bz), 0xdad0b0));
    }
    // Adamesque centre medallion (simple circular plaque via octagon).
    const medallion = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8cea8, flatShading: true }),
    );
    medallion.position.set(0, h - 0.08, 0);
    this.group.add(medallion);

    // North wall: marble fireplace with white mantel.
    const fpW = 2.6, fpH = 2.4, fpD = 0.6;
    this.group.add(makeBox(fpW, 0.3, fpD, new THREE.Vector3(0, fpH - 0.15, -hd + fpD / 2), 0xdbd0b0));
    this.group.add(makeBox(0.35, fpH, fpD, new THREE.Vector3(-fpW / 2 + 0.175, fpH / 2, -hd + fpD / 2), 0xdbd0b0));
    this.group.add(makeBox(0.35, fpH, fpD, new THREE.Vector3(fpW / 2 - 0.175, fpH / 2, -hd + fpD / 2), 0xdbd0b0));
    this.group.add(makeBox(fpW - 0.7, 0.2, fpD, new THREE.Vector3(0, 0.1, -hd + fpD / 2), 0xdbd0b0));
    // Opening with embers.
    this.group.add(makeEmissive(fpW - 0.7, fpH - 0.4, 0.04, new THREE.Vector3(0, 0.2 + (fpH - 0.4) / 2, -hd + fpD - 0.2), 0x0a0604));
    this.group.add(makeEmissive(fpW - 1.0, 0.12, 0.22, new THREE.Vector3(0, 0.3, -hd + fpD - 0.3), 0xff7a28));
    this.fireGlow = new THREE.PointLight(0xff7a38, 0.8, 6.5, 2.0);
    this.fireGlow.position.set(0, 0.8, -hd + 0.5);
    this.group.add(this.fireGlow);
    // Gilt mirror over mantel — proportionally wider.
    this.group.add(makeBox(2.0, 1.2, 0.04, new THREE.Vector3(0, 3.2, -hd + 0.08), 0xb09848));
    this.group.add(makeEmissive(1.8, 1.0, 0.02, new THREE.Vector3(0, 3.2, -hd + 0.06), 0x20283a));

    // Tall arched windows — east/west walls, 6 per side for longer walls.
    for (const wz of [-6.0, -3.5, -1.0, 1.5, 4.0, 6.5]) {
      makeWindow(this.group, hw, 3.2, wz, 1.2, 2.4, -1, 0x8a8466, 0x3a2816);
      makeWindow(this.group, -hw, 3.2, wz, 1.2, 2.4, 1, 0x8a8466, 0x3a2816);
    }

    // Long formal dining table — proportionally scaled.
    makeDiningTable(this.group, 0, 0, 12.0, 1.5, 0x3e2814, 0x2a180c, this.bounds);

    // Chandelier (multi-arm with points) — scaled up.
    const chandelier = new THREE.Group();
    const stem = makeBox(0.1, 1.2, 0.1, new THREE.Vector3(0, -0.6, 0), 0xb09848);
    chandelier.add(stem);
    const body = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45),
      new THREE.MeshLambertMaterial({ color: 0xb09848, flatShading: true }),
    );
    chandelier.add(body);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffecb0 }),
      );
      bulb.position.set(Math.cos(angle) * 0.7, -0.25, Math.sin(angle) * 0.7);
      chandelier.add(bulb);
      this.chandelierBulbs.push(bulb);
    }
    chandelier.position.set(0, h - 1.4, 0);
    this.group.add(chandelier);
    const chandLight = new THREE.PointLight(0xffe8b0, 1.4, 11, 2.0);
    chandLight.position.set(0, h - 1.8, 0);
    this.group.add(chandLight);

    // Framed portraits on walls — more for the larger room.
    makeFramedPicture(this.group, -hw, 3.6, -4.0, 1.1, 1.5, 1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, -hw, 3.6, 4.0, 1.1, 1.5, 1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, hw, 3.6, -4.0, 1.1, 1.5, -1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, hw, 3.6, 4.0, 1.1, 1.5, -1, 0x3a2814, 0xa08838);

    // Wall sconces with brass glow — more along longer walls.
    for (const wz of [-6.0, -3.0, 0, 3.0, 6.0]) {
      makeSconce(this.group, -hw + 0.12, 3.0, wz, 1, 0xffe0a0, 0.6, 4);
      makeSconce(this.group, hw - 0.12, 3.0, wz, -1, 0xffe0a0, 0.6, 4);
    }

    // Soft patterned rug — proportionally larger.
    makeRug(this.group, 0, 0, 7.0, 13.0, 0x382820, 0x503830);

    // Additional furniture: bookshelves on the north wall flanking the fireplace.
    makeBookshelf(this.group, -hw + 0.3, -hd + 0.3, 1.8, 3.0, 1, 0x3a2414, this.bounds);
    makeBookshelf(this.group, hw - 0.3, -hd + 0.3, 1.8, 3.0, 1, 0x3a2414, this.bounds);

    // Armchairs near the fireplace.
    makeArmchair(this.group, -4.5, -hd + 3.0, 0x503830, this.bounds);
    makeArmchair(this.group, 4.5, -hd + 3.0, 0x503830, this.bounds);
    // Armchairs at the south end.
    makeArmchair(this.group, -hw + 2.0, hd - 2.5, 0x503830, this.bounds);
    makeArmchair(this.group, hw - 2.0, hd - 2.5, 0x503830, this.bounds);

    // Side tables beside south armchairs.
    this.group.add(makeBox(0.55, 0.6, 0.55, new THREE.Vector3(-hw + 3.2, 0.3, hd - 2.5), 'wood_dark'));
    this.bounds.push(aabbFromCenter(-hw + 3.2, 0.3, hd - 2.5, 0.3, 0.3, 0.3));
    this.group.add(makeBox(0.55, 0.6, 0.55, new THREE.Vector3(hw - 3.2, 0.3, hd - 2.5), 'wood_dark'));
    this.bounds.push(aabbFromCenter(hw - 3.2, 0.3, hd - 2.5, 0.3, 0.3, 0.3));

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    makeExitDoor(this.group, 0, hd - 0.05, 1.6, 2.5, -1, 0x3a2418, 0xb09848);
    this.triggerBoxes.push({
      id: 'exit_to_campus',
      box: aabbFromCenter(0, 1.0, hd - 0.25, 1.4, 1.2, 0.35),
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
    if (this.fireGlow) this.fireGlow.intensity = 0.75 + Math.sin(this.time * 9) * 0.05;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
