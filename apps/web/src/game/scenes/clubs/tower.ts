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
 * TOWER CLUB INTERIOR — great hall with heavy timber trusses, oak panelling,
 * massive stone fireplace, leaded casement windows. The Tudor/Jacobean room
 * it's most visually known for.
 *
 * Dimensions: 20w x 16d x 6h
 */
export class TowerInterior implements GameScene {
  readonly name = 'tower';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.tower;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // Oak panelled walls (lower half darker, upper half lighter plaster).
    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'wallpaper' });

    // Lower dado band: darker oak panelling up to 1.4m.
    const dadoY = 1.4;
    this.group.add(makeBox(w - 0.05, dadoY, 0.06, new THREE.Vector3(0, dadoY / 2, -hd + 0.05), 'wood_panel'));
    this.group.add(makeBox(w - 0.05, dadoY, 0.06, new THREE.Vector3(0, dadoY / 2, hd - 0.05), 'wood_panel'));
    this.group.add(makeBox(0.06, dadoY, d - 0.05, new THREE.Vector3(-hw + 0.05, dadoY / 2, 0), 'wood_panel'));
    this.group.add(makeBox(0.06, dadoY, d - 0.05, new THREE.Vector3(hw - 0.05, dadoY / 2, 0), 'wood_panel'));

    // Ambient.
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Heavy timber ceiling trusses — 6 crossing beams for the wider room + king posts.
    const beamColor = 'wood_dark' as const;
    for (const bx of [-7.0, -4.2, -1.4, 1.4, 4.2, 7.0]) {
      this.group.add(makeBox(0.22, 0.3, d - 0.2, new THREE.Vector3(bx, h - 0.16, 0), beamColor));
    }
    // Two cross beams running width-wise.
    this.group.add(makeBox(w - 0.2, 0.2, 0.22, new THREE.Vector3(0, h - 0.55, -hd * 0.4), beamColor));
    this.group.add(makeBox(w - 0.2, 0.2, 0.22, new THREE.Vector3(0, h - 0.55, hd * 0.4), beamColor));
    // King posts.
    for (const bx of [-7.0, -4.2, -1.4, 1.4, 4.2, 7.0]) {
      this.group.add(makeBox(0.15, 0.7, 0.15, new THREE.Vector3(bx, h - 0.55, -hd * 0.4), beamColor));
      this.group.add(makeBox(0.15, 0.7, 0.15, new THREE.Vector3(bx, h - 0.55, hd * 0.4), beamColor));
    }

    // North wall: massive stone fireplace with Tudor arch.
    const fp = makeFireplace(this.group, 0, -hd + 0.5, 1, 0x5a524a, true);
    this.fireGlow = fp.glow;
    // Heraldic shield over mantel.
    this.group.add(makeBox(0.7, 0.9, 0.08, new THREE.Vector3(0, 2.7, -hd + 0.1), 0x3a1818));
    this.group.add(makeBox(0.5, 0.6, 0.04, new THREE.Vector3(0, 2.75, -hd + 0.06), 0x8a7038));

    // Leaded casement windows on side walls — 5 per side, evenly spaced.
    for (const wz of [-5.5, -2.8, 0, 2.8, 5.5]) {
      makeWindow(this.group, -hw, 2.8, wz, 1.2, 1.8, 1, 0x4a3a20, 0x1a0e06);
    }
    for (const wz of [-5.5, -2.8, 0, 2.8, 5.5]) {
      makeWindow(this.group, hw, 2.8, wz, 1.2, 1.8, -1, 0x4a3a20, 0x1a0e06);
    }

    // Long oak dining table in centre — scaled for larger room.
    makeDiningTable(this.group, 0, 0, 9.0, 1.4, 0x3a2414, 0x2a180c, this.bounds);

    // Wall sconces flanking fireplace + along side walls (more for longer walls).
    makeSconce(this.group, -2.5, 2.6, -hd + 0.15, 1, 0xffa860, 0.9, 5);
    makeSconce(this.group, 2.5, 2.6, -hd + 0.15, 1, 0xffa860, 0.9, 5);
    makeSconce(this.group, -hw + 0.15, 2.6, -4.0, 1, 0xffa860, 0.7, 4);
    makeSconce(this.group, hw - 0.15, 2.6, -4.0, -1, 0xffa860, 0.7, 4);
    makeSconce(this.group, -hw + 0.15, 2.6, -1.5, 1, 0xffa860, 0.7, 4);
    makeSconce(this.group, hw - 0.15, 2.6, -1.5, -1, 0xffa860, 0.7, 4);
    makeSconce(this.group, -hw + 0.15, 2.6, 1.5, 1, 0xffa860, 0.7, 4);
    makeSconce(this.group, hw - 0.15, 2.6, 1.5, -1, 0xffa860, 0.7, 4);
    makeSconce(this.group, -hw + 0.15, 2.6, 4.0, 1, 0xffa860, 0.7, 4);
    makeSconce(this.group, hw - 0.15, 2.6, 4.0, -1, 0xffa860, 0.7, 4);

    // Framed portraits on east/west walls — more for longer walls.
    makeFramedPicture(this.group, -hw, 2.8, -3.5, 0.9, 1.3, 1, 0x3a2814, 0x0a0604);
    makeFramedPicture(this.group, hw, 2.8, -3.5, 0.9, 1.3, -1, 0x3a2814, 0x0a0604);
    makeFramedPicture(this.group, -hw, 2.8, 3.0, 0.9, 1.3, 1, 0x3a2814, 0x0a0604);
    makeFramedPicture(this.group, hw, 2.8, 3.0, 0.9, 1.3, -1, 0x3a2814, 0x0a0604);

    // Persian rug under the table — proportionally larger.
    makeRug(this.group, 0, 0, 5.5, 10.5, 0x5a1a1a, 0x7a2a28);

    // Additional furniture: two bookshelves flanking the fireplace.
    makeBookshelf(this.group, -hw + 0.3, -hd + 0.3, 1.6, 2.8, 1, 0x2a180c, this.bounds);
    makeBookshelf(this.group, hw - 0.3, -hd + 0.3, 1.6, 2.8, 1, 0x2a180c, this.bounds);

    // Armchairs near the fireplace for reading.
    makeArmchair(this.group, -3.5, -hd + 2.5, 0x4a2a1a, this.bounds);
    makeArmchair(this.group, 3.5, -hd + 2.5, 0x4a2a1a, this.bounds);

    // Side tables next to armchairs.
    this.group.add(makeBox(0.55, 0.6, 0.55, new THREE.Vector3(-3.5, 0.3, -hd + 1.5), 'wood_dark'));
    this.bounds.push(aabbFromCenter(-3.5, 0.3, -hd + 1.5, 0.3, 0.3, 0.3));
    this.group.add(makeBox(0.55, 0.6, 0.55, new THREE.Vector3(3.5, 0.3, -hd + 1.5), 'wood_dark'));
    this.bounds.push(aabbFromCenter(3.5, 0.3, -hd + 1.5, 0.3, 0.3, 0.3));

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    // Exit door on south wall returning to campus.
    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.3, -1, 0x120804, 0x2a1408);
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
    // Fire flicker.
    if (this.fireGlow) {
      const f = 0.85 + Math.sin(this.time * 11) * 0.06 + Math.sin(this.time * 4.3) * 0.04;
      this.fireGlow.intensity = f;
    }
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
