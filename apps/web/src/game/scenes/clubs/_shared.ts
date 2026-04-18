import * as THREE from 'three';
import type { AABB } from '@phobos/types';
import { aabbFromCenter } from '../../collision';
import { getTexture, type TextureType } from '../../textures';
import { applyPS1Jitter } from '../../ps1Material';

/** Unique identifier for each of the 10 eating clubs. */
export type ClubId =
  | 'tower'
  | 'cannon'
  | 'ivy'
  | 'cottage'
  | 'capgown'
  | 'colonial'
  | 'tigerinn'
  | 'terrace'
  | 'cloister'
  | 'charter';

export const CLUB_LABEL: Record<ClubId, string> = {
  tower: 'Tower Club',
  cannon: 'Cannon Dial Elm',
  ivy: 'Ivy Club',
  cottage: 'University Cottage Club',
  capgown: 'Cap and Gown',
  colonial: 'Colonial Club',
  tigerinn: 'Tiger Inn',
  terrace: 'Terrace Club',
  cloister: 'Cloister Inn',
  charter: 'Charter Club',
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared mesh helpers — keep club interiors concise and consistent with the
// existing basement/bedroom/attic visual language.
// ─────────────────────────────────────────────────────────────────────────────

export function makeWall(
  w: number, h: number, p: THREE.Vector3, r: THREE.Euler, appearance: number | TextureType,
): THREE.Mesh {
  const mat = typeof appearance === 'string'
    ? new THREE.MeshLambertMaterial({ map: getTexture(appearance), flatShading: true, side: THREE.FrontSide })
    : new THREE.MeshLambertMaterial({ color: appearance, flatShading: true, side: THREE.FrontSide });
  applyPS1Jitter(mat);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.copy(p);
  mesh.rotation.copy(r);
  return mesh;
}

export function makeBox(
  w: number, h: number, d: number, p: THREE.Vector3, appearance: number | TextureType,
): THREE.Mesh {
  const mat = typeof appearance === 'string'
    ? new THREE.MeshLambertMaterial({ map: getTexture(appearance), flatShading: true })
    : new THREE.MeshLambertMaterial({ color: appearance, flatShading: true });
  applyPS1Jitter(mat);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.copy(p);
  return mesh;
}

export function makeEmissive(
  w: number, h: number, d: number, p: THREE.Vector3, color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.copy(p);
  return mesh;
}

/**
 * Build a standard rectangular room shell (6 planes) with per-surface colors
 * and baseboard trim. Returns the collider AABBs for the walls.
 */
export function buildShell(
  group: THREE.Group,
  w: number, h: number, d: number,
  colors: { floor: number | TextureType; ceiling: number | TextureType; walls: number | TextureType; baseboard?: number | TextureType },
): AABB[] {
  const hw = w / 2, hd = d / 2;
  group.add(makeWall(w, d, new THREE.Vector3(0, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), colors.floor));
  group.add(makeWall(w, d, new THREE.Vector3(0, h, 0), new THREE.Euler(Math.PI / 2, 0, 0), colors.ceiling));
  group.add(makeWall(w, h, new THREE.Vector3(0, h / 2, -hd), new THREE.Euler(0, 0, 0), colors.walls));
  group.add(makeWall(w, h, new THREE.Vector3(0, h / 2, hd), new THREE.Euler(0, Math.PI, 0), colors.walls));
  group.add(makeWall(d, h, new THREE.Vector3(-hw, h / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), colors.walls));
  group.add(makeWall(d, h, new THREE.Vector3(hw, h / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), colors.walls));

  // Baseboard trim so walls/floor have a defined edge line.
  const base = colors.baseboard ?? 0x0a0604;
  group.add(makeBox(w - 0.02, 0.12, 0.05, new THREE.Vector3(0, 0.06, -hd + 0.03), base));
  group.add(makeBox(w - 0.02, 0.12, 0.05, new THREE.Vector3(0, 0.06, hd - 0.03), base));
  group.add(makeBox(0.05, 0.12, d - 0.02, new THREE.Vector3(-hw + 0.03, 0.06, 0), base));
  group.add(makeBox(0.05, 0.12, d - 0.02, new THREE.Vector3(hw - 0.03, 0.06, 0), base));

  // Wall colliders (thin slabs offset slightly outside the visible surface).
  return [
    { min: [-hw, 0, -hd - 0.1], max: [hw, h, -hd] },   // north
    { min: [-hw, 0, hd], max: [hw, h, hd + 0.1] },     // south
    { min: [-hw - 0.1, 0, -hd], max: [-hw, h, hd] },   // west
    { min: [hw, 0, -hd], max: [hw + 0.1, h, hd] },     // east
  ];
}

// ─── Architectural primitives used across clubs ──────────────────────────

/** A simple column — cylinder shaft + square capital + square base. */
export function makeColumn(
  group: THREE.Group, x: number, z: number, h: number,
  color = 0xd8d0b8, capColor = 0xc0b89c,
): void {
  const base = makeBox(0.5, 0.15, 0.5, new THREE.Vector3(x, 0.075, z), capColor);
  group.add(base);
  const shaftMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  applyPS1Jitter(shaftMat);
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.2, h - 0.3, 12),
    shaftMat,
  );
  shaft.position.set(x, 0.15 + (h - 0.3) / 2, z);
  group.add(shaft);
  const cap = makeBox(0.44, 0.15, 0.44, new THREE.Vector3(x, h - 0.075, z), capColor);
  group.add(cap);
}

