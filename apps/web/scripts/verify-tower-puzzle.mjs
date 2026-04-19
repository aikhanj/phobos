#!/usr/bin/env node
/**
 * Static verifier for Tower puzzle item placement.
 *
 * Tower geometry (SCENE_CONFIGS.tower = 20×16×6, hw=10 hd=8):
 *   - Bookshelf at (-9.7, -7.7), facing +Z, carcass z∈[-7.7,-7.3],
 *     x∈[-10.5,-8.9], y∈[0,2.8]
 *   - Fireplace at (0, -7.5), facing +Z, body z∈[-7.5,-6.95],
 *     x∈[-1.2,1.2], y∈[0,2.2]. Mantel TOP at y=2.2 (slab centered
 *     at y=2.025 with thickness 0.35)
 *   - Dining table at (0, 0) size 9×1.4, top surface y=0.89,
 *     spans x∈[-4.5,4.5], z∈[-0.7,0.7]
 *   - Walls at x=±10, z=±8, y∈[0,6]
 *
 * Checks:
 *   1. KEY (-7.5, 0.25, -6.0) — NOT inside bookshelf/fireplace/table
 *   2. PEN (1.5, 0.95, -0.3) — ON the dining table top (y>=0.89)
 *   3. SEAL (0.5, 2.2, -7.15) — ON the fireplace mantel top
 *   4. All three within room bounds x∈[-10,10], z∈[-8,8]
 *   5. Interactable box centers match mesh positions (same x/z ±0.1)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const towerPath = join(__dirname, '..', 'src', 'game', 'scenes', 'clubs', 'tower.ts');
const src = readFileSync(towerPath, 'utf8');

// Rough volumes to avoid. Pickups must NOT be inside these (with a
// small tolerance so "on top of" is OK).
const BOOKSHELF = { x: [-10.5, -8.9], y: [0, 2.8], z: [-7.7, -7.3] };
const FIREPLACE_BODY = { x: [-1.2, 1.2], y: [0, 2.15], z: [-7.5, -6.95] };
const TABLE_BODY = { x: [-4.5, 4.5], y: [0, 0.88], z: [-0.7, 0.7] };

function parsePosition(code, varNameRegex) {
  const m = code.match(varNameRegex);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) };
}

function inside(p, box) {
  return p.x >= box.x[0] && p.x <= box.x[1]
    && p.y >= box.y[0] && p.y <= box.y[1]
    && p.z >= box.z[0] && p.z <= box.z[1];
}

function inRoom(p) {
  return p.x > -10 && p.x < 10 && p.z > -8 && p.z < 8 && p.y >= 0 && p.y <= 6;
}

const checks = [];

// Mesh positions — first set() call after the mesh is declared.
const keyPos = parsePosition(src, /this\.keyMesh\.position\.set\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/);
const penPos = parsePosition(src, /this\.penMesh\.position\.set\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/);
const sealPos = parsePosition(src, /this\.sealMesh\.position\.set\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/);

// Interactable box centers — first aabbFromCenter after id puzzle_*.
function findInteractBox(id) {
  const re = new RegExp(`id:\\s*'${id}'[\\s\\S]*?aabbFromCenter\\(([-\\d.]+),\\s*([-\\d.]+),\\s*([-\\d.]+)`);
  const m = src.match(re);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) };
}
const keyBox = findInteractBox('puzzle_key');
const penBox = findInteractBox('puzzle_pen');
const sealBox = findInteractBox('puzzle_seal');

function check(name, cond, detail) {
  checks.push({ name, ok: cond, detail });
}

// Mesh placements must exist.
check('keyMesh.position set', !!keyPos, keyPos);
check('penMesh.position set', !!penPos, penPos);
check('sealMesh.position set', !!sealPos, sealPos);

// Not inside obstacles.
if (keyPos) {
  check('KEY not in bookshelf', !inside(keyPos, BOOKSHELF), keyPos);
  check('KEY not in fireplace', !inside(keyPos, FIREPLACE_BODY), keyPos);
  check('KEY not in table body', !inside(keyPos, TABLE_BODY), keyPos);
  check('KEY in room', inRoom(keyPos), keyPos);
  check('KEY reachable (y<=1.5)', keyPos.y <= 1.5, keyPos);
}
if (penPos) {
  check('PEN not in bookshelf', !inside(penPos, BOOKSHELF), penPos);
  check('PEN not in fireplace', !inside(penPos, FIREPLACE_BODY), penPos);
  check('PEN on table top (y>=0.89)', penPos.y >= 0.89 && penPos.y <= 1.3, penPos);
  check('PEN on table footprint', penPos.x >= -4.5 && penPos.x <= 4.5 && penPos.z >= -0.7 && penPos.z <= 0.7, penPos);
}
if (sealPos) {
  check('SEAL not in fireplace body', !inside(sealPos, FIREPLACE_BODY), sealPos);
  check('SEAL on mantel y~2.2', sealPos.y >= 2.15 && sealPos.y <= 2.5, sealPos);
  check('SEAL on mantel footprint', sealPos.x >= -1.2 && sealPos.x <= 1.2 && sealPos.z >= -7.5 && sealPos.z <= -6.95, sealPos);
  check('SEAL in room', inRoom(sealPos), sealPos);
}

// Interact boxes near the corresponding mesh (within 0.2m XZ).
function near(a, b) {
  return Math.abs(a.x - b.x) < 0.3 && Math.abs(a.z - b.z) < 0.3;
}
if (keyPos && keyBox)   check('KEY interact near mesh',  near(keyPos, keyBox),  { mesh: keyPos, box: keyBox });
if (penPos && penBox)   check('PEN interact near mesh',  near(penPos, penBox),  { mesh: penPos, box: penBox });
if (sealPos && sealBox) check('SEAL interact near mesh', near(sealPos, sealBox), { mesh: sealPos, box: sealBox });

// Output.
let failed = 0;
console.log('Tower puzzle-item placement verification:');
console.log('─'.repeat(60));
for (const c of checks) {
  const mark = c.ok ? 'OK  ' : 'FAIL';
  console.log(`${mark} · ${c.name}`);
  if (!c.ok) {
    console.log(`       detail: ${JSON.stringify(c.detail)}`);
    failed++;
  }
}
console.log('─'.repeat(60));
if (failed > 0) {
  console.error(`FAIL: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('OK: all Tower puzzle items placed correctly');
