<?php

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=UTF-8');

function send_json($success, $message, $status_code = 200) {
    http_response_code($status_code);
    echo json_encode([
        "success" => $success,
        "message" => $message
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$conn = new mysqli("localhost", "iot", "password123", "greenhouse");

if ($conn->connect_error) {
    send_json(false, "DB接続に失敗しました", 500);
}

$conn->set_charset("utf8mb4");

$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!is_array($data)) {
    $conn->close();
    send_json(false, "JSONデータが正しくありません", 400);
}

$user_id = trim($data["user_id"] ?? "");
$point_id = trim($data["point_id"] ?? "P01");
$temperature_threshold = $data["temperature_threshold"] ?? null;
$condition_type = $data["condition_type"] ?? "";
$notify_target = $data["notify_target"] ?? "";
$webhook_url = trim($data["webhook_url"] ?? "");
$enabled = !empty($data["enabled"]) ? 1 : 0;

if ($user_id === "") {
    $conn->close();
    send_json(false, "user_idを入力してください", 400);
}

if ($point_id === "") {
    $point_id = "P01";
}

if (!is_numeric($temperature_threshold)) {
    $conn->close();
    send_json(false, "温度を入力してください", 400);
}

if (!in_array($condition_type, ["above", "below"], true)) {
    $conn->close();
    send_json(false, "条件が正しくありません", 400);
}

if (!in_array($notify_target, ["line", "discord"], true)) {
    $conn->close();
    send_json(false, "通知先が正しくありません", 400);
}

if ($webhook_url === "") {
    $conn->close();
    send_json(false, "Webhook URLを入力してください", 400);
}

$sql = "INSERT INTO alert_settings
        (user_id, point_id, temperature_threshold, condition_type, notify_target, webhook_url, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    $conn->close();
    send_json(false, "SQL準備に失敗しました", 500);
}

$temperature_threshold = (float)$temperature_threshold;

$stmt->bind_param(
    "ssdsssi",
    $user_id,
    $point_id,
    $temperature_threshold,
    $condition_type,
    $notify_target,
    $webhook_url,
    $enabled
);

if (!$stmt->execute()) {
    $stmt->close();
    $conn->close();
    send_json(false, "アラート設定の保存に失敗しました", 500);
}

$stmt->close();
$conn->close();

send_json(true, "アラート設定を保存しました");
