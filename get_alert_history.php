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

    if ($user_id === "") {
        send_json([
            "success" => false,
            "error" => "user_idを指定してください"
        ], 400);
    }

    $conn = new mysqli("localhost", "iot", "password123", "greenhouse");
    $conn->set_charset("utf8mb4");

    $sql = "SELECT point_id, alert_type, value, threshold_value, message, notified_at
            FROM alert_history
            WHERE user_id = ?
              AND notified_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
            ORDER BY notified_at DESC
            LIMIT 50";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("s", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $history = [];
    while ($row = $result->fetch_assoc()) {
        $history[] = $row;
    }

    $stmt->close();
    $conn->close();

    send_json([
        "success" => true,
        "history" => $history
    ]);

} catch (Throwable $e) {
    send_json([
        "success" => false,
        "error" => $e->getMessage()
    ], 500);
}
