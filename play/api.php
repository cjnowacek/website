<?php
// play/api.php — Traitors & Titans room directory.
//
// The GM's game (Unity NetHost) POSTs a heartbeat here: "room ABCD is reachable at
// these addresses". Players hit /play/, type the code, and get redirected to the game.
// This endpoint is a pure rendezvous — no game traffic ever flows through this server.
//
// Storage: flat JSON file in ../tt-data (OUTSIDE public_html so it is never
// web-readable and no site rsync can touch it). Registration is gated by a shared
// secret in tt-data/secret.txt, provisioned once by deploy-play.sh.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const ROOM_TTL_SECONDS = 180;   // three missed 60s heartbeats = room gone
const ROOM_PATTERN = '/^[A-Z2-9]{4,8}$/';

// Data lives one level above the webroot. TT_DATA_DIR overrides for local testing
// (php -S has a repo-root docroot, not a public_html).
$dataDir = getenv('TT_DATA_DIR') ?: dirname($_SERVER['DOCUMENT_ROOT']) . '/tt-data';
$roomsFile = $dataDir . '/rooms.json';
$secretFile = $dataDir . '/secret.txt';

function fail(int $status, string $msg): void
{
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

function load_rooms(string $file): array
{
    if (!is_file($file)) return [];
    $rooms = json_decode((string)file_get_contents($file), true);
    if (!is_array($rooms)) return [];
    // Expire silently on every read — no cron on shared hosting.
    $now = time();
    foreach ($rooms as $code => $room) {
        if ($now - ($room['updated'] ?? 0) > ROOM_TTL_SECONDS) unset($rooms[$code]);
    }
    return $rooms;
}

function save_rooms(string $file, array $rooms): void
{
    // Atomic-ish write: temp file + rename, under an exclusive lock on the target.
    $tmp = $file . '.tmp';
    $fp = fopen($file, 'c');
    if ($fp === false || !flock($fp, LOCK_EX)) fail(500, 'storage unavailable');
    file_put_contents($tmp, json_encode($rooms));
    rename($tmp, $file);
    flock($fp, LOCK_UN);
    fclose($fp);
}

$action = $_GET['action'] ?? '';

if ($action === 'register') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'POST required');

    if (!is_file($secretFile)) fail(503, 'directory not provisioned');
    $secret = trim((string)file_get_contents($secretFile));

    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) fail(400, 'bad json');
    if (!hash_equals($secret, (string)($body['secret'] ?? ''))) fail(403, 'bad secret');

    $code = strtoupper((string)($body['room'] ?? ''));
    if (!preg_match(ROOM_PATTERN, $code)) fail(400, 'bad room code');

    $port = (int)($body['port'] ?? 0);
    if ($port < 1 || $port > 65535) fail(400, 'bad port');

    // Keep only plausible private/public IPv4 strings; the GM sends its LAN addresses.
    $addrs = [];
    foreach ((array)($body['addrs'] ?? []) as $a) {
        if (is_string($a) && filter_var($a, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) $addrs[] = $a;
        if (count($addrs) >= 8) break;
    }

    // Tunnel URL — reachable from anywhere, so resolve serves it first. Strictly
    // validated (it lands in a redirect on the join page): the relay PATH form
    // (play.cjnowacek.com/ROOM, 2026-09-07 — one cert for every room), the older frp
    // subdomain (ROOM.play.cjnowacek.com), or a legacy cloudflared quick tunnel.
    $publicUrl = (string)($body['publicUrl'] ?? '');
    if ($publicUrl !== ''
        && !preg_match('#^https://play\.cjnowacek\.com/[A-Z2-9]{4,8}/?$#', $publicUrl)
        && !preg_match('#^https://[a-z0-9-]+\.play\.cjnowacek\.com/?$#', $publicUrl)
        && !preg_match('#^https://[a-z0-9.-]+\.trycloudflare\.com/?$#', $publicUrl)) {
        $publicUrl = '';
    }

    if (!is_dir($dataDir)) mkdir($dataDir, 0700, true);
    $rooms = load_rooms($roomsFile);
    $rooms[$code] = [
        'addrs' => $addrs,
        'port' => $port,
        'publicUrl' => $publicUrl,
        // The address this heartbeat came from — the GM's public IP. Useful once the
        // GM port-forwards for true remote play; harmless (last candidate) otherwise.
        'publicIp' => $_SERVER['REMOTE_ADDR'] ?? '',
        'version' => substr((string)($body['version'] ?? ''), 0, 32),
        'updated' => time(),
    ];
    save_rooms($roomsFile, $rooms);
    echo json_encode(['ok' => true, 'room' => $code, 'ttl' => ROOM_TTL_SECONDS]);
    exit;
}

