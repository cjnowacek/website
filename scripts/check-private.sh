#!/usr/bin/env bash
# scripts/check-private.sh: runs the private hub's gate for real and attacks it.
# Run after `npm run build`, from the repo root. It starts PHP's built-in
# server on dist/ with scripts/private-router.php in Apache's place, gives the
# gate a throwaway private-data/ (the built dist-private/pages, one fixture
# image, a test password) and asserts:
#   - without a session: the hub and a project page answer with the login form
#     and none of the page; an image is refused; a wrong password gets nothing;
#   - with the right password: the hub, the project page and the image are
#     served, uncacheable by a shared cache;
#   - path tricks (dot segments, encoded slashes, the password file, the login
#     template's tokens) get nothing, even with a session;
#   - logging out ends the session; changing the password ends every session;
#     with no password file nobody gets in.
# Exit 0 prints "check-private: N checks, 0 failed".
set -u
cd "$(dirname "$0")/.."

if [ ! -d dist-private/pages ] || [ ! -f public/includes/private_gate.php ]; then
  echo "FAIL  dist-private/pages or public/includes/private_gate.php is missing (run npm run build)"
  echo "check-private: 1 checks, 1 failed"
  exit 1
fi

tmp="$(mktemp -d)"
data="$tmp/private-data"
mkdir -p "$data/img/fixture"
cp -r dist-private/pages "$data/pages"
# A 1x1 PNG.
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > "$data/img/fixture/one.png"
PASS='correct horse test'
php -r 'echo password_hash($argv[1], PASSWORD_DEFAULT);' "$PASS" > "$data/password.hash"

port=$((20000 + RANDOM % 20000))
base="http://127.0.0.1:$port"
PRIVATE_DATA_DIR="$data" php -S "127.0.0.1:$port" -t dist scripts/private-router.php >"$tmp/server.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$tmp"' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null "$base/" && break; sleep 0.1; done

checks=0; failed=0
ok() { checks=$((checks + 1)); if ! eval "$1"; then failed=$((failed + 1)); echo "FAIL  $2"; fi; }
# get <jar> <path> : body to $tmp/body, headers to $tmp/head, status in $code
get() { code="$(curl -s --path-as-is -b "$1" -c "$1" -D "$tmp/head" -o "$tmp/body" -w '%{http_code}' "$base$2")"; }
post() { code="$(curl -s -b "$1" -c "$1" -D "$tmp/head" -o "$tmp/body" -w '%{http_code}' --data-urlencode "password=$2" --data-urlencode "next=${3:-/private/}" "$base/private/login")"; }
has() { grep -q -- "$1" "$tmp/body"; }
hdr() { grep -qi -- "$1" "$tmp/head"; }

# The page to attack, and a phrase only its body has (its <h2>): the first
# private project page, or the hub itself when the one private project is
# merged into it (then there is no project folder).
proj="$(cd dist-private/pages && ls -d */ 2>/dev/null | grep -v '^login/$' | head -1)"
proj="${proj%/}"
target="/private/${proj:+$proj/}"
marker="$(grep -o '<h2[^>]*>[^<]*</h2>' "dist-private/pages/${proj:+$proj/}index.html" | head -1 | sed 's/<[^>]*>//g')"
ok '[ -n "$marker" ]' "no private page with an <h2> found in dist-private/pages"
hash="$(cat "$data/password.hash")"

anon="$tmp/anon.jar"; user="$tmp/user.jar"

# 1. No session.
get "$anon" /private/
ok '[ "$code" = 200 ] && has "type=\"password\""' "GET /private/ without a session is not the login form (status $code)"
ok '! has "$marker" && ! has "/private/logout"' "the login form at /private/ shows the hub"
ok '! has "%%"' "the login form still shows a %% token"
ok 'hdr "cache-control:.*no-store"' "the login form is cacheable"
get "$anon" "$target"
ok 'has "type=\"password\"" && ! has "$marker"' "GET $target without a session leaks the page"
ok 'has "value=\"$target\""' "the login form does not remember $target as the page to return to"
get "$anon" /private/img/fixture/one.png
ok '[ "$code" = 403 ]' "an image without a session answers $code, expected 403"
get "$anon" /private
ok '[ "$code" = 302 ] || [ "$code" = 303 ]' "/private without the slash answers $code, expected a redirect"

