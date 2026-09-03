#!/usr/bin/env node
/**
 * §10.6 bundle budget: the home screen must stay under 180 KB of gzipped JS.
 *
 * Reads the build manifest so the number reflects exactly what a first visit
 * downloads, and fails the build when it creeps over.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const BUDGET_KB = 180;
const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, '.next/app-build-manifest.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  console.error('No build manifest found. Run `next build` first.');
  process.exit(1);
}

const files = (manifest.pages['/page'] ?? []).filter((f) => f.endsWith('.js'));
if (files.length === 0) {
  console.error('The home route has no JS in the manifest — the build looks wrong.');
  process.exit(1);
}

let total = 0;
const rows = [];
for (const file of files) {
  const full = path.join(root, '.next', file);
  if (!statSync(full, { throwIfNoEntry: false })) continue;
  const size = gzipSync(readFileSync(full), { level: 9 }).byteLength;
  total += size;
  rows.push([file, size]);
}

rows.sort((a, b) => b[1] - a[1]);
for (const [file, size] of rows) console.log(`${(size / 1024).toFixed(1).padStart(8)} KB  ${file}`);

const totalKb = total / 1024;
console.log('-'.repeat(48));
console.log(`${totalKb.toFixed(1).padStart(8)} KB  home screen, gzipped (budget ${BUDGET_KB} KB)`);

if (totalKb > BUDGET_KB) {
  console.error(`\nOver budget by ${(totalKb - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
