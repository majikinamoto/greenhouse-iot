<?php
declare(strict_types=1);

$yuiDbConfig = __DIR__ . '/db_config.php';
$parentDbConfig = dirname(__DIR__) . '/db_config.php';
if (is_file($yuiDbConfig)) {
    require_once $yuiDbConfig;
} elseif (is_file($parentDbConfig)) {
    require_once $parentDbConfig;
} else {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'db_config.php が見つかりません';
    exit;
}

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');

$userId = isset($_GET['user_id']) && is_string($_GET['user_id']) ? trim($_GET['user_id']) : '';
$pointId = isset($_GET['point_id']) && is_string($_GET['point_id']) ? trim($_GET['point_id']) : '';
$allowedPointIds = ['P01', 'P11'];

if (!preg_match('/\A[A-Za-z0-9][A-Za-z0-9_-]{0,63}\z/D', $userId)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'user_idの形式が正しくありません'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!in_array($pointId, $allowedPointIds, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'point_idはP01またはP11を指定してください'], JSON_UNESCAPED_UNICODE);
    exit;
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    $timezone = new DateTimeZone('Asia/Tokyo');
    $today = new DateTimeImmutable('today', $timezone);

    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);
    $conn->set_charset('utf8mb4');
    $conn->query("SET time_zone = '+09:00'");

    $sql = "SELECT
                DATE(recorded_at) AS date_key,
                MAX(temperature) AS max_temperature,
                MIN(temperature) AS min_temperature,
                AVG(temperature) AS avg_temperature,
                COUNT(temperature) AS sample_count
            FROM measurements
            WHERE user_id = ?
              AND point_id = ?
              AND temperature IS NOT NULL
              AND recorded_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              AND recorded_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
            GROUP BY DATE(recorded_at)";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('ss', $userId, $pointId);
    $stmt->execute();
    $result = $stmt->get_result();

    $statsByDate = [];
    while ($row = $result->fetch_assoc()) {
        $dateKey = (string)$row['date_key'];
        $statsByDate[$dateKey] = [
            'date' => $dateKey,
            'max' => $row['max_temperature'] === null ? null : round((float)$row['max_temperature'], 1),
            'min' => $row['min_temperature'] === null ? null : round((float)$row['min_temperature'], 1),
            'avg' => $row['avg_temperature'] === null ? null : round((float)$row['avg_temperature'], 1),
            'count' => (int)$row['sample_count'],
        ];
    }

    $rows = [];
    for ($offset = 0; $offset < 7; $offset++) {
        $dateKey = $today->modify('-' . $offset . ' days')->format('Y-m-d');
        $rows[] = $statsByDate[$dateKey] ?? [
            'date' => $dateKey,
            'max' => null,
            'min' => null,
            'avg' => null,
            'count' => 0,
        ];
    }

    $stmt->close();
    $conn->close();

    echo json_encode([
        'success' => true,
        'timezone' => 'Asia/Tokyo',
        'user_id' => $userId,
        'point_id' => $pointId,
        'days' => $rows,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    error_log('Yui-Tech daily temperature stats error: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => '日別温度集計の取得に失敗しました'], JSON_UNESCAPED_UNICODE);
}

