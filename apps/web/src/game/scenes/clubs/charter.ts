import * as THREE from 'three';
import type { AABB, GameScene, Interactable, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce, makePilaster,
  makeArmchair, makeBookshelf, makeRug, makeExitDoor, makeFramedPicture,
  addAbandonment,
  makePickupBeacon, updatePickupBeacon, type PickupBeacon,
  makeHideZone, type HideZone, makeBloodWriting,
} from './_shared';

/**
 * CHARTER CLUB INTERIOR — Cram's rare Georgian building. Main dining room
 * with tall arched windows, classical pilasters, plaster cornice, marble
 * mantel fireplace. A wood-paneled library / taproom corner with built-in
 * bookcases. Formal Georgian palette: white, cream, deep red.
 *
 * Dimensions: 22w × 16d × 6h (doubled from 12×8×4.8).
 */
export class CharterInterior implements GameScene {
  readonly name = 'charter';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 5.0);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private pickup!: THREE.Mesh;
  private pickupLight!: THREE.PointLight;
  private pickupBeacon!: PickupBeacon;
  private pickupCollected = false;
  private hideZoneRefs: HideZone[] = [];
  private readonly onExit: () => void;
  private onPickup: (() => void) | null = null;

  constructor(opts: { onExit: () => void; onPickup?: () => void }) {
    this.onExit = opts.onExit;
    this.onPickup = opts.onPickup ?? null;
  }

  load(): void {
    const cfg = SCENE_CONFIGS.charter;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // Cream walls, parquet floor, warmer ceiling.
    this.bounds = buildShell(this.group, w, h, d, { floor: 'wood_floor', ceiling: 'plaster', walls: 'plaster' });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity));

    // Parquet seams.
    for (let zz = -hd + 0.5; zz < hd; zz += 1.0) {
      this.group.add(makeBox(w - 0.4, 0.005, 0.05, new THREE.Vector3(0, 0.015, zz), 0x3a2414));
    }

    // Classical pilasters on side walls — 5 per side for longer walls.
    for (const wx of [-hw + 0.05, hw - 0.05]) {
      for (const wz of [-5.5, -2.5, 0.5, 3.5, 6.0]) {
        makePilaster(this.group, wx, wz, h, wx < 0 ? 1 : -1, 0xeadaba);
      }
    }

    // Plaster cornice.
    this.group.add(makeBox(w, 0.25, 0.15, new THREE.Vector3(0, h - 0.12, -hd + 0.1), 0xdcccaa));
    this.group.add(makeBox(w, 0.25, 0.15, new THREE.Vector3(0, h - 0.12, hd - 0.1), 0xdcccaa));
    this.group.add(makeBox(0.15, 0.25, d, new THREE.Vector3(-hw + 0.1, h - 0.12, 0), 0xdcccaa));
    this.group.add(makeBox(0.15, 0.25, d, new THREE.Vector3(hw - 0.1, h - 0.12, 0), 0xdcccaa));

    // Ceiling beams — wider spacing for 22w room.
    for (const bx of [-7.5, -3.5, 0, 3.5, 7.5]) {
      this.group.add(makeBox(0.18, 0.14, d - 0.2, new THREE.Vector3(bx, h - 0.1, 0), 'wood_dark'));
    }
    // Cross beams.
    for (const bz of [-5.0, -1.5, 2.0, 5.5]) {
      this.group.add(makeBox(w - 0.1, 0.12, 0.18, new THREE.Vector3(0, h - 0.1, bz), 'wood_dark'));
    }

    // North wall: marble mantel fireplace — scaled up.
    const fpW = 2.6, fpH = 2.2, fpD = 0.45;
    this.group.add(makeBox(fpW, 0.32, fpD, new THREE.Vector3(0, fpH - 0.16, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(0.34, fpH, fpD, new THREE.Vector3(-fpW / 2 + 0.17, fpH / 2, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(0.34, fpH, fpD, new THREE.Vector3(fpW / 2 - 0.17, fpH / 2, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeBox(fpW - 0.68, 0.2, fpD, new THREE.Vector3(0, 0.1, -hd + fpD / 2), 0xeee2c8));
    this.group.add(makeEmissive(fpW - 0.68, fpH - 0.45, 0.04, new THREE.Vector3(0, 0.2 + (fpH - 0.45) / 2, -hd + fpD - 0.18), 0x0a0604));
    this.group.add(makeEmissive(fpW - 0.98, 0.14, 0.24, new THREE.Vector3(0, 0.32, -hd + fpD - 0.25), 0xff7a28));
    this.fireGlow = new THREE.PointLight(0xff8040, 0.7, 6, 2.0);
    this.fireGlow.position.set(0, 0.8, -hd + 0.5);
    this.group.add(this.fireGlow);
    // Heraldic crest over the mantel.
    this.group.add(makeBox(0.7, 0.8, 0.04, new THREE.Vector3(0, 3.4, -hd + 0.06), 0x4a1818));
    this.group.add(makeBox(0.5, 0.6, 0.02, new THREE.Vector3(0, 3.45, -hd + 0.04), 0xa08838));

    // Arched windows — 5 per side for 16d walls.
    for (const wz of [-5.5, -2.5, 0.5, 3.0, 5.5]) {
      // East wall.
      this.group.add(makeEmissive(1.1, 2.2, 0.04, new THREE.Vector3(hw - 0.04, 2.6, wz), 0x9c9066));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(hw - 0.06, 2.0, wz), 0x3a2a18));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(hw - 0.06, 3.2, wz), 0x3a2a18));
      this.group.add(makeBox(0.05, 2.2, 0.08, new THREE.Vector3(hw - 0.06, 2.6, wz), 0x3a2a18));
      // Arched top.
      this.group.add(makeBox(1.15, 0.4, 0.08, new THREE.Vector3(hw - 0.06, 3.9, wz), 0x3a2a18));
    }
    for (const wz of [-5.5, -2.5, 0.5, 3.0, 5.5]) {
      // West wall.
      this.group.add(makeEmissive(1.1, 2.2, 0.04, new THREE.Vector3(-hw + 0.04, 2.6, wz), 0x9c9066));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(-hw + 0.06, 2.0, wz), 0x3a2a18));
      this.group.add(makeBox(1.15, 0.05, 0.08, new THREE.Vector3(-hw + 0.06, 3.2, wz), 0x3a2a18));
      this.group.add(makeBox(0.05, 2.2, 0.08, new THREE.Vector3(-hw + 0.06, 2.6, wz), 0x3a2a18));
      this.group.add(makeBox(1.15, 0.4, 0.08, new THREE.Vector3(-hw + 0.06, 3.9, wz), 0x3a2a18));
    }

    // Long formal dining table — proportional to 22w room.
    makeDiningTable(this.group, 0, 0, 10.0, 1.4, 0x3a2214, 0x2a180c, this.bounds);

    // Library nook — built-in bookcases at the rear/south corners (taller for 6h ceiling).
    makeBookshelf(this.group, hw - 0.04, hd - 0.05, 3.5, h - 0.5, -1, 0x2a1a0c, this.bounds);
    makeBookshelf(this.group, -hw + 0.04, hd - 0.05, 3.5, h - 0.5, 1, 0x2a1a0c, this.bounds);
    // Extra bookshelf on north wall corners.
    makeBookshelf(this.group, -hw + 0.04, -hd + 0.05, 2.5, h - 0.5, 1, 0x2a1a0c, this.bounds);
    makeBookshelf(this.group, hw - 0.04, -hd + 0.05, 2.5, h - 0.5, -1, 0x2a1a0c, this.bounds);

    // Armchairs near the fireplace.
    makeArmchair(this.group, -3.5, -hd + 2.0, 0x4a2018, this.bounds);
    makeArmchair(this.group, 3.5, -hd + 2.0, 0x4a2018, this.bounds);
    // Side table between armchairs.
    this.group.add(makeBox(0.7, 0.6, 0.7, new THREE.Vector3(0, 0.3, -hd + 2.0), 'wood_dark'));
    this.bounds.push(aabbFromCenter(0, 0.3, -hd + 2.0, 0.35, 0.3, 0.35));

    // Chandelier — brass with crystal evocation.
    const stem = makeBox(0.05, 1.3, 0.05, new THREE.Vector3(0, h - 0.65, 0), 0xb09848);
    this.group.add(stem);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xb09848, flatShading: true }),
    );
    body.position.set(0, h - 1.3, 0);
    this.group.add(body);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff0c8 }),
      );
      bulb.position.set(Math.cos(angle) * 0.6, h - 1.2, Math.sin(angle) * 0.6);
      this.group.add(bulb);
    }
    const chandLight = new THREE.PointLight(0xfff0c8, 1.4, 10, 2.0);
    chandLight.position.set(0, h - 1.5, 0);
    this.group.add(chandLight);

    // Sconces at pilasters — 5 per side.
    for (const wx of [-hw + 0.15, hw - 0.15]) {
      for (const wz of [-5.5, -2.5, 0.5, 3.5, 6.0]) {
        makeSconce(this.group, wx, 3.2, wz, wx < 0 ? 1 : -1, 0xffe0a0, 0.55, 5);
      }
    }

    // Framed portraits — more for the bigger room.
    makeFramedPicture(this.group, -hw, 3.8, -4.0, 1.1, 1.4, 1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, -hw, 3.8, 1.5, 1.1, 1.4, 1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, hw, 3.8, -4.0, 1.1, 1.4, -1, 0x3a2814, 0xa08838);
    makeFramedPicture(this.group, hw, 3.8, 1.5, 1.1, 1.4, -1, 0x3a2814, 0xa08838);

    makeRug(this.group, 0, 0, 5.5, 9.5, 0x4a1818, 0x6a2820);

    // Pickup: Place card at the head of the dining table.
    this.pickup = makeBox(0.12, 0.08, 0.06, new THREE.Vector3(-4.5, 0.93, 0), 0xf0e8d0);
    this.group.add(this.pickup);
    this.pickupLight = new THREE.PointLight(0xffe0a0, 0.4, 2);
    this.pickupLight.position.set(-4.5, 1.23, 0);
    this.group.add(this.pickupLight);
    this.pickupBeacon = makePickupBeacon(this.group, -4.5, 0, 0.93, 0xe77500);

    // BLOOD WRITING — "YOUR SEAT" above the mantel. The endgame reveal
    // starts here: it's your seat at the head of the table.
    makeBloodWriting(this.group, 'YOUR SEAT', 0, 3.7, -hd + 0.14, 'north', 0.5);

    // HIDE ZONES — under the long table.
    this.hideZoneRefs.push(makeHideZone(
      this.group, 'hide_charter_table_n', -1.8, 0.4, -1.5, 0.9, 0.6, 0.9,
    ));
    this.hideZoneRefs.push(makeHideZone(
      this.group, 'hide_charter_table_s', 1.8, 0.4, 1.5, 0.9, 0.6, 0.9,
    ));

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    makeExitDoor(this.group, 0, hd - 0.05, 1.6, 2.5, -1, 0x3a2418, 0xb09848);
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
    this.hideZoneRefs.length = 0;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.fireGlow) this.fireGlow.intensity = 0.7 + Math.sin(this.time * 9) * 0.04;
    // Pickup light pulse.
    if (!this.pickupCollected) {
      this.pickupLight.intensity = 0.3 + Math.sin(this.time * 2.5) * 0.15;
      updatePickupBeacon(this.pickupBeacon, this.time);
    }
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
  hideZones(): HideZone[] { return this.hideZoneRefs; }
  floorHeightAt(): number { return 0; }

  interactables(): Interactable[] {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    return [
      {
        id: 'pickup_charter',
        box: aabbFromCenter(-4.5, 1.05, 0, 0.4, 0.35, 0.4),
        hint: 'read seal',
        range: 3.0,
        get enabled(): boolean { return !scene.pickupCollected; },
        onInteract: () => {
          scene.pickupCollected = true;
          scene.pickup.visible = false;
          scene.pickupLight.intensity = 0;
          scene.pickupBeacon.group.visible = false;
          scene.onPickup?.();
        },
      },
    ];
  }
}
