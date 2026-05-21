<?php

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=UTF-8');

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

function send_json(array $payload, int $status_code = 200): void {
    http_response_code($status_code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $user_id = trim((string)($_GET["user_id"] ?? ""));
    $point_id = trim((string)($_GET["point_id"] ?? ""));
    $sensor_type = "temperature";

    if ($user_id === "") {
        send_json([
            "success" => false,
            "error" => "user_idを指定してください"
        ], 400);
    }

    if ($point_id === "") {
        send_json([
            "success" => false,
            "error" => "point_idを指定してください"
        ], 400);
    }

    $conn = new mysqli("localhost", "iot", "password123", "greenhouse");
    $conn->set_charset("utf8mb4");

    $sql = "SELECT *
            FROM alert_settings
            WHERE user_id = ?
              AND point_id = ?
              AND sensor_type = ?
              AND enabled = 1
            ORDER BY created_at DESC
            LIMIT 1";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("sss", $user_id, $point_id, $sensor_type);
    $stmt->execute();
    $result = $stmt->get_result();
    $setting = $result->fetch_assoc();

    $stmt->close();
    $conn->close();

    send_json([
        "success" => true,
        "setting" => $setting ?: null
    ]);

} catch (Throwable $e) {
    send_json([
        "success" => false,
        "error" => $e->getMessage()
    ], 500);
}
