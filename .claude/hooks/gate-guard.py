#!/usr/bin/env python3
"""PreToolUse hook for the implementer subagent: the gate is not editable.

Reads the hook JSON on stdin. Exits 2 (blocks the call) when:
  - Edit / Write / NotebookEdit targets a gate file, or
  - Bash or PowerShell runs a git command that leaves the branch, pushes,
    stashes, merges, or touches worktrees, or kills processes by name.

The gate is `.claude/gate` at the root of the checkout the file lives in
(main checkout or worktree: the nearest ancestor with a `.git`); a worktree
without one uses the main checkout's, so a branch that predates the gate
file is still covered. One pattern
per line, `#` comments; a pattern matches a path or anything under it, and
`*` also crosses `/`. With no `.claude/gate`, a default set covers the usual
test, check-script and build-definition locations. `.claude/`, `CLAUDE.md`
and `LEDGER.md` (or its older name `STATE.md`) are always gate, except the
subagent's own notes under `.claude/agent-memory/` and
`.claude/agent-memory-local/` (the `memory:` field in its definition).

Only python3 is needed. Exit 0 = allow.
"""
import fnmatch
import json
import os
import re
import sys

ALWAYS = [".claude", "CLAUDE.md", "LEDGER.md", "STATE.md"]
MEMORY = [".claude/agent-memory", ".claude/agent-memory-local"]

DEFAULT_GATE = [
    "test", "tests", "spec", "specs", "__tests__", "e2e", "cypress",
    "*/test", "*/tests", "*/spec", "*/__tests__",
    "*_test.*", "*.test.*", "*.spec.*", "test_*.py", "conftest.py",
    "scripts/*test*", "scripts/*check*", "scripts/*smoke*", "scripts/*gate*",
    "Makefile", "justfile", "CMakeLists.txt", "package.json", "pyproject.toml",
    "setup.cfg", "tox.ini", "pytest.ini", "Cargo.toml", "go.mod",
    "*.csproj", "*.sln", ".github/workflows",
    "jest.config.*", "vitest.config.*", "playwright.config.*",
]

GIT_FORBIDDEN = re.compile(
    r"\bgit\b(?:\s+(?:-C\s+\S+|--git-dir[= ]\S+|--work-tree[= ]\S+|-c\s+\S+))*"
    r"\s+(?:push|stash|switch|checkout|merge|rebase|worktree|branch\s+-[dDm]"
    r"|reset\s+--hard|clean\s+-\S*[fx])\b"
)
KILL_FORBIDDEN = re.compile(r"\b(?:pkill|killall)\b")


def checkout_root(path):
    """Nearest ancestor of `path` that holds a `.git` (dir in a main checkout,
    file in a worktree). None if there is none."""
    d = path if os.path.isdir(path) else os.path.dirname(path)
    while True:
        if os.path.exists(os.path.join(d, ".git")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def main_checkout(root):
    """For a worktree (whose `.git` is a file naming the main repo's
    .git/worktrees/<name>), the main checkout's root; else None."""
    dotgit = os.path.join(root, ".git")
    if not os.path.isfile(dotgit):
        return None
    with open(dotgit) as f:
        line = f.readline().strip()
    if not line.startswith("gitdir:"):
        return None
    gitdir = os.path.normpath(line[len("gitdir:"):].strip())
    parts = gitdir.split(os.sep)
    if ".git" in parts:
        return os.sep.join(parts[:parts.index(".git")]) or os.sep
    return None


def load_gate(root):
    """The checkout's own .claude/gate; for a worktree without one (a branch
    that predates the gate file), the main checkout's; else the defaults."""
    for where, label in ((root, ".claude/gate"),
                         (main_checkout(root), "the main checkout's .claude/gate")):
        if where is None:
            continue
        p = os.path.join(where, ".claude", "gate")
        if not os.path.isfile(p):
            continue
        pats = []
        with open(p) as f:
            for line in f:
                line = line.split("#", 1)[0].strip()
                if line:
                    pats.append(line.rstrip("/"))
        return pats, label
    return DEFAULT_GATE, "the default set (no .claude/gate in this checkout)"


def matches(rel, pats):
    for pat in pats:
        pat = pat.rstrip("/")
        if rel == pat or fnmatch.fnmatchcase(rel, pat) \
                or fnmatch.fnmatchcase(rel, pat + "/*"):
            return pat
    return None


def deny(msg):
    sys.stderr.write("gate-guard: " + msg + "\n")
    sys.exit(2)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return  # not our input; never block on a parse failure
    tool = data.get("tool_name", "")
    inp = data.get("tool_input") or {}
    cwd = data.get("cwd") or os.getcwd()

    if tool in ("Edit", "Write", "NotebookEdit"):
        path = inp.get("file_path") or inp.get("notebook_path")
        if not path:
            return
        path = os.path.normpath(os.path.join(cwd, path))
        root = checkout_root(path)
        if root is None:
            return
        # Windows relpath uses backslashes; the patterns are written with `/`.
        rel = os.path.relpath(path, root).replace(os.sep, "/")
        if matches(rel, MEMORY):
            return  # the subagent's own notes, never the gate
        hit = matches(rel, ALWAYS)
        pats, source = load_gate(root)
        hit = hit or matches(rel, pats)
        if hit:
            deny(f"{rel} is a gate file (matched `{hit}` in {source}). "
                 "The subagent never edits the gate. If the check is wrong, "
                 "do not work around it: say which check and why in your report.")
        return

    if tool in ("Bash", "PowerShell"):
        cmd = inp.get("command") or ""
        m = GIT_FORBIDDEN.search(cmd)
        if m:
            deny(f"`{m.group(0).strip()}` is not allowed in a subagent run: "
                 "stay on your branch in your worktree, never push, stash, "
                 "switch, merge or manage worktrees.")
        m = KILL_FORBIDDEN.search(cmd)
        if m:
            deny(f"`{m.group(0)}` is not allowed: other sessions run servers "
                 "on this machine. Stop only what you started, by PID.")


if __name__ == "__main__":
    main()