/** A simple classical pilaster (flat rectangular column against a wall). */
export function makePilaster(
  group: THREE.Group, x: number, z: number, h: number, facingNormalZ: number,
  color = 0xeae0c4,
): void {
  const w = 0.35, depth = 0.1;
  const shaft = makeBox(w, h - 0.3, depth, new THREE.Vector3(x, h / 2, z + facingNormalZ * depth / 2), color);
  group.add(shaft);
  const cap = makeBox(w + 0.1, 0.15, depth + 0.05, new THREE.Vector3(x, h - 0.075, z + facingNormalZ * depth / 2), color);
  group.add(cap);
  const base = makeBox(w + 0.1, 0.15, depth + 0.05, new THREE.Vector3(x, 0.075, z + facingNormalZ * depth / 2), color);
  group.add(base);
}

/** A stone fireplace with mantel, hearth, opening, and optional glow. */
export function makeFireplace(
  group: THREE.Group, x: number, z: number, facingNormalZ: number,
  stoneColor = 0x484038, fireOn = true,
): { glow: THREE.PointLight } {
  const w = 2.4, h = 2.2, depth = 0.55;
  const fz = z + facingNormalZ * depth / 2;
  // Mantel + surround (as a C-shape made of 3 slabs).
  group.add(makeBox(w, 0.35, depth, new THREE.Vector3(x, h - 0.175, fz), stoneColor));             // mantel top
  group.add(makeBox(0.35, h, depth, new THREE.Vector3(x - w / 2 + 0.175, h / 2, fz), stoneColor)); // left pillar
  group.add(makeBox(0.35, h, depth, new THREE.Vector3(x + w / 2 - 0.175, h / 2, fz), stoneColor)); // right pillar
  group.add(makeBox(w - 0.7, 0.25, depth, new THREE.Vector3(x, 0.125, fz), stoneColor));           // hearth base
  // Dark interior opening.
  const openW = w - 0.7, openH = h - 0.45;
  group.add(makeEmissive(openW, openH, 0.05, new THREE.Vector3(x, 0.25 + openH / 2, fz + facingNormalZ * 0.28), 0x000000));
  // Ember glow if lit.
  if (fireOn) {
    group.add(makeEmissive(openW * 0.7, 0.15, 0.25, new THREE.Vector3(x, 0.33, fz + facingNormalZ * 0.1), 0xff6a28));
    const glow = new THREE.PointLight(0xff7a38, 0.9, 6, 2.0);
    glow.position.set(x, 0.8, fz + facingNormalZ * 0.3);
    group.add(glow);
    return { glow };
  }
  const dummy = new THREE.PointLight(0x000000, 0, 0.01);
  return { glow: dummy };
}

