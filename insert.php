<?php

ini_set('display_errors', 1);
error_reporting(E_ALL);

$conn = new mysqli("localhost", "iot", "password123", "greenhouse");

if ($conn->connect_error) {
    die("DB接続失敗: " . $conn->connect_error);
}

$data = json_decode(file_get_contents("php://input"), true);

if (!$data) {
    die("JSON取得失敗: データが空です");
}

// データの取得とバリデーション
$temperature = $data["temperature"] ?? null;
$humidity = $data["humidity"] ?? null;
$user_id = $data["user_id"] ?? null;
$co2 = $data["co2"] ?? null;
$solar_radiation = $data["solar_radiation"] ?? null;
$voltage = $data["voltage"] ?? null;

if (!is_numeric($user_id)) {
    die("エラー: user_idは数値である必要があります");
}

$sql = "INSERT INTO measurements (user_id, temperature, humidity, CO2, solar_radiation, voltage) VALUES (?, ?, ?, ?, ?, ?)";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("SQLエラー: " . $conn->error);
}

$stmt->bind_param("iddddd", $user_id, $temperature, $humidity, $co2, $solar_radiation, $voltage);

if ($stmt->execute()) {
    echo "データ挿入成功";
} else {
    echo "データ挿入失敗: " . $stmt->error;
}

$stmt->close();
$conn->close();
?>
