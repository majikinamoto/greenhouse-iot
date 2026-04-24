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

$sql = "INSERT INTO measurements (temperature, humidity) VALUES (?, ?)";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("SQLエラー");
}

$stmt->bind_param("dd", $temperature, $humidity);

if ($stmt->execute()) {
    echo "OK";
} else {
    echo "NG";
}

$stmt->close();
$conn->close();
?>