/** A framed painting hung on a wall. */
export function makeFramedPicture(
  group: THREE.Group, x: number, y: number, z: number, w: number, h: number,
  facingNormalZ: number, canvasColor = 0x4a3828, frameColor = 0x0a0604,
): void {
  const t = 0.06;
  const fz = z + facingNormalZ * 0.03;
  group.add(makeBox(w + t * 2, h + t * 2, t, new THREE.Vector3(x, y, fz), frameColor));
  group.add(makeBox(w, h, t * 0.5, new THREE.Vector3(x, y, fz + facingNormalZ * 0.02), canvasColor));
}

/** A window on a wall with a dark frame and emissive pane. */
export function makeWindow(
  group: THREE.Group, x: number, y: number, z: number, w: number, h: number,
  facingNormalZ: number, paneColor = 0x3a3a1e, frameColor = 0x1a0e06,
): void {
  const t = 0.08;
  const fz = z + facingNormalZ * 0.03;
  // Pane (emissive so it glows).
  group.add(makeEmissive(w, h, 0.04, new THREE.Vector3(x, y, fz), paneColor));
  // Frame (4 sides + cross muntin).
  const frameMat = new THREE.MeshLambertMaterial({ color: frameColor, flatShading: true });
  applyPS1Jitter(frameMat);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, t), frameMat);
  top.position.set(x, y + h / 2, fz);
  group.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, t), frameMat);
  bot.position.set(x, y - h / 2, fz);
  group.add(bot);
  const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), frameMat);
  left.position.set(x - w / 2, y, fz);
  group.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), frameMat);
  right.position.set(x + w / 2, y, fz);
  group.add(right);
  // Cross muntins.
  group.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, t), frameMat).translateX(x).translateY(y).translateZ(fz));
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, t), frameMat);
  v.position.set(x, y, fz);
  group.add(v);
}

/** A simple long dining table with chairs along each side. */
export function makeDiningTable(
  group: THREE.Group, x: number, z: number, length: number, width = 1.1,
  topColor = 0x3a2414, chairColor = 0x1a100a,
  colliders?: AABB[],
): void {
  const topThickness = 0.08;
  const topY = 0.85;
  group.add(makeBox(length, topThickness, width, new THREE.Vector3(x, topY, z), topColor));
  // Legs.
  for (const lx of [-length / 2 + 0.2, length / 2 - 0.2]) {
    for (const lz of [-width / 2 + 0.12, width / 2 - 0.12]) {
      group.add(makeBox(0.08, topY, 0.08, new THREE.Vector3(x + lx, topY / 2, z + lz), topColor));
    }
  }
  // Chairs along both long sides.
  const chairSpacing = 1.1;
  const chairCount = Math.max(1, Math.floor(length / chairSpacing));
  const startX = x - (chairCount - 1) * chairSpacing / 2;
  for (let i = 0; i < chairCount; i++) {
    const cx = startX + i * chairSpacing;
    for (const side of [-1, 1]) {
      const cz = z + side * (width / 2 + 0.25);
      // Seat.
      group.add(makeBox(0.4, 0.05, 0.4, new THREE.Vector3(cx, 0.45, cz), chairColor));
      // Back.
      const backZ = cz + side * 0.18;
      group.add(makeBox(0.4, 0.6, 0.05, new THREE.Vector3(cx, 0.75, backZ), chairColor));
      // Legs.
      for (const lx of [-0.17, 0.17]) {
        for (const lz of [-0.17, 0.17]) {
          group.add(makeBox(0.04, 0.45, 0.04, new THREE.Vector3(cx + lx, 0.225, cz + lz), chairColor));
        }
      }
    }
  }
  // Table footprint collider.
  colliders?.push(aabbFromCenter(x, topY / 2, z, length / 2, topY / 2, width / 2));
}

