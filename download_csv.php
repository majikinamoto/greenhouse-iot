<?php

require_once __DIR__ . '/db_config.php';

function failCsvDownload(string $message, int $status = 400): void {
    http_response_code($status);
    header('Content-Type: text/plain; charset=UTF-8');
    exit($message);
}

function normalizeCsvDateTime(string $value, string $defaultSeconds): ?array {
    $normalized = str_replace('T', ' ', trim($value));

    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $normalized)) {
        $normalized .= ':' . $defaultSeconds;
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $normalized)) {
        return null;
    }

    $date = DateTimeImmutable::createFromFormat(
        '!Y-m-d H:i:s',
        $normalized,
        new DateTimeZone('Asia/Tokyo')
    );
    $errors = DateTimeImmutable::getLastErrors();

    if (
        !$date ||
        ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) ||
        $date->format('Y-m-d H:i:s') !== $normalized
    ) {
        return null;
    }

    return ['sql' => $normalized, 'date' => $date];
}

function calcVapor(float $temp, float $hum): float {
    $es = 6.1078 * pow(10, (7.5 * $temp) / (237.3 + $temp));
    $ea = $es * $hum / 100;
    return 216.7 * ($ea / ($temp + 273.15));
}

function getPointNumber(string $pointId): int {
    return (int)substr($pointId, 1);
}

function isTemperatureHumidityPoint(string $pointId): bool {
    $number = getPointNumber($pointId);
    return $number >= 1 && $number <= 20;
}

function isCo2Point(string $pointId): bool {
    $number = getPointNumber($pointId);
    return $number >= 21 && $number <= 30;
}

function isSolarPoint(string $pointId): bool {
    $number = getPointNumber($pointId);
    return $number >= 31 && $number <= 40;
}

function appendPointHeader(array &$header, string $pointId): void {
    $header[] = '';
    $header[] = $pointId . '_日時';

    if ($pointId === 'P01') {
        $header[] = 'P01_温度';
        $header[] = 'P01_湿度';
        $header[] = 'P01_飽和水蒸気量';
        $header[] = 'P01_水蒸気量';
        $header[] = 'P01_飽差';
    } elseif (isTemperatureHumidityPoint($pointId)) {
        $header[] = $pointId . '_温度';
        $header[] = $pointId . '_湿度';
    } elseif (isCo2Point($pointId)) {
        $header[] = $pointId . '_CO2';
    } elseif (isSolarPoint($pointId)) {
        $header[] = $pointId . '_日射';
    } elseif ($pointId === 'P41') {
        $header[] = 'P41_累積転倒ますカウント';
        $header[] = 'P41_10分転倒ますカウント';
        $header[] = 'P41_累積雨量';
        $header[] = 'P41_10分雨量';
    } elseif ($pointId === 'P91') {
        $header[] = 'P91_電圧';
    }
}

function appendPointValues(array &$line, string $pointId, ?array $item): void {
    $line[] = '';
    $line[] = $item['日時'] ?? '';

    if ($pointId === 'P01') {
        $line[] = $item['温度'] ?? '';
        $line[] = $item['湿度'] ?? '';
        $line[] = $item['飽和水蒸気量'] ?? '';
        $line[] = $item['水蒸気量'] ?? '';
        $line[] = $item['飽差'] ?? '';
    } elseif (isTemperatureHumidityPoint($pointId)) {
        $line[] = $item['温度'] ?? '';
        $line[] = $item['湿度'] ?? '';
    } elseif (isCo2Point($pointId)) {
        $line[] = $item['CO2'] ?? '';
    } elseif (isSolarPoint($pointId)) {
        $line[] = $item['日射'] ?? '';
    } elseif ($pointId === 'P41') {
        $line[] = $item['累積転倒ますカウント'] ?? '';
        $line[] = $item['10分転倒ますカウント'] ?? '';
        $line[] = $item['累積雨量'] ?? '';
        $line[] = $item['10分雨量'] ?? '';
    } elseif ($pointId === 'P91') {
        $line[] = $item['電圧'] ?? '';
    }
}

$allowedPointIds = array_merge(
    array_map(static fn(int $number): string => sprintf('P%02d', $number), range(1, 40)),
    ['P41', 'P91']
);

$userId = trim((string)($_GET['user_id'] ?? ''));
$startInput = (string)($_GET['start'] ?? '');
$endInput = (string)($_GET['end'] ?? '');
$requestedPointIds = $_GET['point_ids'] ?? [];

if ($userId === '') {
    failCsvDownload('user_idを入力してください。');
}

if (!preg_match('/\A[A-Za-z0-9][A-Za-z0-9_-]{0,63}\z/D', $userId)) {
    failCsvDownload('user_idの形式が正しくありません。');
}

if (!is_array($requestedPointIds) || count($requestedPointIds) === 0) {
    failCsvDownload('Point IDを1件以上選択してください。');
}

$requestedPointIdSet = [];
foreach ($requestedPointIds as $pointId) {
    if (!is_string($pointId) || !in_array($pointId, $allowedPointIds, true)) {
        failCsvDownload('許可されていないPoint IDが指定されています。');
    }
    $requestedPointIdSet[$pointId] = true;
}

