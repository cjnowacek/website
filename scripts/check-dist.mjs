#!/usr/bin/env node
// scripts/check-dist.mjs: the site's smoke check. Run after `npm run build`,
// from the repo (or worktree) root: `node scripts/check-dist.mjs`.
//
// It reads dist/ and asserts the things a person notices when they break:
//   - every nav route in src/config.js and the 404 page were built;
//   - every non-draft project in src/content/projects has its detail page,
//     and no draft was built;
//   - every id a listing page hands to getProjectCards() is a live project
//     and the built listing links to it (getProjectCards drops an unknown id
//     silently, so a typo just makes a card vanish);
//   - the files the site cannot work without shipped: .htaccess with its
//     legacy-URL redirect rules, the contact handler the contact page posts
//     to, RSS, the sitemap, the CSS, and every resume PDF a page links to;
//   - the Shore House page: the nav links /shore-house, it was built, every
//     live entry in src/content/models has its <model-viewer> with its .glb
//     and poster, no draft does, the viewer library is bundled, and (on the
//     machine that has the Dropbox sync folder) every .glb and poster the
//     entries name exists there and is within budget;
//   - no built page contains an em dash (site copy rule in CLAUDE.md).
// Exit 0 prints "check-dist: N checks, 0 failed"; exit 1 lists each failure.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

