#!/usr/bin/env bash
# scripts/check-php.sh: syntax-check every PHP file that ships. PHP is never
# executed locally (the contact handler and the /play/ room directory only
# run on the host), so a syntax error would otherwise first show up live.
# Exit 0 prints "check-php: N files, 0 errors"; any error exits 1.
set -u
cd "$(dirname "$0")/.."
files=(public/includes/contact_handler.php play/index.php play/api.php)
errors=0
for f in "${files[@]}"; do
  if ! php -l "$f" >/dev/null 2>&1; then
    php -l "$f" 2>&1 | head -3
    errors=$((errors + 1))
  fi
done
echo "check-php: ${#files[@]} files, $errors errors"
[ "$errors" -eq 0 ]
