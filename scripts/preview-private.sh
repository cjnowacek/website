#!/usr/bin/env bash
# scripts/preview-private.sh: the whole built site on http://127.0.0.1:8787/,
# with the private hub behind its real gate, the real screenshots from
# private-assets/img/ and the password "preview". Run `npm run build` first.
# (`npm run preview` cannot show /private/: it is not in dist/ and needs PHP.)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d dist-private/pages ] || { echo "run npm run build first" >&2; exit 1; }
data="$(mktemp -d)"
trap 'rm -rf "$data"' EXIT
ln -s "$PWD/dist-private/pages" "$data/pages"
[ -d private-assets/img ] && ln -s "$PWD/private-assets/img" "$data/img"
php -r 'echo password_hash("preview", PASSWORD_DEFAULT);' > "$data/password.hash"
echo "http://127.0.0.1:${1:-8787}/private/   password: preview"
PRIVATE_DATA_DIR="$data" php -S "127.0.0.1:${1:-8787}" -t dist scripts/private-router.php
