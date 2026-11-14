# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

CJ Nowacek's portfolio website (cjnowacek.com): a static Astro site, hosted on SiteGround behind Apache. Two portfolio tracks mirror his dual resume: Technical Art (`/techart`) and Pipeline/DevOps (`/devops`). Migrated from procedural PHP in August 2026; the only server-side PHP left is the contact form handler (`public/includes/contact_handler.php`) and the standalone `/play/` room directory.

## Commands

```bash
npm install            # once per clone
npm run dev            # local dev server (http://localhost:4321)
npm run build          # static build into dist/
npm run preview        # serve the built dist/ locally

# Manually re-run the deploy workflow if needed
gh workflow run deploy.yml

# Push new/changed images to the server (images are not deployed by CI)
rsync -avzP --exclude='*.kra' --exclude='*~' static/img/ siteground:www/cjnowacek.com/public_html/static/img/
```

There is no lint step. The gate (see the workflow section below and `LEDGER.md`) is:

```bash
npm run build                  # astro build, then scripts/split-private.mjs moves dist/private to dist-private/pages
node scripts/check-dist.mjs    # smoke check of dist/: nav routes, project pages and cards, shipped files, nothing private in dist/, no em dashes
bash scripts/check-private.sh  # runs the private hub's gate under php -S and attacks it
bash scripts/check-php.sh      # php -l on the PHP that ships
```

## Deploy

Pushing to `main` auto-deploys: `.github/workflows/deploy.yml` builds the Astro site and rsyncs `dist/` over SSH to SiteGround (secrets `SG_HOST`/`SG_USER`/`SG_SSH_KEY`, optional `SG_PORT`). `deploy.sh` is the manual equivalent. Prefer pushing; don't hand-rsync the site. Because of this, landing a task in the workflow below (fast-forward merge, push main) is a deploy; subagent branches are never pushed.

Protected on the server (never deleted by the deploy):

