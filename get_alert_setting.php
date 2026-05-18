<?php

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=UTF-8');

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

function send_json($success, $payload = [], $status_code = 200) {
    http_response_code($status_code);
    echo json_encode(array_merge(["success" => $success], $payload), JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $conn = new mysqli("localhost", "iot", "password123", "greenhouse");
    $conn->set_charset("utf8mb4");

    $user_id = trim($_GET["user_id"] ?? "");
    $point_id = trim($_GET["point_id"] ?? "P01");

    if ($user_id === "") {
        send_json(false, ["message" => "user_id is required"], 400);
    }

    if ($point_id === "") {
        $point_id = "P01";
    }

    $sql = "SELECT user_id, point_id, temperature_threshold, condition_type, notify_target, enabled
            FROM alert_settings
            WHERE user_id = ? AND point_id = ?
            ORDER BY updated_at DESC, id DESC
            LIMIT 1";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ss", $user_id, $point_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $setting = $result->fetch_assoc();

    $stmt->close();
    $conn->close();

    send_json(true, ["setting" => $setting ?: null]);

} catch (Throwable $e) {
    send_json(false, ["message" => "error: " . $e->getMessage()], 500);
}
