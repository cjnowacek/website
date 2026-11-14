#!/usr/bin/env bash
# deploy.sh — build the Astro site and deploy dist/ to SiteGround.
#
# Protected on the server (never deleted by this script):
#   /play/                            — deployed separately by deploy-play.sh
#   /includes/contact_submissions.json — live contact-form log (server-side state)
#   /.well-known/                     — Let's Encrypt / host-managed
#
# Usage:
#   ./deploy.sh                      # uses ssh alias 'siteground'
#   SG_HOST=user@host SG_PORT=18765 ./deploy.sh

set -euo pipefail

HOST="${SG_HOST:-siteground}"
PORT="${SG_PORT:-18765}"
REMOTE="www/cjnowacek.com/public_html"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building"
(cd "$SCRIPT_DIR" && npm run build)

echo "==> Deploying dist/ to $HOST:$REMOTE/"
# Same protections as .github/workflows/deploy.yml; /static/img/** additionally
# stays server-side (images are hand-synced, not in git) except the tracked
# hover videos + ml3ds card art.
rsync -avzP --delete \
  --exclude='/play/' \
  --exclude='/includes/contact_submissions.json' \
  --exclude='/.well-known/' \
  --include='/static/img/' \
  --include='/static/img/project-cards/' \
  --include='/static/img/project-cards/video/***' \
  --include='/static/img/project-cards/ml3ds-webp-1200x900.webp' \
  --exclude='/static/img/**' \
  -e "ssh -p $PORT" \
  "$SCRIPT_DIR/dist/" "$HOST:$REMOTE/"

# The private hub's pages go next to public_html, not into it (the build moved
# them to dist-private/pages/). Screenshots and password: ./deploy-private.sh.
echo "==> Deploying dist-private/pages/ to $HOST:${REMOTE%/public_html}/private-data/pages/"
rsync -avzP --delete --mkpath --chmod=D700,F600 \
  -e "ssh -p $PORT" \
  "$SCRIPT_DIR/dist-private/pages/" "$HOST:${REMOTE%/public_html}/private-data/pages/"

echo "==> Done"
