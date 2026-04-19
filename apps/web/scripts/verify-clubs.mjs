#!/usr/bin/env node
/**
 * Static verifier for chain clubs. Reads each tower/colonial/cannon/
 * capgown/charter .ts file and checks:
 *   - makePickupBeacon is called (visible beacon exists)
 *   - makeHideZone is called at least twice (DOORS hide spots)
 *   - makeBloodWriting is called at least once (atmospheric horror)
 *   - floorHeightAt() method is defined
 *   - interactable box uses range 3.0 (easier targeting)
 *   - pickup Y in the interactable box is within [0.5, 1.5] (ground-floor
 *     accessible). Anything higher would require stairs.
 *
 * Prints a table of pass/fail per club. Exits 0 if all pass.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const clubsDir = join(__dirname, '..', 'src', 'game', 'scenes', 'clubs');

const CLUBS = ['tower', 'colonial', 'cannon', 'capgown', 'charter'];

const checks = [
  {
    name: 'beacon',
    test: (src) => /makePickupBeacon\s*\(/.test(src),
  },
  {
    name: 'hideZone >= 2',
    test: (src) => (src.match(/makeHideZone\s*\(/g) ?? []).length >= 2,
  },
  {
    name: 'bloodWriting',
    test: (src) => /makeBloodWriting\s*\(/.test(src),
  },
  {
    name: 'floorHeightAt',
    test: (src) => /floorHeightAt\s*\(/.test(src),
  },
  {
    name: 'interact range >= 3.0',
    test: (src) => /range:\s*3(?:\.0)?[\s,]/.test(src),
  },
  {
    name: 'pickup box y <=1.5',
    test: (src) => {
      const m = src.match(/id:\s*['"]pickup_\w+['"]\s*,\s*\n\s*\/\/[^\n]*\n?\s*box:\s*aabbFromCenter\(\s*[-\d.]+\s*,\s*([\d.]+)/);
      if (!m) {
        const m2 = src.match(/id:\s*['"]pickup_\w+['"]\s*,\s*\n\s*box:\s*aabbFromCenter\(\s*[-\d.]+\s*,\s*([\d.]+)/);
        if (!m2) return false;
        return parseFloat(m2[1]) <= 1.5;
      }
      return parseFloat(m[1]) <= 1.5;
    },
  },
  {
    name: 'exit trigger',
    test: (src) => /id:\s*['"]exit_to_campus['"]/.test(src),
  },
  {
    name: 'onPickup wired',
    test: (src) => /scene\.onPickup\?\.\(\)/.test(src),
  },
];

let failed = 0;
const results = [];
for (const club of CLUBS) {
  const path = join(clubsDir, `${club}.ts`);
  const src = readFileSync(path, 'utf8');
  const row = { club };
  for (const c of checks) {
    const pass = c.test(src);
    row[c.name] = pass ? 'ok' : 'FAIL';
    if (!pass) failed++;
  }
  results.push(row);
}

// Pretty table.
const headers = ['club', ...checks.map(c => c.name)];
const widths = headers.map(h => Math.max(h.length, ...results.map(r => String(r[h] ?? '').length)));
const pad = (s, w) => String(s).padEnd(w);
console.log(headers.map((h, i) => pad(h, widths[i])).join(' | '));
console.log(widths.map(w => '-'.repeat(w)).join('-+-'));
for (const r of results) {
  console.log(headers.map((h, i) => pad(r[h] ?? '', widths[i])).join(' | '));
}
console.log();
if (failed > 0) {
  console.error(`FAIL: ${failed} check(s) failed across ${CLUBS.length} clubs`);
  process.exit(1);
}
console.log('OK: all clubs pass all checks');
