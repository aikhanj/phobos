import * as THREE from 'three';
import type { AABB } from '@phobos/types';

const PLAYER_RADIUS = 0.32;

/** Build an AABB from center + half-extents. */
export function aabbFromCenter(cx: number, cy: number, cz: number, hw: number, hh: number, hd: number): AABB {
  return { min: [cx - hw, cy - hh, cz - hd], max: [cx + hw, cy + hh, cz + hd] };
}

/** Build a wall AABB given two corner points in XZ and a height range. */
export function wallAABB(ax: number, az: number, bx: number, bz: number, y0 = 0, y1 = 3): AABB {
  return {
    min: [Math.min(ax, bx) - 0.05, y0, Math.min(az, bz) - 0.05],
    max: [Math.max(ax, bx) + 0.05, y1, Math.max(az, bz) + 0.05],
  };
}

function overlaps2D(
  px: number,
  pz: number,
  r: number,
  box: AABB,
): boolean {
  return (
    px + r > box.min[0] &&
    px - r < box.max[0] &&
    pz + r > box.min[2] &&
    pz - r < box.max[2]
  );
}

/**
 * Top-down AABB slide. Mutates `out` in place. Tests X then Z so the player
 * slides along walls rather than sticking. Ignores Y — player is always on
 * the ground.
 */
export function moveAndSlide(
  currentX: number,
  currentZ: number,
  deltaX: number,
  deltaZ: number,
  colliders: readonly AABB[],
  out: THREE.Vector2,
  radius = PLAYER_RADIUS,
): void {
  let nextX = currentX + deltaX;
  for (const c of colliders) {
    if (overlaps2D(nextX, currentZ, radius, c)) {
      if (deltaX > 0) nextX = c.min[0] - radius;
      else if (deltaX < 0) nextX = c.max[0] + radius;
    }
  }

  let nextZ = currentZ + deltaZ;
  for (const c of colliders) {
    if (overlaps2D(nextX, nextZ, radius, c)) {
      if (deltaZ > 0) nextZ = c.min[2] - radius;
      else if (deltaZ < 0) nextZ = c.max[2] + radius;
    }
  }

  out.set(nextX, nextZ);
}

export { PLAYER_RADIUS };

/**
 * Ray vs AABB via the slab method. Origin in world space, direction assumed
 * unit length. Returns the nearest positive `t` (distance along the ray) or
 * null if miss / beyond `maxT`. Used by the interactable picker.
 */
export function rayAABB(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  box: AABB,
  maxT: number,
): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;

  const invDx = 1 / dx;
  if (Math.abs(dx) < 1e-8) {
    if (ox < box.min[0] || ox > box.max[0]) return null;
  } else {
    const t1 = (box.min[0] - ox) * invDx;
    const t2 = (box.max[0] - ox) * invDx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  }

  const invDy = 1 / dy;
  if (Math.abs(dy) < 1e-8) {
    if (oy < box.min[1] || oy > box.max[1]) return null;
  } else {
    const t1 = (box.min[1] - oy) * invDy;
    const t2 = (box.max[1] - oy) * invDy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  }

  const invDz = 1 / dz;
  if (Math.abs(dz) < 1e-8) {
    if (oz < box.min[2] || oz > box.max[2]) return null;
  } else {
    const t1 = (box.min[2] - oz) * invDz;
    const t2 = (box.max[2] - oz) * invDz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  }

  if (tmax < 0) return null;
  const t = tmin > 0 ? tmin : tmax;
  if (t > maxT) return null;
  return t;
}