/** A bookshelf (solid from the player's POV, with ribbed book texture via colored stripes). */
export function makeBookshelf(
  group: THREE.Group, x: number, z: number, w: number, h: number,
  facingNormalZ: number, woodColor = 0x2a1a0e,
  colliders?: AABB[],
): void {
  const depth = 0.4;
  // Carcass: back panel + left/right sides + top + bottom + 3 shelves.
  const fz = z + facingNormalZ * depth / 2;
  group.add(makeBox(w, h, 0.06, new THREE.Vector3(x, h / 2, fz - facingNormalZ * depth / 2 + facingNormalZ * 0.03), woodColor));
  group.add(makeBox(0.08, h, depth, new THREE.Vector3(x - w / 2, h / 2, fz), woodColor));
  group.add(makeBox(0.08, h, depth, new THREE.Vector3(x + w / 2, h / 2, fz), woodColor));
  group.add(makeBox(w, 0.06, depth, new THREE.Vector3(x, h - 0.03, fz), woodColor));
  group.add(makeBox(w, 0.06, depth, new THREE.Vector3(x, 0.03, fz), woodColor));
  // 4 shelves with books.
  const bookColors = [0x4a2a1a, 0x2a4a2a, 0x1a2a4a, 0x4a1a1a, 0x3a3a1a, 0x1a3a3a];
  for (let shelfI = 0; shelfI < 4; shelfI++) {
    const shelfY = (shelfI + 1) * (h / 5);
    group.add(makeBox(w - 0.16, 0.03, depth - 0.05, new THREE.Vector3(x, shelfY, fz), woodColor));
    // Books on this shelf.
    let bx = x - w / 2 + 0.12;
    while (bx < x + w / 2 - 0.12) {
      const bw = 0.05 + Math.random() * 0.06;
      const bh = 0.18 + Math.random() * 0.08;
      const col = bookColors[Math.floor(Math.random() * bookColors.length)];
      group.add(makeBox(bw, bh, depth - 0.08, new THREE.Vector3(bx + bw / 2, shelfY + bh / 2 + 0.015, fz), col));
      bx += bw + 0.005;
    }
  }
  colliders?.push(aabbFromCenter(x, h / 2, fz, w / 2, h / 2, depth / 2));
}

/** A single cushioned armchair. */
export function makeArmchair(
  group: THREE.Group, x: number, z: number, color = 0x4a2a1a,
  colliders?: AABB[],
): void {
  // Seat + backrest + two armrests + 4 legs.
  group.add(makeBox(0.9, 0.25, 0.8, new THREE.Vector3(x, 0.45, z), color));
  group.add(makeBox(0.9, 0.8, 0.18, new THREE.Vector3(x, 0.88, z + 0.3), color));
  group.add(makeBox(0.15, 0.45, 0.8, new THREE.Vector3(x - 0.42, 0.6, z), color));
  group.add(makeBox(0.15, 0.45, 0.8, new THREE.Vector3(x + 0.42, 0.6, z), color));
  colliders?.push(aabbFromCenter(x, 0.4, z, 0.5, 0.4, 0.5));
}

/** An emissive warm sconce on a wall. */
export function makeSconce(
  group: THREE.Group, x: number, y: number, z: number, facingNormalZ: number,
  color = 0xffcc88, intensity = 0.7, range = 4.5,
): THREE.PointLight {
  // Small bracket + bulb.
  const bracket = makeBox(0.08, 0.12, 0.14, new THREE.Vector3(x, y, z + facingNormalZ * 0.08), 0x1a120a);
  group.add(bracket);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe8b0 }),
  );
  bulb.position.set(x, y, z + facingNormalZ * 0.18);
  group.add(bulb);
  const light = new THREE.PointLight(color, intensity, range, 2.0);
  light.position.set(x, y, z + facingNormalZ * 0.18);
  group.add(light);
  return light;
}

/** A rug on the floor. */
export function makeRug(
  group: THREE.Group, x: number, z: number, w: number, d: number,
  color = 0x5a2a28, pattern = 0x7a3a38,
): void {
  group.add(makeBox(w, 0.01, d, new THREE.Vector3(x, 0.011, z), color));
  group.add(makeBox(w - 0.3, 0.012, d - 0.3, new THREE.Vector3(x, 0.013, z), pattern));
}

/**
 * Scatter abandoned debris throughout a room — overturned chairs, papers,
 * broken shards, dust, cobwebs, fallen paintings. Sells the "decades
 * abandoned" feel without any runtime cost (static geometry only).
 */
