<?php

ini_set('display_errors', 1);
error_reporting(E_ALL);

// ===== DB接続 =====
$conn = new mysqli("localhost", "iot", "password123", "greenhouse");

if ($conn->connect_error) {
    die("DB接続失敗: " . $conn->connect_error);
}

// ===== JSON受信 =====
$json = file_get_contents('php://input');

// ログ出力（デバッグ用）
file_put_contents("/tmp/debug.log", $json . "\n", FILE_APPEND);

$data = json_decode($json, true);

if (!$data) {
    die("JSONデータが空、または解析できません");
}

// ===== データ取得 =====
$user_id  = isset($data["user_id"]) ? $data["user_id"] : null;
$point_id = isset($data["point_id"]) ? $data["point_id"] : "P01";

$temperature = isset($data["temperature"]) ? floatval($data["temperature"]) : null;
$humidity    = isset($data["humidity"]) ? floatval($data["humidity"]) : null;
$co2         = isset($data["co2"]) ? floatval($data["co2"]) : null;
$solar_radiation = isset($data["solar_radiation"]) ? floatval($data["solar_radiation"]) : null;
$voltage     = isset($data["voltage"]) ? floatval($data["voltage"]) : null;

if (!$user_id) {
    die("user_idが必要です");
}

// ===== SQL =====
$sql = "INSERT INTO measurements 
(user_id, point_id, temperature, humidity, CO2, solar_radiation, voltage) 
VALUES (?, ?, ?, ?, ?, ?, ?)";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("SQLエラー: " . $conn->error);
}

// s=文字列, d=数値
$stmt->bind_param(
    "ssddddd",
    $user_id,
    $point_id,
    $temperature,
    $humidity,
    $co2,
    $solar_radiation,
    $voltage
);

// ===== 実行 =====
if ($stmt->execute()) {
    echo "OK";
} else {
    echo "NG: " . $stmt->error;
}

$stmt->close();
$conn->close();

?>
