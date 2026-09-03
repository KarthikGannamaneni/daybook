#!/usr/bin/env node
/**
 * Mirrors packages/parser into supabase/functions/_shared/parser.
 *
 * Why this exists: the Supabase edge runtime mounts only `supabase/functions`,
 * so a relative import that climbs out to `packages/` resolves to nothing
 * inside the container. The parser is the one piece of logic the app and the
 * webhook must agree on exactly (§7), so it is mirrored rather than forked, and
 * CI fails if the mirror drifts (`pnpm check:parser-sync`).
 *
 * Usage: node scripts/sync-parser.mjs [--check]
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'packages/parser/src');
const target = path.join(root, 'supabase/functions/_shared/parser');
const check = process.argv.includes('--check');

const HEADER = `// GENERATED FILE — do not edit.
// Mirrored from packages/parser/src by scripts/sync-parser.mjs.
// Edit the source there, then run \`pnpm sync:parser\`.

`;

const files = readdirSync(source).filter((f) => f.endsWith('.ts'));
let drifted = false;

if (!check) {
  if (existsSync(target)) rmSync(target, { recursive: true });
  mkdirSync(target, { recursive: true });
}

for (const file of files) {
  const contents = HEADER + readFileSync(path.join(source, file), 'utf8');
  const destination = path.join(target, file);

  if (check) {
    const current = existsSync(destination) ? readFileSync(destination, 'utf8') : null;
    if (current !== contents) {
      console.error(`Out of date: supabase/functions/_shared/parser/${file}`);
      drifted = true;
    }
  } else {
    writeFileSync(destination, contents);
  }
}

if (check) {
  const extras = existsSync(target)
    ? readdirSync(target).filter((f) => !files.includes(f))
    : [];
  for (const extra of extras) {
    console.error(`Unexpected file: supabase/functions/_shared/parser/${extra}`);
    drifted = true;
  }
  if (drifted) {
    console.error('\nRun `pnpm sync:parser` and commit the result.');
    process.exit(1);
  }
  console.log(`Parser mirror is in sync (${files.length} files).`);
} else {
  console.log(`Mirrored ${files.length} parser files into supabase/functions/_shared/parser.`);
}
