<?php

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/api_config.php';

$received_api_key = $_SERVER['HTTP_X_API_KEY'] ?? '';

if ($received_api_key !== '') {
    if (!hash_equals(IOT_API_KEY, $received_api_key)) {
        http_response_code(403);
        echo "Forbidden";
        exit;
    }
} elseif (IOT_API_KEY_REQUIRED) {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

ini_set('display_errors', 1);
error_reporting(E_ALL);

// ===== DB接続 =====
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);

if ($conn->connect_error) {
    die("DB接続失敗: " . $conn->connect_error);
}

// ===== JSON受信 =====
$json = file_get_contents('php://input');

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
(user_id, point_id, temperature, humidity, co2, solar_radiation, voltage) 
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