if ($action === 'resolve') {
    $code = strtoupper(trim((string)($_GET['room'] ?? '')));
    if (!preg_match(ROOM_PATTERN, $code)) fail(400, 'bad room code');

    $rooms = load_rooms($roomsFile);
    if (!isset($rooms[$code])) fail(404, 'room not found (game offline or code wrong)');

    $room = $rooms[$code];
    $urls = [];
    if (($room['publicUrl'] ?? '') !== '') $urls[] = $room['publicUrl'];
    foreach ($room['addrs'] as $a) $urls[] = "http://{$a}:{$room['port']}/";
    if ($room['publicIp'] !== '' && !in_array($room['publicIp'], $room['addrs'], true))
        $urls[] = "http://{$room['publicIp']}:{$room['port']}/";

    // NOTE: no version echo — the game's build number doubles as its GM console key
    // (2026-08-10), so resolve must not publish it. It stays stored for CJ's own eyes.
    echo json_encode(['ok' => true, 'room' => $code, 'urls' => $urls]);
    exit;
}

// ── Game records (2026-08-28) ─────────────────────────────────────────────
// The GM's game mirrors its journal here: roster, every event (public and GM-only),
// state snapshots at phase changes, the result. One JSON file per game under
// tt-data/games/. Same secret as the heartbeat; events arrive in batches keyed by seq,
// so a retried batch never duplicates. Reads (games / game) need the secret too —
// the journal holds every role and every GM-only line.

function games_dir(string $dataDir): string
{
    $d = $dataDir . '/games';
    if (!is_dir($d)) mkdir($d, 0700, true);
    return $d;
}

function require_secret(string $secretFile, array $body): void
{
    if (!is_file($secretFile)) fail(503, 'directory not provisioned');
    $secret = trim((string)file_get_contents($secretFile));
    if (!hash_equals($secret, (string)($body['secret'] ?? ''))) fail(403, 'bad secret');
}

function read_body(): array
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'POST required');
    $body = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($body)) fail(400, 'bad json');
    return $body;
}

