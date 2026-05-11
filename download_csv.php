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

function calcVapor($temp, $hum) {
    $es = 6.1078 * pow(10, (7.5 * $temp) / (237.3 + $temp));
    $ea = $es * $hum / 100;
    return 216.7 * ($ea / ($temp + 273.15));
}

$sql = "SELECT
            DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at,
            point_id,
            temperature,
            humidity,
            CO2,
            solar_radiation,
            voltage
        FROM measurements
        WHERE user_id = ?
          AND recorded_at BETWEEN ? AND ?
        ORDER BY recorded_at ASC, point_id ASC";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    exit("SQL準備エラー: " . $conn->error);
}

$stmt->bind_param("sss", $user_id, $start_dt, $end_dt);
$stmt->execute();
$result = $stmt->get_result();

$rows = [];

while ($row = $result->fetch_assoc()) {

    $time = $row["recorded_at"];
    $point = $row["point_id"];

    if (!isset($rows[$time])) {
        $rows[$time] = [
            "日時" => $time,
            "P01_温度" => "",
            "P01_湿度" => "",
            "P01_飽和水蒸気量" => "",
            "P01_水蒸気量" => "",
            "P01_飽差" => "",
            "P02_温度" => "",
            "P02_湿度" => "",
            "P11_温度" => "",
            "P11_湿度" => "",
            "P21_CO2" => "",
            "P31_日射" => "",
            "P91_電圧" => ""
        ];
    }

    if ($point === "P01") {
        $rows[$time]["P01_温度"] = $row["temperature"];
        $rows[$time]["P01_湿度"] = $row["humidity"];

        if ($row["temperature"] !== null && $row["humidity"] !== null) {
            $temp = floatval($row["temperature"]);
            $hum  = floatval($row["humidity"]);

            $sat = calcVapor($temp, 100);
            $vapor = calcVapor($temp, $hum);
            $vpd = $sat - $vapor;

            $rows[$time]["P01_飽和水蒸気量"] = round($sat, 3);
            $rows[$time]["P01_水蒸気量"] = round($vapor, 3);
            $rows[$time]["P01_飽差"] = round($vpd, 3);
        }
    }

    if ($point === "P02") {
        $rows[$time]["P02_温度"] = $row["temperature"];
        $rows[$time]["P02_湿度"] = $row["humidity"];
    }

    if ($point === "P11") {
        $rows[$time]["P11_温度"] = $row["temperature"];
        $rows[$time]["P11_湿度"] = $row["humidity"];
    }

    if ($point === "P21") {
        $rows[$time]["P21_CO2"] = $row["CO2"];
    }

    if ($point === "P31") {
        $rows[$time]["P31_日射"] = $row["solar_radiation"];
    }

    if ($point === "P91") {
        $rows[$time]["P91_電圧"] = $row["voltage"];
    }
}

$header = [
    "日時",
    "P01_温度",
    "P01_湿度",
    "P01_飽和水蒸気量",
    "P01_水蒸気量",
    "P01_飽差",
    "P02_温度",
    "P02_湿度",
    "P11_温度",
    "P11_湿度",
    "P21_CO2",
    "P31_日射",
    "P91_電圧"
];

fputcsv($output, $header);

foreach ($rows as $row) {
    fputcsv($output, $row);
}

fclose($output);
$stmt->close();
$conn->close();

exit;
?>