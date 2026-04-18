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
 * IVY CLUB INTERIOR — the oldest club on Prospect. Dark oak beamed/coffered
 * ceiling, oak wainscoting floor-to-chair-rail, leaded diamond-pane
 * casement windows, stone Tudor-arched fireplace, heavy oak panelling.
 * Oil portraits of former presidents lining the walls.
 *
 * Dimensions: 20w x 16d x 5.5h
 */
export class IvyInterior implements GameScene {
  readonly name = 'ivy';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private readonly onExit: () => void;

  constructor(opts: { onExit: () => void }) { this.onExit = opts.onExit; }

  load(): void {
    const cfg = SCENE_CONFIGS.ivy;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // Dark oak throughout — Ivy is the darkest/moodiest club interior.
    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'wallpaper' });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Full-height oak panelling (box panels framed with fillets) — scaled for wider walls.
    for (const zz of [-hd + 0.04, hd - 0.04]) {
      for (let px = -hw + 0.8; px <= hw - 0.8; px += 1.4) {
        this.group.add(makeBox(1.2, 2.6, 0.04, new THREE.Vector3(px, 1.4, zz), 'wood_panel'));
      }
    }
    for (const xx of [-hw + 0.04, hw - 0.04]) {
      for (let pz = -hd + 0.8; pz <= hd - 0.8; pz += 1.4) {
        this.group.add(makeBox(0.04, 2.6, 1.2, new THREE.Vector3(xx, 1.4, pz), 'wood_panel'));
      }
    }

    // Coffered ceiling — a grid of dark box panels, spread for the larger room.
    for (let bx = -hw + 1.2; bx <= hw - 1.2; bx += 2.0) {
      this.group.add(makeBox(0.2, 0.18, d - 0.2, new THREE.Vector3(bx, h - 0.1, 0), 'wood_dark'));
    }
    for (const bz of [-5.0, -2.5, 0, 2.5, 5.0]) {
      this.group.add(makeBox(w - 0.2, 0.18, 0.2, new THREE.Vector3(0, h - 0.1, bz), 'wood_dark'));
    }

    // Stone Tudor-arched fireplace on north wall.
    const fp = makeFireplace(this.group, 0, -hd + 0.5, 1, 0x5e5248, true);
    this.fireGlow = fp.glow;
    // Tudor arch trim over the opening.
    this.group.add(makeBox(2.6, 0.35, 0.1, new THREE.Vector3(0, 2.3, -hd + 0.25), 0x4e4238));
    // Carved stone ivy-leaf motif over the mantel.
    this.group.add(makeBox(0.9, 0.3, 0.06, new THREE.Vector3(0, 2.85, -hd + 0.08), 0x3a5028));

    // Leaded diamond-pane windows — 6 per side for longer walls.
    for (const wz of [-6.0, -3.6, -1.2, 1.2, 3.6, 6.0]) {
      makeWindow(this.group, hw, 2.6, wz, 0.9, 1.6, -1, 0x38301e, 0x1a0e06);
    }
    for (const wz of [-6.0, -3.6, -1.2, 1.2, 3.6, 6.0]) {
      makeWindow(this.group, -hw, 2.6, wz, 0.9, 1.6, 1, 0x38301e, 0x1a0e06);
    }

    // Long oak dining table — proportionally scaled.
    makeDiningTable(this.group, 0, 0, 9.5, 1.3, 0x2a180c, 0x140802, this.bounds);

    // Sconces — more warm points spread along the longer walls.
    makeSconce(this.group, -2.2, 2.5, -hd + 0.1, 1, 0xffa060, 0.85, 5);
    makeSconce(this.group, 2.2, 2.5, -hd + 0.1, 1, 0xffa060, 0.85, 5);
    for (const wz of [-5.0, -2.5, 0, 2.5, 5.0]) {
      makeSconce(this.group, -hw + 0.1, 2.4, wz, 1, 0xffa060, 0.7, 4.5);
      makeSconce(this.group, hw - 0.1, 2.4, wz, -1, 0xffa060, 0.7, 4.5);
    }

    // Row of oil portraits along both walls — more for the longer room.
    for (const wz of [-4.5, -1.5, 1.5, 4.5]) {
      makeFramedPicture(this.group, -hw, 2.8, wz, 0.8, 1.1, 1, 0x3a2812, 0x0a0604);
      makeFramedPicture(this.group, hw, 2.8, wz, 0.8, 1.1, -1, 0x3a2812, 0x0a0604);
    }

    // Rich red patterned rug — proportionally larger.
    makeRug(this.group, 0, 0, 5.5, 11.0, 0x4a1012, 0x6a1a1a);

    // Additional furniture: bookshelves flanking the fireplace.
    makeBookshelf(this.group, -hw + 0.3, -hd + 0.3, 1.4, 2.6, 1, 0x1a0e06, this.bounds);
    makeBookshelf(this.group, hw - 0.3, -hd + 0.3, 1.4, 2.6, 1, 0x1a0e06, this.bounds);

    // Armchairs by the fireplace.
    makeArmchair(this.group, -4.0, -hd + 2.8, 0x3a1a12, this.bounds);
    makeArmchair(this.group, 4.0, -hd + 2.8, 0x3a1a12, this.bounds);

    // Side tables at the south end corners.
    this.group.add(makeBox(0.5, 0.55, 0.5, new THREE.Vector3(-hw + 1.5, 0.275, hd - 2.0), 'wood_dark'));
    this.bounds.push(aabbFromCenter(-hw + 1.5, 0.275, hd - 2.0, 0.28, 0.28, 0.28));
    this.group.add(makeBox(0.5, 0.55, 0.5, new THREE.Vector3(hw - 1.5, 0.275, hd - 2.0), 'wood_dark'));
    this.bounds.push(aabbFromCenter(hw - 1.5, 0.275, hd - 2.0, 0.28, 0.28, 0.28));

    // Bookshelf on south wall beside the exit.
    makeBookshelf(this.group, -4.0, hd - 0.3, 1.6, 2.4, -1, 0x1a0e06, this.bounds);

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.3, -1);
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
    if (this.fireGlow) this.fireGlow.intensity = 0.9 + Math.sin(this.time * 11) * 0.06;
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
}
