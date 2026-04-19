import * as THREE from 'three';
import type { AABB, GameScene, Interactable, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeEmissive, makeDiningTable, makeSconce, makePilaster,
  makeArmchair, makeBookshelf, makeRug, makeExitDoor, makeWindow,
  makeFramedPicture, addAbandonment,
  makePickupBeacon, updatePickupBeacon, type PickupBeacon,
  makeHideZone, type HideZone, makeBloodWriting,
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
  private pickupBeacon!: PickupBeacon;
  private pickupCollected = false;
  private hideZoneRefs: HideZone[] = [];

  // ── 3-CANDLE PUZZLE ──
  // Player must find 3 black candles scattered in the room and place
  // them in the candelabrum on the dining table. Only then does the
  // laptop-cover cloth fall away, letting them pick up BOLT CUTTERS.
  private hasCandle1 = false;
  private hasCandle2 = false;
  private hasCandle3 = false;
  private candle1Mesh!: THREE.Group;
  private candle2Mesh!: THREE.Group;
  private candle3Mesh!: THREE.Group;
  private candle1Light!: THREE.PointLight;
  private candle2Light!: THREE.PointLight;
  private candle3Light!: THREE.PointLight;
  /** The 3 candle+flame meshes on the dining table. Appear as you collect. */
  private candelabrumFlames: THREE.Mesh[] = [];
  private candelabrumCandles: THREE.Mesh[] = [];
  private candelabrumLights: THREE.PointLight[] = [];
  /** Cloth covering the laptop until puzzle is solved. */
  private laptopCover!: THREE.Mesh;
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

    // ── 3-CANDLE PUZZLE ──
    // Three black candles scattered in the room. Player picks each up
    // and it "places" itself in the candelabrum on the dining table.
    // When all three are placed, the candelabrum's flames light and
    // the laptop's cloth cover falls away, revealing BOLT CUTTERS.
    this.buildCandles();
    this.buildCandelabrum();

    // Pickup: Laptop on the side table near the fireplace.
    this.pickup = makeBox(0.3, 0.02, 0.2, new THREE.Vector3(-5.0, 0.66, -hd + 2.0), 0x1a1a1a);
    this.group.add(this.pickup);
    // Cloth cover — drapes over the laptop until puzzle solved.
    const clothMat = new THREE.MeshLambertMaterial({ color: 0x6a2020, flatShading: true });
    this.laptopCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.18, 0.45),
      clothMat,
    );
    this.laptopCover.position.set(-5.0, 0.72, -hd + 2.0);
    this.group.add(this.laptopCover);
    this.pickupLight = new THREE.PointLight(0xffe0a0, 0.4, 2);
    this.pickupLight.position.set(-5.0, 0.96, -hd + 2.0);
    this.group.add(this.pickupLight);
    this.pickupBeacon = makePickupBeacon(this.group, -5.0, -hd + 2.0, 0.66, 0xcce0ff);
    // Beacon hidden until puzzle solved.
    this.pickupBeacon.group.visible = false;

    // BLOOD WRITING — "FORM 7B" on the north wall above the fireplace.
    makeBloodWriting(this.group, 'FORM 7B', 0, 3.5, -hd + 0.14, 'north', 0.5);

    // HIDE ZONES — under the dining table, both sides. Crouch + still.
    this.hideZoneRefs.push(makeHideZone(
      this.group, 'hide_colonial_table_n', -1.8, 0.4, -1.5, 0.9, 0.6, 0.9,
    ));
    this.hideZoneRefs.push(makeHideZone(
      this.group, 'hide_colonial_table_s', 1.8, 0.4, 1.5, 0.9, 0.6, 0.9,
    ));

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

  /** Build a single black candle mesh with a wick. Used for puzzle candles. */
  private makeCandleMesh(): THREE.Group {
    const g = new THREE.Group();
    const wax = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8),
      new THREE.MeshLambertMaterial({ color: 0x181818, flatShading: true }),
    );
    wax.position.y = 0.11;
    g.add(wax);
    const wick = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.03, 0.015),
      new THREE.MeshLambertMaterial({ color: 0x3a2a10, flatShading: true }),
    );
    wick.position.y = 0.24;
    g.add(wick);
    return g;
  }

  /** Position the three findable candles around the Colonial room. */
  private buildCandles(): void {
    // Positions chosen to be on clearly-visible open surfaces — not
    // inside any furniture.
    // 1. On the west side table near the fireplace (south-west of the table).
    this.candle1Mesh = this.makeCandleMesh();
    this.candle1Mesh.position.set(-6.0, 0.7, 2.5);
    this.group.add(this.candle1Mesh);
    this.candle1Light = new THREE.PointLight(0xffaa70, 1.3, 2.6, 2);
    this.candle1Light.position.set(-6.0, 1.0, 2.5);
    this.group.add(this.candle1Light);
    // 2. On the east side of the dining table (opposite side from spawn).
    this.candle2Mesh = this.makeCandleMesh();
    this.candle2Mesh.position.set(3.5, 0.95, -0.4);
    this.group.add(this.candle2Mesh);
    this.candle2Light = new THREE.PointLight(0xffaa70, 1.3, 2.6, 2);
    this.candle2Light.position.set(3.5, 1.25, -0.4);
    this.group.add(this.candle2Light);
    // 3. On the floor near the south armchair (east side).
    this.candle3Mesh = this.makeCandleMesh();
    this.candle3Mesh.position.set(5.5, 0.12, 3.5);
    this.group.add(this.candle3Mesh);
    this.candle3Light = new THREE.PointLight(0xffaa70, 1.3, 2.6, 2);
    this.candle3Light.position.set(5.5, 0.42, 3.5);
    this.group.add(this.candle3Light);
  }

  /** Build the candelabrum centerpiece — 3 empty holders in the middle of the table. */
  private buildCandelabrum(): void {
    // Base of the candelabrum.
    const base = makeBox(0.7, 0.08, 0.25, new THREE.Vector3(0, 0.93, 0), 0x2a2018);
    this.group.add(base);
    // Three cups (empty until candles placed).
    const cupColor = 0x3a3028;
    const positions: Array<[number, number, number]> = [
      [-0.25, 1.00, 0],
      [0,     1.00, 0],
      [0.25,  1.00, 0],
    ];
    for (let i = 0; i < 3; i++) {
      const [px, py, pz] = positions[i];
      // Holder cup.
      this.group.add(makeBox(0.08, 0.05, 0.08, new THREE.Vector3(px, py, pz), cupColor));
      // Candle + flame — hidden until the matching candle is collected.
      const lightCandle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8),
        new THREE.MeshLambertMaterial({ color: 0x181818, flatShading: true }),
      );
      lightCandle.position.set(px, py + 0.14, pz);
      lightCandle.visible = false;
      this.group.add(lightCandle);
      this.candelabrumCandles.push(lightCandle);
      // Emissive flame mesh.
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffcc60 });
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.035), flameMat);
      flame.position.set(px, py + 0.3, pz);
      flame.visible = false;
      this.group.add(flame);
      this.candelabrumFlames.push(flame);
      // Per-candle point light — added to the scene, disabled until placed.
      const pl = new THREE.PointLight(0xffcc60, 0, 3.5, 2);
      pl.position.set(px, py + 0.32, pz);
      this.group.add(pl);
      this.candelabrumLights.push(pl);
    }
  }

  /** Check if all 3 candles are placed, and if so run the "reveal" sequence. */
  private maybeSolvePuzzle(): void {
    if (this.hasCandle1 && this.hasCandle2 && this.hasCandle3) {
      // Reveal: uncover the laptop + activate its beacon.
      this.laptopCover.visible = false;
      this.pickupBeacon.group.visible = true;
    }
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
    if (this.fireGlow) this.fireGlow.intensity = 0.65 + Math.sin(this.time * 9) * 0.04;
    // Puzzle candle lights — pulse to catch the eye.
    const pulse = 0.8 + 0.5 * Math.sin(this.time * 3);
    if (!this.hasCandle1) {
      this.candle1Light.intensity = 0.8 + pulse * 0.5;
      this.candle1Mesh.position.y = 0.7 + Math.sin(this.time * 2) * 0.025;
      this.candle1Mesh.rotation.y += dt * 0.6;
    }
    if (!this.hasCandle2) {
      this.candle2Light.intensity = 0.8 + pulse * 0.5;
      this.candle2Mesh.position.y = 0.95 + Math.sin(this.time * 2.2) * 0.025;
      this.candle2Mesh.rotation.y += dt * 0.5;
    }
    if (!this.hasCandle3) {
      this.candle3Light.intensity = 0.8 + pulse * 0.5;
      this.candle3Mesh.position.y = 0.12 + Math.sin(this.time * 2.4) * 0.02;
      this.candle3Mesh.rotation.y += dt * 0.55;
    }
    // Candelabrum flames flicker when lit.
    for (let i = 0; i < this.candelabrumFlames.length; i++) {
      const fl = this.candelabrumFlames[i];
      if (!fl.visible) continue;
      fl.scale.y = 0.9 + Math.sin(this.time * 12 + i) * 0.12 + (Math.random() - 0.5) * 0.08;
    }
    // Pickup light pulse — only after puzzle solved.
    if (!this.pickupCollected && this.hasCandle1 && this.hasCandle2 && this.hasCandle3) {
      this.pickupLight.intensity = 0.5 + Math.sin(this.time * 2.5) * 0.3;
      updatePickupBeacon(this.pickupBeacon, this.time);
    }
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
  hideZones(): HideZone[] { return this.hideZoneRefs; }
  floorHeightAt(): number { return 0; }

  /** Obstacle boxes the Colonial stalker must route around (dining table only). */
  getStalkerAvoidance(): AABB[] {
    // Dining table — centered at origin, length 10, width 1.4, height 1.4.
    return [{ min: [-5, 0, -0.7], max: [5, 1.4, 0.7] }];
  }

  /** True once the player has collected the laptop; scene stalker escalates on change. */
  isPickupCollected(): boolean {
    return this.pickupCollected;
  }

  interactables(): Interactable[] {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    const hd = SCENE_CONFIGS.colonial.dimensions.depth / 2;
    const revealSlot = (i: number): void => {
      scene.candelabrumCandles[i].visible = true;
      scene.candelabrumFlames[i].visible = true;
      scene.candelabrumLights[i].intensity = 1.1;
    };
    return [
      // ── CANDLE 1 (west side table) ─────────────────────────────
      {
        id: 'puzzle_candle1',
        box: aabbFromCenter(-6.0, 0.8, 2.5, 0.45, 0.45, 0.45),
        hint: 'take black candle',
        range: 3.0,
        get enabled(): boolean { return !scene.hasCandle1; },
        onInteract: () => {
          scene.hasCandle1 = true;
          scene.candle1Mesh.visible = false;
          scene.candle1Light.intensity = 0;
          revealSlot(0);
          scene.maybeSolvePuzzle();
        },
      },
      // ── CANDLE 2 (east end of dining table) ────────────────────
      {
        id: 'puzzle_candle2',
        box: aabbFromCenter(3.5, 1.05, -0.4, 0.45, 0.45, 0.45),
        hint: 'take black candle',
        range: 3.0,
        get enabled(): boolean { return !scene.hasCandle2; },
        onInteract: () => {
          scene.hasCandle2 = true;
          scene.candle2Mesh.visible = false;
          scene.candle2Light.intensity = 0;
          revealSlot(1);
          scene.maybeSolvePuzzle();
        },
      },
      // ── CANDLE 3 (floor near south armchair) ───────────────────
      {
        id: 'puzzle_candle3',
        box: aabbFromCenter(5.5, 0.25, 3.5, 0.45, 0.45, 0.45),
        hint: 'take black candle',
        range: 3.0,
        get enabled(): boolean { return !scene.hasCandle3; },
        onInteract: () => {
          scene.hasCandle3 = true;
          scene.candle3Mesh.visible = false;
          scene.candle3Light.intensity = 0;
          revealSlot(2);
          scene.maybeSolvePuzzle();
        },
      },
      // ── LAPTOP (reward) — enabled only when all 3 candles placed ──
      {
        id: 'pickup_colonial',
        box: aabbFromCenter(-5.0, 0.8, -hd + 2.0, 0.45, 0.45, 0.45),
        hint: 'take bolt cutters',
        range: 3.0,
        get enabled(): boolean {
          return !scene.pickupCollected && scene.hasCandle1 && scene.hasCandle2 && scene.hasCandle3;
        },
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
