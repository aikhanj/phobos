import * as THREE from 'three';
import type { AABB, HideZone } from '@phobos/types';
import { aabbFromCenter } from '../../collision';
import { getTexture, type TextureType } from '../../textures';
import { applyPS1Jitter } from '../../ps1Material';

export type { HideZone };

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

  // Wall colliders — thick slabs extending OUTWARD from the visible
  // wall surface. 0.1m-thick colliders tunnel-through at sprint speed
  // (7.2 m/s × ~16ms frame = 0.12m/step), so the player phased through
  // walls. 5m thickness guarantees no tunneling even at 30fps spikes.
  // The interior boundary still matches the visible wall so collision
  // feels crisp at the surface.
  const T = 5;
  return [
    { min: [-hw, 0, -hd - T], max: [hw, h, -hd] },   // north
    { min: [-hw, 0, hd],       max: [hw, h, hd + T] }, // south
    { min: [-hw - T, 0, -hd],  max: [-hw, h, hd] },  // west
    { min: [hw, 0, -hd],       max: [hw + T, h, hd] }, // east
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

/**
 * Bright vertical pulsing beacon — marks a pickup so the player can see
 * it from anywhere in the room. Returns the group so callers can hide
 * it once the pickup is collected (`.visible = false`).
 *
 * Visual recipe: a strong point light + a thin emissive column + a
 * horizontal halo ring at pickup height. All emissive so PS1 lighting
 * doesn't darken them. The column pulses by being animated in the
 * caller's update() via the returned refs.
 */
export interface PickupBeacon {
  group: THREE.Group;
  light: THREE.PointLight;
  column: THREE.Mesh;
  halo: THREE.Mesh;
}
export function makePickupBeacon(
  parent: THREE.Group, x: number, z: number, pickupY: number,
  color = 0xfff0b0,
): PickupBeacon {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Strong point light that travels up from the pickup height.
  const light = new THREE.PointLight(color, 2.6, 14, 1.5);
  light.position.set(0, pickupY + 0.3, 0);
  group.add(light);

  // FULL-HEIGHT emissive column — extends from floor-level up through
  // the whole room so it's visible from any corner of any floor. When
  // the pickup is on an upper loft, this column pokes through the
  // loft floor edge and reads as a "godray" pillar from below.
  const columnHeight = Math.max(7.5, pickupY + 3.5);
  const columnGeo = new THREE.CylinderGeometry(0.06, 0.06, columnHeight, 8, 1, true);
  const columnMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
  });
  const column = new THREE.Mesh(columnGeo, columnMat);
  column.position.set(0, columnHeight / 2, 0);
  group.add(column);

  // Wider outer glow column — softer halo so the beam reads as light,
  // not a hard pipe.
  const outerGeo = new THREE.CylinderGeometry(0.25, 0.25, columnHeight, 12, 1, true);
  const outerMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.position.set(0, columnHeight / 2, 0);
  group.add(outer);

  // Horizontal halo ring at pickup height — circles the pickup.
  const haloGeo = new THREE.RingGeometry(0.35, 0.5, 32);
  const haloMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(0, pickupY + 0.03, 0);
  group.add(halo);

  // Floor halo too — so looking DOWN from wherever the pickup sits
  // shows a ring; looking UP from below shows the beam striking the
  // loft floor. Position this slightly above y=0 to avoid z-fighting.
  const floorHalo = new THREE.Mesh(haloGeo, haloMat.clone());
  floorHalo.rotation.x = -Math.PI / 2;
  floorHalo.position.set(0, 0.03, 0);
  (floorHalo.material as THREE.MeshBasicMaterial).opacity = 0.55;
  group.add(floorHalo);

  parent.add(group);
  return { group, light, column, halo };
}

/**
 * Tick a PickupBeacon: pulses the column/halo/light based on `time` seconds.
 * Call from the scene's update(dt) loop. Safe to call while hidden.
 */
export function updatePickupBeacon(b: PickupBeacon, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.0);
  b.light.intensity = 1.4 + pulse * 1.6;
  (b.column.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.45;
  (b.halo.material as THREE.MeshBasicMaterial).opacity = 0.4 + pulse * 0.55;
  b.halo.scale.setScalar(0.85 + pulse * 0.3);
  b.column.rotation.y = time * 0.8;
}

/**
 * Straight staircase — N wooden steps going up along +Z (or -Z) over
 * the given run. Adds boxes for each step and colliders (the steps
 * themselves are walkable as their collider tops align with their
 * geometry; player collides with the side walls naturally). Also adds
 * side railings as thin vertical columns for visual clarity.
 *
 * The returned object exposes the XZ footprint + the top-step world
 * position so callers can place the loft platform at the right height.
 */
