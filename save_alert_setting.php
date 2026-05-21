<?php

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=UTF-8');

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

function send_success(): void {
    echo json_encode([
        "success" => true
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function send_error(string $error, int $status_code = 400): void {
    http_response_code($status_code);
    echo json_encode([
        "success" => false,
        "error" => $error,
        "message" => $error
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if ($_SERVER["REQUEST_METHOD"] !== "POST") {
        send_error("POSTメソッドで送信してください", 405);
    }

    $raw_input = file_get_contents("php://input");
    $data = json_decode($raw_input, true);

    if (!is_array($data)) {
        send_error("JSONデータが正しくありません");
    }

    $user_id = trim((string)($data["user_id"] ?? ""));
    $point_id = trim((string)($data["point_id"] ?? ""));
    $sensor_type = "temperature";
    $temperature_threshold = $data["temperature_threshold"] ?? null;
    $condition_type = (string)($data["condition_type"] ?? "");
    $notify_target = (string)($data["notify_target"] ?? "");
    $webhook_url = trim((string)($data["webhook_url"] ?? ""));
    $cooldown_minutes = $data["cooldown_minutes"] ?? 30;
    $enabled = !empty($data["enabled"]) ? 1 : 0;

    if ($user_id === "") {
        send_error("user_idを入力してください");
    }

    if ($point_id === "") {
        send_error("point_idを入力してください");
    }

    if (!is_numeric($temperature_threshold)) {
        send_error("temperature_thresholdは数値で指定してください");
    }

    if (!in_array($condition_type, ["above", "below"], true)) {
        send_error("condition_typeはaboveまたはbelowで指定してください");
    }

    if (!in_array($notify_target, ["line", "discord"], true)) {
        send_error("notify_targetはlineまたはdiscordで指定してください");
    }

    if ($webhook_url === "") {
        send_error("webhook_urlを入力してください");
    }

    if (!is_numeric($cooldown_minutes)) {
        send_error("cooldown_minutesは数値で指定してください");
    }

    $temperature_threshold = (float)$temperature_threshold;
    $cooldown_minutes = (int)$cooldown_minutes;

    if ($cooldown_minutes < 0) {
        send_error("cooldown_minutesは0以上で指定してください");
    }

    $conn = new mysqli("localhost", "iot", "password123", "greenhouse");
    $conn->set_charset("utf8mb4");

    $select_sql = "SELECT id
                   FROM alert_settings
                   WHERE user_id = ?
                     AND point_id = ?
                     AND sensor_type = ?
                   LIMIT 1";
    $select_stmt = $conn->prepare($select_sql);
    $select_stmt->bind_param("sss", $user_id, $point_id, $sensor_type);
    $select_stmt->execute();
    $result = $select_stmt->get_result();
    $existing = $result->fetch_assoc();
    $select_stmt->close();

    if ($existing) {
        $id = (int)$existing["id"];
        $update_sql = "UPDATE alert_settings
                       SET temperature_threshold = ?,
                           condition_type = ?,
                           notify_target = ?,
                           webhook_url = ?,
                           cooldown_minutes = ?,
                           enabled = ?
                       WHERE id = ?";
        $update_stmt = $conn->prepare($update_sql);
        $update_stmt->bind_param(
            "dsssiii",
            $temperature_threshold,
            $condition_type,
            $notify_target,
            $webhook_url,
            $cooldown_minutes,
            $enabled,
            $id
        );
        $update_stmt->execute();
        $update_stmt->close();
    } else {
        $insert_sql = "INSERT INTO alert_settings
                       (user_id, point_id, sensor_type, temperature_threshold, condition_type, notify_target, webhook_url, cooldown_minutes, enabled)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        $insert_stmt = $conn->prepare($insert_sql);
        $insert_stmt->bind_param(
            "sssdsssii",
            $user_id,
            $point_id,
            $sensor_type,
            $temperature_threshold,
            $condition_type,
            $notify_target,
            $webhook_url,
            $cooldown_minutes,
            $enabled
        );
        $insert_stmt->execute();
        $insert_stmt->close();
    }

    $conn->close();
    send_success();

} catch (Throwable $e) {
    send_error($e->getMessage(), 500);
}
