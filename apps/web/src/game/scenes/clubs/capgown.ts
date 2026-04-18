import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeFireplace, makeDiningTable, makeSconce,
  makeRug, makeExitDoor, makeFramedPicture,
} from './_shared';

/**
 * CAP AND GOWN INTERIOR — Great Hall with a hammerbeam/trussed oak ceiling,
 * stone Tudor-arched fireplace, oak linenfold paneling, stone-mullioned
 * leaded-glass windows with heraldic stained glass. The most "haunted
 * chapel" interior on Prospect — ideal for horror.
 */
export class CapGownInterior implements GameScene {
  readonly name = 'capgown';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 3.0);

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

    this.bounds = buildShell(this.group, w, h, d, { floor: 0x2a1a10, ceiling: 0x1a1416, walls: 0x524840 });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Oak linenfold panelling lower half.
    for (const zz of [-hd + 0.04, hd - 0.04]) {
      for (let px = -hw + 0.6; px <= hw - 0.6; px += 1.2) {
        this.group.add(makeBox(1.0, 1.6, 0.05, new THREE.Vector3(px, 0.8, zz), 0x3a2814));
        // Linenfold "folds" — raised vertical strips.
        this.group.add(makeBox(0.08, 1.2, 0.03, new THREE.Vector3(px, 0.8, zz + (zz < 0 ? 0.04 : -0.04)), 0x5a3e20));
      }
    }

    // HAMMERBEAM TRUSSES — the defining feature. Four trusses spanning the hall.
    const trussColor = 0x1a0c06;
    for (const tx of [-3.5, -1.0, 1.5, 3.8]) {
      // Main beam arching across.
      this.group.add(makeBox(0.25, 0.28, d - 0.2, new THREE.Vector3(tx, h - 0.15, 0), trussColor));
      // Hammer beams (short horizontal "arms" projecting from the walls).
      this.group.add(makeBox(0.5, 0.22, 0.22, new THREE.Vector3(tx, h - 0.9, -hd + 0.35), trussColor));
      this.group.add(makeBox(0.5, 0.22, 0.22, new THREE.Vector3(tx, h - 0.9, hd - 0.35), trussColor));
      // Diagonal brace running up to the main beam.
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 1.2, 0.15),
        new THREE.MeshLambertMaterial({ color: trussColor, flatShading: true }),
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

    // Stone-mullioned leaded-glass windows with stained-glass shields.
    for (const wz of [-3.0, -1.0, 1.5, 3.3]) {
      // Mullion frame.
      this.group.add(makeBox(0.08, 2.0, 0.15, new THREE.Vector3(hw - 0.04, 2.0, wz), 0x5e5044));
      // Pane.
      this.group.add(makeEmissive(0.15, 1.8, 0.05, new THREE.Vector3(hw - 0.06, 2.0, wz - 0.4), 0x3a4820));
      this.group.add(makeEmissive(0.15, 1.8, 0.05, new THREE.Vector3(hw - 0.06, 2.0, wz + 0.4), 0x4a3020));
      // Heraldic stained-glass shield.
      this.group.add(makeEmissive(0.35, 0.45, 0.05, new THREE.Vector3(hw - 0.06, 3.2, wz), 0xc02a2a));
    }
    for (const wz of [-3.0, -1.0, 1.5, 3.3]) {
      this.group.add(makeBox(0.08, 2.0, 0.15, new THREE.Vector3(-hw + 0.04, 2.0, wz), 0x5e5044));
      this.group.add(makeEmissive(0.15, 1.8, 0.05, new THREE.Vector3(-hw + 0.06, 2.0, wz - 0.4), 0x3a4820));
      this.group.add(makeEmissive(0.15, 1.8, 0.05, new THREE.Vector3(-hw + 0.06, 2.0, wz + 0.4), 0x4a3020));
      this.group.add(makeEmissive(0.35, 0.45, 0.05, new THREE.Vector3(-hw + 0.06, 3.2, wz), 0x2a4ac0));
    }

    // Long refectory table.
    makeDiningTable(this.group, 0, 0, 6.2, 1.2, 0x2a180c, 0x140802, this.bounds);

    // Iron chandelier (dark metal hoop with candle-lit bulbs).
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.06, 6, 16),
      new THREE.MeshLambertMaterial({ color: 0x1a0e06, flatShading: true }),
    );
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(0, h - 1.2, 0);
    this.group.add(hoop);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffcc80 }),
      );
      bulb.position.set(Math.cos(angle) * 0.9, h - 1.15, Math.sin(angle) * 0.9);
      this.group.add(bulb);
    }
    const chandLight = new THREE.PointLight(0xffb870, 1.3, 8, 2.0);
    chandLight.position.set(0, h - 1.4, 0);
    this.group.add(chandLight);

    // Sconces.
    for (const wz of [-2.5, 2.5]) {
      makeSconce(this.group, -hw + 0.1, 2.5, wz, 1, 0xff9a60, 0.6, 4);
      makeSconce(this.group, hw - 0.1, 2.5, wz, -1, 0xff9a60, 0.6, 4);
    }

    // Dark heraldic portrait frames.
    makeFramedPicture(this.group, -hw, 3.8, 0, 1.1, 1.4, 1, 0x2a1810, 0x140802);
    makeFramedPicture(this.group, hw, 3.8, 0, 1.1, 1.4, -1, 0x2a1810, 0x140802);

    makeRug(this.group, 0, 0, 3.8, 6.8, 0x3a1a1a, 0x5a2a28);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.3, -1, 0x1a0e06, 0x3a2a1a);
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
    if (this.fireGlow) this.fireGlow.intensity = 0.85 + Math.sin(this.time * 10) * 0.05;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
