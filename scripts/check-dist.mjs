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

// 3b. Card and hero images are responsive. An <img> whose src is a
// *-webp-1200x900.webp card image must offer the 800x600 variant too and say
// how wide it renders, or every visitor downloads 1200x900 for a 420px card.
let responsive = 0;
for (const f of walk(dist).filter((f) => f.endsWith('.html'))) {
  const rel = posix(relative(dist, f));
  for (const m of read(f).matchAll(/<img[^>]*>/g)) {
    const tag = m[0];
    const src = (tag.match(/src="([^"]+)"/) || [])[1] || '';
    if (!/-webp-1200x900\.webp$/.test(src)) continue;
    responsive++;
    const name = src.split('/').pop();
    const small = src.replace('-1200x900.webp', '-800x600.webp');
    check(tag.includes(`${small} 800w`) && tag.includes(`${src} 1200w`), `${rel}: <img ${name}> lacks an 800w/1200w srcset`);
    check(/sizes="[^"]+"/.test(tag), `${rel}: <img ${name}> has no sizes attribute`);
  }
}
check(responsive > 0, 'no card images found in the built pages');

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

// 5. No em dash in any built page.
const pages = walk(dist).filter((f) => f.endsWith('.html'));
check(pages.length >= navItems.length + 1, `only ${pages.length} html pages built`);
for (const f of pages) check(!read(f).includes('—'), `${posix(relative(dist, f))} contains an em dash`);

if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`check-dist: ${checks} checks, ${failures.length} failed`);
  process.exit(1);
}
console.log(`check-dist: ${checks} checks, 0 failed (${pages.length} pages, ${projects.filter((p) => !p.draft).length} projects, ${rules} redirect rules)`);
