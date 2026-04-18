import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeFireplace, makeDiningTable, makeSconce,
  makeRug, makeExitDoor, makeFramedPicture,
  makeBookshelf, makeArmchair, addAbandonment,
} from './_shared';

/**
 * CAP AND GOWN INTERIOR — Great Hall with a hammerbeam/trussed oak ceiling,
 * stone Tudor-arched fireplace, oak linenfold paneling, stone-mullioned
 * leaded-glass windows with heraldic stained glass. The most "haunted
 * chapel" interior on Prospect — ideal for horror.
 *
 * Dimensions: 20w x 18d x 6h
 */
export class CapGownInterior implements GameScene {
  readonly name = 'capgown';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.capgown;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'wallpaper' });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Oak linenfold panelling lower half — scaled for wider and deeper walls.
    for (const zz of [-hd + 0.04, hd - 0.04]) {
      for (let px = -hw + 0.6; px <= hw - 0.6; px += 1.2) {
        this.group.add(makeBox(1.0, 1.6, 0.05, new THREE.Vector3(px, 0.8, zz), 'wood_panel'));
        // Linenfold "folds" — raised vertical strips.
        this.group.add(makeBox(0.08, 1.2, 0.03, new THREE.Vector3(px, 0.8, zz + (zz < 0 ? 0.04 : -0.04)), 0x5a3e20));
      }
    }
    for (const xx of [-hw + 0.04, hw - 0.04]) {
      for (let pz = -hd + 0.6; pz <= hd - 0.6; pz += 1.2) {
        this.group.add(makeBox(0.05, 1.6, 1.0, new THREE.Vector3(xx, 0.8, pz), 'wood_panel'));
        this.group.add(makeBox(0.03, 1.2, 0.08, new THREE.Vector3(xx + (xx < 0 ? 0.04 : -0.04), 0.8, pz), 0x5a3e20));
      }
    }

    // HAMMERBEAM TRUSSES — 6 trusses spanning the wider hall.
    const trussColor = 'wood_dark' as const;
    for (const tx of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) {
      // Main beam arching across.
      this.group.add(makeBox(0.25, 0.28, d - 0.2, new THREE.Vector3(tx, h - 0.15, 0), trussColor));
      // Hammer beams (short horizontal "arms" projecting from the walls).
      this.group.add(makeBox(0.5, 0.22, 0.22, new THREE.Vector3(tx, h - 0.9, -hd + 0.35), trussColor));
      this.group.add(makeBox(0.5, 0.22, 0.22, new THREE.Vector3(tx, h - 0.9, hd - 0.35), trussColor));
      // Diagonal brace running up to the main beam.
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 1.2, 0.15),
        new THREE.MeshLambertMaterial({ color: 0x1a0c06, flatShading: true }),
      );
      brace.position.set(tx, h - 0.5, -hd + 0.6);
      brace.rotation.x = -0.5;
      this.group.add(brace);
      const brace2 = brace.clone();
      brace2.position.set(tx, h - 0.5, hd - 0.6);
      brace2.rotation.x = 0.5;
      this.group.add(brace2);
    }

    // North wall: stone Tudor-arched fireplace.
    const fp = makeFireplace(this.group, 0, -hd + 0.5, 1, 0x504a42, true);
    this.fireGlow = fp.glow;
    // Carved stone label above fireplace with a carved crest.
    this.group.add(makeBox(3.0, 0.45, 0.25, new THREE.Vector3(0, 2.5, -hd + 0.3), 0x68604e));
    this.group.add(makeBox(0.7, 0.9, 0.08, new THREE.Vector3(0, 3.3, -hd + 0.1), 0x2a1a0e));

    // Stone-mullioned leaded-glass windows with stained-glass shields — 6 per side.
    for (const wz of [-7.0, -4.5, -2.0, 0.5, 3.0, 6.0]) {
      // East wall.
      this.group.add(makeBox(0.08, 2.0, 0.15, new THREE.Vector3(hw - 0.04, 2.2, wz), 0x5e5044));
      this.group.add(makeEmissive(0.15, 1.8, 0.05, new THREE.Vector3(hw - 0.06, 2.2, wz - 0.4), 0x3a4820));
      this.group.add(makeEmissive(0.15, 1.8, 0.05, new THREE.Vector3(hw - 0.06, 2.2, wz + 0.4), 0x4a3020));
      this.group.add(makeEmissive(0.35, 0.45, 0.05, new THREE.Vector3(hw - 0.06, 3.4, wz), 0xc02a2a));
    }
    for (const wz of [-7.0, -4.5, -2.0, 0.5, 3.0, 6.0]) {
      // West wall.
      this.group.add(makeBox(0.08, 2.0, 0.15, new THREE.Vector3(-hw + 0.04, 2.2, wz), 0x5e5044));
      this.group.add(makeEmissive(0.15, 1.8, 0.05, new THREE.Vector3(-hw + 0.06, 2.2, wz - 0.4), 0x3a4820));
      this.group.add(makeEmissive(0.15, 1.8, 0.05, new THREE.Vector3(-hw + 0.06, 2.2, wz + 0.4), 0x4a3020));
      this.group.add(makeEmissive(0.35, 0.45, 0.05, new THREE.Vector3(-hw + 0.06, 3.4, wz), 0x2a4ac0));
    }

    // Long refectory table — proportionally scaled for the larger room.
    makeDiningTable(this.group, 0, 0, 11.0, 1.3, 0x2a180c, 0x140802, this.bounds);

    // Iron chandelier (dark metal hoop with candle-lit bulbs) — larger for bigger room.
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.08, 6, 16),
      new THREE.MeshLambertMaterial({ color: 0x1a0e06, flatShading: true }),
    );
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(0, h - 1.4, 0);
    this.group.add(hoop);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffcc80 }),
      );
      bulb.position.set(Math.cos(angle) * 1.2, h - 1.35, Math.sin(angle) * 1.2);
      this.group.add(bulb);
    }
    const chandLight = new THREE.PointLight(0xffb870, 1.3, 10, 2.0);
    chandLight.position.set(0, h - 1.6, 0);
    this.group.add(chandLight);

    // Sconces — more along the longer walls.
    for (const wz of [-6.0, -3.0, 0, 3.0, 6.0]) {
      makeSconce(this.group, -hw + 0.1, 2.8, wz, 1, 0xff9a60, 0.6, 4);
      makeSconce(this.group, hw - 0.1, 2.8, wz, -1, 0xff9a60, 0.6, 4);
    }

    // Dark heraldic portrait frames — more for the larger room.
    makeFramedPicture(this.group, -hw, 3.8, -4.5, 1.1, 1.4, 1, 0x2a1810, 0x140802);
    makeFramedPicture(this.group, -hw, 3.8, 4.5, 1.1, 1.4, 1, 0x2a1810, 0x140802);
    makeFramedPicture(this.group, hw, 3.8, -4.5, 1.1, 1.4, -1, 0x2a1810, 0x140802);
    makeFramedPicture(this.group, hw, 3.8, 4.5, 1.1, 1.4, -1, 0x2a1810, 0x140802);

    makeRug(this.group, 0, 0, 6.5, 12.0, 0x3a1a1a, 0x5a2a28);

    // Additional furniture: bookshelves flanking the fireplace on the north wall.
    makeBookshelf(this.group, -hw + 0.3, -hd + 0.3, 1.6, 2.8, 1, 0x2a1a0e, this.bounds);
    makeBookshelf(this.group, hw - 0.3, -hd + 0.3, 1.6, 2.8, 1, 0x2a1a0e, this.bounds);

    // Armchairs flanking the fireplace.
    makeArmchair(this.group, -4.0, -hd + 2.5, 0x3a1a1a, this.bounds);
    makeArmchair(this.group, 4.0, -hd + 2.5, 0x3a1a1a, this.bounds);

    // Side tables next to the armchairs.
    this.group.add(makeBox(0.5, 0.55, 0.5, new THREE.Vector3(-5.0, 0.275, -hd + 2.5), 'wood_dark'));
    this.bounds.push(aabbFromCenter(-5.0, 0.275, -hd + 2.5, 0.28, 0.28, 0.28));
    this.group.add(makeBox(0.5, 0.55, 0.5, new THREE.Vector3(5.0, 0.275, -hd + 2.5), 'wood_dark'));
    this.bounds.push(aabbFromCenter(5.0, 0.275, -hd + 2.5, 0.28, 0.28, 0.28));

    // Bookshelf on the south wall beside the exit.
    makeBookshelf(this.group, -5.0, hd - 0.3, 1.8, 2.6, -1, 0x2a1a0e, this.bounds);

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.3, -1, 0x1a0e06, 0x3a2a1a);
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
    if (this.fireGlow) this.fireGlow.intensity = 0.85 + Math.sin(this.time * 10) * 0.05;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