$selectedPointIds = array_values(array_filter(
    $allowedPointIds,
    static fn(string $pointId): bool => isset($requestedPointIdSet[$pointId])
));

if (count($selectedPointIds) === 0) {
    failCsvDownload('Point IDを1件以上選択してください。');
}

$start = normalizeCsvDateTime($startInput, '00');
$end = normalizeCsvDateTime($endInput, '59');

if ($start === null || $end === null) {
    failCsvDownload('開始日または終了日の形式が正しくありません。');
}

if ($start['date'] > $end['date']) {
    failCsvDownload('開始日は終了日以前にしてください。');
}

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);

if ($conn->connect_error) {
    failCsvDownload('DB接続に失敗しました。', 500);
}

$conn->set_charset('utf8mb4');

$pointPlaceholders = implode(',', array_fill(0, count($selectedPointIds), '?'));
$sql = "SELECT
            DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at,
            point_id,
            temperature,
            humidity,
            CO2,
            solar_radiation,
            rainfall_tip_count,
            rainfall_tip_interval,
            rainfall_cumulative,
            rainfall_interval,
            voltage
        FROM measurements
        WHERE user_id = ?
          AND recorded_at BETWEEN ? AND ?
          AND point_id IN ($pointPlaceholders)
        ORDER BY recorded_at ASC, point_id ASC";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    $conn->close();
    failCsvDownload('CSV出力の準備に失敗しました。', 500);
}

$bindValues = array_merge(
    [$userId, $start['sql'], $end['sql']],
    $selectedPointIds
);
$bindTypes = str_repeat('s', count($bindValues));
$stmt->bind_param($bindTypes, ...$bindValues);

if (!$stmt->execute()) {
    $stmt->close();
    $conn->close();
    failCsvDownload('CSVデータの取得に失敗しました。', 500);
}

$result = $stmt->get_result();
$data = array_fill_keys($selectedPointIds, []);

while ($row = $result->fetch_assoc()) {
    $pointId = (string)$row['point_id'];

    if (!isset($data[$pointId])) {
        continue;
    }

    $item = [
        '日時' => $row['recorded_at'],
        '温度' => '',
        '湿度' => '',
        '飽和水蒸気量' => '',
        '水蒸気量' => '',
        '飽差' => '',
        'CO2' => '',
        '日射' => '',
        '累積転倒ますカウント' => '',
        '10分転倒ますカウント' => '',
        '累積雨量' => '',
        '10分雨量' => '',
        '電圧' => ''
    ];

    if (isTemperatureHumidityPoint($pointId)) {
        $item['温度'] = $row['temperature'];
        $item['湿度'] = $row['humidity'];

        if ($pointId === 'P01' && $row['temperature'] !== null && $row['humidity'] !== null) {
            $temperature = (float)$row['temperature'];
            $humidity = (float)$row['humidity'];
            $saturatedVapor = calcVapor($temperature, 100);
            $vapor = calcVapor($temperature, $humidity);

            $item['飽和水蒸気量'] = round($saturatedVapor, 3);
            $item['水蒸気量'] = round($vapor, 3);
            $item['飽差'] = round($saturatedVapor - $vapor, 3);
        }
    } elseif (isCo2Point($pointId)) {
        $item['CO2'] = $row['CO2'];
    } elseif (isSolarPoint($pointId)) {
        $item['日射'] = $row['solar_radiation'];
    } elseif ($pointId === 'P41') {
        $item['累積転倒ますカウント'] = $row['rainfall_tip_count'];
        $item['10分転倒ますカウント'] = $row['rainfall_tip_interval'];
        $item['累積雨量'] = $row['rainfall_cumulative'];
        $item['10分雨量'] = $row['rainfall_interval'];
    } elseif ($pointId === 'P91') {
        $item['電圧'] = $row['voltage'];
    }

    $data[$pointId][] = $item;
}

$stmt->close();
$conn->close();

$startDateForFile = str_replace('-', '', substr($start['sql'], 0, 10));
$endDateForFile = str_replace('-', '', substr($end['sql'], 0, 10));
$filename = "U-Tech_{$userId}_{$startDateForFile}-{$endDateForFile}.csv";

header('Content-Type: text/csv; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: attachment; filename="' . $filename . '"');

echo "\xEF\xBB\xBF";

$output = fopen('php://output', 'w');
$header = [];

foreach ($selectedPointIds as $pointId) {
    appendPointHeader($header, $pointId);
}

fputcsv($output, $header);

$maxRows = 0;
foreach ($selectedPointIds as $pointId) {
    $maxRows = max($maxRows, count($data[$pointId]));
}

for ($index = 0; $index < $maxRows; $index++) {
    $line = [];

    foreach ($selectedPointIds as $pointId) {
        appendPointValues($line, $pointId, $data[$pointId][$index] ?? null);
    }

    fputcsv($output, $line);
}

fclose($output);
exit;