let checks = 0;
const failures = [];
function check(ok, what) {
  checks++;
  if (!ok) failures.push(what);
}
const page = (route) => join(dist, route.replace(/^\//, ''), 'index.html');
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const posix = (p) => p.replace(/\\/g, '/');

if (!existsSync(dist)) {
  console.error('check-dist: no dist/ here; run `npm run build` first');
  process.exit(1);
}

// 1. Nav routes and the 404 page.
const { navItems } = await import(pathToFileURL(join(root, 'src/config.js')).href);
for (const [href] of navItems) check(existsSync(page(href)), `nav route ${href} has no built page`);
check(existsSync(join(dist, '404.html')), '404.html was not built');

// 2. Projects: one detail page per non-draft entry, none for drafts.
const projectsDir = join(root, 'src/content/projects');
const projects = walk(projectsDir)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => {
    const fm = read(f).split(/^---\s*$/m)[1] || '';
    const field = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim() || '';
    return {
      id: posix(relative(projectsDir, f)).replace(/\.mdx$/, ''),
      category: field('category'),
      draft: /^true\b/.test(field('draft')),
    };
  });
check(projects.length > 0, 'no project .mdx files found under src/content/projects');
for (const p of projects) {
  const route = `/${p.category}/${p.id}`;
  if (p.draft) check(!existsSync(page(route)), `draft project ${p.id} was built at ${route}/`);
  else check(existsSync(page(route)), `project ${p.id} has no page at ${route}/`);
}

// 3. Listing pages: every id they name is live and linked from the built page.
const byId = new Map(projects.map((p) => [p.id, p]));
for (const [file, route] of [
  ['index.astro', '/'],
  ['techart.astro', '/techart'],
  ['devops.astro', '/devops'],
]) {
  const src = read(join(root, 'src/pages', file));
  const call = src.match(/getProjectCards\(\s*\[([\s\S]*?)\]/);
  check(!!call, `${file}: no getProjectCards([...]) call found`);
  if (!call) continue;
  const ids = [...call[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  check(ids.length > 0, `${file}: getProjectCards() is given no ids`);
  const html = read(page(route));
  for (const id of ids) {
    const p = byId.get(id);
    check(p && !p.draft, `${file} lists '${id}', which is not a live project (its card is dropped silently)`);
    if (!p) continue;
    const link = `/${p.category}/${id}`;
    check(html.includes(`href="${link}"`) || html.includes(`href="${link}/"`), `${route} does not link to ${link}`);
  }
}

// 4. Files the site cannot work without.
for (const f of ['.htaccess', 'includes/contact_handler.php', 'rss.xml', 'sitemap-index.xml', 'static/css/main.css']) {
  check(existsSync(join(dist, f)), `${f} missing from dist`);
}
const rules = (read(join(dist, '.htaccess')).match(/^\s*(RewriteRule|Redirect)\b/gm) || []).length;
check(rules >= 10, `.htaccess has ${rules} redirect rules, expected at least 10 (the legacy-URL 301s)`);
check(read(page('/contact')).includes('/includes/contact_handler.php'), '/contact does not post to /includes/contact_handler.php');
const pdfs = new Set();
for (const f of walk(join(root, 'src/pages')).filter((f) => f.endsWith('.astro'))) {
  for (const m of read(f).matchAll(/\/static\/files\/[^"'\s)]+\.pdf/g)) pdfs.add(m[0]);
}
check(pdfs.size >= 2, `expected the two resume PDFs to be linked from pages, found ${pdfs.size}`);
for (const p of pdfs) check(existsSync(join(dist, p)), `${p} is linked but missing from dist`);

// 5. Shore House models: src/content/models -> /shore-house/.
const modelsDir = join(root, 'src/content/models');
const models = (existsSync(modelsDir) ? walk(modelsDir) : [])
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => {
    const fm = read(f).split(/^---\s*$/m)[1] || '';
    const field = (k) => (fm.match(new RegExp(`^${k}:\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '') || '';
    return { id: posix(relative(modelsDir, f)).replace(/\.mdx$/, ''), file: field('file'), poster: field('poster'), draft: /^true\b/.test(field('draft')) };
  });
const liveModels = models.filter((m) => !m.draft);
check(liveModels.length > 0, 'no live model entries under src/content/models');
check(navItems.some(([href]) => href === '/shore-house'), 'nav does not link /shore-house');
check(existsSync(page('/shore-house')), '/shore-house/ was not built');
const shore = read(page('/shore-house'));
const viewers = (shore.match(/<model-viewer\b/g) || []).length;
check(viewers === liveModels.length, `/shore-house/ has ${viewers} <model-viewer> elements for ${liveModels.length} live entries`);
for (const m of models) {
  if (m.draft) {
    check(!shore.includes(m.file), `draft model ${m.id} is on /shore-house/`);
    continue;
  }
  check(m.file.startsWith('/static/img/models/') && m.file.endsWith('.glb'), `model ${m.id}: file '${m.file}' is not a .glb under /static/img/models/`);
  check(m.poster.startsWith('/static/img/models/'), `model ${m.id}: poster '${m.poster}' is not under /static/img/models/`);
  check(shore.includes(`src="${m.file}"`), `/shore-house/ has no viewer with src="${m.file}" (${m.id})`);
  check(shore.includes(`poster="${m.poster}"`), `/shore-house/ has no viewer with poster="${m.poster}" (${m.id})`);
}
const astroDir = join(dist, '_astro');
const bundled = (existsSync(astroDir) ? walk(astroDir) : []).some((f) => f.endsWith('.js') && statSync(f).size > 300 * 1024 && read(f).includes('model-viewer'));
check(bundled, 'the model-viewer library is not bundled under dist/_astro (a chunk over 300 KB that names model-viewer)');
// The model files are Dropbox-synced (~sync/models -> static/img/models), so
// a typo in `file` or `poster` is a 404 the build cannot see. Where that
// folder exists (the main session's machine) each named file must be there
// and within budget: a room 4 MB, a poster 200 KB.
const SYNC = 'C:/Dropbox/1-career/web-assets/~sync';
let syncNote = 'Dropbox sync folder absent, model files not checked';
if (existsSync(SYNC)) {
  syncNote = `${liveModels.length} model entries checked against ~sync`;
  const budgets = [['file', 4 * 1024 * 1024], ['poster', 200 * 1024]];
  for (const m of liveModels) {
    for (const [key, limit] of budgets) {
      const local = join(SYNC, m[key].replace(/^\/static\/img\//, ''));
      check(existsSync(local), `model ${m.id}: ${key} ${m[key]} is not in ~sync (${local})`);
      if (existsSync(local)) check(statSync(local).size <= limit, `model ${m.id}: ${key} ${m[key]} is ${Math.round(statSync(local).size / 1024)} KB, budget ${Math.round(limit / 1024)} KB`);
    }
  }
}

// 6. No em dash in any built page.
const pages = walk(dist).filter((f) => f.endsWith('.html'));
check(pages.length >= navItems.length + 1, `only ${pages.length} html pages built`);
for (const f of pages) check(!read(f).includes('—'), `${posix(relative(dist, f))} contains an em dash`);

if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`check-dist: ${checks} checks, ${failures.length} failed`);
  process.exit(1);
}
console.log(`check-dist: ${checks} checks, 0 failed (${pages.length} pages, ${projects.filter((p) => !p.draft).length} projects, ${liveModels.length} models, ${rules} redirect rules; ${syncNote})`);
