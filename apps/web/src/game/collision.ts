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
 * Top-down AABB slide with Y-filtering. Tests X then Z so the player
 * slides along walls. Colliders outside the player's vertical band
 * are ignored — this is what lets the player walk under a loft (wall
 * colliders start at y=3.2) and walk on top of the loft (ground-
 * floor walls end at y=7 which overlaps, but the loft's own walls
 * also overlap). Without this, multi-floor geometry creates invisible
 * walls at ground level.
 *
 * `playerFeetY` = player floor Y. `playerHeadY` = feet + standing height.
 */
export function moveAndSlide(
  currentX: number,
  currentZ: number,
  deltaX: number,
  deltaZ: number,
  colliders: readonly AABB[],
  out: THREE.Vector2,
  radius = PLAYER_RADIUS,
  playerFeetY = 0,
  playerHeadY = 1.7,
): void {
  // A collider "affects" the player only if its Y range overlaps the
  // player's [feet, head] band. Small tolerance so standing ON a
  // collider's top edge doesn't register as colliding with it.
  const EDGE_TOL = 0.05;
  const relevant = (c: AABB): boolean =>
    playerHeadY > c.min[1] + EDGE_TOL && playerFeetY < c.max[1] - EDGE_TOL;

  // SUB-STEPPING: If the player's step is large (sprint at 7.2m/s ×
  // 16ms ≈ 0.12m, or more at low framerates), split the motion into
  // chunks ≤ radius/2 so we never skip over a thin collider between
  // frames. This is the canonical CCD (continuous collision detection)
  // trick for kinematic characters with axis-aligned box colliders.
  const maxStep = radius * 0.5; // ≤ 0.16m per sub-step
  const magnitude = Math.hypot(deltaX, deltaZ);
  const subSteps = Math.max(1, Math.ceil(magnitude / maxStep));
  const sdx = deltaX / subSteps;
  const sdz = deltaZ / subSteps;

  let posX = currentX;
  let posZ = currentZ;

  for (let step = 0; step < subSteps; step++) {
    // X axis.
    let nextX = posX + sdx;
    for (const c of colliders) {
      if (!relevant(c)) continue;
      if (overlaps2D(nextX, posZ, radius, c)) {
        if (sdx > 0) nextX = c.min[0] - radius;
        else if (sdx < 0) nextX = c.max[0] + radius;
      }
    }
    // Z axis.
    let nextZ = posZ + sdz;
    for (const c of colliders) {
      if (!relevant(c)) continue;
      if (overlaps2D(nextX, nextZ, radius, c)) {
        if (sdz > 0) nextZ = c.min[2] - radius;
        else if (sdz < 0) nextZ = c.max[2] + radius;
      }
    }
    posX = nextX;
    posZ = nextZ;
  }

  out.set(posX, posZ);
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