# 2. Wrong password, empty password.
post "$anon" 'not the password'
ok '[ "$code" = 200 ] && has "type=\"password\"" && has "Wrong password"' "a wrong password does not come back to the form with an error (status $code)"
get "$anon" "$target"
ok '! has "$marker"' "a wrong password opened the page"
post "$anon" ''
get "$anon" "$target"
ok '! has "$marker"' "an empty password opened the page"

# 3. Right password.
post "$user" "$PASS" "$target"
ok '[ "$code" = 303 ] && hdr "location: $target"' "the right password does not redirect to the page asked for (status $code)"
ok 'hdr "set-cookie:.*httponly" && hdr "set-cookie:.*samesite=lax"' "the session cookie is not HttpOnly + SameSite=Lax"
get "$user" /private/
ok '[ "$code" = 200 ] && has "/private/logout"' "the hub is not served to a session (status $code)"
get "$user" "$target"
ok '[ "$code" = 200 ] && has "$marker"' "the project page is not served to a session (status $code)"
ok 'hdr "cache-control:.*private" && hdr "cache-control:.*no-store" && hdr "x-robots-tag:.*noindex"' "a private page lacks private/no-store or noindex headers"
get "$user" /private/img/fixture/one.png
ok '[ "$code" = 200 ] && hdr "content-type: image/png" && hdr "cache-control:.*private"' "the image is not served as a private image/png to a session (status $code)"
get "$user" "${target%/}"
ok '[ "$code" = 302 ] || [ "$code" = 303 ]' "${target%/} without the slash answers $code, expected a redirect"
post "$tmp/evil.jar" "$PASS" 'https://evil.example/'
ok 'hdr "location: /private/"' "login follows an off-site next= (open redirect)"
post "$tmp/evil.jar" "$PASS" '//evil.example/'
ok 'hdr "location: /private/"' "login follows a //host next= (open redirect)"

# 4. Path tricks, with a session. None may return the hash or a 200 file.
for p in /private/img/../password.hash /private/../private-data/password.hash /private/img/%2e%2e/password.hash \
         /private/img/..%2fpassword.hash /private/%2e%2e%2fpassword.hash /private/password.hash /private/img/%252e%252e/password.hash \
         /private/img/fixture/../../password.hash /private/img//fixture/one.png/ /private/.htaccess /private/img/fixture/ \
         '/private/img/fixture/one.png%00.html' /private/nope/; do
  get "$user" "$p"
  ok '[ "$code" != 200 ] && ! grep -qF -- "$hash" "$tmp/body"' "$p answers $code with a session"
done
get "$user" /private/login/index.html
ok '! has "%%NEXT%%"' "the raw login template is served"
get "$user" /includes/private_gate.php
ok '[ "$code" != 200 ] || ! has "$marker"' "the gate serves private pages when called by its own URL"

# 5. Logout.
get "$user" /private/logout
get "$user" "$target"
ok '! has "$marker" && has "type=\"password\""' "the page is still served after logout"

# 6. A changed password ends existing sessions; no password file locks everyone out.
post "$user" "$PASS"
get "$user" "$target"
ok 'has "$marker"' "could not log in again after logout"
php -r 'echo password_hash($argv[1], PASSWORD_DEFAULT);' 'a new password' > "$data/password.hash"
get "$user" "$target"
ok '! has "$marker"' "a session survived a password change"
rm "$data/password.hash"
post "$tmp/nohash.jar" "$PASS"
get "$tmp/nohash.jar" "$target"
ok '! has "$marker"' "with no password file the page is served"
post "$tmp/nohash.jar" ''
get "$tmp/nohash.jar" "$target"
ok '! has "$marker"' "with no password file an empty password gets in"

ok '! grep -qiE "(warning|notice|fatal|deprecated)" "$tmp/server.log"' "PHP logged warnings: $(grep -iE '(warning|notice|fatal|deprecated)' "$tmp/server.log" | head -3)"

echo "check-private: $checks checks, $failed failed"
[ "$failed" -eq 0 ]