if ($action === 'record') {
    $body = read_body();
    require_secret($secretFile, $body);
    $id = (string)($body['game'] ?? '');
    if (!preg_match('/^[0-9]{8}-[0-9]{6}-[A-Z0-9]{2,8}$/', $id)) fail(400, 'bad game id');

    $file = games_dir($dataDir) . '/' . $id . '.json';
    $fp = fopen($file, 'c+');
    if ($fp === false || !flock($fp, LOCK_EX)) fail(500, 'storage unavailable');
    $raw = stream_get_contents($fp);
    $rec = $raw !== '' ? json_decode($raw, true) : null;
    if (!is_array($rec)) {
        $rec = ['id' => $id, 'events' => [], 'snapshots' => [], 'createdUtc' => gmdate('c')];
    }
    // 'mode' is "game" or "test" — a sandbox session is stored with the rest but labelled.
    foreach (['room', 'version', 'startedUtc', 'endedUtc', 'result', 'winner', 'king', 'mode'] as $k)
        if (isset($body[$k]) && $body[$k] !== '') $rec[$k] = substr((string)$body[$k], 0, 400);
    if (isset($body['playerCount'])) $rec['playerCount'] = (int)$body['playerCount'];
    if (!empty($body['roster']) && is_array($body['roster'])) $rec['roster'] = array_slice($body['roster'], 0, 40);

    $maxSeq = 0;
    foreach ($rec['events'] as $e) $maxSeq = max($maxSeq, (int)($e['seq'] ?? 0));
    $added = 0;
    foreach ((array)($body['events'] ?? []) as $e) {
        if (!is_array($e)) continue;
        $seq = (int)($e['seq'] ?? 0);
        if ($seq <= $maxSeq) continue;                       // retried batch — already have it
        $rec['events'][] = [
            'seq' => $seq, 'at' => (int)($e['at'] ?? 0), 'phase' => (int)($e['phase'] ?? -1),
            'day' => (int)($e['day'] ?? 0), 'cat' => substr((string)($e['cat'] ?? ''), 0, 16),
            'msg' => substr((string)($e['msg'] ?? ''), 0, 2000), 'gmOnly' => !empty($e['gmOnly']),
        ];
        $maxSeq = $seq; $added++;
    }
    $maxSnap = 0;
    foreach ($rec['snapshots'] as $s) $maxSnap = max($maxSnap, (int)($s['seq'] ?? 0));
    foreach ((array)($body['snapshots'] ?? []) as $s) {
        if (!is_array($s)) continue;
        $seq = (int)($s['seq'] ?? 0);
        if ($seq < $maxSnap || ($seq === $maxSnap && $maxSnap > 0)) continue;
        $rec['snapshots'][] = ['seq' => $seq, 'label' => substr((string)($s['label'] ?? ''), 0, 40), 'json' => (string)($s['json'] ?? '')];
        $maxSnap = $seq;
    }
    $rec['ended'] = !empty($body['ended']) || !empty($rec['endedUtc']);
    $rec['updatedUtc'] = gmdate('c');

    ftruncate($fp, 0); rewind($fp);
    fwrite($fp, json_encode($rec));
    fflush($fp); flock($fp, LOCK_UN); fclose($fp);
    echo json_encode(['ok' => true, 'game' => $id, 'seq' => $maxSeq, 'added' => $added]);
    exit;
}

if ($action === 'games') {
    $body = read_body();
    require_secret($secretFile, $body);
    $out = [];
    foreach (glob(games_dir($dataDir) . '/*.json') as $f) {
        $r = json_decode((string)file_get_contents($f), true);
        if (!is_array($r)) continue;
        $out[] = [
            'id' => $r['id'] ?? basename($f, '.json'), 'room' => $r['room'] ?? '', 'startedUtc' => $r['startedUtc'] ?? '',
            'endedUtc' => $r['endedUtc'] ?? '', 'playerCount' => $r['playerCount'] ?? 0, 'events' => count($r['events'] ?? []),
            'snapshots' => count($r['snapshots'] ?? []), 'result' => $r['result'] ?? '', 'winner' => $r['winner'] ?? '',
            'mode' => $r['mode'] ?? 'game',
            'ended' => !empty($r['ended']),
        ];
    }
    usort($out, fn($a, $b) => strcmp($b['id'], $a['id']));
    echo json_encode(['ok' => true, 'games' => $out]);
    exit;
}

if ($action === 'game') {
    $body = read_body();
    require_secret($secretFile, $body);
    $id = (string)($body['game'] ?? '');
    if (!preg_match('/^[0-9]{8}-[0-9]{6}-[A-Z0-9]{2,8}$/', $id)) fail(400, 'bad game id');
    $file = games_dir($dataDir) . '/' . $id . '.json';
    if (!is_file($file)) fail(404, 'no such game');
    $rec = json_decode((string)file_get_contents($file), true);
    if (empty($body['snapshots'])) unset($rec['snapshots']);   // snapshots only on request — they are big
    echo json_encode(['ok' => true, 'game' => $rec]);
    exit;
}

fail(400, 'unknown action');
