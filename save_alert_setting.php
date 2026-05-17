<?php

header('Content-Type: application/json; charset=UTF-8');

$conn = new mysqli("localhost", "iot", "password123", "greenhouse");

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "DB接続に失敗しました"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$conn->set_charset("utf8mb4");

$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "JSONデータが正しくありません"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$user_id = trim($data["user_id"] ?? "");
$point_id = trim($data["point_id"] ?? "P01");
$temperature_threshold = $data["temperature_threshold"] ?? null;
$condition_type = $data["condition_type"] ?? "";
$notify_target = $data["notify_target"] ?? "";
$webhook_url = trim($data["webhook_url"] ?? "");
$enabled = !empty($data["enabled"]) ? 1 : 0;

if ($user_id === "") {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "user_idを入力してください"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($point_id === "") {
    $point_id = "P01";
}

if (!is_numeric($temperature_threshold)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "温度を入力してください"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!in_array($condition_type, ["above", "below"], true)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "条件が正しくありません"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!in_array($notify_target, ["line", "discord"], true)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "通知先が正しくありません"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($webhook_url === "") {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Webhook URLを入力してください"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$sql = "INSERT INTO alert_settings
        (user_id, point_id, temperature_threshold, condition_type, notify_target, webhook_url, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "SQL準備に失敗しました"
    ], JSON_UNESCAPED_UNICODE);
    exit;
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
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "アラート設定の保存に失敗しました"
    ], JSON_UNESCAPED_UNICODE);
    $stmt->close();
    $conn->close();
    exit;
}

echo json_encode([
    "success" => true,
    "message" => "アラート設定を保存しました"
], JSON_UNESCAPED_UNICODE);

$stmt->close();
$conn->close();

?>
