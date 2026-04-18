import * as THREE from 'three';
import type { AABB, GameScene, Trigger } from '@phobos/types';
import { aabbFromCenter } from '../collision';
import type { ClubId } from './clubs/_shared';
import { CLUB_LABEL, makeBox, makeEmissive } from './clubs/_shared';
import { getTexture } from '../textures';
import { applyPS1Jitter } from '../ps1Material';

/**
 * CAMPUS — Prospect Avenue, Princeton.
 *
 *   Avenue runs east-west (±X). 5 clubs on the north side (z=-14), 5 on the
 *   south side (z=+14), in the order they appear by street address:
 *
 *   North:  Tower · Cannon · Ivy · Cottage · Cap&Gown
 *   South:  Colonial · Tiger Inn · Terrace · Cloister · Charter
 *
 *   Player spawns at the west end of the avenue facing east and walks
 *   through the street; each club's front door is a trigger that fires
 *   `onEnterClub(id)` — main.ts loads the matching interior scene.
 */
export class Campus implements GameScene {
  readonly name = 'campus';
  readonly group = new THREE.Group();
  readonly spawnPoint = new THREE.Vector3(-44, 1.6, 0);

  private lamps: Array<{ light: THREE.PointLight; phase: number }> = [];
  private canopy!: THREE.Mesh;
  private time = 0;

  private readonly onEnterClub: (id: ClubId) => void;
  private readonly lockedClubs: Set<ClubId>;
  private readonly bounds: AABB[] = [];
  private readonly triggerBoxes: Trigger[] = [];

  constructor(opts: { onEnterClub: (id: ClubId) => void; lockedClubs?: ClubId[] }) {
    this.onEnterClub = opts.onEnterClub;
    this.lockedClubs = new Set(opts.lockedClubs ?? []);
  }

