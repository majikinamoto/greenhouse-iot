<?php

ini_set('display_errors', 1);
error_reporting(E_ALL);

$conn = new mysqli("localhost", "iot", "password123", "greenhouse");

if ($conn->connect_error) {
    die("DB接続失敗: " . $conn->connect_error);
}

$data = json_decode(file_get_contents("php://input"), true);

if (!$data) {
    die("JSON取得失敗");
}

$temperature = isset($data["temperature"]) ? floatval($data["temperature"]) : null;
$humidity = isset($data["humidity"]) ? floatval($data["humidity"]) : null;
$user_id = isset($data["user_id"]) ? intval($data["user_id"]) : null;
$co2 = isset($data["co2"]) ? floatval($data["co2"]) : null;
$solar_radiation = isset($data["solar_radiation"]) ? floatval($data["solar_radiation"]) : null;
$voltage = isset($data["voltage"]) ? floatval($data["voltage"]) : null;

if (!$user_id) {
    die("user_idが必要です");
}

$sql = "INSERT INTO measurements 
(user_id, temperature, humidity, CO2, solar_radiation, voltage) 
VALUES (?, ?, ?, ?, ?, ?)";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("SQLエラー: " . $conn->error);
}

$stmt->bind_param("iddddd", $user_id, $temperature, $humidity, $co2, $solar_radiation, $voltage);

if ($stmt->execute()) {
    echo "OK";
} else {
    echo "NG: " . $stmt->error;
}

$stmt->close();
$conn->close();
?>