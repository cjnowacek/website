#!/usr/bin/env bash
# scripts/check-plumbing.sh: throwaway check for the workflow's plumbing proof.
# Passes once src/lib/projects.js carries the comment that names check-dist.mjs.
cd "$(dirname "$0")/.."
if grep -Fq 'scripts/check-dist.mjs' src/lib/projects.js; then
  echo "check-plumbing: 1 check, 0 failed"
else
  echo "FAIL  src/lib/projects.js does not mention scripts/check-dist.mjs"; echo "check-plumbing: 1 check, 1 failed"; exit 1
fi
