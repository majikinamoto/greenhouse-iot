<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/db.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
ini_set('display_errors', '0');

function nextJson(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    nextJson(['success' => false, 'message' => 'GETを使用してください。'], 405);
}
$date = $_GET['date'] ?? (new DateTimeImmutable('tomorrow', UTechNext\tokyo()))->format('Y-m-d');
try {
    if (!is_string($date)) {
        throw new InvalidArgumentException('日付の形式が正しくありません。');
    }
    UTechNext\forecastDate($date);
} catch (InvalidArgumentException $error) {
    nextJson(['success' => false, 'message' => $error->getMessage()], 400);
}

try {
    $db = UTechNext\connect();
    $location = UTechNext\location($db);
    $rows = UTechNext\savedRows($db, (int)$location['id'], $date);
    nextJson([
        'success' => true,
        'forecast_date' => $date,
        'timezone' => 'Asia/Tokyo',
        'model' => UTechNext\MODEL,
        'location' => $location,
        'status' => $rows === [] ? UTechNext\readStatus($date) : 'saved',
        'fetched_at' => $rows === [] ? null : $rows[0]['fetched_at'],
        'summary' => $rows === [] ? null : UTechNext\summarize($rows),
        'rows' => $rows,
    ]);
} catch (Throwable $error) {
    error_log('U-Tech Next read error: ' . $error->getMessage());
    nextJson(['success' => false, 'message' => '予報データを読み込めません。設定または保存状態を確認してください。'], 503);
}
