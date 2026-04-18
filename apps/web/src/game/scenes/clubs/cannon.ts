import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeFireplace, makeDiningTable, makeSconce,
  makeRug, makeExitDoor, makeWindow, makeFramedPicture,
} from './_shared';

/**
 * CANNON DIAL ELM INTERIOR — Collegiate Gothic main hall. Oak wainscoting,
 * exposed wood ceiling beams, stone fireplace, leaded-glass windows. Three
 * heraldic shields over the fireplace for the three predecessor clubs
 * (Cannon, Dial, Elm).
 */
export class CannonInterior implements GameScene {
  readonly name = 'cannon';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 2.8);

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
    this.bounds = buildShell(this.group, w, h, d, { floor: 0x2a1e12, ceiling: 0x302828, walls: 0x6a5e52 });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Oak wainscoting lower band.
    const dadoY = 1.6;
    for (const zz of [-hd + 0.05, hd - 0.05]) {
      this.group.add(makeBox(w - 0.05, dadoY, 0.06, new THREE.Vector3(0, dadoY / 2, zz), 0x3a2416));
    }
    for (const xx of [-hw + 0.05, hw - 0.05]) {
      this.group.add(makeBox(0.06, dadoY, d - 0.05, new THREE.Vector3(xx, dadoY / 2, 0), 0x3a2416));
    }

    // Exposed wood ceiling beams running across the hall.
    for (const bx of [-3.8, -1.8, 0.2, 2.2, 4.0]) {
      this.group.add(makeBox(0.18, 0.22, d - 0.2, new THREE.Vector3(bx, h - 0.12, 0), 0x1a0e06));
    }

    // North wall fireplace.
    const fp = makeFireplace(this.group, 0, -hd + 0.5, 1, 0x504a44, true);
    this.fireGlow = fp.glow;
    // Three heraldic shields (Cannon / Dial / Elm).
    for (const [i, sx] of [[-1, -1.1], [0, 0], [1, 1.1]] as Array<[number, number]>) {
      this.group.add(makeBox(0.55, 0.75, 0.08, new THREE.Vector3(sx, 2.8, -hd + 0.1), i === 0 ? 0x6a2818 : 0x183a2a));
      this.group.add(makeBox(0.36, 0.5, 0.03, new THREE.Vector3(sx, 2.85, -hd + 0.06), 0xb08848));
    }

    // Leaded-glass windows on east wall (three panels).
    for (const wz of [-2.4, 0, 2.4]) {
      makeWindow(this.group, hw, 2.6, wz, 1.1, 1.7, -1, 0x3a3020, 0x1a0e06);
    }
    // West wall (two panels flanking a parapet-style niche).
    for (const wz of [-2.0, 2.0]) {
      makeWindow(this.group, -hw, 2.6, wz, 1.1, 1.7, 1, 0x3a3020, 0x1a0e06);
    }

    // Dining table.
    makeDiningTable(this.group, 0, 0, 5.5, 1.2, 0x2e1a0e, 0x1a0e06, this.bounds);

    // Sconces.
    makeSconce(this.group, -2.5, 2.6, -hd + 0.12, 1, 0xffd088, 0.8, 5);
    makeSconce(this.group, 2.5, 2.6, -hd + 0.12, 1, 0xffd088, 0.8, 5);
    makeSconce(this.group, -hw + 0.12, 2.4, -1.5, 1, 0xffd088, 0.7, 4);
    makeSconce(this.group, -hw + 0.12, 2.4, 1.5, 1, 0xffd088, 0.7, 4);
    makeSconce(this.group, hw - 0.12, 2.4, -1.5, -1, 0xffd088, 0.7, 4);
    makeSconce(this.group, hw - 0.12, 2.4, 1.5, -1, 0xffd088, 0.7, 4);

    // Heraldry frames on west wall.
    makeFramedPicture(this.group, -hw, 2.6, 0, 1.0, 1.4, 1, 0x3a2814, 0x0a0604);

    makeRug(this.group, 0, 0, 3.5, 6.2, 0x3a1a20, 0x5a2a30);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.3, -1);
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
    if (this.fireGlow) this.fireGlow.intensity = 0.85 + Math.sin(this.time * 10) * 0.06;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
