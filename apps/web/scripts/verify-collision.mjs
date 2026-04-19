#!/usr/bin/env node
/**
 * Runtime collision verifier. Builds a Tower-sized collider set
 * (matching _shared.ts:buildShell) and simulates sprinting into each
 * wall at various framerates. Fails if the player ever ends up past
 * the wall boundary.
 *
 * Tower dimensions (hw=10, hd=8, h=7):
 *   - Floor at y=0, ceiling y=7
 *   - North wall x∈[-10,10] z≤-8
 *   - South wall x∈[-10,10] z≥8
 *   - West wall x≤-10
 *   - East wall x≥10
 *
 * This replays the ACTUAL collision.ts logic (copied inline so we
 * don't need a TS build step). If this diverges from production code,
 * update both.
 */

const PLAYER_RADIUS = 0.32;
const EDGE_TOL = 0.05;

function overlaps2D(px, pz, r, b) {
  return (
    px + r > b.min[0] && px - r < b.max[0]
    && pz + r > b.min[2] && pz - r < b.max[2]
  );
}

function moveAndSlide(cx, cz, dx, dz, colliders, feetY = 0, headY = 1.7) {
  const relevant = (c) => headY > c.min[1] + EDGE_TOL && feetY < c.max[1] - EDGE_TOL;
  const maxStep = PLAYER_RADIUS * 0.5;
  const mag = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(mag / maxStep));
  const sdx = dx / steps, sdz = dz / steps;
  let px = cx, pz = cz;
  for (let i = 0; i < steps; i++) {
    let nx = px + sdx;
    for (const c of colliders) {
      if (!relevant(c)) continue;
      if (overlaps2D(nx, pz, PLAYER_RADIUS, c)) {
        if (sdx > 0) nx = c.min[0] - PLAYER_RADIUS;
        else if (sdx < 0) nx = c.max[0] + PLAYER_RADIUS;
      }
    }
    let nz = pz + sdz;
    for (const c of colliders) {
      if (!relevant(c)) continue;
      if (overlaps2D(nx, nz, PLAYER_RADIUS, c)) {
        if (sdz > 0) nz = c.min[2] - PLAYER_RADIUS;
        else if (sdz < 0) nz = c.max[2] + PLAYER_RADIUS;
      }
    }
    px = nx; pz = nz;
  }
  return { x: px, z: pz };
}

function towerColliders() {
  const hw = 10, hd = 8, h = 7, T = 5;
  return [
    { min: [-hw, 0, -hd - T], max: [hw, h, -hd] },
    { min: [-hw, 0, hd],       max: [hw, h, hd + T] },
    { min: [-hw - T, 0, -hd],  max: [-hw, h, hd] },
    { min: [hw, 0, -hd],       max: [hw + T, h, hd] },
  ];
}

// Room bounds check: player center must stay in (-10, 10) × (-8, 8).
function inRoom(p) {
  return p.x > -10 && p.x < 10 && p.z > -8 && p.z < 8;
}

const SPRINT_SPEED = 7.2;
const framerates = [60, 30, 15, 10];
const walkDurations = [1, 2, 5]; // seconds of pure sprint into a wall

const cases = [
  { name: 'sprint NORTH into north wall',  dir: [0, -1],  start: [0, 0] },
  { name: 'sprint SOUTH into south wall',  dir: [0, 1],   start: [0, 0] },
  { name: 'sprint WEST into west wall',    dir: [-1, 0],  start: [0, 0] },
  { name: 'sprint EAST into east wall',    dir: [1, 0],   start: [0, 0] },
  { name: 'sprint NW diagonal',            dir: [-1, -1], start: [0, 0] },
  { name: 'sprint corner-trap NE',         dir: [1, -1],  start: [5, -3] },
];

const colliders = towerColliders();
let failed = 0;
const results = [];

for (const c of cases) {
  for (const fps of framerates) {
    for (const dur of walkDurations) {
      const dt = 1 / fps;
      const steps = Math.floor(dur / dt);
      const len = Math.hypot(c.dir[0], c.dir[1]);
      const nx = c.dir[0] / len;
      const nz = c.dir[1] / len;
      let x = c.start[0], z = c.start[1];
      for (let s = 0; s < steps; s++) {
        const deltaX = nx * SPRINT_SPEED * dt;
        const deltaZ = nz * SPRINT_SPEED * dt;
        const r = moveAndSlide(x, z, deltaX, deltaZ, colliders);
        x = r.x; z = r.z;
      }
      const ok = inRoom({ x, z });
      if (!ok) failed++;
      results.push({ case: c.name, fps, dur, final: { x: +x.toFixed(3), z: +z.toFixed(3) }, ok });
    }
  }
}

console.log('Collision tunneling tests (Tower dimensions):');
console.log('─'.repeat(80));
for (const r of results) {
  const mark = r.ok ? 'OK  ' : 'FAIL';
  console.log(
    `${mark} · ${r.case.padEnd(38)} · ${String(r.fps).padStart(3)}fps · ${r.dur}s · final (${r.final.x}, ${r.final.z})`
  );
}
console.log('─'.repeat(80));
if (failed > 0) {
  console.error(`FAIL: ${failed} / ${results.length} tunneling tests failed`);
  process.exit(1);
}
console.log(`OK: all ${results.length} tunneling tests passed`);
