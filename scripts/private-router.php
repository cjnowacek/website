<?php
// scripts/private-router.php: stands in for Apache when the private hub is run
// locally under PHP's built-in server (scripts/check-private.sh and
// scripts/preview-private.sh). Never deployed. It does what public/.htaccess
// does on the host: every /private request goes to the gate, everything else
// is a plain file from dist/.
//
//   PRIVATE_DATA_DIR=<dir> php -S 127.0.0.1:8787 -t dist scripts/private-router.php
//
// <dir> plays the host's private-data/: pages/, img/, password.hash.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
if ($path === '/private' || strncmp($path, '/private/', 9) === 0) {
    define('PRIVATE_DATA_DIR', getenv('PRIVATE_DATA_DIR'));
    require __DIR__ . '/../public/includes/private_gate.php';
    return true;
}
return false; // the built-in server serves the file from dist/ (index.html for a directory)