export function addAbandonment(
  group: THREE.Group, w: number, d: number, h: number, density = 1.0,
): void {
  const hw = w / 2, hd = d / 2;
  const r = () => Math.random();

  // ── overturned chairs ──
  const chairCount = Math.floor(4 * density);
  for (let i = 0; i < chairCount; i++) {
    const x = (r() - 0.5) * (w - 4);
    const z = (r() - 0.5) * (d - 4);
    const rot = r() * Math.PI;
    const tilt = Math.PI / 2 + (r() - 0.5) * 0.4;
    // seat
    const seat = makeBox(0.45, 0.05, 0.45, new THREE.Vector3(x, 0.25, z), 0x1a100a);
    seat.rotation.set(0, rot, tilt);
    group.add(seat);
    // back
    const back = makeBox(0.45, 0.55, 0.05, new THREE.Vector3(x + Math.cos(rot) * 0.25, 0.35, z + Math.sin(rot) * 0.25), 0x1a100a);
    back.rotation.set(0, rot, tilt * 0.8);
    group.add(back);
  }

  // ── scattered papers / parchment ──
  const paperCount = Math.floor(12 * density);
  for (let i = 0; i < paperCount; i++) {
    const x = (r() - 0.5) * (w - 2);
    const z = (r() - 0.5) * (d - 2);
    const paperMat = new THREE.MeshLambertMaterial({ color: r() > 0.3 ? 0xc8c0a0 : 0x9a9480, flatShading: true, side: THREE.DoubleSide });
    applyPS1Jitter(paperMat);
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25 + r() * 0.25, 0.35 + r() * 0.2),
      paperMat,
    );
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = r() * Math.PI * 2;
    paper.position.set(x, 0.01 + r() * 0.005, z);
    group.add(paper);
  }

  // ── dust / dirt patches ──
  const dustCount = Math.floor(8 * density);
  for (let i = 0; i < dustCount; i++) {
    const x = (r() - 0.5) * (w - 1);
    const z = (r() - 0.5) * (d - 1);
    const dustMat = new THREE.MeshLambertMaterial({ color: 0x2a2218, flatShading: true, side: THREE.DoubleSide });
    applyPS1Jitter(dustMat);
    const dust = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8 + r() * 1.5, 0.6 + r() * 1.2),
      dustMat,
    );
    dust.rotation.x = -Math.PI / 2;
    dust.rotation.z = r() * Math.PI;
    dust.position.set(x, 0.005, z);
    group.add(dust);
  }

  // ── broken plate / glass shards ──
  const shardClusters = Math.floor(5 * density);
  for (let i = 0; i < shardClusters; i++) {
    const cx = (r() - 0.5) * (w - 3);
    const cz = (r() - 0.5) * (d - 3);
    const count = 3 + Math.floor(r() * 5);
    const isGlass = r() > 0.5;
    for (let s = 0; s < count; s++) {
      const shard = makeBox(
        0.04 + r() * 0.1, 0.01, 0.03 + r() * 0.08,
        new THREE.Vector3(cx + (r() - 0.5) * 0.5, 0.008, cz + (r() - 0.5) * 0.5),
        isGlass ? 0x8aa0a8 : 0xd0c8b0,
      );
      shard.rotation.y = r() * Math.PI;
      group.add(shard);
    }
  }

  // ── cobwebs in upper corners ──
  const corners: Array<[number, number]> = [[-hw + 0.05, -hd + 0.05], [hw - 0.05, -hd + 0.05], [-hw + 0.05, hd - 0.05], [hw - 0.05, hd - 0.05]];
  for (const [cx, cz] of corners) {
    if (r() > 0.35) {
      const web = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5 + r() * 1.0, 1.0 + r() * 0.8),
        new THREE.MeshBasicMaterial({ color: 0x888880, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
      );
      web.position.set(cx, h - 0.5 - r() * 0.5, cz);
      web.rotation.set(r() * 0.3, Math.atan2(-cz, -cx), r() * 0.2);
      group.add(web);
    }
  }

  // ── fallen / leaning paintings ──
  const fallenCount = Math.floor(2 * density);
  for (let i = 0; i < fallenCount; i++) {
    const side = r() > 0.5 ? 1 : -1;
    const onX = r() > 0.5;
    const px = onX ? side * (hw - 0.12) : (r() - 0.5) * (w - 3);
    const pz = onX ? (r() - 0.5) * (d - 4) : side * (hd - 0.12);
    const lean = side * (0.1 + r() * 0.15);
    const frame = makeBox(0.7 + r() * 0.4, 0.9 + r() * 0.3, 0.06, new THREE.Vector3(px, 0.5, pz), 0x0a0604);
    if (onX) frame.rotation.z = lean;
    else frame.rotation.x = lean;
    group.add(frame);
    const canvas = makeBox(0.55 + r() * 0.3, 0.7 + r() * 0.2, 0.03, new THREE.Vector3(px, 0.5, pz + 0.02), 0x4a3828);
    if (onX) canvas.rotation.z = lean;
    else canvas.rotation.x = lean;
    group.add(canvas);
  }

  // ── toppled candlesticks ──
  const candleCount = Math.floor(3 * density);
  for (let i = 0; i < candleCount; i++) {
    const x = (r() - 0.5) * (w - 3);
    const z = (r() - 0.5) * (d - 3);
    const stick = makeBox(0.06, 0.35, 0.06, new THREE.Vector3(x, 0.03, z), 0x8a7040);
    stick.rotation.z = Math.PI / 2 + (r() - 0.5) * 0.3;
    stick.rotation.y = r() * Math.PI;
    group.add(stick);
  }

  // ── rubble / stone chips along walls ──
  const rubbleCount = Math.floor(6 * density);
  for (let i = 0; i < rubbleCount; i++) {
    const wallSide = Math.floor(r() * 4);
    let x: number, z: number;
    if (wallSide === 0) { x = -hw + 0.3 + r() * 0.5; z = (r() - 0.5) * d; }
    else if (wallSide === 1) { x = hw - 0.3 - r() * 0.5; z = (r() - 0.5) * d; }
    else if (wallSide === 2) { x = (r() - 0.5) * w; z = -hd + 0.3 + r() * 0.5; }
    else { x = (r() - 0.5) * w; z = hd - 0.3 - r() * 0.5; }
    const chunk = makeBox(0.15 + r() * 0.2, 0.1 + r() * 0.12, 0.12 + r() * 0.18,
      new THREE.Vector3(x, 0.06, z), 0x4a4440 + Math.floor(r() * 0x101010));
    chunk.rotation.y = r() * Math.PI;
    group.add(chunk);
  }
}

