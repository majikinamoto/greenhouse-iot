<?php
declare(strict_types=1);

require_once __DIR__ . '/daily.php';
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
ini_set('display_errors', '0');

function ddReply(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    ddReply(['message' => 'GETを使用してください。'], 405);
    return;
}

$zone = new DateTimeZone('Asia/Tokyo');
$now = new DateTimeImmutable('now', $zone);
$today = $now->setTime(0, 0);
$comparison = 0;
try {
    foreach (['user_id', 'point_id'] as $key) {
        $input = $_GET[$key] ?? '';
        $value = is_string($input) ? trim($input) : '';
        if ($value === '' || strlen($value) > 256) {
            throw new InvalidArgumentException($key . 'を確認してください。');
        }
        $ids[$key] = $value;
    }

    if (isset($_GET['comparison_days'])) {
        $comparison = filter_var($_GET['comparison_days'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10]]);
        if ($comparison === false) {
            throw new InvalidArgumentException('比較日数は1〜10日で指定してください。');
        }
    }
    $latest = $comparison ? $today->modify('+365 days') : $today;
    foreach (['start', 'end'] as $key) {
        $value = $_GET[$key] ?? '';
        $date = is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)
            ? DateTimeImmutable::createFromFormat('!Y-m-d', $value, $zone) : false;
        if (!$date || $date->format('Y-m-d') !== $value || $date > $latest || $date->format('Y') < '1000') {
            throw new InvalidArgumentException('開始日と終了日を確認してください。');
        }
        $dates[$key] = $date;
    }
    $start = $dates['start'];
    $end = $dates['end'];
    if ($start > $end || $start->diff($end)->days >= 366) {
        throw new InvalidArgumentException('開始日と終了日を確認してください（最大366日）。');
    }
    $fillLimit = 0;
    if (isset($_GET['fill_limit'])) {
        $fillLimit = filter_var($_GET['fill_limit'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 366]]);
        if ($fillLimit === false) {
            throw new InvalidArgumentException('補完の上限は1〜366日で指定してください。');
        }
    }
} catch (InvalidArgumentException $error) {
    ddReply(['message' => $error->getMessage()], 400);
    return;
}

try {
    require_once dirname(__DIR__) . '/u-tech-next/lib/db.php';
    $queryStart = $start;
    $queryEnd = min($end, $today);
    if ($fillLimit > 0 && $start < $today) {
        $padding = $fillLimit + 1;
        $queryStart = max($start->modify("-$padding days"), new DateTimeImmutable('1000-01-01', $zone));
        $queryEnd = min($end->modify("+$padding days"), $today);
    }

    $rows = [];
    if ($start < $today) {
        $db = UTechNext\connect();
        $db->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
        $stop = min($queryEnd->modify('+1 day'), $today);
        $stmt = $db->prepare('SELECT recorded_at, temperature FROM measurements
            WHERE user_id = ? AND point_id = ? AND recorded_at >= ? AND recorded_at < ?
              AND temperature IS NOT NULL ORDER BY recorded_at');
        $stmt->execute([$ids['user_id'], $ids['point_id'], $queryStart->format('Y-m-d H:i:s'), $stop->format('Y-m-d H:i:s')]);
        $rows = $stmt;
    }
    $days = ddDailyAverages($queryStart, $queryEnd, $today, $rows);
    if ($fillLimit > 0 && $start < $today) {
        $days = ddFillMissingDays($days, $fillLimit);
        $days = array_slice($days, $queryStart->diff($start)->days, $start->diff(min($end, $today))->days + 1);
    }
    $payload = ['days' => $days];
    if ($comparison && $end >= $today) {
        if ($rows instanceof PDOStatement) {
            $rows->closeCursor();
        }
        $db = $db ?? UTechNext\connect();
        $first = $today->modify("-$comparison days");
        $stmt = $db->prepare("SELECT DATE_FORMAT(recorded_at, '%Y-%m-%dT%H:00') AS hour_key, AVG(temperature) AS average
            FROM measurements WHERE user_id = ? AND point_id = ? AND recorded_at >= ? AND recorded_at <= ?
            AND temperature > -237.3 GROUP BY hour_key");
        $stmt->execute([$ids['user_id'], $ids['point_id'], $first->format('Y-m-d H:i:s'), $now->format('Y-m-d H:i:s')]);
        $hourly = [];
        foreach ($stmt as $row) {
            $hourly[$row['hour_key']] = (float) $row['average'];
        }
        $payload['comparison'] = ['today' => $today->format('Y-m-d'), 'first' => $first->format('Y-m-d'), 'hourly' => (object) $hourly];
    }
    ddReply($payload);
} catch (Throwable $error) {
    error_log('U-Tech DD measurements: ' . $error->getMessage());
    ddReply(['message' => '実測気温を取得できませんでした。'], 503);
}
