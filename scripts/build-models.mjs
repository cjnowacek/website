#!/usr/bin/env node
// scripts/build-models.mjs: display versions of the Shore House scans.
// Usage: node scripts/build-models.mjs <scan-dir> <out-dir>
//   scan-dir  the source .glb files (iPhone LiDAR exports, one mesh and one
//             8192 px jpeg per room, 1 to 13 MB each)
//   out-dir   where the browser versions go; on this machine that is Dropbox
//             ~sync/models, which the image sync copies into static/img/models
// Each <Room name>.glb becomes <room-name>.glb: materials made unlit (the scan
// texture already carries its lighting; lit, the PBR defaults render it dark),
// then gltf-transform optimize: weld, simplify (ratio 0.75), quantize
// (KHR_mesh_quantization, which every viewer reads without a decoder) and the
// texture re-encoded as 1024 px webp. Not meshopt or draco: neither decoder
// ships in the @google/model-viewer bundle (meshopt is loaded from a URL the
// site would have to host and set as meshoptDecoderLocation; without it the
// load fails with "setMeshoptDecoder must be called", seen 2026-09-27), and
// draco fetches its decoder from Google's CDN on the visitor's first click.
// Quantized files are about twice the meshopt size and need nothing. Measured
// on Kitchen.glb: 5.54 MB
// to 0.70 MB (343 KB with meshopt), the same 44.7k triangles. A file whose
// output is newer than its source is skipped, so re-running after adding one
// scan converts only that.
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
// npx is a .cmd on Windows, which node will only spawn through a shell; the
// room names have spaces, so every argument is quoted for it.
const q = (a) => (process.platform === 'win32' ? `"${a.replace(/"/g, '""')}"` : a);
const cli = (...args) => execFileSync('npx', ['--yes', '@gltf-transform/cli@4', ...args].map(q), { stdio: 'pipe', shell: process.platform === 'win32' });
const mb = (n) => (n / 1024 / 1024).toFixed(2);

let done = 0, skipped = 0;
for (const name of readdirSync(src).filter((f) => f.toLowerCase().endsWith('.glb')).sort()) {
  const from = join(src, name);
  const to = join(out, `${slug(name)}.glb`);
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) { skipped++; continue; }
  const tmp = join(tmpdir(), `unlit-${process.pid}-${slug(name)}.glb`);
  try {
    cli('unlit', from, tmp);
    cli('optimize', tmp, to, '--compress', 'quantize', '--texture-compress', 'webp', '--texture-size', '1024');
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
  console.log(`${name} (${mb(statSync(from).size)} MB) -> ${basename(to)} (${mb(statSync(to).size)} MB)`);
  done++;
}
console.log(`build-models: ${done} converted, ${skipped} up to date, in ${out}`);
