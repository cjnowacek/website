# LEDGER

What a new session reads first. The main session keeps it current after
every delegation, review and landing. If this file and the repo disagree, the
repo is right and this file gets fixed.

## The gate

Run from the repo (or worktree) root. All of it, every time, green before and
after every task.

    npm run build                  # Astro build: schema and MDX errors, broken imports. 16 page(s) built
    node scripts/check-dist.mjs    # smoke check of dist/: 67 checks, 0 failed (16 pages, 8 projects, 10 redirect rules)
    bash scripts/check-php.sh      # php -l on the PHP that ships: 3 files, 0 errors

A worktree needs `node_modules` before the build: the main session junctions
the main checkout's `node_modules` into it when it creates the worktree
(`New-Item -ItemType Junction`), so no install runs there. This clone has
`git config core.symlinks true` (Developer Mode), without which git writes
`public/static` as a text file and `dist/static` is empty; worktrees share
that config.

What the gate does NOT cover: the contact handler's behaviour (email, honeypot,
the submissions log: only ever run on the host); the Apache redirects in
`.htaccess` (counted, not exercised); the `/play/` PHP app beyond syntax;
layout, CSS and anything visual (the look is the main session's job in
Chrome); images (`static/img` is Dropbox-synced and absent from worktrees,
and the build does not verify image URLs).

Gate files are listed in `.claude/gate`. Only the main session edits them;
`.claude/hooks/gate-guard.py` refuses the subagent's edits to them and to
`.claude/`, `CLAUDE.md` and this file. In words: everything under `scripts/`,
`package.json`, `package-lock.json`, `astro.config.mjs`,
`src/content.config.ts`, `.github/workflows/`, `deploy.sh`, `deploy-play.sh`,
and `static/files/`.

## Rules of the run

- The main session plans, writes the failing checks, and reviews. It does
  not implement.
- One task = one branch `subagent/<name>` in a worktree `.claude/worktrees/<name>`.
  Never pushed. Merged or deleted before the sitting ends. Every branch that
  exists is named under Running; one that is not named here is a mistake.
- The check comes first: committed on the subagent's branch, and SHOWN RED against
  today's build, before the subagent is delegated.
- Never trust a report. Review = scope (only in-scope files changed) + gate
  files untouched by the subagent + read the diff + rebase on main + run the
  whole gate yourself + look at it if it can be looked at.
- One task in review at a time.
- Anything that changes what the user sees is shown to the user before it
  merges.
- Pushing main deploys the site (`.github/workflows/deploy.yml`), so a landing
  is a deploy. Flush SiteGround's cache if the change looks stale.

## Landed

(newest last; one entry per task: what it did, the gate counts, what review
found, what is known and accepted)