- `private-data/` (next to `public_html`, not in it): the private hub's pages are synced there by the deploy; its screenshots and password hash only by `./deploy-private.sh`
- `/play/` — deployed separately, only via `./deploy-play.sh`
- `/includes/contact_submissions.json` — live contact-form log
- `/.well-known/` — host-managed (Let's Encrypt)
- `/static/img/**` — images are hand-synced (see below), except the git-tracked exceptions: `static/img/project-cards/video/` and `static/img/project-cards/ml3ds-webp-1200x900.webp`

If a deployed change looks stale in the browser, SiteGround's cache may be serving old files: flush via Site Tools > Speed > Caching. `public/.htaccess` already sends no-cache for HTML and immutable for hashed `/_astro/` assets.

## Images

Images live in Dropbox, not git; `static/img/` is gitignored (except the exceptions above). Astro serves them via the `public/static -> ../static` symlink, so root `static/` is the canonical asset dir. The sync source is `C:\Dropbox\1-career\web-assets\~sync\` (subfolders `pages/`, `pfp/`, `project-cards/` map 1:1 into `static/img/`). The sync script wipes `static/img/` and re-copies from Dropbox, so Dropbox is the source of truth: any image added here must also be added to `~sync\`. The script lives in that Dropbox folder, not this repo:

```bash
"/c/Dropbox/1-career/web-assets/sync-with-static-img.sh" [path-to-repo]
```

Source art (PSDs, logo, gif frames) is in `C:\Dropbox\1-career\web-assets\src\`; only `~sync\` contents ship to the site.

## Architecture

### Projects are content, not markup

One `.mdx` file per project under `src/content/projects/` holds both the card metadata (frontmatter: `title`, `company`, `category` techart/devops, `featured`, `order`, `image`, `video`, `description`, `highlights`, `tech_tags`, `meta`) and the detail-page body. The schema is `src/content.config.ts`. The detail route is derived as `/{category}/{id}`, where id is the file path (e.g. `smite/gravity-switch` → `/techart/smite/gravity-switch`), rendered by `src/pages/techart/[...slug].astro` and `src/pages/devops/[...slug].astro`.

Listing pages pass an explicit ordered id array to `getProjectCards()` (`src/lib/projects.js`): `index.astro` (featured), `techart.astro`, `devops.astro`. An id absent from every list is unlisted but still builds a reachable detail page (currently `sintern`). `draft: true` keeps a project out of the build entirely (`deadline-deploy`: not yet IP-safe; `omnitool` is `private: true` instead, see the private hub below). `getProjectCards()` drops an id it cannot find without error; `scripts/check-dist.mjs` catches that.

**To add a project:** create the `.mdx` in `src/content/projects/`, add its id to the relevant page's list, and drop the card image/video into `static/img/project-cards/` (via Dropbox, not git; small mp4 hover videos are the tracked exception).

### The private hub (`/private/`)

Password-protected, unlisted, noindex: work that can be shown on request but not published (currently `omnitool`). A project with `private: true` in its frontmatter is built only into the hub, nowhere public. While there is a single private project it is the `/private/` page itself (the user, 2026-11-13: no list with one card); with two or more, `/private/` lists them and each gets `/private/<id>/`. `src/pages/private/` holds the hub page, the detail route and the login form template.

- Nothing private is in the webroot. `npm run build` moves `dist/private/` to `dist-private/pages/`; the deploy syncs that to `private-data/pages/` beside `public_html`. `public/.htaccess` rewrites every `/private...` request to `public/includes/private_gate.php`, which checks the session and serves from `private-data/`. (A deny rule in `.htaccess` would not be a lock: SiteGround's nginx serves static files without asking Apache.)
- Screenshots live in `private-assets/img/` (gitignored, NOT `static/img`, never in git) and are referenced as `/private/img/...`. `./deploy-private.sh` syncs them; `./deploy-private.sh --set-password` sets the one shared password (only its hash is stored, on the host; changing it logs everyone out). Keep a copy of `private-assets/` outside the repo.
- Preview: `astro dev` shows `/private/` without the lock; `scripts/preview-private.sh` serves the built site with the real gate (password `preview`).
- To add a private project: `private: true` in its `.mdx`, images under `private-assets/img/<id>/`, then `./deploy-private.sh` and push.

### Everything else

- `src/layouts/Layout.astro` — shell (nav, footer, SEO); site-wide strings in `src/config.js`.
- `src/pages/devlog.astro` — dev log; posts are inline in that file.
- `public/` — copied verbatim into `dist/`: `.htaccess` (legacy-URL 301s, cache headers), `includes/contact_handler.php`, and the `static` symlink.
- Contact form (`src/pages/contact.astro`) POSTs to `/includes/contact_handler.php`, which honeypots, validates, appends to `contact_submissions.json` (gitignored), and emails cj@cjnowacek.com.
- `play/` — Traitors & Titans room directory, self-contained PHP (`index.php` + `api.php`). Never touched by the site deploy; use `./deploy-play.sh`, which also provisions the registration secret in `tt-data/` outside the webroot.

## Gotchas

- `static/files/` holds the two resume PDFs. Do not edit them here: the `Resume-with-Tex` repo's CI builds them and pushes fresh copies into this repo automatically (commits authored by `resume-ci`). That CI targets root `static/files/`, which is why `public/static` must stay a symlink rather than a real directory.
- Site copy style: no em dashes anywhere in user-facing text; use colons, commas, or parentheses. Keep employer work described IP-safe: no internal tool codenames, node counts, vendor names, or client names from MediaLab work.
- Old PHP URLs (`/foo.php`, `/pages-techart/...`, retired/renamed slugs) 301 via `public/.htaccess`; keep those rules when touching it.
- On Windows, the clone needs `git config core.symlinks true` (Developer Mode) before `public/static` is checked out; otherwise git writes it as a text file, `dist/static` is empty (no CSS, PDFs, icons) and the build still succeeds. This clone has it set; worktrees inherit it.

## The gated subagent workflow

Work is done in tasks, each given to a subagent (`LEDGER.md` is the ledger of the run; read it first).

- A subagent's branch `subagent/<name>` lives in a git worktree under
  `.claude/worktrees/` for the length of one sitting. It is never pushed, and
  it is merged into main or deleted before the sitting ends. `LEDGER.md` names
  every one that exists.
- The gate is listed in `.claude/gate` and described in `LEDGER.md`. Only the
  main session edits gate files: a hook on the `implementer` subagent
  (`.claude/hooks/gate-guard.py`) refuses its edits to them, to `.claude/`,
  `CLAUDE.md` and `LEDGER.md`, and refuses the git commands that leave its
  branch. A change that is meant to alter what a check checks changes the
  check in the same commit, by the main session.
- Every new check is shown failing before the work that makes it pass.
- Nothing merges on a subagent's word: the main session reruns the whole gate.

## Layout

```
website/
├── .claude/                       gate (protected paths), hooks/gate-guard.py, agents/implementer.md, KICKOFF.md, worktrees/ (gitignored)
├── LEDGER.md                      The workflow's record: gate, running tasks, landed tasks, lessons
├── scripts/                       check-dist.mjs, check-private.sh, check-php.sh (the gate's checks), split-private.mjs (build step)
├── .github/workflows/deploy.yml   Build Astro + rsync dist/ to SiteGround on push to main
├── astro.config.mjs
├── deploy.sh                      Manual full-site deploy (same protections as CI)
├── deploy-play.sh                 Deploys ONLY play/
├── deploy-private.sh              Private hub: syncs private-assets/img, sets the password
├── private-assets/                Gitignored; the private hub's screenshots
├── play/                          Traitors & Titans room directory (PHP, separate deploy)
├── public/                        Copied into dist/ as-is
│   ├── .htaccess                  Redirects from old PHP URLs, cache headers
│   ├── includes/contact_handler.php
│   ├── includes/private_gate.php  The lock on /private/
│   └── static -> ../static        Symlink; see Images
├── src/
│   ├── config.js                  Nav, SEO metadata, social links
│   ├── content.config.ts          Project frontmatter schema
│   ├── content/projects/          One .mdx per project (card + detail page)
│   ├── components/                ProjectCard, ProjectGrid, Breadcrumb, Expandable
│   ├── layouts/                   Layout.astro, ProjectDetail.astro
│   ├── lib/projects.js            getProjectCards() helpers
│   └── pages/                     index, techart, devops, about, contact, devlog, 404, [...slug]
└── static/
    ├── css/                       Modular stylesheets (variables, base, grid, header, ...)
    ├── files/                     Resume PDFs (from Resume-with-Tex CI; do not edit)
    ├── icons/
    └── img/                       Gitignored; synced from Dropbox
```
