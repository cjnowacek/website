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
//   - the Shore House scans: the nav links /other, /other/shore-house/ was built,
//     every live entry in src/content/models has its <model-viewer> with its .glb
//     and poster, no draft does, the viewer library is bundled, and (on the
//     machine that has the Dropbox sync folder) every .glb and poster the
//     entries name exists there and is within budget;
//   - the Shore House walkthrough (/other/shore-house/explore/): built, linked
//     from the project page, carrying every room of src/data/shore-house-explore.json
//     in its embedded data, its three.js chunk bundled, and (where the Dropbox
//     sync folder exists) every room file present and within budget;
//   - the private hub (/private/, behind public/includes/private_gate.php):
//     nothing private is in dist/ (no dist/private, no private project's page
//     or title in any text file, no /private/ URL in the sitemap); the build
//     moved the private pages to dist-private/pages/ (the hub, the login
//     template with its form and tokens, one page per `private: true` project,
//     all noindex); the gate and its rewrite rule ship; and (where
//     private-assets/ exists) every /private/img/ file a page names is there;
//   - no built page, public or private, contains an em dash (site copy rule in CLAUDE.md).
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

// 1. The home page, the nav routes and the 404 page (Home is not a nav item:
//    the header title links there).
const { navItems } = await import(pathToFileURL(join(root, 'src/config.js')).href);
check(existsSync(page('/')), 'the home page was not built');
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
      title: field('title').replace(/^['"]|['"]$/g, ''),
      private: /^true\b/.test(field('private')),
      // A private project is never public: for the public site it counts as a draft.
      draft: /^true\b/.test(field('draft')) || /^true\b/.test(field('private')),
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
  ['other.astro', '/other'],
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
// The room models are served only to pages on this site (a referer check, a
// speed bump against pasted URLs and hotlinks, not a lock; see LEDGER.md).
const ht = read(join(dist, '.htaccess'));
check(ht.includes('HTTP_REFERER') && /RewriteCond %\{REQUEST_URI\} .*models.*glb/.test(ht), '.htaccess has no referer check on /static/img/models/*.glb');
check(read(page('/contact')).includes('/includes/contact_handler.php'), '/contact does not post to /includes/contact_handler.php');
const pdfs = new Set();
for (const f of walk(join(root, 'src/pages')).filter((f) => f.endsWith('.astro'))) {
  for (const m of read(f).matchAll(/\/static\/files\/[^"'\s)]+\.pdf/g)) pdfs.add(m[0]);
}
check(pdfs.size >= 2, `expected the two resume PDFs to be linked from pages, found ${pdfs.size}`);
for (const p of pdfs) check(existsSync(join(dist, p)), `${p} is linked but missing from dist`);

// 5. Shore House models: src/content/models -> the shore-house project page under /other/.
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
check(navItems.some(([href]) => href === '/other'), 'nav does not link /other');
const shoreRoute = '/other/shore-house';
check(existsSync(page(shoreRoute)), `${shoreRoute}/ was not built`);
const shore = read(page(shoreRoute));
const viewers = (shore.match(/<model-viewer\b/g) || []).length;
check(viewers === liveModels.length, `${shoreRoute}/ has ${viewers} <model-viewer> elements for ${liveModels.length} live entries`);
for (const m of models) {
  if (m.draft) {
    check(!shore.includes(m.file), `draft model ${m.id} is on ${shoreRoute}/`);
    continue;
  }
  check(m.file.startsWith('/static/img/models/') && m.file.endsWith('.glb'), `model ${m.id}: file '${m.file}' is not a .glb under /static/img/models/`);
  check(m.poster.startsWith('/static/img/models/'), `model ${m.id}: poster '${m.poster}' is not under /static/img/models/`);
  check(shore.includes(`src="${m.file}"`), `${shoreRoute}/ has no viewer with src="${m.file}" (${m.id})`);
  check(shore.includes(`poster="${m.poster}"`), `${shoreRoute}/ has no viewer with poster="${m.poster}" (${m.id})`);
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

// 6. The Shore House walkthrough: src/data/shore-house-explore.json -> /other/shore-house/explore/.
const exploreRoute = '/other/shore-house/explore';
const layoutFile = join(root, 'src/data/shore-house-explore.json');
check(existsSync(layoutFile), 'src/data/shore-house-explore.json is missing (scripts/export-shore-house.py writes it)');
const layout = existsSync(layoutFile) ? JSON.parse(readFileSync(layoutFile, 'utf8')) : { layers: [] };
const rooms = layout.layers.flatMap((l) => l.rooms);
check(rooms.length >= 10, `the walkthrough layout has ${rooms.length} rooms, expected at least 10`);
check(existsSync(page(exploreRoute)), `${exploreRoute}/ was not built`);
const explore = read(page(exploreRoute));
check(shore.includes(`href="${exploreRoute}/"`), `${shoreRoute}/ does not link to ${exploreRoute}/`);
const dataTag = explore.match(/<script type="application\/json" id="explore-data">([^<]*)<\/script>/);
check(!!dataTag, `${exploreRoute}/ has no <script type="application/json" id="explore-data">`);
let embedded = { layers: [] };
if (dataTag) {
  try { embedded = JSON.parse(dataTag[1]); } catch (e) { check(false, `${exploreRoute}/ explore-data is not JSON: ${e.message}`); }
}
const embeddedIds = new Set(embedded.layers.flatMap((l) => l.rooms.map((r) => r.id)));
for (const r of rooms) check(embeddedIds.has(r.id), `${exploreRoute}/ embedded data lacks room ${r.id}`);
const threeBundled = (existsSync(astroDir) ? walk(astroDir) : []).some((f) => f.endsWith('.js') && statSync(f).size > 100 * 1024 && read(f).includes('WebGLRenderer'));
check(threeBundled, 'the three.js chunk is not bundled under dist/_astro (a chunk over 100 KB that names WebGLRenderer)');
if (existsSync(SYNC)) {
  for (const r of rooms) for (const f of r.files) {
    const local = join(SYNC, (layout.base || '/static/img/models/world/').replace('/static/img/', ''), f);
    check(existsSync(local), `walkthrough room ${r.id}: ${f} is not in ~sync (${local})`);
    if (existsSync(local)) check(statSync(local).size <= 4 * 1024 * 1024, `walkthrough room ${r.id}: ${f} is ${Math.round(statSync(local).size / 1024)} KB, budget 4096 KB`);
  }
}

// 7. The private hub. Public side first: nothing private may be in dist/.
const privateProjects = projects.filter((p) => p.private);
const privDist = join(root, 'dist-private');
const privPage = (route) => join(privDist, 'pages', route.replace(/^\//, ''), 'index.html');
check(privateProjects.length > 0, 'no project has `private: true` (the private hub would be empty)');
check(!existsSync(join(dist, 'private')), 'dist/private exists: the build did not move the private pages out of the public site');
const textFiles = walk(dist).filter((f) => /\.(html|xml|js|css|json|txt)$/.test(f));
for (const f of textFiles) {
  const body = read(f);
  for (const p of privateProjects) check(!body.includes(p.title), `public file ${posix(relative(dist, f))} contains the private project title '${p.title}'`);
  check(!body.includes('/private/img/'), `public file ${posix(relative(dist, f))} names a /private/img/ file`);
  if (f.endsWith('.xml')) check(!body.includes('/private'), `${posix(relative(dist, f))} lists a /private URL`);
}
// The gate and the rule that sends every /private request through it.
check(existsSync(join(dist, 'includes/private_gate.php')), 'includes/private_gate.php missing from dist');
check(/^RewriteRule \^private\(\/\.\*\)\?\$ \/includes\/private_gate\.php \[L\]$/m.test(ht), '.htaccess does not rewrite ^private(/.*)?$ to /includes/private_gate.php');
// Private side: what the gate serves, built into dist-private/pages/.
check(existsSync(privPage('/')), 'dist-private/pages/index.html (the hub) was not built');
const login = read(privPage('/login'));
check(login.includes('action="/private/login"') && login.includes('type="password"'), 'the login template has no password form posting to /private/login');
check(login.includes('%%LOGIN_ERROR%%') && login.includes('%%NEXT%%'), 'the login template lacks the %%LOGIN_ERROR%% / %%NEXT%% tokens the gate fills in');
const hub = read(privPage('/'));
for (const p of privateProjects) {
  check(existsSync(privPage(`/${p.id}`)), `private project ${p.id} has no page at dist-private/pages/${p.id}/`);
  check(hub.includes(`href="/private/${p.id}/"`), `the hub does not link to /private/${p.id}/`);
}
const privPages = existsSync(privDist) ? walk(privDist).filter((f) => f.endsWith('.html')) : [];
const assets = join(root, 'private-assets');
let assetNote = 'private-assets/ absent, screenshots not checked';
let shots = 0;
for (const f of privPages) {
  const body = read(f);
  const name = `dist-private/${posix(relative(privDist, f))}`;
  check(/<meta name="robots" content="noindex/.test(body), `${name} is not noindex`);
  check(!body.includes('—'), `${name} contains an em dash`);
  for (const m of body.matchAll(/["'](\/private\/img\/[^"']+)["']/g)) {
    shots++;
    if (existsSync(assets)) check(existsSync(join(assets, m[1].replace(/^\/private\//, ''))), `${name} names ${m[1]}, which is not in private-assets/`);
  }
}
if (existsSync(assets)) assetNote = `${shots} private image references checked against private-assets/`;

// 8. No em dash in any built page.
const pages = walk(dist).filter((f) => f.endsWith('.html'));
check(pages.length >= navItems.length + 1, `only ${pages.length} html pages built`);
for (const f of pages) check(!read(f).includes('—'), `${posix(relative(dist, f))} contains an em dash`);

if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`check-dist: ${checks} checks, ${failures.length} failed`);
  process.exit(1);
}
console.log(`check-dist: ${checks} checks, 0 failed (${pages.length} pages, ${projects.filter((p) => !p.draft).length} projects, ${liveModels.length} models, ${rooms.length} walkthrough rooms, ${rules} redirect rules; ${syncNote}; ${privPages.length} private pages, ${assetNote})`);
