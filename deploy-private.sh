#!/usr/bin/env bash
# deploy-private.sh: the two parts of the private hub (/private/) that a push
# does not deploy, because neither is in git:
#
#   ./deploy-private.sh                  sync private-assets/img/ (the screenshots) to the host
#   ./deploy-private.sh --set-password   set or change the hub's password (asks for it)
#   ./deploy-private.sh --set-password --generate   same, but generates and prints one (no prompt)
#
# Both go to private-data/ NEXT TO public_html, not inside it: no URL reaches
# that folder, only public/includes/private_gate.php reads it. The pages
# themselves (private-data/pages/) are built and synced by the normal deploy.
#
# --set-password asks for a password (empty = generate one), hashes it on the
# host with PHP's password_hash() and writes private-data/password.hash. The
# password is never stored anywhere; write it down when it is shown. Changing
# it logs every visitor out.
#
# Usage:  ./deploy-private.sh [--set-password]      (ssh alias 'siteground')
#         SG_HOST=user@host SG_PORT=18765 ./deploy-private.sh
set -euo pipefail

HOST="${SG_HOST:-siteground}"
PORT="${SG_PORT:-18765}"
REMOTE="www/cjnowacek.com/private-data"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "--set-password" ]; then
  PW=""
  if [ "${2:-}" = "--generate" ]; then
    : # no prompt: generate one below
  elif [ -t 0 ]; then
    read -r -s -p "New password for /private/ (empty = generate one): " PW
    echo
  else
    echo "No terminal to type a password into. Run this in a real terminal, or add --generate to have one made and printed." >&2
    exit 1
  fi
  if [ -z "$PW" ]; then
    PW="$(head -c 15 /dev/urandom | base64 | tr '+/' '-_')"
    echo "Generated password (shown once, write it down):"
    echo "    $PW"
  fi
  # The password travels on stdin, never in a command line or a file.
  printf '%s' "$PW" | ssh -p "$PORT" "$HOST" "umask 077; mkdir -p $REMOTE && php -r 'echo password_hash(stream_get_contents(STDIN), PASSWORD_DEFAULT);' > $REMOTE/password.hash.new && test -s $REMOTE/password.hash.new && mv $REMOTE/password.hash.new $REMOTE/password.hash"
  echo "==> Password set. Everyone who was logged in is logged out."
  exit 0
fi

SRC="$SCRIPT_DIR/private-assets/img/"
if [ ! -d "$SRC" ]; then
  echo "No private-assets/img/ here (it is not in git; copy it from where you keep it)." >&2
  exit 1
fi
echo "==> Syncing private-assets/img/ to $HOST:$REMOTE/img/"
ssh -p "$PORT" "$HOST" "umask 077; mkdir -p $REMOTE/img"
rsync -avzP --delete -e "ssh -p $PORT" "$SRC" "$HOST:$REMOTE/img/"
ssh -p "$PORT" "$HOST" "test -s $REMOTE/password.hash" \
  || echo "NOTE: no password is set yet, so nobody can get in. Run: ./deploy-private.sh --set-password"
echo "==> Done"