export interface Stairs {
  topY: number;
  topZ: number;
  /** Half-extents of the stair footprint on XZ — for collision/obstacle avoidance. */
  footprint: { cx: number; cz: number; hw: number; hd: number };
}
export function makeStairs(
  group: THREE.Group,
  startX: number, startZ: number, direction: -1 | 1,
  stepCount: number, stepWidth: number, totalRise: number, totalRun: number,
  bounds: AABB[],
): Stairs {
  const stepRise = totalRise / stepCount;
  const stepRun = totalRun / stepCount;
  // Build visual step geometry ONLY — no colliders per step. Player
  // vertical position is driven by scene.floorHeightAt() instead, so
  // the stairs are walkable surfaces. Step meshes are purely cosmetic;
  // the player's feet "lerp" up the slope smoothly.
  for (let i = 0; i < stepCount; i++) {
    const y = (i + 0.5) * stepRise;
    const z = startZ + direction * (i + 0.5) * stepRun;
    const step = makeBox(stepWidth, stepRise, stepRun, new THREE.Vector3(startX, y, z), 'wood_dark');
    group.add(step);
  }
  // Side rail wall beside the stairs — remains a collider so the
  // player can't walk OFF the stairs onto the main hall at the wrong
  // height. Sits on the OUTER side (negative X if stepWidth > 0).
  const railX = startX - stepWidth / 2 - 0.04;
  group.add(makeBox(0.1, totalRise + 0.5, totalRun,
    new THREE.Vector3(railX, totalRise / 2 + 0.25, startZ + direction * totalRun / 2),
    'wood_dark'));
  bounds.push(aabbFromCenter(railX, totalRise / 2, startZ + direction * totalRun / 2, 0.05, totalRise / 2, totalRun / 2));
  // Emissive warm glow under the stairs so they're unmissable from
  // anywhere in the hall — tells the player "this way, up."
  const stairLight = new THREE.PointLight(0xffd090, 1.4, 6, 1.6);
  stairLight.position.set(startX, 1.4, startZ + direction * totalRun * 0.5);
  group.add(stairLight);
  return {
    topY: totalRise,
    topZ: startZ + direction * totalRun,
    footprint: {
      cx: startX, cz: startZ + direction * totalRun / 2,
      hw: stepWidth / 2, hd: totalRun / 2,
    },
  };
}

/**
 * Ramp-floor-height interpolator — given a position (x, z), return
 * the world-space floor Y if the position lies on a staircase, else
 * null. Stair scenes use this inside floorHeightAt() to map player
 * position → walkable height.
 */
export function stairFloorHeight(
  x: number, z: number,
  startX: number, startZ: number, direction: -1 | 1,
  stepWidth: number, totalRise: number, totalRun: number,
): number | null {
  // X must be within the stair footprint.
  if (Math.abs(x - startX) > stepWidth / 2 + 0.1) return null;
  // Z must be along the run (inclusive of both ends).
  const zMin = direction > 0 ? startZ : startZ - totalRun;
  const zMax = direction > 0 ? startZ + totalRun : startZ;
  if (z < zMin - 0.1 || z > zMax + 0.1) return null;
  // Linear height based on how far into the run.
  const progress = direction > 0 ? (z - startZ) / totalRun : (startZ - z) / totalRun;
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * totalRise;
}

/**
 * Upper loft platform — a flat box at height Y, with optional side
 * walls forming a small enclosed room. Used above the stairs. Returns
 * the top-surface Y for placing pickups/lights on the platform.
 */