  load(): void {
    this.buildGroundAndRoad();
    this.buildSkyAndLight();
    this.buildOverheadCanopy();
    this.buildLampPosts();
    this.buildDistantCampus();
    this.buildTreelines();

    // NORTH side — addresses 13 → 61
    this.buildTower(-40, -14);
    this.buildCannon(-22, -14);
    this.buildIvy(-4, -14);
    this.buildCottage(16, -14);
    this.buildCapGown(38, -14);

    // SOUTH side — addresses 40 → 79
    this.buildColonial(-40, 14);
    this.buildTigerInn(-22, 14);
    this.buildTerrace(-4, 14);
    this.buildCloister(18, 14);
    this.buildCharter(38, 14);

    this.buildArenaWalls();
    this.buildStreetSign();
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
    this.lamps = [];
    this.bounds.length = 0;
    this.triggerBoxes.length = 0;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.canopy) {
      this.canopy.position.y = 18 + Math.sin(this.time * 0.4) * 0.1;
    }
    for (const lamp of this.lamps) {
      const base = 1.3;
      const flicker = Math.sin(this.time * 5 + lamp.phase) * 0.15;
      const drop = Math.random() < 0.004 ? 0.15 : 1.0;
      lamp.light.intensity = Math.max(0, base * (1 + flicker) * drop);
    }
  }

  colliders(): AABB[] { return this.bounds; }
  triggers(): Trigger[] { return this.triggerBoxes; }

  // ─── environment ──────────────────────────────────────────────────────

  private buildGroundAndRoad(): void {
    // Mossy grounds flanking the avenue.
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x28341a, flatShading: true });
    applyPS1Jitter(groundMat);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 70),
      groundMat,
    );
    ground.rotation.x = -Math.PI / 2;
    this.group.add(ground);

    // Sidewalk strips along the road (concrete texture).
    const swMat = new THREE.MeshLambertMaterial({ map: getTexture('concrete'), flatShading: true });
    applyPS1Jitter(swMat);
    const sw = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 2),
      swMat,
    );
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(0, 0.005, -5.5);
    this.group.add(sw);
    const sw2 = sw.clone();
    sw2.position.set(0, 0.005, 5.5);
    this.group.add(sw2);

    // Cracked asphalt road (dark grey with crack strips).
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e2e30, flatShading: true });
    applyPS1Jitter(roadMat);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 8),
      roadMat,
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.002, 0);
    this.group.add(road);

    // Dashed yellow centre line (broken segments).
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xb8a040, flatShading: true });
    applyPS1Jitter(dashMat);
    for (let x = -55; x <= 55; x += 3) {
      if (Math.random() < 0.3) continue;
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.15),
        dashMat,
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.004, 0);
      this.group.add(dash);
    }

    // Crack lines (thin dark rectangles scattered on the road).
    const crackMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0c, flatShading: true });
    applyPS1Jitter(crackMat);
    for (let i = 0; i < 30; i++) {
      const crack = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4 + Math.random() * 1.5, 0.04),
        crackMat,
      );
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = Math.random() * Math.PI;
      crack.position.set(-55 + Math.random() * 110, 0.003, (Math.random() - 0.5) * 7);
      this.group.add(crack);
    }

    // Kudzu patches on the road (green irregular shapes).
    const kudzuMat = new THREE.MeshLambertMaterial({ color: 0x2a4028, flatShading: true });
    applyPS1Jitter(kudzuMat);
    for (let i = 0; i < 14; i++) {
      const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2 + Math.random(), 1.2 + Math.random()),
        kudzuMat,
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(-55 + Math.random() * 110, 0.003, (Math.random() - 0.5) * 7);
      this.group.add(patch);
    }
  }

  private buildSkyAndLight(): void {
    const sun = new THREE.DirectionalLight(0xe8e0b4, 0.45);
    sun.position.set(10, 30, -10);
    this.group.add(sun);
    this.group.add(sun.target);
  }

  private buildOverheadCanopy(): void {
    // One large dark-green plane as the canopy "ceiling" — reads as dense
    // forest cover from below.
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x0e1a0c, flatShading: true, side: THREE.DoubleSide });
    applyPS1Jitter(canopyMat);
    this.canopy = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 70),
      canopyMat,
    );
    this.canopy.rotation.x = Math.PI / 2;
    this.canopy.position.y = 18;
    this.group.add(this.canopy);
  }

  private buildLampPosts(): void {
    for (let x = -50; x <= 50; x += 14) {
      for (const side of [-1, 1]) {
        const z = side * 6;
        const postMat = new THREE.MeshLambertMaterial({ color: 0x100c10, flatShading: true });
        applyPS1Jitter(postMat);
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6),
          postMat,
        );
        post.position.set(x, 2.1, z);
        this.group.add(post);
        const arm = makeBox(0.4, 0.1, 0.1, new THREE.Vector3(x, 4.1, z - side * 0.25), 0x100c10);
        this.group.add(arm);
        // Bright glowing bulb.
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffd090 }),
        );
        bulb.position.set(x, 4.0, z - side * 0.55);
        this.group.add(bulb);
        // Warm glow halo around the bulb.
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.7, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.12 }),
        );
        halo.position.copy(bulb.position);
        this.group.add(halo);
        const light = new THREE.PointLight(0xffa050, 1.4, 12, 1.8);
        light.position.copy(bulb.position);
        this.group.add(light);
        this.lamps.push({ light, phase: Math.random() * 100 });
      }
    }
  }

  private buildDistantCampus(): void {
    // McCosh Hall's spire visible above the north treeline.
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3e, flatShading: true });
    applyPS1Jitter(stoneMat);
    const base = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 3), stoneMat);
    base.position.set(0, 6, -45);
    this.group.add(base);
    const mid = new THREE.Mesh(new THREE.ConeGeometry(2.0, 5, 8), stoneMat);
    mid.position.set(0, 14.5, -45);
    this.group.add(mid);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), stoneMat);
    finial.position.set(0, 17.5, -45);
    this.group.add(finial);
  }

  private buildTreelines(): void {
    // Instanced trees pressing into the scene from all four sides beyond
    // the clubs — the "woods have crept close" feel.
    const trunkGeom = new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x1a1008, flatShading: true });
    applyPS1Jitter(trunkMat);
    const canopyGeom = new THREE.SphereGeometry(2.2, 6, 5);
    // No jitter on instanced canopy mesh — vertex jitter on InstancedMesh can look wrong.
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x0f1d10, flatShading: true });

    const count = 140;
    const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, count);
    const canopies = new THREE.InstancedMesh(canopyGeom, canopyMat, count);
    const m = new THREE.Matrix4();

    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 4) {
      attempts++;
      const quadrant = Math.floor(Math.random() * 4);
      let x: number, z: number;
      if (quadrant === 0) { // north beyond clubs
        x = -55 + Math.random() * 110;
        z = -35 + Math.random() * 13;
      } else if (quadrant === 1) { // south beyond clubs
        x = -55 + Math.random() * 110;
        z = 22 + Math.random() * 13;
      } else if (quadrant === 2) { // west
        x = -60 + Math.random() * 8;
        z = -25 + Math.random() * 50;
      } else { // east
        x = 52 + Math.random() * 8;
        z = -25 + Math.random() * 50;
      }
      const scale = 0.9 + Math.random() * 0.6;
      m.makeScale(scale, scale, scale);
      m.setPosition(x, 2.75 * scale, z);
      trunks.setMatrixAt(placed, m);
      m.makeScale(scale * 1.3, scale * 1.0, scale * 1.3);
      m.setPosition(x, 5.5 * scale + 0.3, z);
      canopies.setMatrixAt(placed, m);
      placed++;
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    this.group.add(trunks);
    this.group.add(canopies);
  }

  private buildArenaWalls(): void {
    const y0 = 0, y1 = 8;
    this.bounds.push({ min: [-60, y0, -36], max: [-59.9, y1, 36] });
    this.bounds.push({ min: [59.9, y0, -36], max: [60, y1, 36] });
    this.bounds.push({ min: [-60, y0, -36], max: [60, y1, -35.9] });
    this.bounds.push({ min: [-60, y0, 35.9], max: [60, y1, 36] });
  }

  // ─── per-club building helpers ────────────────────────────────────────

  /**
   * Register the club as collider + entry trigger + sign, then return the
   * direction the front of this club faces (−1 if club is north of road
   * and its front faces +Z; +1 if south of road and front faces −Z).
   */
  private registerClub(id: ClubId, x: number, z: number, w: number, h: number, d: number): number {
    // North clubs (z < 0) face +Z (toward road); south clubs face -Z.
    const frontNormalZ = z < 0 ? 1 : -1;
    // Building collider (a little inset so the door area stays walkable).
    this.bounds.push(aabbFromCenter(x, h / 2, z, w / 2, h / 2, d / 2));

    const isLocked = this.lockedClubs.has(id);

    if (!isLocked) {
      // Entry trigger — only for unlocked clubs.
      const triggerZ = z + frontNormalZ * (d / 2 + 0.9);
      this.triggerBoxes.push({
        id: `enter_${id}`,
        box: aabbFromCenter(x, 1.0, triggerZ, 1.4, 1.2, 0.9),
        onEnter: () => this.onEnterClub(id),
        once: true,
      });
    } else {
      // Locked visual — dark boards nailed across the door area.
      const doorZ = z + frontNormalZ * (d / 2 + 0.08);
      // Horizontal boards
      this.group.add(makeBox(1.5, 0.12, 0.06, new THREE.Vector3(x, 0.8, doorZ), 0x1a1008));
      this.group.add(makeBox(1.5, 0.12, 0.06, new THREE.Vector3(x, 1.4, doorZ), 0x1a1008));
      this.group.add(makeBox(1.5, 0.12, 0.06, new THREE.Vector3(x, 2.0, doorZ), 0x1a1008));
      // Diagonal board (X shape implied by two crossed planks)
      const plank = makeBox(0.1, 2.4, 0.04, new THREE.Vector3(x - 0.3, 1.15, doorZ + frontNormalZ * 0.02), 0x140c06);
      plank.rotation.z = 0.35;
      this.group.add(plank);
    }

    // Sign plaque beside the door.
    this.addSignPlaque(x - w * 0.42, z + frontNormalZ * (d / 2 + 0.04), CLUB_LABEL[id], frontNormalZ);
    return frontNormalZ;
  }

  private addSignPlaque(x: number, z: number, text: string, facingNormalZ: number): void {
    const fz = z + facingNormalZ * 0.01;
    // A dark bronze plaque with a brighter-top bolt pair.
    const plaque = makeBox(1.4, 0.35, 0.05, new THREE.Vector3(x, 2.5, fz), 0x2a1a0c);
    this.group.add(plaque);
    // Indicate club name via a brass-coloured strip (we cannot render text cheaply here).
    const strip = makeBox(1.2, 0.08, 0.05, new THREE.Vector3(x, 2.5, fz + facingNormalZ * 0.02), 0x9a7838);
    this.group.add(strip);
    // Tiny corner bolts.
    this.group.add(makeEmissive(0.04, 0.04, 0.03, new THREE.Vector3(x - 0.6, 2.63, fz + facingNormalZ * 0.03), 0x5a4020));
    this.group.add(makeEmissive(0.04, 0.04, 0.03, new THREE.Vector3(x + 0.6, 2.63, fz + facingNormalZ * 0.03), 0x5a4020));
    // Log the text into userData for debugging.
    plaque.userData.signText = text;
  }

  private addDoorAndGlow(x: number, z: number, frontNormalZ: number, glowColor = 0xffa860): void {
    const fz = z + frontNormalZ * 0.06;
    const door = makeBox(1.3, 2.3, 0.08, new THREE.Vector3(x, 1.15, fz), 0x120804);
    this.group.add(door);
    // Door frame.
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x1a0e06, flatShading: true });
    applyPS1Jitter(frameMat);
    const t = 0.12;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.3 + t * 2, t, t), frameMat);
    top.position.set(x, 2.3 + t / 2, fz);
    this.group.add(top);
    const left = new THREE.Mesh(new THREE.BoxGeometry(t, 2.3 + t, t), frameMat);
    left.position.set(x - 1.3 / 2 - t / 2, (2.3 + t) / 2, fz);
    this.group.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(t, 2.3 + t, t), frameMat);
    right.position.set(x + 1.3 / 2 + t / 2, (2.3 + t) / 2, fz);
    this.group.add(right);
    // Threshold step.
    this.group.add(makeBox(1.8, 0.12, 0.5, new THREE.Vector3(x, 0.06, z + frontNormalZ * 0.35), 0x1a0e06));
    // Porch glow — inviting.
    const glow = new THREE.PointLight(glowColor, 1.1, 5.5, 2.0);
    glow.position.set(x, 2.3, z + frontNormalZ * 0.7);
    this.group.add(glow);
    // Visible bulb.
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc88 }),
    );
    bulb.position.set(x, 2.5, z + frontNormalZ * 0.7);
    this.group.add(bulb);
  }

  private addWindowPane(x: number, y: number, z: number, w: number, h: number, frontNormalZ: number, glow = 0x443822): void {
    const fz = z + frontNormalZ * 0.02;
    const pane = makeEmissive(w, h, 0.04, new THREE.Vector3(x, y, fz), glow);
    this.group.add(pane);
    // Cross muntins.
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x0a0604, flatShading: true });
    applyPS1Jitter(frameMat);
    const t = 0.06;
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(t, h + t * 2, t), frameMat);
      edge.position.set(x + side * w / 2, y, fz);
      this.group.add(edge);
    }
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, t), frameMat);
      edge.position.set(x, y + side * h / 2, fz);
      this.group.add(edge);
    }
    // Cross.
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, t), frameMat);
    crossH.position.set(x, y, fz);
    this.group.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, t), frameMat);
    crossV.position.set(x, y, fz);
    this.group.add(crossV);
  }

  private addTrim(x: number, z: number, w: number, h: number, d: number, bodyColor: number): void {
    // Foundation + cornice to break the slab.
    this.group.add(makeBox(w + 0.2, 0.4, d + 0.2, new THREE.Vector3(x, 0.2, z), 0x120a04));
    const corniceColor = new THREE.Color(bodyColor).multiplyScalar(0.55).getHex();
    this.group.add(makeBox(w + 0.25, 0.22, d + 0.25, new THREE.Vector3(x, h - 0.11, z), corniceColor));
  }

  private addPeakedRoof(x: number, z: number, w: number, d: number, bodyH: number, color: number, rh = 2.4): void {
    const slabW = Math.sqrt((w / 2) * (w / 2) + rh * rh) + 0.1;
    const angle = Math.atan2(w / 2, rh);
    const mat = new THREE.MeshLambertMaterial({ map: getTexture('wood_dark'), flatShading: true });
    applyPS1Jitter(mat);
    const l = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.25, d + 0.4), mat);
    l.position.set(x - w / 4, bodyH + rh / 2, z);
    l.rotation.z = angle;
    this.group.add(l);
    const r = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.25, d + 0.4), mat);
    r.position.set(x + w / 4, bodyH + rh / 2, z);
    r.rotation.z = -angle;
    this.group.add(r);
    // Gable-end triangles filled with darker shade.
    const tri = new THREE.BufferGeometry();
    const v = new Float32Array([
      -w / 2, 0, 0,
      w / 2, 0, 0,
      0, rh, 0,
    ]);
    tri.setAttribute('position', new THREE.BufferAttribute(v, 3));
    tri.setIndex([0, 1, 2]);
    tri.computeVertexNormals();
    const gableMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8).getHex(), flatShading: true, side: THREE.DoubleSide });
    applyPS1Jitter(gableMat);
    const gableN = new THREE.Mesh(tri, gableMat);
    gableN.position.set(x, bodyH, z + d / 2 + 0.01);
    this.group.add(gableN);
    const gableS = new THREE.Mesh(tri, gableMat);
    gableS.position.set(x, bodyH, z - d / 2 - 0.01);
    this.group.add(gableS);
  }

  private addChimney(x: number, y: number, z: number, w = 0.7, h = 2.0, color = 0x4a2a1a): void {
    this.group.add(makeBox(w, h, w, new THREE.Vector3(x, y + h / 2, z), color));
    this.group.add(makeBox(w + 0.15, 0.15, w + 0.15, new THREE.Vector3(x, y + h + 0.08, z), 0x1a0e06));
  }

  // ─── CLUBS — one method per club, architecture-driven ─────────────────

  // 1. Tower Club — Tudor/Jacobean, red brick, square crenellated central tower
  private buildTower(x: number, z: number): void {
    const w = 11, h = 7, d = 7;
    const brick = 0xa84a32;
    const stone = 0xc8b896;
    const frontZ = this.registerClub('tower', x, z, w, h, d);
    // Body.
    this.group.add(makeBox(w, h, d, new THREE.Vector3(x, h / 2, z), brick));
    this.addTrim(x, z, w, h, d, brick);
    this.addPeakedRoof(x, z, w, d, h, 0x241612, 2.6);
    // Central square tower (taller).
    const tW = 3.2, tH = h + 4;
    this.group.add(makeBox(tW, tH, tW, new THREE.Vector3(x, tH / 2, z + frontZ * 0.7), brick));
    // Limestone trim bands on tower.
    this.group.add(makeBox(tW + 0.2, 0.3, tW + 0.2, new THREE.Vector3(x, 3.0, z + frontZ * 0.7), stone));
    this.group.add(makeBox(tW + 0.2, 0.3, tW + 0.2, new THREE.Vector3(x, 6.0, z + frontZ * 0.7), stone));
    // Crenellations atop the tower — four small stone blocks.
    for (const dx of [-1.0, -0.3, 0.3, 1.0]) {
      this.group.add(makeBox(0.5, 0.6, 0.5, new THREE.Vector3(x + dx, tH + 0.3, z + frontZ * 0.7), stone));
    }
    // Tudor-arched door + porch glow.
    this.addDoorAndGlow(x, z + frontZ * (d / 2 - 0.1), frontZ);
    // Casement windows on tower.
    this.addWindowPane(x, 5.2, z + frontZ * (0.7 + tW / 2), 0.9, 1.1, frontZ);
    // Windows on wings.
    this.addWindowPane(x - 3.5, 3.5, z + frontZ * d / 2, 1.0, 1.0, frontZ);
    this.addWindowPane(x + 3.5, 3.5, z + frontZ * d / 2, 1.0, 1.0, frontZ);
    this.addChimney(x - w / 2 + 1.0, h + 0.1, z, 0.8, 2.2, brick);
    this.addChimney(x + w / 2 - 1.0, h + 0.1, z, 0.8, 2.2, brick);
  }

  // 2. Cannon Dial Elm — Collegiate Gothic, grey fieldstone, parapeted gables
  private buildCannon(x: number, z: number): void {
    const w = 12, h = 7, d = 7;
    const stone = 0x6a6a70;
    const trim = 0xbab0a0;
    const frontZ = this.registerClub('cannon', x, z, w, h, d);
    this.group.add(makeBox(w, h, d, new THREE.Vector3(x, h / 2, z), stone));
    this.addTrim(x, z, w, h, d, stone);
    // Parapeted (flat-top-with-stepped-ends) gables on east & west.
    for (const dx of [-w / 2, w / 2]) {
      const parapet = makeBox(1.0, 1.2, d + 0.2, new THREE.Vector3(x + dx, h + 0.6, z), stone);
      this.group.add(parapet);
      this.group.add(makeBox(1.1, 0.2, d + 0.3, new THREE.Vector3(x + dx, h + 1.3, z), trim));
    }
    // Peaked slate between parapets.
    this.addPeakedRoof(x, z, w - 2.0, d, h, 0x141418, 2.0);
    // Pointed stone entry arch (built as a projecting bay).
    this.group.add(makeBox(2.5, 3.4, 0.4, new THREE.Vector3(x, 1.7, z + frontZ * (d / 2 + 0.2)), trim));
    this.addDoorAndGlow(x, z + frontZ * (d / 2 + 0.35), frontZ, 0xffe0a8);
    // Carved-shield motif over door — a small dark relief.
    this.group.add(makeBox(0.6, 0.6, 0.1, new THREE.Vector3(x, 3.0, z + frontZ * (d / 2 + 0.45)), 0x3a3028));
    // Mullioned casement windows with leaded look — two flanking, two upper.
    this.addWindowPane(x - 3.5, 4.0, z + frontZ * d / 2, 1.2, 1.5, frontZ, 0x3a2a14);
    this.addWindowPane(x + 3.5, 4.0, z + frontZ * d / 2, 1.2, 1.5, frontZ, 0x3a2a14);
    // Clustered chimney stacks.
    this.addChimney(x, h + 0.1, z - d / 4, 1.1, 2.4, stone);
  }

  // 3. Ivy Club — Collegiate Gothic/Jacobethan, red-orange brick + limestone
  private buildIvy(x: number, z: number): void {
    const w = 11, h = 7, d = 7;
    const brick = 0xc25a3a;
    const stone = 0xd8c8a8;
    const frontZ = this.registerClub('ivy', x, z, w, h, d);
    this.group.add(makeBox(w, h, d, new THREE.Vector3(x, h / 2, z), brick));
    this.addTrim(x, z, w, h, d, brick);
    // Steep slate gabled roof.
    this.addPeakedRoof(x, z, w, d, h, 0x2a1a14, 3.0);
    // Projecting gabled wing on the right.
    this.group.add(makeBox(3.5, h + 1.0, 2.4, new THREE.Vector3(x + w / 2 - 1.75, (h + 1.0) / 2, z + frontZ * (d / 2 + 1.2)), brick));
    this.addPeakedRoof(x + w / 2 - 1.75, z + frontZ * (d / 2 + 1.2), 3.5, 2.4, h + 1.0, 0x2a1a14, 2.4);
    // Stone Tudor-arched front entry with limestone frame.
    this.group.add(makeBox(2.2, 3.2, 0.25, new THREE.Vector3(x - 1.8, 1.6, z + frontZ * (d / 2 + 0.15)), stone));
    this.addDoorAndGlow(x - 1.8, z + frontZ * (d / 2 + 0.3), frontZ);
    // Clustered brick chimney stacks.
    this.addChimney(x - 3.0, h + 0.1, z - 0.5, 0.7, 2.2, brick);
    this.addChimney(x - 3.0, h + 0.1, z + 0.5, 0.7, 2.2, brick);
    this.addChimney(x + 3.2, h + 0.1, z - 0.5, 0.7, 2.2, brick);
    // Leaded-diamond mullioned windows.
    this.addWindowPane(x - 4.0, 4.2, z + frontZ * d / 2, 1.1, 1.5, frontZ, 0x2a2810);
    this.addWindowPane(x + 1.5, 4.2, z + frontZ * d / 2, 1.1, 1.5, frontZ, 0x2a2810);
    // Ivy covering the left portion (the club's namesake).
    const ivyMat = new THREE.MeshLambertMaterial({ color: 0x1a3818, flatShading: true });
    applyPS1Jitter(ivyMat);
    for (let i = 0; i < 10; i++) {
      const sh = h * (0.5 + Math.random() * 0.45);
      const sx = x - w / 2 + Math.random() * w * 0.6;
      const sw2 = 0.3 + Math.random() * 0.6;
      const strand = new THREE.Mesh(new THREE.BoxGeometry(sw2, sh, 0.08), ivyMat);
      strand.position.set(sx, sh / 2, z + frontZ * (d / 2 + 0.04));
      this.group.add(strand);
    }
  }

  // 4. Cottage Club — Georgian Revival by McKim Mead White, H-plan, pedimented entry
  private buildCottage(x: number, z: number): void {
    const centerW = 8, wingW = 3.5, h = 7, d = 7;
    const brick = 0x9c3a28;
    const whiteTrim = 0xe8dcc4;
    const frontZ = this.registerClub('cottage', x, z, centerW + 2 * wingW, h, d);
    // Central block set back.
    this.group.add(makeBox(centerW, h, d, new THREE.Vector3(x, h / 2, z), brick));
    // Two forward-projecting wings (H-plan).
    const wingZ = z + frontZ * (d / 2 - 0.5);
    this.group.add(makeBox(wingW, h, d, new THREE.Vector3(x - centerW / 2 - wingW / 2 + 0.2, h / 2, wingZ), brick));
    this.group.add(makeBox(wingW, h, d, new THREE.Vector3(x + centerW / 2 + wingW / 2 - 0.2, h / 2, wingZ), brick));
    this.addTrim(x, z, centerW + 2 * wingW, h, d, brick);
    // Hipped roof across center; peaked caps on wings.
    this.group.add(makeBox(centerW + 0.3, 0.4, d + 0.3, new THREE.Vector3(x, h + 0.2, z), 0x3a2c20));
    this.addPeakedRoof(x - centerW / 2 - wingW / 2 + 0.2, wingZ, wingW, d, h, 0x3a2c20, 2.0);
    this.addPeakedRoof(x + centerW / 2 + wingW / 2 - 0.2, wingZ, wingW, d, h, 0x3a2c20, 2.0);
    // White cornice band.
    this.group.add(makeBox(centerW + 2 * wingW + 0.4, 0.25, d + 0.4, new THREE.Vector3(x, h + 0.05, z), whiteTrim));
    // Central pedimented entry portico — small white pilasters + triangular pediment.
    const portW = 2.8, portH = 3.2;
    this.group.add(makeBox(0.3, portH, 0.2, new THREE.Vector3(x - portW / 2, portH / 2, z + frontZ * (d / 2 + 0.7)), whiteTrim));
    this.group.add(makeBox(0.3, portH, 0.2, new THREE.Vector3(x + portW / 2, portH / 2, z + frontZ * (d / 2 + 0.7)), whiteTrim));
    this.group.add(makeBox(portW + 0.6, 0.35, 0.3, new THREE.Vector3(x, portH, z + frontZ * (d / 2 + 0.7)), whiteTrim));
    // Pediment triangle.
    const pedMat = new THREE.MeshLambertMaterial({ color: whiteTrim, flatShading: true, side: THREE.DoubleSide });
    applyPS1Jitter(pedMat);
    const pTri = new THREE.BufferGeometry();
    pTri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-portW / 2 - 0.3, 0, 0, portW / 2 + 0.3, 0, 0, 0, 0.9, 0]), 3));
    pTri.setIndex([0, 1, 2]);
    pTri.computeVertexNormals();
    const ped = new THREE.Mesh(pTri, pedMat);
    ped.position.set(x, portH + 0.35, z + frontZ * (d / 2 + 0.75));
    this.group.add(ped);
    // Door + fanlight.
    this.addDoorAndGlow(x, z + frontZ * (d / 2 + 0.5), frontZ);
    this.group.add(makeEmissive(1.4, 0.45, 0.04, new THREE.Vector3(x, 2.6, z + frontZ * (d / 2 + 0.54)), 0xffd49a));
    // Tall 12-over-12 windows flanking entrance.
    for (const ox of [-4.0, -2.3, 2.3, 4.0]) {
      this.addWindowPane(x + ox, 2.2, z + frontZ * d / 2, 1.0, 1.6, frontZ, 0x2a2616);
      this.addWindowPane(x + ox, 5.0, z + frontZ * d / 2, 1.0, 1.2, frontZ, 0x2a2616);
    }
    // Paired dormers.
    for (const ox of [-2.2, 2.2]) {
      this.group.add(makeBox(1.2, 1.0, 0.8, new THREE.Vector3(x + ox, h + 0.8, z + frontZ * 2.8), brick));
      this.addWindowPane(x + ox, h + 0.85, z + frontZ * 3.25, 0.8, 0.7, frontZ, 0xffd08a);
    }
    // End-wall chimneys.
    this.addChimney(x - centerW / 2 - wingW + 0.5, h + 0.3, z, 0.8, 2.5, brick);
    this.addChimney(x + centerW / 2 + wingW - 0.5, h + 0.3, z, 0.8, 2.5, brick);
  }

  // 5. Cap and Gown — Collegiate Gothic, grey stone, oriel window, gargoyles
  private buildCapGown(x: number, z: number): void {
    const w = 11, h = 7, d = 7;
    const stone = 0x807668;
    const frontZ = this.registerClub('capgown', x, z, w, h, d);
    this.group.add(makeBox(w, h, d, new THREE.Vector3(x, h / 2, z), stone));
    this.addTrim(x, z, w, h, d, stone);
    // Steep slate roof with stone-coped gables.
    this.addPeakedRoof(x, z, w, d, h, 0x18141a, 3.2);
    // Projecting front wing with oriel window bay.
    this.group.add(makeBox(3.0, h + 1.5, 2.2, new THREE.Vector3(x + 2.5, (h + 1.5) / 2, z + frontZ * (d / 2 + 1.1)), stone));
    this.addPeakedRoof(x + 2.5, z + frontZ * (d / 2 + 1.1), 3.0, 2.2, h + 1.5, 0x18141a, 2.6);
    // Tudor-arched entry with label moulding.
    this.group.add(makeBox(2.2, 3.2, 0.25, new THREE.Vector3(x - 2.5, 1.6, z + frontZ * (d / 2 + 0.15)), 0xc4b8a0));
    this.addDoorAndGlow(x - 2.5, z + frontZ * (d / 2 + 0.3), frontZ, 0xffd898);
    // Oriel window (projecting bay) on the right wing.
    const oriel = makeBox(1.4, 1.8, 0.6, new THREE.Vector3(x + 2.5, 5.2, z + frontZ * (d / 2 + 1.1 + 1.1 + 0.3)), stone);
    this.group.add(oriel);
    this.addWindowPane(x + 2.5, 5.2, z + frontZ * (d / 2 + 1.1 + 1.1 + 0.6), 1.1, 1.5, frontZ, 0x6a5838);
    // Stone mullioned windows on left.
    this.addWindowPane(x - 4.0, 4.0, z + frontZ * d / 2, 1.1, 1.6, frontZ, 0x3a3020);
    this.addWindowPane(x - 1.2, 4.0, z + frontZ * d / 2, 1.1, 1.6, frontZ, 0x3a3020);
    // Tall stone chimney stacks.
    this.addChimney(x - w / 2 + 0.8, h + 0.3, z, 0.9, 2.8, stone);
    this.addChimney(x + w / 2 - 0.8, h + 0.3, z, 0.9, 2.8, stone);
    // Carved gargoyle (small dark corbel) near roofline.
    this.group.add(makeBox(0.3, 0.35, 0.3, new THREE.Vector3(x - 3.0, h, z + frontZ * (d / 2 + 0.15)), 0x2a2420));
    this.group.add(makeBox(0.3, 0.35, 0.3, new THREE.Vector3(x + 3.0, h, z + frontZ * (d / 2 + 0.15)), 0x2a2420));
  }

  // 6. Colonial Club — Greek Revival, white, full-height 4-column Ionic portico
  private buildColonial(x: number, z: number): void {
    const w = 12, h = 8, d = 7;
    const white = 0xe8dcbc;
    const frontZ = this.registerClub('colonial', x, z, w, h, d);
    this.group.add(makeBox(w, h, d, new THREE.Vector3(x, h / 2, z), white));
    this.addTrim(x, z, w, h, d, white);
    // Low gabled roof.
    this.addPeakedRoof(x, z, w, d, h, 0x4a3828, 1.4);
    // Full-height portico: 4 white columns in front, supporting pediment.
    const columnY = h / 2;
    const columnH = h - 0.2;
    const portZ = z + frontZ * (d / 2 + 1.5);
    const columnColor = 0xece0c4;
    for (const ox of [-4.0, -1.3, 1.3, 4.0]) {
      // Column base.
      this.group.add(makeBox(0.7, 0.2, 0.7, new THREE.Vector3(x + ox, 0.1, portZ), 0xc8b88c));
      // Column shaft (cylinder).
      const colShaftMat = new THREE.MeshLambertMaterial({ color: columnColor, flatShading: true });
      applyPS1Jitter(colShaftMat);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.3, columnH - 0.4, 14),
        colShaftMat,
      );
      shaft.position.set(x + ox, 0.2 + (columnH - 0.4) / 2, portZ);
      this.group.add(shaft);
      // Ionic capital.
      this.group.add(makeBox(0.8, 0.3, 0.8, new THREE.Vector3(x + ox, columnH - 0.1, portZ), 0xc8b88c));
    }
    // Entablature (beam across columns).
    this.group.add(makeBox(w - 1.2, 0.45, 0.6, new THREE.Vector3(x, columnY * 2 + 0.1, portZ), 0xc8b88c));
    // Triangular pediment.
    const pedTri = new THREE.BufferGeometry();
    pedTri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-(w - 1.2) / 2, 0, 0, (w - 1.2) / 2, 0, 0, 0, 1.6, 0]), 3));
    pedTri.setIndex([0, 1, 2]);
    pedTri.computeVertexNormals();
    const pedMat = new THREE.MeshLambertMaterial({ color: white, flatShading: true, side: THREE.DoubleSide });
    applyPS1Jitter(pedMat);
    const ped = new THREE.Mesh(pedTri, pedMat);
    ped.position.set(x, h + 0.35, portZ);
    this.group.add(ped);
    // Portico floor.
    this.group.add(makeBox(w - 0.5, 0.15, 3, new THREE.Vector3(x, 0.08, z + frontZ * (d / 2 + 1.5)), 0xd4c29c));
    // Door recessed behind columns.
    this.addDoorAndGlow(x, z + frontZ * (d / 2 + 0.2), frontZ, 0xffe8b0);
    // Shuttered windows left/right of door.
    for (const ox of [-3.5, 3.5]) {
      this.addWindowPane(x + ox, 3.8, z + frontZ * d / 2, 0.9, 1.6, frontZ, 0x2a2416);
      // Louvered shutters at angle.
      this.group.add(makeBox(0.25, 1.6, 0.04, new THREE.Vector3(x + ox - 0.55, 3.8, z + frontZ * (d / 2 + 0.01)), 0x18140c));
      this.group.add(makeBox(0.25, 1.6, 0.04, new THREE.Vector3(x + ox + 0.55, 3.8, z + frontZ * (d / 2 + 0.01)), 0x18140c));
    }
  }

  // 7. Tiger Inn — English Tudor half-timbered, brick base + timber upper, cross-gables
  private buildTigerInn(x: number, z: number): void {
    const w = 11, h = 6.5, d = 7;
    const brick = 0x7a3a28;
    const stucco = 0xd4c4a8;
    const timber = 0x18100a;
    const frontZ = this.registerClub('tigerinn', x, z, w, h, d);
    // Brick lower story.
    const lowerH = 2.8;
    this.group.add(makeBox(w, lowerH, d, new THREE.Vector3(x, lowerH / 2, z), brick));
    // Stucco upper story.
    this.group.add(makeBox(w, h - lowerH, d, new THREE.Vector3(x, lowerH + (h - lowerH) / 2, z), stucco));
    this.addTrim(x, z, w, h, d, brick);
    // Steep slate roof.
    this.addPeakedRoof(x, z, w, d, h, 0x1a120a, 3.0);
    // Cross-gable on the front.
    const cgW = 3.5;
    this.group.add(makeBox(cgW, 2.5, 2.0, new THREE.Vector3(x + 1.5, h + 0.5, z + frontZ * (d / 2 + 0.5)), stucco));
    this.addPeakedRoof(x + 1.5, z + frontZ * (d / 2 + 0.5), cgW, 2.0, h + 2.5 - 2.0, 0x1a120a, 1.6);
    // Half-timbering: vertical and diagonal dark timber strips on the upper story.
    for (let i = -w / 2 + 1; i < w / 2 - 1; i += 1.6) {
      this.group.add(makeBox(0.15, h - lowerH - 0.3, 0.05, new THREE.Vector3(x + i, lowerH + (h - lowerH) / 2, z + frontZ * (d / 2 + 0.03)), timber));
    }
    // Horizontal timber band at the story break.
    this.group.add(makeBox(w + 0.05, 0.18, 0.07, new THREE.Vector3(x, lowerH, z + frontZ * (d / 2 + 0.03)), timber));
    // Oriel (projecting bay) window.
    this.group.add(makeBox(1.6, 1.4, 0.5, new THREE.Vector3(x - 3.0, 4.3, z + frontZ * (d / 2 + 0.25)), stucco));
    this.addWindowPane(x - 3.0, 4.3, z + frontZ * (d / 2 + 0.5), 1.2, 1.0, frontZ, 0x504028);
    // Rustic timber-hooded front door.
    this.addDoorAndGlow(x + 1.5, z + frontZ * (d / 2 + 0.05), frontZ, 0xffa868);
    // Porch hood.
    this.group.add(makeBox(2.0, 0.18, 0.9, new THREE.Vector3(x + 1.5, 2.6, z + frontZ * (d / 2 + 0.55)), timber));
    // Windows on brick lower.
    this.addWindowPane(x - 3.5, 1.6, z + frontZ * d / 2, 0.8, 1.0, frontZ, 0x2a2416);
    this.addWindowPane(x + 3.5, 1.6, z + frontZ * d / 2, 0.8, 1.0, frontZ, 0x2a2416);
    // Tall narrow brick chimney.
    this.addChimney(x + w / 2 - 1.0, h + 0.3, z - 1.2, 0.7, 2.8, brick);
  }

  // 8. Terrace Club — Cotswold Tudor, rubble stone, rambling, flagstone terrace
  private buildTerrace(x: number, z: number): void {
    const w = 12, h = 6, d = 7;
    const stone = 0x908270;
    const frontZ = this.registerClub('terrace', x, z, w, h, d);
    // Rambling mass: main block + lower side ell.
    this.group.add(makeBox(w, h, d, new THREE.Vector3(x, h / 2, z), stone));
    this.group.add(makeBox(4.0, h - 1.5, 4.0, new THREE.Vector3(x + w / 2 + 1.5, (h - 1.5) / 2, z - 1), stone));
    this.addTrim(x, z, w, h, d, stone);
    // Compound gabled roofline.
    this.addPeakedRoof(x, z, w, d, h, 0x2a1e14, 2.4);
    this.addPeakedRoof(x + w / 2 + 1.5, z - 1, 4.0, 4.0, h - 1.5, 0x2a1e14, 1.6);
    // Flagstone terrace out front.
    const terraceMat = new THREE.MeshLambertMaterial({ color: 0x7a7060, flatShading: true });
    applyPS1Jitter(terraceMat);
    const terrace = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 4, 3.5),
      terraceMat,
    );
    terrace.rotation.x = -Math.PI / 2;
    terrace.position.set(x + 1, 0.04, z + frontZ * (d / 2 + 1.75));
    this.group.add(terrace);
    // Flagstone grid lines.
    for (let gx = x - w / 2 - 1; gx <= x + w / 2 + 3; gx += 1.5) {
      this.group.add(makeBox(0.04, 0.01, 3.5, new THREE.Vector3(gx, 0.05, z + frontZ * (d / 2 + 1.75)), 0x3a3428));
    }
    // Broad arched stone entry.
    this.group.add(makeBox(2.8, 3.4, 0.35, new THREE.Vector3(x - 2, 1.7, z + frontZ * (d / 2 + 0.2)), 0xb0a090));
    this.addDoorAndGlow(x - 2, z + frontZ * (d / 2 + 0.4), frontZ, 0xffbc80);
    // Wall dormers (small gables poking out of main roof).
    for (const ox of [-3.5, 2.0]) {
      this.group.add(makeBox(1.2, 1.4, 0.6, new THREE.Vector3(x + ox, h + 0.7, z + frontZ * 2.5), stone));
      this.addWindowPane(x + ox, h + 0.8, z + frontZ * 2.85, 0.8, 0.9, frontZ, 0x4a3818);
    }
    // Mullioned windows.
    this.addWindowPane(x + 1.5, 2.8, z + frontZ * d / 2, 1.6, 1.6, frontZ, 0x3a2e1a);
    this.addWindowPane(x - 4.5, 2.8, z + frontZ * d / 2, 1.0, 1.4, frontZ, 0x3a2e1a);
    // Tall stone chimneys.
    this.addChimney(x - w / 2 + 1, h + 0.2, z, 0.9, 2.6, stone);
    this.addChimney(x + w / 2 + 2.0, h - 1.5 + 0.2, z - 1, 0.8, 2.2, stone);
  }

  // 9. Cloister Inn — Collegiate Gothic by Klauder, U-plan with arcaded courtyard
  private buildCloister(x: number, z: number): void {
    const mainW = 10, h = 7, mainD = 4;
    const wingD = 5, wingW = 2.6;
    const stone = 0x74787c;
    const frontZ = this.registerClub('cloister', x, z, mainW + wingW * 2, h, mainD + wingD);
    // Main block (back of U).
    const mainCentreZ = z - frontZ * (wingD / 2);
    this.group.add(makeBox(mainW, h, mainD, new THREE.Vector3(x, h / 2, mainCentreZ), stone));
    // Two forward wings to form the U.
    this.group.add(makeBox(wingW, h, wingD, new THREE.Vector3(x - mainW / 2 + wingW / 2, h / 2, z + frontZ * (mainD / 2 - 1) + frontZ * (wingD / 2 - mainD / 2)), stone));
    this.group.add(makeBox(wingW, h, wingD, new THREE.Vector3(x + mainW / 2 - wingW / 2, h / 2, z + frontZ * (mainD / 2 - 1) + frontZ * (wingD / 2 - mainD / 2)), stone));
    this.addTrim(x, mainCentreZ, mainW + wingW * 2, h, mainD + wingD, stone);
    // Roofs on main + wings.
    this.addPeakedRoof(x, mainCentreZ, mainW, mainD, h, 0x1a1e20, 2.6);
    this.addPeakedRoof(x - mainW / 2 + wingW / 2, mainCentreZ + frontZ * (mainD / 2 + wingD / 2), wingW, wingD, h, 0x1a1e20, 1.8);
    this.addPeakedRoof(x + mainW / 2 - wingW / 2, mainCentreZ + frontZ * (mainD / 2 + wingD / 2), wingW, wingD, h, 0x1a1e20, 1.8);
    // Arcaded cloister walk in the U — small pointed arches between wings.
    const arcY = 2.4;
    const archCount = 4;
    const archSpan = (mainW - wingW * 2) / archCount;
    for (let i = 0; i < archCount; i++) {
      const ax = x - mainW / 2 + wingW + i * archSpan + archSpan / 2;
      // Pillar + capital (shared between arches).
      this.group.add(makeBox(0.3, arcY, 0.3, new THREE.Vector3(ax - archSpan / 2 + 0.15, arcY / 2, z + frontZ * (mainD / 2 - 0.3)), stone));
      if (i === archCount - 1) {
        this.group.add(makeBox(0.3, arcY, 0.3, new THREE.Vector3(ax + archSpan / 2 - 0.15, arcY / 2, z + frontZ * (mainD / 2 - 0.3)), stone));
      }
      // Pointed-arch header above each opening.
      this.group.add(makeBox(archSpan - 0.2, 0.4, 0.3, new THREE.Vector3(ax, arcY + 0.2, z + frontZ * (mainD / 2 - 0.3)), 0xb0a898));
    }
    // Gothic entry in main block centre, behind arcade.
    this.addDoorAndGlow(x, mainCentreZ + frontZ * (mainD / 2 + 0.1), frontZ, 0xffc878);
    // Oriel window over the entry.
    this.group.add(makeBox(1.6, 1.8, 0.5, new THREE.Vector3(x, 4.8, mainCentreZ + frontZ * (mainD / 2 + 0.25)), stone));
    this.addWindowPane(x, 4.8, mainCentreZ + frontZ * (mainD / 2 + 0.5), 1.2, 1.5, frontZ, 0x50483a);
    // Side windows on wings.
    this.addWindowPane(x - mainW / 2 + wingW / 2, 4.0, z + frontZ * (mainD / 2 + wingD - 0.5), 0.9, 1.2, frontZ, 0x50483a);
    this.addWindowPane(x + mainW / 2 - wingW / 2, 4.0, z + frontZ * (mainD / 2 + wingD - 0.5), 0.9, 1.2, frontZ, 0x50483a);
    // Crenellated parapet sections on the wings.
    for (const xx of [x - mainW / 2 + wingW / 2, x + mainW / 2 - wingW / 2]) {
      for (const ox of [-0.7, 0, 0.7]) {
        this.group.add(makeBox(0.35, 0.45, 0.35, new THREE.Vector3(xx + ox, h + 0.25, z + frontZ * (mainD / 2 + wingD - 0.2)), stone));
      }
    }
  }

  // 10. Charter Club — Georgian Revival by Cram, red brick, 4-col white portico, cupola
  private buildCharter(x: number, z: number): void {
    const w = 12, h = 8, d = 7;
    const brick = 0x9c3a28;
    const whiteTrim = 0xe8dcc4;
    const frontZ = this.registerClub('charter', x, z, w, h, d);
    this.group.add(makeBox(w, h, d, new THREE.Vector3(x, h / 2, z), brick));
    this.addTrim(x, z, w, h, d, brick);
    // Side-gabled slate roof.
    this.addPeakedRoof(x, z, w, d, h, 0x3a2820, 2.0);
    // White cornice band.
    this.group.add(makeBox(w + 0.4, 0.3, d + 0.4, new THREE.Vector3(x, h + 0.1, z), whiteTrim));
    // Central 4-column portico.
    const portZ = z + frontZ * (d / 2 + 1.7);
    const columnH = h - 1;
    for (const ox of [-2.4, -0.8, 0.8, 2.4]) {
      // Base.
      this.group.add(makeBox(0.5, 0.15, 0.5, new THREE.Vector3(x + ox, 0.08, portZ), 0xc8b88c));
      // Shaft.
      const charterShaftMat = new THREE.MeshLambertMaterial({ color: whiteTrim, flatShading: true });
      applyPS1Jitter(charterShaftMat);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.22, columnH - 0.3, 12),
        charterShaftMat,
      );
      shaft.position.set(x + ox, 0.15 + (columnH - 0.3) / 2, portZ);
      this.group.add(shaft);
      // Capital.
      this.group.add(makeBox(0.45, 0.15, 0.45, new THREE.Vector3(x + ox, columnH - 0.075, portZ), 0xc8b88c));
    }
    // Portico entablature + pediment.
    this.group.add(makeBox(6.0, 0.4, 0.5, new THREE.Vector3(x, columnH + 0.1, portZ), whiteTrim));
    const pedTri = new THREE.BufferGeometry();
    pedTri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-3, 0, 0, 3, 0, 0, 0, 1.1, 0]), 3));
    pedTri.setIndex([0, 1, 2]);
    pedTri.computeVertexNormals();
    const pedMat = new THREE.MeshLambertMaterial({ color: whiteTrim, flatShading: true, side: THREE.DoubleSide });
    applyPS1Jitter(pedMat);
    const ped = new THREE.Mesh(pedTri, pedMat);
    ped.position.set(x, columnH + 0.3, portZ);
    this.group.add(ped);
    // Portico floor.
    this.group.add(makeBox(6.5, 0.15, 3.4, new THREE.Vector3(x, 0.08, portZ), 0xd4c29c));
    // Round-arched door with fanlight.
    this.addDoorAndGlow(x, z + frontZ * (d / 2 + 0.2), frontZ);
    this.group.add(makeEmissive(1.6, 0.5, 0.04, new THREE.Vector3(x, 2.65, z + frontZ * (d / 2 + 0.24)), 0xffd488));
    // 12-over-12 windows on the front, two flanking portico.
    for (const ox of [-4.2, 4.2]) {
      this.addWindowPane(x + ox, 2.3, z + frontZ * d / 2, 0.9, 1.5, frontZ, 0x2a241a);
      this.addWindowPane(x + ox, 5.2, z + frontZ * d / 2, 0.9, 1.2, frontZ, 0x2a241a);
    }
    // Pedimented dormer on roof.
    this.group.add(makeBox(1.4, 1.0, 0.9, new THREE.Vector3(x, h + 0.9, z + frontZ * 2.5), brick));
    this.addWindowPane(x, h + 0.95, z + frontZ * 2.95, 0.9, 0.8, frontZ, 0xffd488);
    // Central cupola/lantern on ridge.
    this.group.add(makeBox(1.4, 1.4, 1.4, new THREE.Vector3(x, h + 2.2, z), whiteTrim));
    const cupTopMat = new THREE.MeshLambertMaterial({ color: 0x3a2820, flatShading: true });
    applyPS1Jitter(cupTopMat);
    const cupTop = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 8), cupTopMat);
    cupTop.position.set(x, h + 3.5, z);
    this.group.add(cupTop);
    // End-wall chimneys.
    this.addChimney(x - w / 2 + 0.4, h + 0.3, z, 0.9, 2.2, brick);
    this.addChimney(x + w / 2 - 0.4, h + 0.3, z, 0.9, 2.2, brick);
  }

  private buildStreetSign(): void {
    const signX = -40;
    const signZ = -5;
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2c, flatShading: true });
    applyPS1Jitter(poleMat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6), poleMat);
    pole.position.set(signX, 1.8, signZ);
    this.group.add(pole);
    this.group.add(makeBox(3.2, 0.5, 0.06, new THREE.Vector3(signX, 3.3, signZ), 0x1a5028));
    this.group.add(makeBox(3.3, 0.06, 0.07, new THREE.Vector3(signX, 3.55, signZ), 0xd0d0d0));
    this.group.add(makeBox(3.3, 0.06, 0.07, new THREE.Vector3(signX, 3.05, signZ), 0xd0d0d0));
    this.group.add(makeBox(0.06, 0.56, 0.07, new THREE.Vector3(signX - 1.6, 3.3, signZ), 0xd0d0d0));
    this.group.add(makeBox(0.06, 0.56, 0.07, new THREE.Vector3(signX + 1.6, 3.3, signZ), 0xd0d0d0));
    const letters = 'PROSPECT AVE';
    const lw = 0.16;
    const lg = 0.04;
    const tw = letters.length * (lw + lg) - lg;
    const sx = signX - tw / 2 + lw / 2;
    for (let i = 0; i < letters.length; i++) {
      if (letters[i] === ' ') continue;
      this.group.add(makeEmissive(lw, 0.28, 0.02, new THREE.Vector3(sx + i * (lw + lg), 3.3, signZ + 0.04), 0xe0e0e0));
    }
    this.group.add(makeBox(1.6, 0.3, 0.05, new THREE.Vector3(signX, 2.85, signZ), 0x1a5028));
    const sub = 'PRINCETON NJ';
    const sw2 = 0.09;
    const sg = 0.02;
    const stw = sub.length * (sw2 + sg) - sg;
    const ssx = signX - stw / 2 + sw2 / 2;
    for (let i = 0; i < sub.length; i++) {
      if (sub[i] === ' ') continue;
      this.group.add(makeEmissive(sw2, 0.16, 0.02, new THREE.Vector3(ssx + i * (sw2 + sg), 2.85, signZ + 0.03), 0xd0d0d0));
    }
  }
}
