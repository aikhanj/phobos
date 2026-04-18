import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce, makePilaster,
  makeBookshelf, makeRug, makeExitDoor, makeFramedPicture,
} from './_shared';

/**
 * CHARTER CLUB INTERIOR — Cram's rare Georgian building. Main dining room
 * with tall arched windows, classical pilasters, plaster cornice, marble
 * mantel fireplace. A wood-paneled library / taproom corner with built-in
 * bookcases. Formal Georgian palette: white, cream, deep red.
 */
export class CharterInterior implements GameScene {
  readonly name = 'charter';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 2.8);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.charter;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // Cream walls, parquet floor, warmer ceiling.
    this.bounds = buildShell(this.group, w, h, d, { floor: 0x5a3824, ceiling: 0xe8d8b4, walls: 0xeadaba });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Parquet seams.
    for (let zz = -hd + 0.5; zz < hd; zz += 1.0) {
      this.group.add(makeBox(w - 0.4, 0.005, 0.05, new THREE.Vector3(0, 0.015, zz), 0x3a2414));
    }

    // Classical pilasters on side walls.
    for (const wx of [-hw + 0.05, hw - 0.05]) {
      for (const wz of [-2.5, 0, 2.5]) {
        makePilaster(this.group, wx, wz, h, wx < 0 ? 1 : -1, 0xeadaba);
      }
    }

    // Plaster cornice.
    this.group.add(makeBox(w, 0.25, 0.15, new THREE.Vector3(0, h - 0.12, -hd + 0.1), 0xdcccaa));
    this.group.add(makeBox(w, 0.25, 0.15, new THREE.Vector3(0, h - 0.12, hd - 0.1), 0xdcccaa));
    this.group.add(makeBox(0.15, 0.25, d, new THREE.Vector3(-hw + 0.1, h - 0.12, 0), 0xdcccaa));
    this.group.add(makeBox(0.15, 0.25, d, new THREE.Vector3(hw - 0.1, h - 0.12, 0), 0xdcccaa));

    // Ceiling beams — light coffering.
    for (const bx of [-3, 0, 3]) {
      this.group.add(makeBox(0.18, 0.14, d - 0.2, new THREE.Vector3(bx, h - 0.1, 0), 0x8a7a54));
    }

    // North wall: marble mantel fireplace.
    const fpW = 2.2, fpH = 1.9, fpD = 0.4;
    this.group.add(makeBox(fpW, 0.3, fpD, new THREE.Vector3(0, fpH - 0.15, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(0.3, fpH, fpD, new THREE.Vector3(-fpW / 2 + 0.15, fpH / 2, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(0.3, fpH, fpD, new THREE.Vector3(fpW / 2 - 0.15, fpH / 2, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(fpW - 0.6, 0.18, fpD, new THREE.Vector3(0, 0.09, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeEmissive(fpW - 0.6, fpH - 0.4, 0.04, new THREE.Vector3(0, 0.18 + (fpH - 0.4) / 2, -hd + fpD - 0.15), 0x0a0604));
    this.group.add(makeEmissive(fpW - 0.9, 0.12, 0.22, new THREE.Vector3(0, 0.3, -hd + fpD - 0.22), 0xff7a28));
    this.fireGlow = new THREE.PointLight(0xff8040, 0.7, 5, 2.0);
    this.fireGlow.position.set(0, 0.8, -hd + 0.4);
    this.group.add(this.fireGlow);
    // Heraldic crest over the mantel.
    this.group.add(makeBox(0.6, 0.7, 0.04, new THREE.Vector3(0, 2.8, -hd + 0.06), 0x4a1818));
    this.group.add(makeBox(0.4, 0.5, 0.02, new THREE.Vector3(0, 2.85, -hd + 0.04), 0xa08838));

    // Arched windows — 4 total on east wall (one corner turns into a library nook).
    for (const wz of [-3.0, -0.8, 1.4]) {
      this.group.add(makeEmissive(1.1, 2.0, 0.04, new THREE.Vector3(hw - 0.04, 2.4, wz), 0x9c9066));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(hw - 0.06, 1.9, wz), 0x3a2a18));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(hw - 0.06, 2.9, wz), 0x3a2a18));
      this.group.add(makeBox(0.05, 2.0, 0.08, new THREE.Vector3(hw - 0.06, 2.4, wz), 0x3a2a18));
      // Arched top (semi-circle evocation via a thin plane).
      this.group.add(makeBox(1.15, 0.4, 0.08, new THREE.Vector3(hw - 0.06, 3.6, wz), 0x3a2a18));
    }
    for (const wz of [-3.0, -0.8, 1.4]) {
      this.group.add(makeEmissive(1.1, 2.0, 0.04, new THREE.Vector3(-hw + 0.04, 2.4, wz), 0x9c9066));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(-hw + 0.06, 1.9, wz), 0x3a2a18));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(-hw + 0.06, 2.9, wz), 0x3a2a18));
      this.group.add(makeBox(0.05, 2.0, 0.08, new THREE.Vector3(-hw + 0.06, 2.4, wz), 0x3a2a18));
      this.group.add(makeBox(1.15, 0.4, 0.08, new THREE.Vector3(-hw + 0.06, 3.6, wz), 0x3a2a18));
    }

    // Long formal dining table.
    makeDiningTable(this.group, 0, 0, 6.5, 1.3, 0x3a2214, 0x2a180c, this.bounds);

    // Library nook — built-in bookcases at the rear/south corner.
    makeBookshelf(this.group, hw - 0.04, hd - 2.2, 3.0, 3.5, -1, 0x2a1a0c, this.bounds);
    makeBookshelf(this.group, -hw + 0.04, hd - 2.2, 3.0, 3.5, 1, 0x2a1a0c, this.bounds);

    // Chandelier — brass with crystal evocation.
    const stem = makeBox(0.05, 1.2, 0.05, new THREE.Vector3(0, h - 0.6, 0), 0xb09848);
    this.group.add(stem);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xb09848, flatShading: true }),
    );
    body.position.set(0, h - 1.2, 0);
    this.group.add(body);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff0c8 }),
      );
      bulb.position.set(Math.cos(angle) * 0.5, h - 1.1, Math.sin(angle) * 0.5);
      this.group.add(bulb);
    }
    const chandLight = new THREE.PointLight(0xfff0c8, 1.3, 9, 2.0);
    chandLight.position.set(0, h - 1.4, 0);
    this.group.add(chandLight);

    // Sconces at pilasters.
    for (const wx of [-hw + 0.15, hw - 0.15]) {
      for (const wz of [-2.5, 0, 2.5]) {
        makeSconce(this.group, wx, 2.9, wz, wx < 0 ? 1 : -1, 0xffe0a0, 0.55, 4);
      }
    }

    // Framed portraits.
    makeFramedPicture(this.group, -hw, 3.7, -0.5, 1.1, 1.4, 1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, hw, 3.7, -0.5, 1.1, 1.4, -1, 0x3a2814, 0xa08838);

    makeRug(this.group, 0, 0, 3.8, 6.8, 0x4a1818, 0x6a2820);

    makeExitDoor(this.group, 0, hd - 0.05, 1.6, 2.5, -1, 0x3a2418, 0xb09848);
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
    if (this.fireGlow) this.fireGlow.intensity = 0.7 + Math.sin(this.time * 9) * 0.04;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
