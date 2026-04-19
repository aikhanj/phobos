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
 * TOWER CLUB — CHAPTER I: THE REFERRING MEMBER (Granny-style puzzle)
 *
 * The player arrives in a Tudor great hall. The pamphlet (Seal) they
 * need is inside a LOCKED CABINET on the west wall. To unlock the
 * cabinet they must find three items scattered through the room:
 *
 *   1. BRASS KEY       — stashed on the south bookshelf's bottom shelf
 *   2. SIGNATURE PEN   — on the dining table near the candelabra
 *   3. WAX SEAL STAMP  — on the north mantel, beside the shield
 *
 * Each item is a small glowing mesh with its own pickup light. The
 * cabinet checks inventory on interact: missing items are listed in a
 * HUD flash. All three collected → cabinet opens, pamphlet revealed,
 * normal pickup flow resumes.
 *
 * Meanwhile the ClubDeanHunt has Dean Eisgruber patrolling. Player
 * crouches under the dining table to hide.
 *
 * Dimensions: 20w x 16d x 6h (single floor — no stairs).
 */
export class TowerInterior implements GameScene {
  readonly name = 'tower';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(0, 1.6, 6.5);

  private time = 0;
  private bounds: AABB[] = [];
  private triggerBoxes: Trigger[] = [];
  private fireGlow!: THREE.PointLight;
  private chandelierLight!: THREE.PointLight;

  // ── PUZZLE STATE ──
  /** Inventory flags. The cabinet unlocks when all three are true. */
  private hasKey = false;
  private hasPen = false;
  private hasSeal = false;
  /** True once the cabinet door has been opened. */
  private cabinetOpen = false;
  /** True once the pamphlet (seal) has been read — fires onPickup. */
  private pickupCollected = false;

  // ── Meshes + lights per puzzle item ──
  private keyMesh!: THREE.Group;
  private keyLight!: THREE.PointLight;
  private penMesh!: THREE.Group;
  private penLight!: THREE.PointLight;
  private sealMesh!: THREE.Group;
  private sealLight!: THREE.PointLight;
  /** Closed + open cabinet meshes (only one visible at a time). */
  private cabinetClosed!: THREE.Group;
  private cabinetOpenGrp!: THREE.Group;
  /** The pamphlet mesh sits inside the cabinet — hidden until opened. */
  private pamphletMesh!: THREE.Mesh;
  private pamphletBeacon!: PickupBeacon;

  private hideZoneRefs: HideZone[] = [];
  private seatedFigure: THREE.Group | null = null;

  private readonly onExit: () => void;
  private onPickup: (() => void) | null = null;
  /**
   * Main.ts sets this so scene code can push HUD messages ("BRASS KEY
   * acquired", "the cabinet is sealed · needs PEN and SEAL") without
   * importing devHud directly.
   */
  onPuzzleMessage: ((msg: string) => void) | null = null;

  constructor(opts: { onExit: () => void; onPickup?: () => void }) {
    this.onExit = opts.onExit;
    this.onPickup = opts.onPickup ?? null;
  }

  load(): void {
    const cfg = SCENE_CONFIGS.tower;
    const { width: w, height: h, depth: d } = cfg.dimensions;
    const hw = w / 2, hd = d / 2;

    // ── Shell + wainscoting ──
    this.bounds = buildShell(this.group, w, h, d, {
      floor: 'wood_floor', ceiling: 'plaster', walls: 'wallpaper',
    });
    this.group.add(new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity * 0.7));
    const dadoY = 1.4;
    this.group.add(makeBox(w - 0.05, dadoY, 0.06, new THREE.Vector3(0, dadoY / 2, -hd + 0.05), 'wood_panel'));
    this.group.add(makeBox(w - 0.05, dadoY, 0.06, new THREE.Vector3(0, dadoY / 2, hd - 0.05), 'wood_panel'));
    this.group.add(makeBox(0.06, dadoY, d - 0.05, new THREE.Vector3(-hw + 0.05, dadoY / 2, 0), 'wood_panel'));
    this.group.add(makeBox(0.06, dadoY, d - 0.05, new THREE.Vector3(hw - 0.05, dadoY / 2, 0), 'wood_panel'));

