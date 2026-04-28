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

$temperature = $data["temperature"] ?? null;
$humidity = $data["humidity"] ?? null;
$channel_id = $data["channel_id"] ?? null;
$co2 = $data["co2"] ?? null;
$solar_radiation = $data["solar_radiation"] ?? null;
$voltage = $data["voltage"] ?? null;

$sql = "INSERT INTO measurements (channel_id, temperature, humidity, CO2, solar_radiation, voltage) VALUES (?, ?, ?, ?, ?, ?)";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("SQLエラー");
}

$stmt->bind_param("iddddd", $channel_id, $temperature, $humidity, $co2, $solar_radiation, $voltage);

if ($stmt->execute()) {
    echo "OK";
} else {
    echo "NG";
}

$stmt->close();
$conn->close();
?>
