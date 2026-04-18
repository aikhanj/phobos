import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeFireplace, makeDiningTable, makeSconce,
  makeRug, makeExitDoor, makeWindow, makeFramedPicture,
  makeBookshelf, makeArmchair, addAbandonment,
} from './_shared';

/**
 * CANNON DIAL ELM INTERIOR — Collegiate Gothic main hall. Oak wainscoting,
 * exposed wood ceiling beams, stone fireplace, leaded-glass windows. Three
 * heraldic shields over the fireplace for the three predecessor clubs
 * (Cannon, Dial, Elm).
 *
 * Dimensions: 22w x 16d x 5.5h
 */
export class CannonInterior implements GameScene {
  readonly name = 'cannon';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.cannon;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // Stone-and-panel shell.
    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'wallpaper' });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Oak wainscoting lower band.
    const dadoY = 1.6;
    for (const zz of [-hd + 0.05, hd - 0.05]) {
      this.group.add(makeBox(w - 0.05, dadoY, 0.06, new THREE.Vector3(0, dadoY / 2, zz), 'wood_panel'));
    }
    for (const xx of [-hw + 0.05, hw - 0.05]) {
      this.group.add(makeBox(0.06, dadoY, d - 0.05, new THREE.Vector3(xx, dadoY / 2, 0), 'wood_panel'));
    }

    // Exposed wood ceiling beams running across the hall — 7 beams for wider room.
    for (const bx of [-8.0, -5.5, -3.0, 0, 3.0, 5.5, 8.0]) {
      this.group.add(makeBox(0.18, 0.22, d - 0.2, new THREE.Vector3(bx, h - 0.12, 0), 'wood_dark'));
    }
    // Cross beams.
    this.group.add(makeBox(w - 0.2, 0.18, 0.18, new THREE.Vector3(0, h - 0.35, -hd * 0.35), 'wood_dark'));
    this.group.add(makeBox(w - 0.2, 0.18, 0.18, new THREE.Vector3(0, h - 0.35, hd * 0.35), 'wood_dark'));

    // North wall fireplace.
    const fp = makeFireplace(this.group, 0, -hd + 0.5, 1, 0x504a44, true);
    this.fireGlow = fp.glow;
    // Three heraldic shields (Cannon / Dial / Elm).
    for (const [i, sx] of [[-1, -1.1], [0, 0], [1, 1.1]] as Array<[number, number]>) {
      this.group.add(makeBox(0.55, 0.75, 0.08, new THREE.Vector3(sx, 2.8, -hd + 0.1), i === 0 ? 0x6a2818 : 0x183a2a));
      this.group.add(makeBox(0.36, 0.5, 0.03, new THREE.Vector3(sx, 2.85, -hd + 0.06), 0xb08848));
    }

    // Leaded-glass windows — east wall (5 panels, evenly spaced).
    for (const wz of [-5.5, -2.8, 0, 2.8, 5.5]) {
      makeWindow(this.group, hw, 2.6, wz, 1.1, 1.7, -1, 0x3a3020, 0x1a0e06);
    }
    // West wall (4 panels).
    for (const wz of [-4.5, -1.5, 1.5, 4.5]) {
      makeWindow(this.group, -hw, 2.6, wz, 1.1, 1.7, 1, 0x3a3020, 0x1a0e06);
    }

    // Dining table — proportionally longer.
    makeDiningTable(this.group, 0, 0, 10.0, 1.3, 0x2e1a0e, 0x1a0e06, this.bounds);

    // Sconces — more along longer walls.
    makeSconce(this.group, -2.5, 2.6, -hd + 0.12, 1, 0xffd088, 0.8, 5);
    makeSconce(this.group, 2.5, 2.6, -hd + 0.12, 1, 0xffd088, 0.8, 5);
    makeSconce(this.group, -hw + 0.12, 2.4, -4.5, 1, 0xffd088, 0.7, 4);
    makeSconce(this.group, -hw + 0.12, 2.4, -1.5, 1, 0xffd088, 0.7, 4);
    makeSconce(this.group, -hw + 0.12, 2.4, 1.5, 1, 0xffd088, 0.7, 4);
    makeSconce(this.group, -hw + 0.12, 2.4, 4.5, 1, 0xffd088, 0.7, 4);
    makeSconce(this.group, hw - 0.12, 2.4, -4.5, -1, 0xffd088, 0.7, 4);
    makeSconce(this.group, hw - 0.12, 2.4, -1.5, -1, 0xffd088, 0.7, 4);
    makeSconce(this.group, hw - 0.12, 2.4, 1.5, -1, 0xffd088, 0.7, 4);
    makeSconce(this.group, hw - 0.12, 2.4, 4.5, -1, 0xffd088, 0.7, 4);

    // Heraldry frames on west wall — two now.
    makeFramedPicture(this.group, -hw, 2.6, -3.0, 1.0, 1.4, 1, 0x3a2814, 0x0a0604);
    makeFramedPicture(this.group, -hw, 2.6, 3.0, 1.0, 1.4, 1, 0x3a2814, 0x0a0604);
    // East wall portraits.
    makeFramedPicture(this.group, hw, 2.6, -4.0, 0.9, 1.3, -1, 0x3a2814, 0x0a0604);
    makeFramedPicture(this.group, hw, 2.6, 4.0, 0.9, 1.3, -1, 0x3a2814, 0x0a0604);

    makeRug(this.group, 0, 0, 6.0, 11.0, 0x3a1a20, 0x5a2a30);

    // Additional furniture: bookshelves flanking the fireplace on the north wall.
    makeBookshelf(this.group, -hw + 0.3, -hd + 0.3, 1.8, 2.6, 1, 0x2a180c, this.bounds);
    makeBookshelf(this.group, hw - 0.3, -hd + 0.3, 1.8, 2.6, 1, 0x2a180c, this.bounds);

    // Armchairs at the south end of the room.
    makeArmchair(this.group, -4.0, hd - 3.0, 0x3a2016, this.bounds);
    makeArmchair(this.group, 4.0, hd - 3.0, 0x3a2016, this.bounds);

    // Side tables near armchairs.
    this.group.add(makeBox(0.5, 0.55, 0.5, new THREE.Vector3(-5.0, 0.275, hd - 3.0), 'wood_dark'));
    this.bounds.push(aabbFromCenter(-5.0, 0.275, hd - 3.0, 0.28, 0.28, 0.28));
    this.group.add(makeBox(0.5, 0.55, 0.5, new THREE.Vector3(5.0, 0.275, hd - 3.0), 'wood_dark'));
    this.bounds.push(aabbFromCenter(5.0, 0.275, hd - 3.0, 0.28, 0.28, 0.28));

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.3, -1);
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
    if (this.fireGlow) this.fireGlow.intensity = 0.85 + Math.sin(this.time * 10) * 0.06;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
