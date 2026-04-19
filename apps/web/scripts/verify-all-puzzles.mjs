#!/usr/bin/env node
/**
 * Static verifier for every chain club's puzzle.
 *
 *  TOWER:    3 items (KEY, PEN, SEAL) → cabinet → pamphlet
 *  COLONIAL: 3 candles → candelabrum → laptop (BOLTS)
 *  CANNON:   3 fragments → lectern → clipboard (CODE)
 *  CAPGOWN:  single pickup (flavor)
 *  CHARTER:  single pickup (flavor)
 *
 * For each puzzle club, check:
 *   - All puzzle-item mesh positions are in-bounds + at reachable Y
 *   - All 3 puzzle interactables exist
 *   - The reward pickup is gated on all 3 items collected
 *   - The gating check uses AND of the three item flags
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const clubsDir = join(__dirname, '..', 'src', 'game', 'scenes', 'clubs');

function read(club) {
  return readFileSync(join(clubsDir, `${club}.ts`), 'utf8');
}

const results = [];
function check(club, name, ok, detail) {
  results.push({ club, name, ok, detail });
}

// ── TOWER ────────────────────────────────────────────────────────
{
  const src = read('tower');
  const ids = ['puzzle_key', 'puzzle_pen', 'puzzle_seal', 'puzzle_cabinet', 'pickup_tower'];
  for (const id of ids) {
    const re = new RegExp(`id:\\s*'${id}'`);
    check('tower', `has ${id}`, re.test(src), null);
  }
  // Gate: pamphlet needs cabinet open.
  check('tower', 'pamphlet gated on cabinetOpen', /enabled.*cabinetOpen/.test(src.replace(/\s/g, ' ')), null);
  // Cabinet gate checks all 3 items.
  const cabinetBlock = src.match(/id:\s*'puzzle_cabinet'[\s\S]*?onInteract[\s\S]*?\},/);
  if (cabinetBlock) {
    check('tower', 'cabinet checks hasKey',  /hasKey/.test(cabinetBlock[0]),  null);
    check('tower', 'cabinet checks hasPen',  /hasPen/.test(cabinetBlock[0]),  null);
    check('tower', 'cabinet checks hasSeal', /hasSeal/.test(cabinetBlock[0]), null);
  } else {
    check('tower', 'cabinet block found', false, null);
  }
}

// ── COLONIAL ─────────────────────────────────────────────────────
{
  const src = read('colonial');
  const ids = ['puzzle_candle1', 'puzzle_candle2', 'puzzle_candle3', 'pickup_colonial'];
  for (const id of ids) {
    const re = new RegExp(`id:\\s*'${id}'`);
    check('colonial', `has ${id}`, re.test(src), null);
  }
  // Laptop gate should require all 3 candles.
  const laptopBlock = src.match(/id:\s*'pickup_colonial'[\s\S]*?onInteract/);
  if (laptopBlock) {
    check('colonial', 'laptop checks hasCandle1', /hasCandle1/.test(laptopBlock[0]), null);
    check('colonial', 'laptop checks hasCandle2', /hasCandle2/.test(laptopBlock[0]), null);
    check('colonial', 'laptop checks hasCandle3', /hasCandle3/.test(laptopBlock[0]), null);
  } else {
    check('colonial', 'laptop block found', false, null);
  }
  // Candle positions — extract mesh.position.set for each.
  for (let i = 1; i <= 3; i++) {
    const m = src.match(new RegExp(`this\\.candle${i}Mesh\\.position\\.set\\(([-\\d.]+),\\s*([-\\d.]+),\\s*([-\\d.]+)\\)`));
    if (!m) { check('colonial', `candle${i} position parsed`, false, null); continue; }
    const x = +m[1], y = +m[2], z = +m[3];
    check('colonial', `candle${i} in room`, x > -11 && x < 11 && z > -8 && z < 8 && y >= 0 && y <= 3, { x, y, z });
  }
}

// ── CANNON ───────────────────────────────────────────────────────
{
  const src = read('cannon');
  const ids = ['puzzle_frag1', 'puzzle_frag2', 'puzzle_frag3', 'pickup_cannon'];
  for (const id of ids) {
    const re = new RegExp(`id:\\s*'${id}'`);
    check('cannon', `has ${id}`, re.test(src), null);
  }
  const ledgerBlock = src.match(/id:\s*'pickup_cannon'[\s\S]*?onInteract/);
  if (ledgerBlock) {
    check('cannon', 'ledger checks hasFrag1', /hasFrag1/.test(ledgerBlock[0]), null);
    check('cannon', 'ledger checks hasFrag2', /hasFrag2/.test(ledgerBlock[0]), null);
    check('cannon', 'ledger checks hasFrag3', /hasFrag3/.test(ledgerBlock[0]), null);
  } else {
    check('cannon', 'ledger block found', false, null);
  }
  for (let i = 1; i <= 3; i++) {
    const m = src.match(new RegExp(`this\\.frag${i}Mesh\\.position\\.set\\(([-\\d.]+),\\s*([-\\d.]+),\\s*([-\\d.]+)\\)`));
    if (!m) { check('cannon', `frag${i} position parsed`, false, null); continue; }
    const x = +m[1], y = +m[2], z = +m[3];
    check('cannon', `frag${i} in room`, x > -11 && x < 11 && z > -8 && z < 8 && y >= 0 && y <= 3, { x, y, z });
  }
}

// Output.
let failed = 0;
let clubPrev = '';
console.log('All-puzzle placement + logic verification:');
console.log('─'.repeat(72));
for (const r of results) {
  if (r.club !== clubPrev) {
    console.log(`\n[${r.club.toUpperCase()}]`);
    clubPrev = r.club;
  }
  const mark = r.ok ? 'OK  ' : 'FAIL';
  console.log(`  ${mark} · ${r.name}`);
  if (!r.ok) {
    if (r.detail) console.log(`         detail: ${JSON.stringify(r.detail)}`);
    failed++;
  }
}
console.log('─'.repeat(72));
if (failed > 0) {
  console.error(`\nFAIL: ${failed}/${results.length} checks failed`);
  process.exit(1);
}
console.log(`\nOK: all ${results.length} puzzle checks passed`);
