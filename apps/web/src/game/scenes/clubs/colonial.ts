import * as THREE from 'three';
import type { AABB, GameScene, Interactable, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce, makePilaster,
  makeArmchair, makeBookshelf, makeRug, makeExitDoor, makeWindow,
  makeFramedPicture, addAbandonment,
} from './_shared';

/**
 * COLONIAL CLUB INTERIOR — bright, airy classical dining room with tall
 * rectangular windows, white classical pilasters, simple coffered/beamed
 * ceiling, classical mantel fireplace. Greek Revival discipline: everything
 * symmetrical, everything white.
 *
 * Dimensions: 22w × 16d × 6h (doubled from 11×8×4.5).
 */
export class ColonialInterior implements GameScene {
  readonly name = 'colonial';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private pickup!: THREE.Mesh;
  private pickupLight!: THREE.PointLight;
  private pickupCollected = false;
  private readonly onExit: () => void;
  private onPickup: (() => void) | null = null;

  constructor(opts: { onExit: () => void; onPickup?: () => void }) {
    this.onExit = opts.onExit;
    this.onPickup = opts.onPickup ?? null;
  }

  load(): void {
    const cfg = SCENE_CONFIGS.colonial;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'plaster' });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Eight pilasters symmetrically placed on side walls — more for longer walls.
    for (const wx of [-hw + 0.05, hw - 0.05]) {
      for (const wz of [-5.5, -2.5, 0.5, 3.5, 6.0]) {
        makePilaster(this.group, wx, wz, h, wx < 0 ? 1 : -1, 0xeee2c8);
      }
    }

    // Coffered ceiling with dark wood beams — wider spacing for 22w room.
    for (const bx of [-8, -4.5, -1.0, 2.5, 6.0, 9.0]) {
      this.group.add(makeBox(0.2, 0.16, d - 0.2, new THREE.Vector3(bx, h - 0.1, 0), 'wood_dark'));
    }
    // Cross beams along depth.
    for (const bz of [-5, -1.5, 2.0, 5.5]) {
      this.group.add(makeBox(w - 0.1, 0.14, 0.2, new THREE.Vector3(0, h - 0.1, bz), 'wood_dark'));
    }
    // Decorative entablature at wall/ceiling join.
    this.group.add(makeBox(w - 0.1, 0.22, 0.12, new THREE.Vector3(0, h - 0.12, -hd + 0.12), 0xdad0b0));
    this.group.add(makeBox(w - 0.1, 0.22, 0.12, new THREE.Vector3(0, h - 0.12, hd - 0.12), 0xdad0b0));

    // North wall: white classical mantel fireplace (scaled up for taller room).
    const fpW = 2.4, fpH = 2.2, fpD = 0.5;
    this.group.add(makeBox(fpW, 0.3, fpD, new THREE.Vector3(0, fpH - 0.15, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(0.32, fpH, fpD, new THREE.Vector3(-fpW / 2 + 0.16, fpH / 2, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(0.32, fpH, fpD, new THREE.Vector3(fpW / 2 - 0.16, fpH / 2, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(fpW - 0.64, 0.18, fpD, new THREE.Vector3(0, 0.09, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeEmissive(fpW - 0.64, fpH - 0.45, 0.04, new THREE.Vector3(0, 0.18 + (fpH - 0.45) / 2, -hd + fpD - 0.18), 0x0a0604));
    this.group.add(makeEmissive(fpW - 0.94, 0.14, 0.24, new THREE.Vector3(0, 0.32, -hd + fpD - 0.28), 0xff7a28));
    this.fireGlow = new THREE.PointLight(0xff8040, 0.65, 6, 2.0);
    this.fireGlow.position.set(0, 0.8, -hd + 0.5);
    this.group.add(this.fireGlow);
    // Framed oval mirror above the mantel.
    this.group.add(makeBox(1.0, 1.3, 0.03, new THREE.Vector3(0, 3.4, -hd + 0.07), 0xa08838));
    this.group.add(makeEmissive(0.85, 1.1, 0.02, new THREE.Vector3(0, 3.4, -hd + 0.05), 0x28324a));

    // Tall rectangular windows — 5 per side, evenly spread along 16d walls.
    for (const wz of [-5.5, -2.5, 0.5, 3.5, 6.0]) {
      makeWindow(this.group, hw, 3.0, wz, 1.1, 2.6, -1, 0x9c9066, 0x3a2a18);
      makeWindow(this.group, -hw, 3.0, wz, 1.1, 2.6, 1, 0x9c9066, 0x3a2a18);
    }

    // Long dining table — proportional to 22w room.
    makeDiningTable(this.group, 0, 0, 10.0, 1.4, 0x2e1c0c, 0x1a0e06, this.bounds);

    // Armchairs flanking the fireplace.
    makeArmchair(this.group, -3.5, -hd + 2.0, 0x4a2a1a, this.bounds);
    makeArmchair(this.group, 3.5, -hd + 2.0, 0x4a2a1a, this.bounds);
    // Side tables near each armchair.
    this.group.add(makeBox(0.6, 0.65, 0.6, new THREE.Vector3(-5.0, 0.325, -hd + 2.0), 'wood_dark'));
    this.bounds.push(aabbFromCenter(-5.0, 0.325, -hd + 2.0, 0.3, 0.325, 0.3));
    this.group.add(makeBox(0.6, 0.65, 0.6, new THREE.Vector3(5.0, 0.325, -hd + 2.0), 'wood_dark'));
    this.bounds.push(aabbFromCenter(5.0, 0.325, -hd + 2.0, 0.3, 0.325, 0.3));
    // Bookshelves against south wall corners.
    makeBookshelf(this.group, -hw + 0.04, hd - 0.05, 2.8, h - 0.5, 1, 0x2a1a0e, this.bounds);
    makeBookshelf(this.group, hw - 0.04, hd - 0.05, 2.8, h - 0.5, -1, 0x2a1a0e, this.bounds);

    // Sconces at each pilaster.
    for (const wx of [-hw + 0.12, hw - 0.12]) {
      for (const wz of [-5.5, -2.5, 0.5, 3.5, 6.0]) {
        makeSconce(this.group, wx, 3.5, wz, wx < 0 ? 1 : -1, 0xffe0a0, 0.6, 5);
      }
    }
    // Central chandelier (simple spherical brass).
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 }),
    );
    bulb.position.set(0, h - 1.2, 0);
    this.group.add(bulb);
    const stem = makeBox(0.04, 1.2, 0.04, new THREE.Vector3(0, h - 0.6, 0), 0xa08838);
    this.group.add(stem);
    const chandLight = new THREE.PointLight(0xfff0c8, 1.4, 10, 2.0);
    chandLight.position.set(0, h - 1.2, 0);
    this.group.add(chandLight);

    // Presidential portraits on side walls.
    makeFramedPicture(this.group, -hw, 3.6, -1.5, 1.1, 1.5, 1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, -hw, 3.6, 2.0, 1.1, 1.5, 1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, hw, 3.6, -1.5, 1.1, 1.5, -1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, hw, 3.6, 2.0, 1.1, 1.5, -1, 0x3a2814, 0xa08838);

    makeRug(this.group, 0, 0, 5.0, 9.0, 0x4a2420, 0x6a3830);

    // Pickup: Laptop on the side table near the fireplace.
    this.pickup = makeBox(0.3, 0.02, 0.2, new THREE.Vector3(-5.0, 0.66, -hd + 2.0), 0x1a1a1a);
    this.group.add(this.pickup);
    this.pickupLight = new THREE.PointLight(0xffe0a0, 0.4, 2);
    this.pickupLight.position.set(-5.0, 0.96, -hd + 2.0);
    this.group.add(this.pickupLight);

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    makeExitDoor(this.group, 0, hd - 0.05, 1.6, 2.5, -1, 0x3a2818, 0xb09848);
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
    if (this.fireGlow) this.fireGlow.intensity = 0.65 + Math.sin(this.time * 9) * 0.04;
    // Pickup light pulse.
    if (!this.pickupCollected) {
      this.pickupLight.intensity = 0.3 + Math.sin(this.time * 2.5) * 0.15;
    }
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }

  interactables(): Interactable[] {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    const hd = SCENE_CONFIGS.colonial.dimensions.depth / 2;
    return [
      {
        id: 'pickup_colonial',
        box: aabbFromCenter(-5.0, 0.66, -hd + 2.0, 0.2, 0.1, 0.2),
        hint: 'examine',
        range: 2.5,
        get enabled(): boolean { return !scene.pickupCollected; },
        onInteract: () => {
          scene.pickupCollected = true;
          scene.pickup.visible = false;
          scene.pickupLight.intensity = 0;
          scene.onPickup?.();
        },
      },
    ];
  }
}
