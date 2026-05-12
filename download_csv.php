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

$data = [
    "P01" => [],
    "P02" => [],
    "P11" => [],
    "P21" => [],
    "P31" => [],
    "P91" => []
];

while ($row = $result->fetch_assoc()) {

    $point = $row["point_id"];

    if (!isset($data[$point])) {
        continue;
    }

    $item = [
        "日時" => $row["recorded_at"],
        "温度" => "",
        "湿度" => "",
        "飽和水蒸気量" => "",
        "水蒸気量" => "",
        "飽差" => "",
        "CO2" => "",
        "日射" => "",
        "電圧" => ""
    ];

    if ($point === "P01") {
        $item["温度"] = $row["temperature"];
        $item["湿度"] = $row["humidity"];

        if ($row["temperature"] !== null && $row["humidity"] !== null) {
            $temp = floatval($row["temperature"]);
            $hum  = floatval($row["humidity"]);

            $sat = calcVapor($temp, 100);
            $vapor = calcVapor($temp, $hum);
            $vpd = $sat - $vapor;

            $item["飽和水蒸気量"] = round($sat, 3);
            $item["水蒸気量"] = round($vapor, 3);
            $item["飽差"] = round($vpd, 3);
        }
    }

    if ($point === "P02" || $point === "P11") {
        $item["温度"] = $row["temperature"];
        $item["湿度"] = $row["humidity"];
    }

    if ($point === "P21") {
        $item["CO2"] = $row["CO2"];
    }

    if ($point === "P31") {
        $item["日射"] = $row["solar_radiation"];
    }

    if ($point === "P91") {
        $item["電圧"] = $row["voltage"];
    }

    $data[$point][] = $item;
}

$header = [
    "", "P01_日時", "P01_温度", "P01_湿度", "P01_飽和水蒸気量", "P01_水蒸気量", "P01_飽差",
    "", "P02_日時", "P02_温度", "P02_湿度",
    "", "P11_日時", "P11_温度", "P11_湿度",
    "", "P21_日時", "P21_CO2",
    "", "P31_日時", "P31_日射",
    "", "P91_日時", "P91_電圧"
];

fputcsv($output, $header);

$max = max(
    count($data["P01"]),
    count($data["P02"]),
    count($data["P11"]),
    count($data["P21"]),
    count($data["P31"]),
    count($data["P91"])
);

for ($i = 0; $i < $max; $i++) {

    $p01 = $data["P01"][$i] ?? null;
    $p02 = $data["P02"][$i] ?? null;
    $p11 = $data["P11"][$i] ?? null;
    $p21 = $data["P21"][$i] ?? null;
    $p31 = $data["P31"][$i] ?? null;
    $p91 = $data["P91"][$i] ?? null;

    $line = [
        "", $p01["日時"] ?? "", $p01["温度"] ?? "", $p01["湿度"] ?? "", $p01["飽和水蒸気量"] ?? "", $p01["水蒸気量"] ?? "", $p01["飽差"] ?? "",
        "", $p02["日時"] ?? "", $p02["温度"] ?? "", $p02["湿度"] ?? "",
        "", $p11["日時"] ?? "", $p11["温度"] ?? "", $p11["湿度"] ?? "",
        "", $p21["日時"] ?? "", $p21["CO2"] ?? "",
        "", $p31["日時"] ?? "", $p31["日射"] ?? "",
        "", $p91["日時"] ?? "", $p91["電圧"] ?? ""
    ];

    fputcsv($output, $line);
}

fclose($output);
$stmt->close();
$conn->close();

exit;
?>
