#!/usr/bin/env node
// scripts/check-media.mjs: the media budget for what ships from git.
// Run from the repo (or worktree) root: `node scripts/check-media.mjs`.
//
// The hover videos and the tracked card image live in git and deploy with the
// site, so their weight is part of every listing page. The card renders at
// about 420 CSS px wide, so a 1920x1080 hover clip is waste: 960x540 at
// crf 30 is visually identical there (measured 2026-09-26). Budgets:
//   - each static/img/project-cards/video/*.mp4          <= 1.6 MB
//   - each tracked static/img/project-cards/*.webp       <= 200 KB
// When the Dropbox sync folder is present (the main session's machine) the
// same 200 KB budget is applied to every card image there too; elsewhere that
// part is skipped and says so.
// Exit 0 prints "check-media: N checks, 0 failed"; exit 1 lists each failure.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO_BUDGET = 1.6 * 1024 * 1024;
const IMAGE_BUDGET = 200 * 1024;
const SYNC = 'C:/Dropbox/1-career/web-assets/~sync/project-cards';

let checks = 0;
const failures = [];
const kb = (n) => `${Math.round(n / 1024)} KB`;
function budget(dir, ext, limit, label) {
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => f.endsWith(ext));
  for (const f of files) {
    checks++;
    const size = statSync(join(dir, f)).size;
    if (size > limit) failures.push(`${label}/${f} is ${kb(size)}, budget ${kb(limit)}`);
  }
  return files.length;
}

const videos = budget(join(root, 'static/img/project-cards/video'), '.mp4', VIDEO_BUDGET, 'video');
checks++;
if (videos === 0) failures.push('no hover videos found under static/img/project-cards/video');
const tracked = budget(join(root, 'static/img/project-cards'), '.webp', IMAGE_BUDGET, 'project-cards');

let synced = 0;
let note = 'Dropbox sync folder absent, its images skipped';
if (existsSync(SYNC)) {
  synced = budget(SYNC, '.webp', IMAGE_BUDGET, '~sync/project-cards');
  note = `${synced} Dropbox card images checked`;
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`check-media: ${checks} checks, ${failures.length} failed`);
  process.exit(1);
}
console.log(`check-media: ${checks} checks, 0 failed (${videos} videos, ${tracked} tracked images, ${note})`);
