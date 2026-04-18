import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeFireplace, makeDiningTable, makeSconce,
  makeArmchair, makeBookshelf, makeRug, makeExitDoor, makeFramedPicture,
  addAbandonment,
} from './_shared';

/**
 * CLOISTER INN INTERIOR — Klauder's Collegiate Gothic dining hall. Hammerbeam
 * or exposed timber truss ceiling, stone Tudor-arched fireplace with carved
 * overmantel, stained-glass heraldic shields. Carved stone corbels. The
 * quietest, most "medieval church" atmosphere of the Gothic clubs.
 *
 * Dimensions: 22w × 18d × 6h (doubled from 12×9×4.8).
 */
export class CloisterInterior implements GameScene {
  readonly name = 'cloister';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.cloister;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // Stone interior — cooler, more monastic.
    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'wallpaper' });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Stone floor pattern (darker grout lines in a grid).
    for (let bx = -hw + 1; bx < hw; bx += 1.0) {
      this.group.add(makeBox(0.04, 0.005, d - 0.1, new THREE.Vector3(bx, 0.015, 0), 0x1a1218));
    }
    for (let bz = -hd + 1; bz < hd; bz += 1.0) {
      this.group.add(makeBox(w - 0.1, 0.005, 0.04, new THREE.Vector3(0, 0.015, bz), 0x1a1218));
    }

    // Hammerbeam trusses — 6 trusses spread across 22w room.
    const trussColor = 'wood_dark' as const;
    for (const tx of [-8.5, -5.0, -1.5, 2.0, 5.5, 9.0]) {
      this.group.add(makeBox(0.3, 0.32, d - 0.2, new THREE.Vector3(tx, h - 0.16, 0), trussColor));
      // Stone corbels projecting from wall at hammer-beam height.
      this.group.add(makeBox(0.4, 0.35, 0.4, new THREE.Vector3(tx, h - 1.0, -hd + 0.2), 0x7a7078));
      this.group.add(makeBox(0.4, 0.35, 0.4, new THREE.Vector3(tx, h - 1.0, hd - 0.2), 0x7a7078));
      // Hammer beams.
      this.group.add(makeBox(0.7, 0.24, 0.24, new THREE.Vector3(tx, h - 0.95, -hd + 0.45), trussColor));
      this.group.add(makeBox(0.7, 0.24, 0.24, new THREE.Vector3(tx, h - 0.95, hd - 0.45), trussColor));
      // Queen posts.
      this.group.add(makeBox(0.16, 0.9, 0.16, new THREE.Vector3(tx, h - 0.55, -hd + 0.8), trussColor));
      this.group.add(makeBox(0.16, 0.9, 0.16, new THREE.Vector3(tx, h - 0.55, hd - 0.8), trussColor));
    }
    // Ridge beam.
    this.group.add(makeBox(0.2, 0.22, d - 0.2, new THREE.Vector3(0, h - 0.12, 0), trussColor));

    // North wall: stone Tudor-arched fireplace with carved overmantel.
    const fp = makeFireplace(this.group, 0, -hd + 0.6, 1, 0x586068, true);
    this.fireGlow = fp.glow;
    // Carved overmantel — tall stone panel with heraldic carving.
    this.group.add(makeBox(3.2, 2.0, 0.22, new THREE.Vector3(0, 3.6, -hd + 0.28), 0x6a6a70));
    // Central shield.
    this.group.add(makeBox(0.7, 0.9, 0.08, new THREE.Vector3(0, 3.6, -hd + 0.14), 0x2a1a0e));
    this.group.add(makeBox(0.5, 0.65, 0.03, new THREE.Vector3(0, 3.65, -hd + 0.1), 0xa08830));
    // Stone tracery strips flanking the shield.
    this.group.add(makeBox(0.15, 1.6, 0.08, new THREE.Vector3(-1.2, 3.6, -hd + 0.14), 0x78787e));
    this.group.add(makeBox(0.15, 1.6, 0.08, new THREE.Vector3(1.2, 3.6, -hd + 0.14), 0x78787e));

    // Gothic-traceried windows on side walls — 6 per side for 18d depth.
    for (const wz of [-6.5, -3.5, -0.5, 2.5, 5.0, 7.5]) {
      // East wall.
      this.group.add(makeEmissive(1.1, 2.4, 0.05, new THREE.Vector3(hw - 0.04, 2.8, wz), 0x1a2a3a));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(hw - 0.06, 2.2, wz), 0x1a0e06));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(hw - 0.06, 3.4, wz), 0x1a0e06));
      this.group.add(makeBox(0.05, 2.4, 0.08, new THREE.Vector3(hw - 0.06, 2.8, wz), 0x1a0e06));
      // Stained-glass shield insert.
      this.group.add(makeEmissive(0.4, 0.5, 0.05, new THREE.Vector3(hw - 0.06, 2.8, wz), 0xbf1818));
    }
    for (const wz of [-6.5, -3.5, -0.5, 2.5, 5.0, 7.5]) {
      // West wall.
      this.group.add(makeEmissive(1.1, 2.4, 0.05, new THREE.Vector3(-hw + 0.04, 2.8, wz), 0x1a2a3a));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(-hw + 0.06, 2.2, wz), 0x1a0e06));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(-hw + 0.06, 3.4, wz), 0x1a0e06));
      this.group.add(makeBox(0.05, 2.4, 0.08, new THREE.Vector3(-hw + 0.06, 2.8, wz), 0x1a0e06));
      this.group.add(makeEmissive(0.4, 0.5, 0.05, new THREE.Vector3(-hw + 0.06, 2.8, wz), 0x1830bf));
    }

    // Long refectory table — proportional to 22w room.
    makeDiningTable(this.group, 0, 0, 10.0, 1.3, 0x1f120a, 0x0e0604, this.bounds);

    // Armchairs near the fireplace.
    makeArmchair(this.group, -3.5, -hd + 2.5, 0x3a2018, this.bounds);
    makeArmchair(this.group, 3.5, -hd + 2.5, 0x3a2018, this.bounds);
    // Armchairs at south end.
    makeArmchair(this.group, -hw + 1.5, hd - 2.5, 0x3a2018, this.bounds);
    makeArmchair(this.group, hw - 1.5, hd - 2.5, 0x3a2018, this.bounds);

    // Bookshelves in south corners.
    makeBookshelf(this.group, -hw + 0.04, hd - 0.05, 3.0, h - 0.5, 1, 0x1a0e06, this.bounds);
    makeBookshelf(this.group, hw - 0.04, hd - 0.05, 3.0, h - 0.5, -1, 0x1a0e06, this.bounds);

    // Chandeliers: three iron hoops over the table — spread along 22w.
    for (const hx of [-4.0, 0, 4.0]) {
      const hoop = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.05, 6, 14),
        new THREE.MeshLambertMaterial({ color: 0x0a0402, flatShading: true }),
      );
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(hx, h - 1.3, 0);
      this.group.add(hoop);
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffb060 }),
        );
        bulb.position.set(hx + Math.cos(angle) * 0.7, h - 1.3, Math.sin(angle) * 0.7);
        this.group.add(bulb);
      }
      const light = new THREE.PointLight(0xffa860, 0.9, 7, 2);
      light.position.set(hx, h - 1.5, 0);
      this.group.add(light);
    }

    // Sconces — more along the longer walls.
    makeSconce(this.group, -3.0, 2.8, -hd + 0.1, 1, 0xffb060, 0.7, 4.5);
    makeSconce(this.group, 3.0, 2.8, -hd + 0.1, 1, 0xffb060, 0.7, 4.5);
    for (const wz of [-5.0, -1.0, 3.0, 6.5]) {
      makeSconce(this.group, -hw + 0.1, 2.6, wz, 1, 0xffb060, 0.5, 4);
      makeSconce(this.group, hw - 0.1, 2.6, wz, -1, 0xffb060, 0.5, 4);
    }

    // Dark gothic portraits on walls — more for longer walls.
    makeFramedPicture(this.group, -hw, 3.8, -4.0, 1.0, 1.3, 1, 0x2a1810, 0x140802);
    makeFramedPicture(this.group, -hw, 3.8, 2.0, 1.0, 1.3, 1, 0x2a1810, 0x140802);
    makeFramedPicture(this.group, hw, 3.8, -4.0, 1.0, 1.3, -1, 0x2a1810, 0x140802);
    makeFramedPicture(this.group, hw, 3.8, 2.0, 1.0, 1.3, -1, 0x2a1810, 0x140802);

    makeRug(this.group, 0, 0, 5.5, 9.5, 0x4a2018, 0x6a2820);

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.4, -1, 0x1a0e06, 0x3a3a38);
    this.triggerBoxes.push({
      id: 'exit_to_campus',
      box: aabbFromCenter(0, 1.0, hd - 0.5, 3.0, 1.2, 0.8),
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
    if (this.fireGlow) this.fireGlow.intensity = 0.85 + Math.sin(this.time * 10) * 0.06;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