    // Ceiling trusses.
    const beamColor = 'wood_dark' as const;
    for (const bx of [-7.0, -4.2, -1.4, 1.4, 4.2, 7.0]) {
      this.group.add(makeBox(0.22, 0.3, d - 0.2, new THREE.Vector3(bx, h - 0.16, 0), beamColor));
    }
    this.group.add(makeBox(w - 0.2, 0.2, 0.22, new THREE.Vector3(0, h - 0.55, -hd * 0.4), beamColor));
    this.group.add(makeBox(w - 0.2, 0.2, 0.22, new THREE.Vector3(0, h - 0.55, hd * 0.4), beamColor));

    // North wall: fireplace + shield. Shield sits above the fireplace
    // mantel. makeFireplace builds its own mantel slab with top at y≈2.2,
    // spanning x∈[-1.2,1.2], z∈[-7.5,-6.95]. The WAX SEAL sits on top
    // of that mantel (see Puzzle Items section below).
    const fp = makeFireplace(this.group, 0, -hd + 0.5, 1, 0x5a524a, true);
    this.fireGlow = fp.glow;
    this.group.add(makeBox(0.7, 0.9, 0.08, new THREE.Vector3(0, 2.7, -hd + 0.1), 0x3a1818));
    this.group.add(makeBox(0.5, 0.6, 0.04, new THREE.Vector3(0, 2.75, -hd + 0.06), 0x8a7038));
    makeBloodWriting(this.group, 'SEAT 7', 0, 4.3, -hd + 0.14, 'north', 0.55);

    // Windows.
    for (const wz of [-5.5, -2.8, 0, 2.8, 5.5]) {
      makeWindow(this.group, -hw, 2.8, wz, 1.2, 1.8, 1, 0x4a3a20, 0x1a0e06);
      makeWindow(this.group, hw, 2.8, wz, 1.2, 1.8, -1, 0x4a3a20, 0x1a0e06);
    }

    // ── Dining table with 6 chairs + throne (Seat 7). ──
    const tableCX = 0, tableCZ = 0;
    const tableLen = 9.0;
    makeDiningTable(this.group, tableCX, tableCZ, tableLen, 1.4, 0x3a2414, 0x2a180c, this.bounds);
    for (const z of [-3.2, 0, 3.2]) {
      this.group.add(makeBox(0.55, 0.85, 0.55, new THREE.Vector3(-1.3, 0.3, z), 'wood_dark'));
      this.group.add(makeBox(0.55, 0.55, 0.08, new THREE.Vector3(-1.53, 0.9, z), 'wood_dark'));
      this.group.add(makeBox(0.55, 0.85, 0.55, new THREE.Vector3(1.3, 0.3, z), 'wood_dark'));
      this.group.add(makeBox(0.55, 0.55, 0.08, new THREE.Vector3(1.53, 0.9, z), 'wood_dark'));
    }
    const seat7Z = -tableLen / 2 - 0.8;
    this.group.add(makeBox(0.9, 0.7, 0.9, new THREE.Vector3(0, 0.3, seat7Z), 'wood_dark'));
    this.group.add(makeBox(0.9, 1.4, 0.1, new THREE.Vector3(0, 1.15, seat7Z - 0.4), 'wood_dark'));

