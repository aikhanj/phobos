import * as THREE from 'three';
import type { AABB } from '@phobos/types';
import { aabbFromCenter } from '../../collision';

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
  w: number, h: number, p: THREE.Vector3, r: THREE.Euler, color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.FrontSide }),
  );
  mesh.position.copy(p);
  mesh.rotation.copy(r);
  return mesh;
}

export function makeBox(
  w: number, h: number, d: number, p: THREE.Vector3, color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
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
  colors: { floor: number; ceiling: number; walls: number; baseboard?: number },
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
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.2, h - 0.3, 12),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
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
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a7040, flatShading: true }),
  );
  knob.position.set(x + w * 0.35, h * 0.5, fz + facingNormalZ * 0.03);
  group.add(knob);
}
