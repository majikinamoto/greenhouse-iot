<?php

$conn = new mysqli("localhost", "iot", "password123", "greenhouse");

if ($conn->connect_error) {
    die("DB接続失敗: " . $conn->connect_error);
}

$conn->set_charset("utf8mb4");

$start = $_GET['start'] ?? '';
$end   = $_GET['end'] ?? '';
$user_id = $_GET['user_id'] ?? '';

if (!$user_id || !$start || !$end) {
    exit("パラメータ不足");
}

$start_dt = str_replace("T", " ", $start) . ":00";
$end_dt   = str_replace("T", " ", $end) . ":59";

$start_safe = preg_replace('/[^0-9]/', '', $start);
$end_safe   = preg_replace('/[^0-9]/', '', $end);

$filename = "data_{$user_id}_{$start_safe}_to_{$end_safe}.csv";

header('Content-Type: text/csv; charset=UTF-8');
header("Content-Disposition: attachment; filename=\"$filename\"");

echo "\xEF\xBB\xBF";

$output = fopen('php://output', 'w');

fputcsv($output, [
    '日時',
    'user_id',
    'point_id',
    '温度',
    '湿度',
    'CO2',
    '日射',
    '電圧',
    '飽和水蒸気量',
    '水蒸気量',
    '飽差'
]);

$sql = "SELECT
            DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at,
            user_id,
            point_id,
            temperature,
            humidity,
            CO2,
            solar_radiation,
            voltage
        FROM measurements
        WHERE user_id = ?
          AND recorded_at BETWEEN ? AND ?
          ORDER BY point_id ASC, recorded_at ASC";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    exit("SQL準備エラー: " . $conn->error);
}

$stmt->bind_param("sss", $user_id, $start_dt, $end_dt);
$stmt->execute();
$result = $stmt->get_result();

while ($row = $result->fetch_assoc()) {

    $sat = "";
    $vapor = "";
    $vpd = "";

    if ($row["temperature"] !== null && $row["humidity"] !== null) {

        $temp = floatval($row["temperature"]);
        $hum  = floatval($row["humidity"]);

        $es = 6.1078 * pow(10, (7.5 * $temp) / (237.3 + $temp));
        $ea = $es * $hum / 100;

        $sat = 216.7 * ($es / ($temp + 273.15));
        $vapor = 216.7 * ($ea / ($temp + 273.15));
        $vpd = $sat - $vapor;
    }

    fputcsv($output, [
        $row["recorded_at"],
        $row["user_id"],
        $row["point_id"],
        $row["temperature"],
        $row["humidity"],
        $row["CO2"],
        $row["solar_radiation"],
        $row["voltage"],
        $sat === "" ? "" : round($sat, 3),
        $vapor === "" ? "" : round($vapor, 3),
        $vpd === "" ? "" : round($vpd, 3)
    ]);
}

fclose($output);
$stmt->close();
$conn->close();

exit;
?>