<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function disable_alerts_reply(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    disable_alerts_reply(['success' => false, 'error' => 'POSTメソッドで送信してください'], 405);
}
// Require JSON and an explicit user scope; form/link requests cannot disable rules.
if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
    disable_alerts_reply(['success' => false, 'error' => 'JSON形式で送信してください'], 415);
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $host = parse_url($origin, PHP_URL_HOST);
    $port = parse_url($origin, PHP_URL_PORT);
    $authority = $host === null || $host === false ? '' : $host . ($port !== null && $port !== false ? ':' . $port : '');
    if (strtolower($authority) !== strtolower($_SERVER['HTTP_HOST'] ?? '')) {
        disable_alerts_reply(['success' => false, 'error' => '同じサイトから実行してください'], 403);
    }
}
$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data) || ($data['scope'] ?? null) !== 'user' || ($data['confirmed'] ?? null) !== true) {
    disable_alerts_reply(['success' => false, 'error' => '対象user_idのアラートを解除する確認が必要です'], 400);
}
if (!is_string($data['user_id'] ?? null) || trim($data['user_id']) === '') {
    disable_alerts_reply(['success' => false, 'error' => 'user_idを指定してください'], 400);
}
$user_id = trim($data['user_id']);

try {
    // Match the lock used by the production cron, so an already running batch
    // finishes before rules are disabled instead of sending from its snapshot.
    $lock = fopen(sys_get_temp_dir() . '/utech-alerts.lock', 'c');
    if ($lock === false) throw new RuntimeException('Cannot open alert runner lock');
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        disable_alerts_reply(['success' => false, 'error' => '通知処理中です。数秒後にもう一度解除してください。'], 409);
    }
    require_once __DIR__ . '/db_config.php';
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);
    $conn->set_charset('utf8mb4');
    $stmt = $conn->prepare('UPDATE alert_settings SET enabled = 0 WHERE user_id = ? AND enabled = 1');
    $stmt->bind_param('s', $user_id);
    $stmt->execute();
    $count = $stmt->affected_rows;
    $stmt->close();
    $conn->close();
    disable_alerts_reply(['success' => true, 'user_id' => $user_id, 'disabled_count' => $count]);
} catch (Throwable $error) {
    disable_alerts_reply(['success' => false, 'error' => '一括解除に失敗しました。時間をおいて再度お試しください。'], 500);
}
