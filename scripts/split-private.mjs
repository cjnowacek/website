#!/usr/bin/env node
// scripts/split-private.mjs: the second half of `npm run build`. Astro builds
// the private hub (src/pages/private/) into dist/private/ like any other page;
// this moves that folder out to dist-private/pages/, so dist/ (which is the
// public webroot) holds nothing private. The deploy syncs dist-private/pages/
// to private-data/pages/ on the host, outside the webroot, where only
// public/includes/private_gate.php can read it.
//
// It fails the build if there is nothing to move: a build that silently
// produced no private pages would empty the hub on the next deploy.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'dist', 'private');
const out = join(root, 'dist-private');
const to = join(out, 'pages');

rmSync(out, { recursive: true, force: true });
if (!existsSync(join(from, 'index.html'))) {
  console.error('split-private: dist/private/index.html was not built; nothing to move');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
renameSync(from, to);
console.log('split-private: dist/private -> dist-private/pages');
