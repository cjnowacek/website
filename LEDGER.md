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

- 2026-09-27 `models-section` (landed b0da2e5, fast-forward of
  `subagent/models-section`, 10 commits): the Other Projects tab
  (`/other/`, nav "Other", a card grid like the home page) and the Shore
  House project at `/other/shore-house/`: 19 iPhone LiDAR room scans as
  click-to-load `<model-viewer>` rooms (`src/content/models/`, 20 entries,
  one draft), `@google/model-viewer` 4.3.1 loaded on the first click only,
  a third project category `other`, `scripts/build-models.mjs` (the
  gltf-transform recipe), `.glb` MIME type in `.htaccess`. Gate at landing:
  18 pages, check-dist 233/0, check-php 3/0. Assets rsynced to the host
  from WSL (Git Bash has no rsync and no `siteground` alias; WSL has both):
  `static/img/models/` (40 files, 15 MB) and the two `shore-house-webp-*`
  card images. Review found the diff as briefed; the implementer found a
  real defect in the main session's check (two escapes arrived as 0x08
  bytes, fixed in 41c2a4c); the main session's look found the card-shrink
  bug fixed in 02009e8. The user looked twice: first at a standalone tab
  ("this is good" but no tab of its own), then asked for the card grid.
  Known and accepted: the viewer chunk is 1,070 KB (290 KB gzipped) where
  the package's prebuilt module is 464 KB (140 KB); captions are empty;
  the "initial test" scan is a draft; the posters were rendered once by
  model-viewer in headless Chrome and the tool for that lives only in the
  session scratch (recreate from the ledger notes under Next, or
  screenshot the viewer).

- 2026-09-27 `nav-trim` (main session, on main): the user's look at
  /other/ ("is this too cluttered"): Home dropped from the nav (the header
  title links home; seven items wrapped on a tablet), the rule and the
  two-line intro on /other/ replaced by one line. check-dist now asserts
  the home page directly since it is no longer a nav route. Gate: 18 pages,
  233/0, 3/0.

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
- `explore` (branch `subagent/explore`, worktree `.claude/worktrees/explore`,
  junctions: `node_modules`, `static/img/models`): the noclip-style
  walkthrough at `/other/shore-house/explore/`. The user (2026-09-27): "is
  there a way to set it up like https://noclip.website/" then "yes. I am
  eventually going to make a cleaned up model. full version". Gate commits by
  the main session: d5ca29d (`three` 0.183.2 as a direct dependency, pinned
  to model-viewer's; `scripts/export-shore-house.py`;
  `src/data/shore-house-explore.json`; checks; red 274/38), 1bf7575 and
  e818970 (export fixes: manual deselect, missing-image relink, `--only`).
  Why the Blender file and not the raw scans: the scans in the .blend were
  cropped, rotated and placed in edit mode, so the placement is in the mesh
  data and no object transform reproduces it with the original files; the
  export takes the placed meshes themselves (17 rooms, two east-side scans
  merged), world space, glTF Y-up. Assets: `~sync/models/world/*.glb`
  (18 files, 14 MB, 0.3 to 2.3 MB each), synced into `static/img/models/world`,
  NOT yet on the host. Layout verified by three Blender renders (top-down,
  three-quarter, inside the front hall): rooms adjoin, street north (-z in
  glTF), backyard south. Delegated to the implementer on opus (controls are
  judgement) with `brief-explore.md` in the session scratch: full-screen
  three.js page, fly camera, room list with teleport, per-room show/hide,
  camera in the URL hash, copy link, touch stick, data structured in layers
  for the rebuild to come. Also in that brief: the CTA on the project page
  and the northeast/southeast bedroom entries moved to the downstairs group
  (they are on the ground floor).

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

5. `models-section`: landed 2026-09-27 (see Landed), assets rsynced.
6. `viewer-chunk` (main session or implementer, small): import
   `@google/model-viewer/dist/model-viewer-module.min.js` instead of the
   package entry so the first click fetches 140 KB gzipped, not 290 KB.
   Check: the bundled chunk under 600 KB.
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