/** Exit door marker — a dark panel + a frame, used as the return-to-campus visual. */
export function makeExitDoor(
  group: THREE.Group, x: number, z: number, w: number, h: number,
  facingNormalZ: number, color = 0x0a0604, frameColor = 0x1a0f08,
): void {
  const fz = z + facingNormalZ * 0.02;
  // Panel.
  group.add(makeBox(w, h, 0.05, new THREE.Vector3(x, h / 2, fz), color));
  // Frame.
  const t = 0.1;
  group.add(makeBox(w + t * 2, t, t, new THREE.Vector3(x, h + t / 2, fz), frameColor));
  group.add(makeBox(t, h + t, t, new THREE.Vector3(x - w / 2 - t / 2, (h + t) / 2, fz), frameColor));
  group.add(makeBox(t, h + t, t, new THREE.Vector3(x + w / 2 + t / 2, (h + t) / 2, fz), frameColor));
  // Threshold step.
  group.add(makeBox(w + 0.5, 0.05, 0.4, new THREE.Vector3(x, 0.025, z + facingNormalZ * 0.22), frameColor));
  // Doorknob.
  const knobMat = new THREE.MeshLambertMaterial({ color: 0x8a7040, flatShading: true });
  applyPS1Jitter(knobMat);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    knobMat,
  );
  knob.position.set(x + w * 0.35, h * 0.5, fz + facingNormalZ * 0.03);
  group.add(knob);
  // Warm exit glow so the player can find the door in the fog.
  const exitGlow = new THREE.PointLight(0xff9050, 1.2, 8, 1.8);
  exitGlow.position.set(x, h * 0.7, z + facingNormalZ * 0.5);
  group.add(exitGlow);
  // Visible "EXIT" strip above the door — emissive so it cuts through fog.
  group.add(makeEmissive(0.6, 0.15, 0.04, new THREE.Vector3(x, h + 0.2, fz), 0xcc3030));
}
