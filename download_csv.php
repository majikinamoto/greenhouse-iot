<?php

$conn = new mysqli("localhost", "iot", "password123", "greenhouse");

if ($conn->connect_error) {
    die("DB接続失敗: " . $conn->connect_error);
}

$start = $_GET['start'] ?? '';
$end   = $_GET['end'] ?? '';

if (!$start || !$end) {
    exit("パラメータ不足");
}

// 日付補正
$start_dt = $start . " 00:00:00";
$end_dt   = $end   . " 23:59:59";

// ファイル名安全化
$start_safe = preg_replace('/[^0-9\-]/', '', $start);
$end_safe   = preg_replace('/[^0-9\-]/', '', $end);

$filename = "data_{$start_safe}_to_{$end_safe}.csv";

header('Content-Type: text/csv; charset=UTF-8');
header("Content-Disposition: attachment; filename=\"$filename\"");

// BOM
echo "\xEF\xBB\xBF";

$output = fopen('php://output', 'w');

// ヘッダー
fputcsv($output, ['日時', '温度', '湿度']);

$sql = "SELECT
            DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') as recorded_at,
            temperature,
            humidity
        FROM measurements
        WHERE recorded_at BETWEEN ? AND ?
        ORDER BY recorded_at ASC";

$stmt = $conn->prepare($sql);
$stmt->bind_param("ss", $start_dt, $end_dt);
$stmt->execute();
$result = $stmt->get_result();

while ($row = $result->fetch_assoc()) {
    fputcsv($output, $row);
}

fclose($output);
$conn->close();
