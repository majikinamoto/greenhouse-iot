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

$points = [
    "P01" => [],
    "P02" => [],
    "P11" => [],
    "P21" => [],
    "P31" => [],
    "P91" => []
];

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
        ORDER BY point_id ASC, recorded_at ASC";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    exit("SQL準備エラー: " . $conn->error);
}

$stmt->bind_param("sss", $user_id, $start_dt, $end_dt);
$stmt->execute();
$result = $stmt->get_result();

while ($row = $result->fetch_assoc()) {

    $point = $row["point_id"];

    if (!isset($points[$point])) {
        continue;
    }

    if ($point === "P01") {

        $sat = "";
        $vapor = "";
        $vpd = "";

        if ($row["temperature"] !== null && $row["humidity"] !== null) {
            $temp = floatval($row["temperature"]);
            $hum  = floatval($row["humidity"]);

            $sat = calcVapor($temp, 100);
            $vapor = calcVapor($temp, $hum);
            $vpd = $sat - $vapor;
        }

        $points["P01"][] = [
            $row["recorded_at"],
            $row["temperature"],
            $row["humidity"],
            $sat === "" ? "" : round($sat, 3),
            $vapor === "" ? "" : round($vapor, 3),
            $vpd === "" ? "" : round($vpd, 3)
        ];
    }

    if ($point === "P02") {
        $points["P02"][] = [
            $row["recorded_at"],
            $row["temperature"],
            $row["humidity"]
        ];
    }

    if ($point === "P11") {
        $points["P11"][] = [
            $row["recorded_at"],
            $row["temperature"],
            $row["humidity"]
        ];
    }

    if ($point === "P21") {
        $points["P21"][] = [
            $row["recorded_at"],
            $row["CO2"]
        ];
    }

    if ($point === "P31") {
        $points["P31"][] = [
            $row["recorded_at"],
            $row["solar_radiation"]
        ];
    }

    if ($point === "P91") {
        $points["P91"][] = [
            $row["recorded_at"],
            $row["voltage"]
        ];
    }
}

$header = [
    "P01_日時",
    "P01_温度",
    "P01_湿度",
    "P01_飽和水蒸気量",
    "P01_水蒸気量",
    "P01_飽差",

    "P02_日時",
    "P02_温度",
    "P02_湿度",

    "P11_日時",
    "P11_温度",
    "P11_湿度",

    "P21_日時",
    "P21_CO2",

    "P31_日時",
    "P31_日射",

    "P91_日時",
    "P91_電圧"
];

fputcsv($output, $header);

$maxRows = max(
    count($points["P01"]),
    count($points["P02"]),
    count($points["P11"]),
    count($points["P21"]),
    count($points["P31"]),
    count($points["P91"])
);

for ($i = 0; $i < $maxRows; $i++) {

    $line = [];

    $line = array_merge($line, $points["P01"][$i] ?? ["", "", "", "", "", ""]);
    $line = array_merge($line, $points["P02"][$i] ?? ["", "", ""]);
    $line = array_merge($line, $points["P11"][$i] ?? ["", "", ""]);
    $line = array_merge($line, $points["P21"][$i] ?? ["", ""]);
    $line = array_merge($line, $points["P31"][$i] ?? ["", ""]);
    $line = array_merge($line, $points["P91"][$i] ?? ["", ""]);

    fputcsv($output, $line);
}

fclose($output);
$stmt->close();
$conn->close();

exit;
?>