- 2026-09-26 `plumbing` (adoption's throwaway task, landed 7849893): one
  comment line in `src/lib/projects.js`. Check `scripts/check-plumbing.sh`,
  seen red before delegation, green after; retired in the landing commit.
  Gate at landing: 16 pages, check-dist 67/0, check-php 3/0. Review found
  the diff exactly as briefed, one file, no gate file touched. The
  implementer (sonnet) reported honestly that it never saw the check red
  itself; that is the main session's proof, not its job.

## Running

- `card-srcset` (branch `subagent/card-srcset`, worktree
  `.claude/worktrees/card-srcset`): responsive card and hero images.
  Reviewed 2026-09-26 and approved: two files, no gate file touched, rebased
  on main (tip 6683473), gate green under the main session (100 checks).
  NOT landed on purpose: the markup asks for `*-webp-800x600.webp`, so the
  800x600 files must be on the host (Next item 3) before this deploys, or
  narrow viewports get 404 images. Lands right after that rsync.
- `media-budget` (branch `media-budget`, main session, no worktree): commit
  a1564fd. Gate on it is green except `check-media` on the five Dropbox card
  images that item 3 under Next replaces; lands together with those assets
  after the user's look.
- `models-section` (branch `subagent/models-section`, worktree
  `.claude/worktrees/models-section`): Other Projects tab with the Shore
  House scans. REVIEWED 2026-09-27 AND APPROVED, waiting for the user's look
  and the asset rsync. Branch (rebased on main 84a4b5d, 10 commits): gate
  commits 664ac4c (schema `models`, `@google/model-viewer` 4.3.1,
  `scripts/build-models.mjs`, checks; red 72/4), 35640b5 (quantize recipe,
  `.glb` MIME type), 41c2a4c (two word-boundary escapes had arrived as 0x08
  bytes; found by the implementer), c0927f0 and 0a18845 (retargets after the
  user's looks: category `other`, listing `/other/`, scans on
  `/other/shore-house/`; red 228/42); implementer commits fba1007 (first
  pass, standalone page), be3100f and 5411a1a (the card-grid version:
  `other.astro`, `other/[...slug].astro`, `shore-house.mdx`,
  `ModelGrid.astro`, `ProjectDetail` category map, `ModelViewer` caption,
  20 model entries, `models.css`); main-session fix 02009e8 (`height: auto`
  on `model-viewer`: once the library loaded, its `:host` height of 150px
  beat `aspect-ratio` and every card shrank; seen in the headless look,
  heights 227/227 before and after now). Review: scope exact, no gate file
  touched, diff read, gate under the main session 18 pages, check-dist
  233/0, check-php 3/0. Looks: headless Chrome on the built preview at 1300
  and 400 px (page loads one 1.3 KB script and no library; the first click
  fetches the 1 MB chunk, 290 KB gzipped, then the room), Chrome
  screenshots of `/other/` and `/other/shore-house/`. Preview for the user:
  http://127.0.0.1:4326/other/ (`astro preview` from the worktree, which has
  `static/img/models` junctioned from the main checkout and the card image
  copied into `static/img/project-cards/`, both gitignored).
  TO LAND: (1) rsync `static/img/models/` and
  `static/img/project-cards/shore-house-webp-{1200x900,800x600}.webp` to the
  host, (2) fast-forward main, push (deploys), (3) remove the
  `static/img/models` junction and the `node_modules` junction in the
  worktree on their own before `git worktree remove`.
  Follow-up worth a task: the bundled viewer chunk is 1,070 KB (290 KB
  gzipped) against 464 KB (140 KB) for the package's own
  `dist/model-viewer-module.min.js`; importing that file instead would halve
  the first click.

## Next, in order

Sitting 2026-09-26, "optimization". Measured first (Chrome, live site):
home page above the fold 56 KB; fully scrolled 1.18 MB, of which 1.12 MB is
four card images served at 1200x900 for a 420px card; hover videos fetch
nothing until hovered but weigh 10.9 MB (1920x1080); the SMITE page's
gravitySwitch card is a 4.4 MB animated webp; HTML, CSS (one 21 KB file),
fonts (system) and cache/Brotli headers are already fine.

1. `card-srcset` (implementer): `srcset` 800w/1200w and `sizes` on card
   and hero images. Check in `check-dist.mjs`, red first.
2. `media-budget` (main session, branch `media-budget`): hover videos
   re-encoded to 960x540 crf 30, `scripts/check-media.mjs` budgets
   (video 1.6 MB, card image 200 KB). Lands with 3.