export function makeLoft(
  group: THREE.Group,
  cx: number, cz: number, w: number, d: number, y: number,
  wallH: number, opening: { side: 'south' | 'north' | 'east' | 'west'; width: number },
  bounds: AABB[],
): number {
  // Platform floor — walkable.
  const thickness = 0.25;
  const floor = makeBox(w, thickness, d,
    new THREE.Vector3(cx, y - thickness / 2, cz), 'wood_dark');
  group.add(floor);
  bounds.push(aabbFromCenter(cx, y - thickness / 2, cz, w / 2, thickness / 2, d / 2));

  // Ceiling over the loft (low).
  const ceilY = y + wallH;
  group.add(makeBox(w, 0.1, d, new THREE.Vector3(cx, ceilY, cz), 'plaster'));

  // Four walls with an opening on one side.
  const halfW = w / 2, halfD = d / 2;
  const wallCol = 'wood_panel' as const;

  // Helper to build a wall segment (optionally with a centered opening).
  const wallSegment = (
    isEW: boolean, zOrX: number, length: number, centerOfOpening: number, openingWidth: number,
  ): void => {
    // If no opening (openingWidth<=0), one solid wall.
    if (openingWidth <= 0) {
      if (isEW) {
        group.add(makeBox(length, wallH, 0.1, new THREE.Vector3(cx, y + wallH / 2, zOrX), wallCol));
        bounds.push(aabbFromCenter(cx, y + wallH / 2, zOrX, length / 2, wallH / 2, 0.05));
      } else {
        group.add(makeBox(0.1, wallH, length, new THREE.Vector3(zOrX, y + wallH / 2, cz), wallCol));
        bounds.push(aabbFromCenter(zOrX, y + wallH / 2, cz, 0.05, wallH / 2, length / 2));
      }
      return;
    }
    // Opening: two wall segments flanking the gap.
    const halfOpen = openingWidth / 2;
    const leftEnd = centerOfOpening - halfOpen;
    const rightStart = centerOfOpening + halfOpen;
    const fullStart = isEW ? cx - length / 2 : cz - length / 2;
    const fullEnd = isEW ? cx + length / 2 : cz + length / 2;
    // Left piece.
    if (leftEnd > fullStart) {
      const segLen = leftEnd - fullStart;
      const segCenter = fullStart + segLen / 2;
      if (isEW) {
        group.add(makeBox(segLen, wallH, 0.1, new THREE.Vector3(segCenter, y + wallH / 2, zOrX), wallCol));
        bounds.push(aabbFromCenter(segCenter, y + wallH / 2, zOrX, segLen / 2, wallH / 2, 0.05));
      } else {
        group.add(makeBox(0.1, wallH, segLen, new THREE.Vector3(zOrX, y + wallH / 2, segCenter), wallCol));
        bounds.push(aabbFromCenter(zOrX, y + wallH / 2, segCenter, 0.05, wallH / 2, segLen / 2));
      }
    }
    // Right piece.
    if (rightStart < fullEnd) {
      const segLen = fullEnd - rightStart;
      const segCenter = rightStart + segLen / 2;
      if (isEW) {
        group.add(makeBox(segLen, wallH, 0.1, new THREE.Vector3(segCenter, y + wallH / 2, zOrX), wallCol));
        bounds.push(aabbFromCenter(segCenter, y + wallH / 2, zOrX, segLen / 2, wallH / 2, 0.05));
      } else {
        group.add(makeBox(0.1, wallH, segLen, new THREE.Vector3(zOrX, y + wallH / 2, segCenter), wallCol));
        bounds.push(aabbFromCenter(zOrX, y + wallH / 2, segCenter, 0.05, wallH / 2, segLen / 2));
      }
    }
  };

  // South wall (low Z).
  wallSegment(true, cz - halfD, w,
    opening.side === 'south' ? cx : 0,
    opening.side === 'south' ? opening.width : 0);
  // North wall (high Z).
  wallSegment(true, cz + halfD, w,
    opening.side === 'north' ? cx : 0,
    opening.side === 'north' ? opening.width : 0);
  // West wall (low X).
  wallSegment(false, cx - halfW, d,
    opening.side === 'west' ? cz : 0,
    opening.side === 'west' ? opening.width : 0);
  // East wall (high X).
  wallSegment(false, cx + halfW, d,
    opening.side === 'east' ? cz : 0,
    opening.side === 'east' ? opening.width : 0);

  return y;
}

/**
 * Under-table hide zone. Defines an AABB the player must stand inside
 * while crouched + still to be hidden. The HideZone type is exported
 * from @phobos/types — re-exported at the top of this file.
 */
export function makeHideZone(
  group: THREE.Group,
  id: string, cx: number, cy: number, cz: number,
  hw: number, hh: number, hd: number,
): HideZone {
  // Subtle marker — a dim glow patch under the table so the player
  // can find the hide spot without it being obvious in the scene.
  const marker = new THREE.PointLight(0x30a0ff, 0.35, 1.8, 2);
  marker.position.set(cx, cy + 0.05, cz);
  group.add(marker);
  return {
    id,
    aabb: aabbFromCenter(cx, cy, cz, hw, hh, hd),
    center: { x: cx, y: cy, z: cz },
  };
}

/**
 * Blood-written wall text — emissive red characters painted on a wall.
 * Each character is an emissive cube; characters are laid out left-to-
 * right at the given wall position. The text is simple: uppercase
 * letters built from short segments.
 *
 * Used for "SEAT 7", "4722", player name, etc. Reference: The Shining
 * (REDRUM), IT (Pennywise writes on walls).
 */
