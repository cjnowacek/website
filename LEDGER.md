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

## Running

(none)

## Next, in order

(none given yet)

## Held for the user

(decisions only the user can make, each with the question to ask)

## Lessons

- 2026-09-26: on Windows, a clone without `core.symlinks=true` builds a site
  with no CSS, PDFs or icons and the build still exits 0. The smoke check
  asserts `dist/static/css/main.css` and the resume PDFs so this cannot pass
  silently again.