3. Assets (main session, needs the user's look): q80 re-encodes of every
   card image (1200x900 and new 800x600), a still frame for gravitySwitch,
   into Dropbox `~sync/project-cards`, then the sync script and the image
   rsync. Staged in the session scratch `assets-out/` until approved.
4. `drop-puppeteer` (main session): done on main, unpushed.

Sitting 2026-09-26 (second kickoff), "3d viewer space for models", and
sitting 2026-09-27 (this one), where the plan was executed. The user
(2026-09-26): "not for smite or other projects. completely different tab I
want to show off" and "like wip models of my shorehouse project". So a
standalone section with its own nav item, and the models are the iPhone
LiDAR scans in `C:/Dropbox/2-dev/3d/blender-shore-house/scans/` (20 rooms,
110 MB). Downloads cannot be prevented in a browser viewer; the user was
told, and what ships is display versions only.

Decided by the main session 2026-09-27 (the user was not available; each is
one line to change): viewer `@google/model-viewer`, loaded on the first click
on any room, never with the page; nav label "Shore House", route
`/shore-house/`; models grouped Outside / Downstairs / Upstairs; the "Front
outside initial test" scan is a draft entry; captions empty for now.

Pipeline, all done and reproducible:
- `scripts/build-models.mjs <scan-dir> <out-dir>`: unlit, then gltf-transform
  optimize with quantize (not meshopt: the model-viewer bundle has no
  meshopt decoder; not draco: it would fetch Google's decoder), texture to
  1024 webp. 110 MB in, 15 MB out. Run it on this machine with
  `C:/Dropbox/1-career/web-assets/~sync/models` as out-dir.
- Posters: rendered by model-viewer itself in headless Chrome
  (puppeteer-core, SwiftShader) at `camera-orbit="-30deg 60deg 80%"`, the
  same framing the page uses, so the poster does not jump when the model
  appears. The tool is in the session scratch (`posters/server.mjs`,
  `poster.html`, `render.mjs`), not in the repo; recreate it from the ledger
  if a new room needs a poster, or screenshot the viewer in Chrome. The
  headed Chrome tab could not be used: the MCP tab reports
  `document.hidden`, and model-viewer never renders a hidden tab.

5. `models-section` (implementer): running, see above.
6. Image rsync (main session): `~sync/models/` to the host, with the item 3
   assets or on its own. Then `models-section` lands.
7. Later, if wanted: room captions (the `.mdx` bodies), the blockmesh stage
   and the clean house exported from save 46 as further entries, a
   hand-rolled three.js viewer with skeleton and clip switching for
   rigging work.

## Held for the user

- The envelope-tool hover video `skinExporter_1200x900.mp4` is 2 frames
  (0.08 s at 12 Mbps): the hover preview shows nothing. Re-export it from
  the source clip, or remove `video:` from that project's frontmatter?
- `~sync/project-cards/` holds 285 MB of old gifs (180 MB gravitySwitch,
  40 MB smite, 35 MB runaway, 14 MB sintern, 13 MB whispers, plus
  skinExporter) that nothing references since the mp4 switch. They still
  rsync to the host on every image sync. Delete them from `~sync`, or move
  them to `web-assets/src`?
- Card images at quality 80: approve the re-encodes staged in the session
  scratch (`assets-out/project-cards`) before they overwrite `~sync`? The
  1200x900 set goes from 6.7 MB to 0.6 MB; crops looked identical.
- 3D viewer: the choices above (label "Shore House", model-viewer, groups,
  the draft, empty captions) were made without the user; any of them is one
  line to change before it lands. Also: the scans are of a family home;
  confirm it is fine to publish them.

## Lessons

- 2026-09-26: the main session's shell must not `cd` into a worktree: the
  harness then treats the worktree as the working directory. Use `git -C`
  and `( cd ... )` subshells from the main checkout.
- 2026-09-26: remove a worktree's `node_modules` junction on its own
  (`[System.IO.Directory]::Delete(path, $false)`) before `git worktree
  remove`, so nothing can recurse into the main checkout's `node_modules`.
- 2026-09-26: on Windows, a clone without `core.symlinks=true` builds a site
  with no CSS, PDFs or icons and the build still exits 0. The smoke check
  asserts `dist/static/css/main.css` and the resume PDFs so this cannot pass
  silently again.
- 2026-09-27: `npx` is a `.cmd` on Windows, so `execFileSync` needs a shell,
  and a shell splits unquoted arguments with spaces (the room names). Quote
  every argument when spawning through the shell.
- 2026-09-27: the model-viewer bundle reads meshopt files only with a decoder
  the site hosts and configures (`meshoptDecoderLocation`); without it the
  load fails silently in the page (an `error` event). Check the extensions a
  file requires against what the viewer ships before choosing a compressor.
- 2026-09-27: in a shared worktree a bare `git commit` takes whatever the
  subagent has staged (its `git mv` rode into a gate commit and had to be
  rewritten). The main session commits gate files with explicit paths:
  `git -C <worktree> commit -m ... -- <files>`.
- 2026-09-27: the Bash tool halves backslashes, so a `\b` typed into a
  Python heredoc reaches Python as a backspace escape. Write regex escapes
  through the Write/Edit tools, or spell the backslash as `chr(92)`.