export function makeBloodWriting(
  group: THREE.Group,
  text: string,
  x: number, y: number, z: number,
  facing: 'north' | 'south' | 'east' | 'west',
  charH = 0.45,
): void {
  const charW = charH * 0.65;
  const gap = charW * 0.4;
  const stroke = Math.max(0.02, charH * 0.08);
  const mat = new THREE.MeshBasicMaterial({ color: 0x801010, transparent: true, opacity: 0.92 });
  const totalWidth = text.length * (charW + gap) - gap;
  // Direction offsets by wall facing.
  let charAxisSign = 1; // direction chars advance in
  let depth = 0.02; // how far from the wall the letters protrude
  let dirAxis: 'x' | 'z' = 'x';
  switch (facing) {
    case 'north': dirAxis = 'x'; charAxisSign = 1;  depth = -0.02; break;
    case 'south': dirAxis = 'x'; charAxisSign = -1; depth =  0.02; break;
    case 'east':  dirAxis = 'z'; charAxisSign = -1; depth = -0.02; break;
    case 'west':  dirAxis = 'z'; charAxisSign = 1;  depth =  0.02; break;
  }
  // Starting offset so the text is centered on (x, z).
  let cursor = -totalWidth / 2;
  const addBar = (cx: number, cy: number, bw: number, bh: number): void => {
    let wx = x, wz = z;
    if (dirAxis === 'x') wx = x + charAxisSign * cx;
    else wz = z + charAxisSign * cx;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(
        dirAxis === 'x' ? bw : 0.04,
        bh,
        dirAxis === 'z' ? bw : 0.04,
      ),
      mat,
    );
    bar.position.set(
      wx + (dirAxis === 'z' ? 0 : 0) + (facing === 'east' || facing === 'west' ? depth : 0),
      cy,
      wz + (facing === 'north' || facing === 'south' ? depth : 0),
    );
    group.add(bar);
  };
  for (const rawCh of text.toUpperCase()) {
    const ch = rawCh;
    const cx0 = cursor + charW / 2;
    const cy0 = y;
    // Very simple segment glyphs — not readable as font, more like
    // graffiti streaks. Each char is 3-5 bars.
    const topY = cy0 + charH / 2;
    const midY = cy0;
    const botY = cy0 - charH / 2;
    if (ch === ' ') { cursor += charW + gap; continue; }
    // Most chars get a top bar + middle bar + bottom bar.
    const hasVLeft = 'ABEFHKLMNPRTUV'.includes(ch);
    const hasVRight = 'ABDHIJMNORTUVWXY'.includes(ch);
    const hasTop = 'ABCDEFGJOPQRSTZ057'.includes(ch);
    const hasMid = 'ABEFGHKPRS234569'.includes(ch);
    const hasBot = 'BCDEGJLMNOQSTUVWXZ023568'.includes(ch);
    if (hasTop) addBar(cx0, topY - stroke / 2, charW, stroke);
    if (hasMid) addBar(cx0, midY, charW * 0.82, stroke);
    if (hasBot) addBar(cx0, botY + stroke / 2, charW, stroke);
    if (hasVLeft) addBar(cx0 - charW / 2 + stroke / 2, midY, stroke, charH);
    if (hasVRight) addBar(cx0 + charW / 2 - stroke / 2, midY, stroke, charH);
    // Numbers need their own strokes (digit glyphs).
    if (ch === '1') addBar(cx0, midY, stroke, charH);
    if (ch === '4') { addBar(cx0 - charW / 2 + stroke / 2, cy0 + charH / 4, stroke, charH / 2); addBar(cx0 + charW / 2 - stroke / 2, midY, stroke, charH); addBar(cx0, midY, charW * 0.8, stroke); }
    if (ch === '7') { addBar(cx0, topY - stroke / 2, charW, stroke); addBar(cx0 + charW / 2 - stroke / 2, midY - charH / 4, stroke, charH * 0.6); }
    cursor += charW + gap;
  }
  // A faint ground-red point light tints the wall around the text so
  // the "blood" is visible in fog.
  const pl = new THREE.PointLight(0x701010, 0.9, 3.5, 2);
  if (dirAxis === 'x') pl.position.set(x, y, z + (facing === 'north' ? 0.4 : -0.4));
  else pl.position.set(x + (facing === 'west' ? 0.4 : -0.4), y, z);
  group.add(pl);
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
