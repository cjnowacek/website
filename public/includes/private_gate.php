<?php
// public/includes/private_gate.php: the lock on the private hub (/private/).
//
// public/.htaccess sends every /private request here. Nothing private lives in
// the webroot: the pages and screenshots are in private-data/, next to
// public_html, where no URL reaches them (the host's nginx serves static files
// from the webroot without asking Apache, so a "deny" in .htaccess would not
// be a lock). This script is the only way to them:
//
//   private-data/password.hash   password_hash() of the one shared password
//                                (written by ./deploy-private.sh --set-password)
//   private-data/pages/          the built pages (dist-private/pages, synced by the deploy)
//   private-data/img/            the screenshots (private-assets/img, synced by ./deploy-private.sh)
//
// Without a valid session every page request gets the login form and every
// other request a 403. A session is tied to the password hash, so changing the
// password logs everyone out, and with no hash file nobody gets in.
// scripts/check-private.sh runs this file under php -S and attacks it.
declare(strict_types=1);

if (!defined('PRIVATE_DATA_DIR')) {
    define('PRIVATE_DATA_DIR', dirname(__DIR__, 2) . '/private-data');
}
const PRIVATE_PREFIX = '/private';

// PHP 8 string helpers, for a host still on 7.4.
if (!function_exists('str_contains')) {
    function str_contains(string $h, string $n): bool { return $n === '' || strpos($h, $n) !== false; }
    function str_starts_with(string $h, string $n): bool { return strncmp($h, $n, strlen($n)) === 0; }
    function str_ends_with(string $h, string $n): bool { return $n === '' || substr($h, -strlen($n)) === $n; }
}
const PRIVATE_SESSION_SECONDS = 12 * 3600;

// Nothing from here may be indexed, or kept by a shared cache (SiteGround's
// dynamic cache would otherwise hand one visitor's page to the next).
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Cache-Control: private, no-store, max-age=0');
header('X-Cache-Enabled: False');
header('Referrer-Policy: same-origin');
header('X-Content-Type-Options: nosniff');

function private_fail(int $code)
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo [403 => 'Forbidden', 404 => 'Not found'][$code] ?? 'Error';
    exit;
}

function private_redirect(string $to)
{
    header('Location: ' . $to, true, 303);
    exit;
}

// Only a path inside the hub is a place to return to after login.
function private_next($next): string
{
    $ok = is_string($next)
        && preg_match('#^/private/[A-Za-z0-9_./-]*$#', $next)
        && !str_contains($next, '//')
        && !preg_match('#/\.#', $next);
    return $ok ? $next : PRIVATE_PREFIX . '/';
}

// The login form is a page the site build made (so it looks like the site),
// with two tokens for this script to fill in.
function private_login_page(string $error, string $next)
{
    $template = PRIVATE_DATA_DIR . '/pages/login/index.html';
    $html = is_readable($template) ? (string) file_get_contents($template) : '';
    if ($html === '') {
        $html = '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Private</title>'
            . '<form method="post" action="/private/login"><p>%%LOGIN_ERROR%%</p>'
            . '<input type="hidden" name="next" value="%%NEXT%%">'
            . '<label>Password <input type="password" name="password" autofocus required></label> <button>Enter</button></form>';
    }
    header('Content-Type: text/html; charset=utf-8');
    echo strtr($html, [
        '%%LOGIN_ERROR%%' => htmlspecialchars($error, ENT_QUOTES),
        '%%NEXT%%' => htmlspecialchars($next, ENT_QUOTES),
    ]);
    exit;
}

// 1. The request path, as the visitor typed it.
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if (!is_string($uriPath) || ($uriPath !== PRIVATE_PREFIX && !str_starts_with($uriPath, PRIVATE_PREFIX . '/'))) {
    private_fail(404); // called by its own URL, not through the rewrite
}
$rel = rawurldecode(substr($uriPath, strlen(PRIVATE_PREFIX)));
if ($rel === '') {
    private_redirect(PRIVATE_PREFIX . '/');
}
// Plain path characters only, no empty segment, no segment starting with a
// dot: that rules out "..", dotfiles, NUL bytes and anything still encoded.
if (!preg_match('#^/[A-Za-z0-9_./-]*$#', $rel) || str_contains($rel, '//') || preg_match('#/\.#', $rel)) {
    private_fail(404);
}

// 2. The session.
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
ini_set('session.use_strict_mode', '1');
ini_set('session.gc_maxlifetime', (string) PRIVATE_SESSION_SECONDS);
session_cache_limiter(''); // keep the Cache-Control sent above; PHP would replace it with its own
session_name('cj_private');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => PRIVATE_PREFIX,
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

$hashFile = PRIVATE_DATA_DIR . '/password.hash';
$hash = is_readable($hashFile) ? trim((string) file_get_contents($hashFile)) : '';
$key = $hash !== '' ? hash('sha256', $hash) : null;
$authed = $key !== null
    && is_string($_SESSION['key'] ?? null)
    && is_int($_SESSION['since'] ?? null)
    && hash_equals($key, $_SESSION['key'])
    && time() - $_SESSION['since'] < PRIVATE_SESSION_SECONDS;

// 3. Login and logout.
if ($rel === '/logout') {
    $_SESSION = [];
    session_destroy();
    private_redirect(PRIVATE_PREFIX . '/');
}
if ($rel === '/login' || str_starts_with($rel, '/login/')) {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $next = private_next($_POST['next'] ?? null);
        $password = $_POST['password'] ?? null;
        if ($key !== null && is_string($password) && $password !== '' && password_verify($password, $hash)) {
            session_regenerate_id(true);
            $_SESSION = ['key' => $key, 'since' => time()];
            private_redirect($next);
        }
        sleep(1); // slows guessing; the password itself is long and random
        private_login_page($key === null ? 'This area is not set up yet.' : 'Wrong password.', $next);
    }
    if ($authed) {
        private_redirect(PRIVATE_PREFIX . '/');
    }
    private_login_page('', PRIVATE_PREFIX . '/');
}

// 4. Everything else needs the session.
$isImage = str_starts_with($rel, '/img/');
if (!$authed) {
    if ($isImage || preg_match('#\.[A-Za-z0-9]+$#', $rel)) {
        private_fail(403);
    }
    private_login_page('', private_next($uriPath));
}
session_write_close(); // a page's images load in parallel; do not hold the session lock

// 5. Serve the file: /img/... from private-data/img, the rest from private-data/pages.
if ($isImage) {
    $base = PRIVATE_DATA_DIR . '/img';
    $file = $base . substr($rel, 4);
} else {
    $base = PRIVATE_DATA_DIR . '/pages';
    $file = $base . $rel;
    if (is_dir($file)) {
        if (!str_ends_with($rel, '/')) {
            private_redirect(PRIVATE_PREFIX . $rel . '/');
        }
        $file .= 'index.html';
    }
}
$types = [
    'html' => 'text/html; charset=utf-8',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'mp4' => 'video/mp4',
    'pdf' => 'application/pdf',
];
$real = realpath($file);
$realBase = realpath($base);
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
if (
    $real === false || $realBase === false
    || !str_starts_with($real, $realBase . DIRECTORY_SEPARATOR)
    || !is_file($real)
    || !isset($types[$ext])
) {
    private_fail(404);
}
header('Content-Type: ' . $types[$ext]);
header('Content-Length: ' . filesize($real));
if ($ext !== 'html') {
    header('Cache-Control: private, max-age=3600'); // the visitor's own browser may keep images for an hour
}
readfile($real);