    // Seated figure at seat 7 (vanishes on approach).
    this.seatedFigure = new THREE.Group();
    const figMat = new THREE.MeshLambertMaterial({
      color: 0x0a0808, flatShading: true, transparent: true, opacity: 0.85, fog: false,
    });
    const tTorso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.3), figMat);
    tTorso.position.set(0, 0.9, seat7Z);
    this.seatedFigure.add(tTorso);
    const tHead = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.26), figMat.clone());
    tHead.position.set(0, 1.7, seat7Z);
    this.seatedFigure.add(tHead);
    const stoleMat = new THREE.MeshLambertMaterial({ color: 0xe77500, flatShading: true, fog: false });
    for (const sx of [-0.15, 0.15]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.04), stoleMat.clone());
      s.position.set(sx, 0.95, seat7Z + 0.16);
      this.seatedFigure.add(s);
    }
    this.group.add(this.seatedFigure);

    // Chandelier.
    this.chandelierLight = new THREE.PointLight(0xffbf80, 1.2, 14, 1.8);
    this.chandelierLight.position.set(0, h - 1.2, 0);
    this.group.add(this.chandelierLight);
    this.group.add(makeBox(2.2, 0.08, 0.4, new THREE.Vector3(0, h - 0.9, 0), 0x1a1008));

    // Sconces.
    makeSconce(this.group, -2.5, 2.6, -hd + 0.15, 1, 0xffa860, 0.9, 5);
    makeSconce(this.group, 2.5, 2.6, -hd + 0.15, 1, 0xffa860, 0.9, 5);
    makeSconce(this.group, -hw + 0.15, 2.6, -4.0, 1, 0xffa860, 0.7, 4);
    makeSconce(this.group, -hw + 0.15, 2.6, 1.5, 1, 0xffa860, 0.7, 4);
    makeSconce(this.group, hw - 0.15, 2.6, -1.5, -1, 0xffa860, 0.7, 4);
    makeSconce(this.group, hw - 0.15, 2.6, 4.0, -1, 0xffa860, 0.7, 4);

    // Portraits.
    for (const pz of [-4.0, 0, 4.0]) {
      makeFramedPicture(this.group, -hw, 3.0, pz, 0.9, 1.3, 1, 0x3a2814, 0x0a0604);
      makeFramedPicture(this.group, hw, 3.0, pz, 0.9, 1.3, -1, 0x3a2814, 0x0a0604);
    }

    // Rug.
    makeRug(this.group, 0, 0, 5.5, 10.5, 0x5a1a1a, 0x7a2a28);

    // Bookshelves + armchairs.
    makeBookshelf(this.group, -hw + 0.3, -hd + 0.3, 1.6, 2.8, 1, 0x2a180c, this.bounds);
    makeBookshelf(this.group, hw - 0.3, hd - 0.3, 1.6, 2.8, -1, 0x2a180c, this.bounds);
    makeArmchair(this.group, -3.8, -hd + 3.0, 0x4a2a1a, this.bounds);
    makeArmchair(this.group, 3.8, -hd + 3.0, 0x4a2a1a, this.bounds);

    // ── LOCKED CABINET on the west wall ──
    // Large ornate wooden cabinet. Mesh positioned flush against the
    // west wall at x ≈ -hw + 0.35. Two states (closed + open) toggled
    // when the puzzle completes.
    const cabX = -hw + 0.42;
    const cabZ = 0;
    this.cabinetClosed = new THREE.Group();
    const cabBodyMat = new THREE.MeshLambertMaterial({ color: 0x2a1808, flatShading: true });
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 1.8), cabBodyMat);
    cabBody.position.set(cabX, 1.1, cabZ);
    this.cabinetClosed.add(cabBody);
    // Iron bands (horizontal trim) — purely visual.
    for (const ty of [0.4, 1.1, 1.8]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.06, 1.82),
        new THREE.MeshLambertMaterial({ color: 0x1a1410, flatShading: true }),
      );
      band.position.set(cabX, ty, cabZ);
      this.cabinetClosed.add(band);
    }
    // Keyhole emissive — red when locked.
    const keyhole = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.12, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x700505 }),
    );
    keyhole.position.set(cabX + 0.36, 1.2, cabZ + 0.1);
    this.cabinetClosed.add(keyhole);
    // Pulsing red lock light.
    const lockLight = new THREE.PointLight(0xff2020, 1.2, 3.5, 2);
    lockLight.position.set(cabX + 0.6, 1.2, cabZ);
    this.cabinetClosed.add(lockLight);
    this.group.add(this.cabinetClosed);
    this.bounds.push(aabbFromCenter(cabX, 1.1, cabZ, 0.4, 1.1, 0.9));

    // OPEN cabinet (doors visually swung open + interior visible).
    this.cabinetOpenGrp = new THREE.Group();
    // Carcass — same body but slightly inset.
    const openBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.2, 1.8), cabBodyMat.clone());
    openBody.position.set(cabX + 0.08, 1.1, cabZ);
    this.cabinetOpenGrp.add(openBody);
    // Doors swung open at 90° on either side (simulated with boxes at angles).
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x1a0e06, flatShading: true });
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.85), doorMat);
    doorL.position.set(cabX + 0.42, 1.1, cabZ - 0.85);
    doorL.rotation.y = -Math.PI / 2;
    this.cabinetOpenGrp.add(doorL);
    const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.85), doorMat.clone());
    doorR.position.set(cabX + 0.42, 1.1, cabZ + 0.85);
    doorR.rotation.y = Math.PI / 2;
    this.cabinetOpenGrp.add(doorR);
    // Interior glow — warm gold when opened.
    const cabInteriorLight = new THREE.PointLight(0xffd070, 2.0, 4, 1.6);
    cabInteriorLight.position.set(cabX + 0.25, 1.4, cabZ);
    this.cabinetOpenGrp.add(cabInteriorLight);
    this.cabinetOpenGrp.visible = false; // hidden until puzzle solved
    this.group.add(this.cabinetOpenGrp);

    // Pamphlet inside the cabinet — visible only after opening.
    this.pamphletMesh = createNoteMesh(0.22, 0.28);
    this.pamphletMesh.rotation.x = -Math.PI / 2;
    this.pamphletMesh.position.set(cabX + 0.3, 1.25, cabZ);
    this.pamphletMesh.visible = false;
    this.group.add(this.pamphletMesh);
    // Beacon on the pamphlet — fires only once cabinet opens.
    this.pamphletBeacon = makePickupBeacon(this.group, cabX + 0.3, cabZ, 1.25, 0xffe0a0);
    this.pamphletBeacon.group.visible = false;

    // ── PUZZLE ITEMS ──
    // Each is a small glowing Group with a pickup light. Positions are
    // chosen so the player genuinely has to look around.

    // KEY — on the floor in front of the bookshelf, clearly visible.
    // Bookshelf footprint: x∈[-10.5,-8.9], z∈[-7.7,-7.3]. Place the
    // key at (-7.5, 0.2, -6.0) — 1.4m east + 1.3m south of the bookshelf
    // face so nothing overlaps it and the player can see it from the
    // south doorway.
    this.keyMesh = new THREE.Group();
    const keyMat = new THREE.MeshLambertMaterial({ color: 0xffd040, flatShading: true });
    const keyShaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.26), keyMat);
    this.keyMesh.add(keyShaft);
    const keyHead = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), keyMat.clone());
    keyHead.position.set(0, 0, -0.16);
    this.keyMesh.add(keyHead);
    const keyTooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.03), keyMat.clone());
    keyTooth1.position.set(0.05, 0, 0.1);
    this.keyMesh.add(keyTooth1);
    const keyTooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.03), keyMat.clone());
    keyTooth2.position.set(0.035, 0, 0.05);
    this.keyMesh.add(keyTooth2);
    this.keyMesh.position.set(-7.5, 0.25, -6.0);
    this.keyMesh.rotation.y = 0.6;
    this.group.add(this.keyMesh);
    this.keyLight = new THREE.PointLight(0xffe080, 1.4, 3.0, 2);
    this.keyLight.position.set(-7.5, 0.55, -6.0);
    this.group.add(this.keyLight);

    // PEN — on the dining table top (table top is at y≈0.89, spans
    // z∈[-0.7,0.7]). Place it near the north end of the table, clearly
    // on the surface.
    this.penMesh = new THREE.Group();
    const penBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 0.22),
      new THREE.MeshLambertMaterial({ color: 0x141414, flatShading: true }),
    );
    this.penMesh.add(penBody);
    const penTip = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xffd070, flatShading: true }),
    );
    penTip.position.set(0, 0, 0.1);
    this.penMesh.add(penTip);
    this.penMesh.position.set(1.5, 0.95, -0.3);
    this.penMesh.rotation.y = 0.3;
    this.group.add(this.penMesh);
    this.penLight = new THREE.PointLight(0xffffff, 1.2, 2.5, 2);
    this.penLight.position.set(1.5, 1.2, -0.3);
    this.group.add(this.penLight);

    // WAX SEAL STAMP — on top of the fireplace mantel. The mantel's
    // real top surface is at y=2.2, spanning x∈[-1.2,1.2] and
    // z∈[-7.5,-6.95]. Place the seal slightly right of center at
    // (0.5, 2.2, -7.15) so it sits visibly on the mantel, below
    // the heraldic shield at y=2.7.
    this.sealMesh = new THREE.Group();
    const sealHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.18, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x3a1e10, flatShading: true }),
    );
    sealHandle.position.set(0, 0.09, 0);
    this.sealMesh.add(sealHandle);
    const sealBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.04, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xff3040, flatShading: true }),
    );
    sealBase.position.set(0, 0.02, 0);
    this.sealMesh.add(sealBase);
    this.sealMesh.position.set(0.5, 2.2, -7.15);
    this.group.add(this.sealMesh);
    this.sealLight = new THREE.PointLight(0xff4040, 1.4, 2.8, 2);
    this.sealLight.position.set(0.5, 2.45, -7.15);
    this.group.add(this.sealLight);

    // ── HIDE ZONES — under the dining table ──
    this.hideZoneRefs.push(makeHideZone(
      this.group, 'hide_tower_table_north', -1.8, 0.4, -1.5, 0.9, 0.6, 0.9,
    ));
    this.hideZoneRefs.push(makeHideZone(
      this.group, 'hide_tower_table_south', 1.8, 0.4, 1.5, 0.9, 0.6, 0.9,
    ));

    // Abandonment debris.
    addAbandonment(this.group, w, d, h);

    // ── Exit door + triggers ──
    makeExitDoor(this.group, 0, hd - 0.05, 1.4, 2.3, -1, 0x120804, 0x2a1408);
    this.triggerBoxes.push({
      id: 'exit_to_campus',
      box: aabbFromCenter(0, 1.0, hd - 0.5, 3.0, 1.2, 0.8),
      onEnter: () => this.onExit(),
      once: true,
    });
    // Seat 7 approach trigger vanishes the seated figure.
    this.triggerBoxes.push({
      id: 'seat7_approach',
      box: aabbFromCenter(0, 1.0, seat7Z + 1.5, 2.0, 1.8, 2.5),
      onEnter: () => {
        if (this.seatedFigure) this.seatedFigure.visible = false;
      },
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
    this.seatedFigure = null;
  }

  update(dt: number): void {
    this.time += dt;
    // Fire flicker.
    if (this.fireGlow) {
      this.fireGlow.intensity = 0.85 + Math.sin(this.time * 11) * 0.06 + Math.sin(this.time * 4.3) * 0.04;
    }
    // Chandelier.
    if (this.chandelierLight) {
      const base = 1.05 + Math.sin(this.time * 1.7) * 0.08;
      const stutter = Math.random() < 0.003 ? -0.7 : 0;
      this.chandelierLight.intensity = Math.max(0.15, base + stutter);
    }
    // Puzzle items pulse their lights (attention grabbers).
    const pulse = 0.5 + 0.4 * Math.sin(this.time * 3);
    if (!this.hasKey && this.keyLight) this.keyLight.intensity = 0.5 + pulse * 0.8;
    if (!this.hasPen && this.penLight) this.penLight.intensity = 0.4 + pulse * 0.7;
    if (!this.hasSeal && this.sealLight) this.sealLight.intensity = 0.5 + pulse * 0.8;
    // Puzzle items gently hover + rotate so they read as "pickup-able".
    // Base Y values match their literal spawn positions above.
    if (!this.hasKey) {
      this.keyMesh.position.y = 0.25 + Math.sin(this.time * 2) * 0.04;
      this.keyMesh.rotation.y += dt * 0.7;
    }
    if (!this.hasPen) {
      this.penMesh.position.y = 0.95 + Math.sin(this.time * 2.3) * 0.025;
      this.penMesh.rotation.y += dt * 0.5;
    }
    if (!this.hasSeal) {
      this.sealMesh.position.y = 2.2 + Math.sin(this.time * 2.5) * 0.03;
      this.sealMesh.rotation.y += dt * 0.6;
    }
    // Pamphlet beacon animates only when cabinet is open + pickup
    // hasn't happened yet.
    if (this.cabinetOpen && !this.pickupCollected) {
      updatePickupBeacon(this.pamphletBeacon, this.time);
    }
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }
  hideZones(): HideZone[] { return this.hideZoneRefs; }
  floorHeightAt(): number { return 0; }

  /** Inventory snapshot — called by main.ts for HUD + chapter logs. */
  getPuzzleInventory(): { key: boolean; pen: boolean; seal: boolean; cabinet: boolean } {
    return {
      key: this.hasKey, pen: this.hasPen, seal: this.hasSeal, cabinet: this.cabinetOpen,
    };
  }

  interactables(): Interactable[] {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    const hw = SCENE_CONFIGS.tower.dimensions.width / 2;
    const cabX = -hw + 0.42;
    return [
      // ── KEY — floor in front of the bookshelf ──────────────────
      {
        id: 'puzzle_key',
        box: aabbFromCenter(-7.5, 0.3, -6.0, 0.5, 0.45, 0.5),
        hint: 'take brass key',
        range: 3.0,
        get enabled(): boolean { return !scene.hasKey; },
        onInteract: () => {
          scene.hasKey = true;
          scene.keyMesh.visible = false;
          scene.keyLight.intensity = 0;
          scene.onPuzzleMessage?.('BRASS KEY acquired (1/3)');
        },
      },
      // ── PEN — on the dining tabletop ───────────────────────────
      {
        id: 'puzzle_pen',
        box: aabbFromCenter(1.5, 1.0, -0.3, 0.5, 0.45, 0.5),
        hint: 'take signature pen',
        range: 3.0,
        get enabled(): boolean { return !scene.hasPen; },
        onInteract: () => {
          scene.hasPen = true;
          scene.penMesh.visible = false;
          scene.penLight.intensity = 0;
          scene.onPuzzleMessage?.('SIGNATURE PEN acquired (2/3)');
        },
      },
      // ── SEAL — on top of the fireplace mantel (y=2.2) ──────────
      {
        id: 'puzzle_seal',
        box: aabbFromCenter(0.5, 2.3, -7.15, 0.5, 0.5, 0.5),
        hint: 'take wax seal',
        range: 3.5,
        get enabled(): boolean { return !scene.hasSeal; },
        onInteract: () => {
          scene.hasSeal = true;
          scene.sealMesh.visible = false;
          scene.sealLight.intensity = 0;
          scene.onPuzzleMessage?.('WAX SEAL acquired (3/3)');
        },
      },
      // ── LOCKED CABINET ─────────────────────────────────────────
      {
        id: 'puzzle_cabinet',
        box: aabbFromCenter(cabX + 0.45, 1.1, 0, 0.6, 1.1, 1.0),
        hint: 'open cabinet',
        range: 3.0,
        get enabled(): boolean { return !scene.cabinetOpen; },
        onInteract: () => {
          const missing: string[] = [];
          if (!scene.hasKey) missing.push('BRASS KEY');
          if (!scene.hasPen) missing.push('SIGNATURE PEN');
          if (!scene.hasSeal) missing.push('WAX SEAL');
          if (missing.length > 0) {
            scene.onPuzzleMessage?.(`CABINET SEALED · need: ${missing.join(' + ')}`);
            return;
          }
          // All three present — open it.
          scene.cabinetOpen = true;
          scene.cabinetClosed.visible = false;
          scene.cabinetOpenGrp.visible = true;
          scene.pamphletMesh.visible = true;
          scene.pamphletBeacon.group.visible = true;
          scene.onPuzzleMessage?.('CABINET OPENED · read the pamphlet');
        },
      },
      // ── PAMPHLET (the Seal) ────────────────────────────────────
      {
        id: 'pickup_tower',
        // cabX + 0.3 = -9.28 — pamphlet sits inside the cabinet.
        box: aabbFromCenter(-9.28, 1.3, 0, 0.45, 0.4, 0.45),
        hint: 'read pamphlet',
        range: 3.0,
        get enabled(): boolean { return scene.cabinetOpen && !scene.pickupCollected; },
        onInteract: () => {
          scene.pickupCollected = true;
          scene.pamphletMesh.visible = false;
          scene.pamphletBeacon.group.visible = false;
          scene.onPickup?.();
        },
      },
    ];
  }
}
