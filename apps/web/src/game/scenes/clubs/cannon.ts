import * as THREE from 'three';
import type { AABB, GameScene, Interactable, Trigger } from '@phobos/types';
import { SCENE_CONFIGS } from '../../sceneConfig';
import { aabbFromCenter } from '../../collision';
import {
  buildShell, makeBox, makeFireplace, makeDiningTable, makeSconce,
  makeRug, makeExitDoor, makeWindow, makeFramedPicture,
  makeBookshelf, makeArmchair, addAbandonment,
  makePickupBeacon, updatePickupBeacon, type PickupBeacon,
  makeHideZone, type HideZone, makeBloodWriting,
} from './_shared';
import { createNoteMesh } from '../../noteMesh';

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
  private pickup!: THREE.Mesh;
  private pickupLight!: THREE.PointLight;
  private pickupBeacon!: PickupBeacon;
  private pickupCollected = false;
  private hideZoneRefs: HideZone[] = [];

  // ── 3-SHIELD-FRAGMENT PUZZLE ──
  // Three heraldic shields on the north wall (Cannon / Dial / Elm, the
  // three predecessor clubs). Each shield is MISSING a chunk — its
  // matching fragment sits on the floor in front of the shield. Picking
  // up all three places them into a central lectern. Completed lectern
  // reveals the Registry Ledger (the CODE).
  private hasFrag1 = false;
  private hasFrag2 = false;
  private hasFrag3 = false;
  private frag1Mesh!: THREE.Group;
  private frag2Mesh!: THREE.Group;
  private frag3Mesh!: THREE.Group;
  private frag1Light!: THREE.PointLight;
  private frag2Light!: THREE.PointLight;
  private frag3Light!: THREE.PointLight;
  /** Lectern display — the 3 slots that fill as fragments are collected. */
  private lecternSlots: THREE.Mesh[] = [];
  /** Clipboard cover hiding the pickup until puzzle solved. */
  private clipboardCover!: THREE.Mesh;
  private readonly onExit: () => void;
  private onPickup: (() => void) | null = null;

  constructor(opts: { onExit: () => void; onPickup?: () => void }) {
    this.onExit = opts.onExit;
    this.onPickup = opts.onPickup ?? null;
  }

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

    // ── 3-SHIELD-FRAGMENT PUZZLE ──
    // Build the shield fragments scattered on the floor + the central
    // lectern with 3 empty slots. Placing all 3 fragments uncovers the
    // Registry Ledger clipboard on the dining table.
    this.buildShieldFragments();
    this.buildLectern();

    // Pickup: Clipboard on the dining table (gated behind puzzle).
    this.pickup = createNoteMesh(0.18, 0.3);
    this.pickup.rotation.x = -Math.PI / 2;
    this.pickup.position.set(2.0, 0.90, 0);
    this.group.add(this.pickup);
    // Dust-cloth cover on the clipboard until puzzle solved.
    const coverMat = new THREE.MeshLambertMaterial({ color: 0x6a4030, flatShading: true });
    this.clipboardCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.1, 0.45),
      coverMat,
    );
    this.clipboardCover.position.set(2.0, 0.94, 0);
    this.group.add(this.clipboardCover);
    this.pickupLight = new THREE.PointLight(0xffe0a0, 0.4, 2);
    this.pickupLight.position.set(2.0, 1.2, 0);
    this.group.add(this.pickupLight);
    this.pickupBeacon = makePickupBeacon(this.group, 2.0, 0, 0.90, 0xff8860);
    this.pickupBeacon.group.visible = false;

    // BLOOD WRITING — "REGISTRY" above the three shields.
    makeBloodWriting(this.group, 'REGISTRY', 0, 3.6, -hd + 0.14, 'north', 0.45);

    // HIDE ZONES — under the dining table.
    this.hideZoneRefs.push(makeHideZone(
      this.group, 'hide_cannon_table_n', -1.8, 0.4, -1.5, 0.9, 0.6, 0.9,
    ));
    this.hideZoneRefs.push(makeHideZone(
      this.group, 'hide_cannon_table_s', 1.8, 0.4, 1.5, 0.9, 0.6, 0.9,
    ));

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

  /** Build a single shield fragment mesh (triangular chunk of stone). */
  private makeFragmentMesh(color: number): THREE.Group {
    const g = new THREE.Group();
    const stone = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.3),
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
    stone.position.y = 0.04;
    g.add(stone);
    // Emissive tip — visible from anywhere in the room.
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.03, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffaa30 }),
    );
    tip.position.y = 0.1;
    g.add(tip);
    return g;
  }

  /** Place the three shield fragments on the floor. */
  private buildShieldFragments(): void {
    // Positions on the floor in front of the three north-wall shields.
    // Shields are spaced across the north wall; place fragments where
    // the player can clearly see them on approach.
    this.frag1Mesh = this.makeFragmentMesh(0x8a2020);
    this.frag1Mesh.position.set(-5.5, 0.1, -5.0);
    this.group.add(this.frag1Mesh);
    this.frag1Light = new THREE.PointLight(0xffaa30, 1.4, 3.0, 2);
    this.frag1Light.position.set(-5.5, 0.4, -5.0);
    this.group.add(this.frag1Light);

    this.frag2Mesh = this.makeFragmentMesh(0x208a40);
    this.frag2Mesh.position.set(0, 0.1, -5.0);
    this.group.add(this.frag2Mesh);
    this.frag2Light = new THREE.PointLight(0xffaa30, 1.4, 3.0, 2);
    this.frag2Light.position.set(0, 0.4, -5.0);
    this.group.add(this.frag2Light);

    this.frag3Mesh = this.makeFragmentMesh(0x1040a0);
    this.frag3Mesh.position.set(5.5, 0.1, -5.0);
    this.group.add(this.frag3Mesh);
    this.frag3Light = new THREE.PointLight(0xffaa30, 1.4, 3.0, 2);
    this.frag3Light.position.set(5.5, 0.4, -5.0);
    this.group.add(this.frag3Light);
  }

  /** Build the central lectern with 3 empty slots. */
  private buildLectern(): void {
    // Lectern base — a short stone column on the west side of the room.
    const base = makeBox(0.7, 1.1, 0.7, new THREE.Vector3(-4.0, 0.55, 0), 0x3a3028);
    this.group.add(base);
    this.bounds.push(aabbFromCenter(-4.0, 0.55, 0, 0.36, 0.55, 0.36));
    // Top tray with 3 empty emissive slots.
    const tray = makeBox(0.8, 0.06, 0.8, new THREE.Vector3(-4.0, 1.12, 0), 0x2a2018);
    this.group.add(tray);
    const slotColor = 0x1a1410;
    const fragColors = [0x8a2020, 0x208a40, 0x1040a0];
    for (let i = 0; i < 3; i++) {
      const sx = -4.0 + (i - 1) * 0.22;
      // Empty dark slot.
      const empty = makeBox(0.18, 0.02, 0.18, new THREE.Vector3(sx, 1.155, 0), slotColor);
      this.group.add(empty);
      // Fragment that appears when placed — hidden by default.
      const placed = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.06, 0.18),
        new THREE.MeshLambertMaterial({ color: fragColors[i], flatShading: true }),
      );
      placed.position.set(sx, 1.18, 0);
      placed.visible = false;
      this.group.add(placed);
      this.lecternSlots.push(placed);
    }
  }

  private maybeSolvePuzzle(): void {
    if (this.hasFrag1 && this.hasFrag2 && this.hasFrag3) {
      this.clipboardCover.visible = false;
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
    if (this.fireGlow) this.fireGlow.intensity = 0.85 + Math.sin(this.time * 10) * 0.06;
    // Puzzle fragment lights + hover/spin.
    const pulse = 0.9 + 0.5 * Math.sin(this.time * 3);
    if (!this.hasFrag1) {
      this.frag1Light.intensity = 0.9 + pulse * 0.5;
      this.frag1Mesh.position.y = 0.1 + Math.sin(this.time * 2.2) * 0.03;
      this.frag1Mesh.rotation.y += dt * 0.7;
    }
    if (!this.hasFrag2) {
      this.frag2Light.intensity = 0.9 + pulse * 0.5;
      this.frag2Mesh.position.y = 0.1 + Math.sin(this.time * 2.4) * 0.03;
      this.frag2Mesh.rotation.y += dt * 0.65;
    }
    if (!this.hasFrag3) {
      this.frag3Light.intensity = 0.9 + pulse * 0.5;
      this.frag3Mesh.position.y = 0.1 + Math.sin(this.time * 2.1) * 0.03;
      this.frag3Mesh.rotation.y += dt * 0.75;
    }
    // Pickup light pulse — only when puzzle solved.
    if (!this.pickupCollected && this.hasFrag1 && this.hasFrag2 && this.hasFrag3) {
      this.pickupLight.intensity = 0.5 + Math.sin(this.time * 2.5) * 0.3;
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
    const revealSlot = (i: number): void => {
      scene.lecternSlots[i].visible = true;
    };
    return [
      // ── FRAGMENT 1 (red) ───────────────────────────────────────
      {
        id: 'puzzle_frag1',
        box: aabbFromCenter(-5.5, 0.25, -5.0, 0.5, 0.4, 0.5),
        hint: 'take red fragment',
        range: 3.0,
        get enabled(): boolean { return !scene.hasFrag1; },
        onInteract: () => {
          scene.hasFrag1 = true;
          scene.frag1Mesh.visible = false;
          scene.frag1Light.intensity = 0;
          revealSlot(0);
          scene.maybeSolvePuzzle();
        },
      },
      // ── FRAGMENT 2 (green) ─────────────────────────────────────
      {
        id: 'puzzle_frag2',
        box: aabbFromCenter(0, 0.25, -5.0, 0.5, 0.4, 0.5),
        hint: 'take green fragment',
        range: 3.0,
        get enabled(): boolean { return !scene.hasFrag2; },
        onInteract: () => {
          scene.hasFrag2 = true;
          scene.frag2Mesh.visible = false;
          scene.frag2Light.intensity = 0;
          revealSlot(1);
          scene.maybeSolvePuzzle();
        },
      },
      // ── FRAGMENT 3 (blue) ──────────────────────────────────────
      {
        id: 'puzzle_frag3',
        box: aabbFromCenter(5.5, 0.25, -5.0, 0.5, 0.4, 0.5),
        hint: 'take blue fragment',
        range: 3.0,
        get enabled(): boolean { return !scene.hasFrag3; },
        onInteract: () => {
          scene.hasFrag3 = true;
          scene.frag3Mesh.visible = false;
          scene.frag3Light.intensity = 0;
          revealSlot(2);
          scene.maybeSolvePuzzle();
        },
      },
      // ── LEDGER (reward) — enabled only when all 3 fragments placed ──
      {
        id: 'pickup_cannon',
        box: aabbFromCenter(2.0, 1.0, 0, 0.45, 0.4, 0.45),
        hint: 'read registry ledger',
        range: 3.0,
        get enabled(): boolean {
          return !scene.pickupCollected && scene.hasFrag1 && scene.hasFrag2 && scene.hasFrag3;
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
