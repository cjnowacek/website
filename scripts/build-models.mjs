#!/usr/bin/env node
// scripts/build-models.mjs: display versions of the Shore House scans.
// Usage: node scripts/build-models.mjs <scan-dir> <out-dir>
//   scan-dir  the source .glb files (iPhone LiDAR exports, one mesh and one
//             8192 px jpeg per room, 1 to 13 MB each)
//   out-dir   where the browser versions go; on this machine that is Dropbox
//             ~sync/models, which the image sync copies into static/img/models
// Each <Room name>.glb becomes <room-name>.glb: materials made unlit (the scan
// texture already carries its lighting; lit, the PBR defaults render it dark),
// then gltf-transform optimize with meshopt compression and the texture
// re-encoded as 1024 px webp. Measured on Kitchen.glb: 5.54 MB to 343 KB, the
// same 44.7k triangles. Order matters: unlit after optimize would decode the
// meshopt buffer and double the file. A file whose output is newer than its
// source is skipped, so re-running after adding one scan converts only that.
// The .glb.json sidecars beside the scans are art-catalog metadata and ignored.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const [src, out] = process.argv.slice(2);
if (!src || !out || !existsSync(src)) {
  console.error('usage: node scripts/build-models.mjs <scan-dir> <out-dir>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const slug = (name) => name.replace(/\.glb$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cli = (...args) => execFileSync('npx', ['--yes', '@gltf-transform/cli@4', ...args], { stdio: 'pipe', shell: process.platform === 'win32' });
const mb = (n) => (n / 1024 / 1024).toFixed(2);

let done = 0, skipped = 0;
for (const name of readdirSync(src).filter((f) => f.toLowerCase().endsWith('.glb')).sort()) {
  const from = join(src, name);
  const to = join(out, `${slug(name)}.glb`);
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) { skipped++; continue; }
  const tmp = join(tmpdir(), `unlit-${process.pid}-${slug(name)}.glb`);
  try {
    cli('unlit', from, tmp);
    cli('optimize', tmp, to, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024');
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
  console.log(`${name} (${mb(statSync(from).size)} MB) -> ${basename(to)} (${mb(statSync(to).size)} MB)`);
  done++;
}
console.log(`build-models: ${done} converted, ${skipped} up to date, in ${out}`);
