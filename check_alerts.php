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

function postWebhook($url, $payload) {
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        return [
            "success" => $error === "" && $httpCode >= 200 && $httpCode < 300,
            "http_code" => $httpCode,
            "error" => $error
        ];
    }

    $context = stream_context_create([
        "http" => [
            "method" => "POST",
            "header" => "Content-Type: application/json\r\n",
            "content" => $json,
            "timeout" => 10
        ]
    ]);

    $result = @file_get_contents($url, false, $context);
    $httpCode = 0;
    $responseHeaders = function_exists('http_get_last_response_headers')
        ? http_get_last_response_headers()
        : (${'http_response_header'} ?? []);

    if (isset($responseHeaders[0]) &&
        preg_match('/\s([0-9]{3})\s/', $responseHeaders[0], $matches)) {
        $httpCode = (int)$matches[1];
    }

    return [
        "success" => $result !== false && $httpCode >= 200 && $httpCode < 300,
        "http_code" => $httpCode,
        "error" => $result === false ? "POST failed" : ""
    ];
}

function sendEmailAlert($to, $message) {
    $subject = "U-Techアラート";
    if (function_exists("mb_encode_mimeheader")) {
        $subject = mb_encode_mimeheader($subject, "UTF-8");
    }

    $headers = "Content-Type: text/plain; charset=UTF-8\r\n";
    $sent = mail($to, $subject, $message, $headers);

    return [
        "success" => $sent,
        "http_code" => null,
        "error" => $sent ? "" : "mail failed"
    ];
}

$settingsSql = "SELECT *
                FROM alert_settings
                WHERE enabled = 1
                  AND notify_target IN ('discord', 'email')
                ORDER BY id ASC";

$settingsResult = $conn->query($settingsSql);

if (!$settingsResult) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "アラート設定の取得に失敗しました"
    ], JSON_UNESCAPED_UNICODE);
    $conn->close();
    exit;
}

$latestStmt = $conn->prepare(
    "SELECT temperature
     FROM measurements
     WHERE user_id = ?
       AND point_id = ?
       AND temperature IS NOT NULL
     ORDER BY recorded_at DESC
     LIMIT 1"
);

$updateStmt = $conn->prepare(
    "UPDATE alert_settings
     SET last_notified_at = NOW(),
         last_status = 'alert'
     WHERE id = ?"
);

$normalStmt = $conn->prepare(
    "UPDATE alert_settings
     SET last_status = 'normal'
     WHERE id = ?"
);

$historyStmt = $conn->prepare(
    "INSERT INTO alert_history
     (setting_id, user_id, point_id, sensor_type, alert_type, value, threshold_value, message, notified_at)
     VALUES (?, ?, ?, 'temperature', ?, ?, ?, ?, NOW())"
);

if (!$latestStmt || !$updateStmt || !$normalStmt || !$historyStmt) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "SQL準備に失敗しました"
    ], JSON_UNESCAPED_UNICODE);
    $conn->close();
    exit;
}

$checked = 0;
$notified = 0;
$failed = 0;
$details = [];

while ($setting = $settingsResult->fetch_assoc()) {
    $checked++;

    $id = (int)$setting["id"];
    $userId = $setting["user_id"];
    $pointId = $setting["point_id"] ?: "P01";

    $latestStmt->bind_param("ss", $userId, $pointId);
    $latestStmt->execute();
    $latestResult = $latestStmt->get_result();
    $latest = $latestResult->fetch_assoc();

    if (!$latest || $latest["temperature"] === null) {
        $details[] = [
            "id" => $id,
            "status" => "no_temperature"
        ];
        continue;
    }

    $temperature = (float)$latest["temperature"];
    $threshold = (float)$setting["temperature_threshold"];
    $conditionType = $setting["condition_type"];
    $shouldNotify = false;
    $alertType = "";

    if ($conditionType === "above" && $temperature >= $threshold) {
        $shouldNotify = true;
        $alertType = "temperature_high";
        $message = "設定した温度を超えました。現在の温度は" . number_format($temperature, 1, ".", "") . "℃です。";
    } elseif ($conditionType === "below" && $temperature <= $threshold) {
        $shouldNotify = true;
        $alertType = "temperature_low";
        $message = "設定した温度を下回りました。現在の温度は" . number_format($temperature, 1, ".", "") . "℃です。";
    }

    if (!$shouldNotify) {
        $normalStmt->bind_param("i", $id);
        $normalStmt->execute();

        $details[] = [
            "id" => $id,
            "status" => "not_matched",
            "temperature" => $temperature
        ];
        continue;
    }

    $cooldownMinutes = isset($setting["cooldown_minutes"]) && is_numeric($setting["cooldown_minutes"])
        ? (int)$setting["cooldown_minutes"]
        : 180;
    $lastNotifiedAt = $setting["last_notified_at"] ?? null;

    if ($lastNotifiedAt) {
        $lastNotifiedTime = strtotime($lastNotifiedAt);

        if ($lastNotifiedTime !== false && time() - $lastNotifiedTime < $cooldownMinutes * 60) {
            $details[] = [
                "id" => $id,
                "status" => "cooldown",
                "temperature" => $temperature
            ];
            continue;
        }
    }

    if ($setting["notify_target"] === "email") {
        $postResult = sendEmailAlert($setting["webhook_url"], $message);
    } else {
        $postResult = postWebhook($setting["webhook_url"], ["content" => $message]);
    }

    if ($postResult["success"]) {
        $updateStmt->bind_param("i", $id);
        $updateStmt->execute();

        $historyStmt->bind_param(
            "isssdds",
            $id,
            $userId,
            $pointId,
            $alertType,
            $temperature,
            $threshold,
            $message
        );
        $historyStmt->execute();
        $notified++;

        $details[] = [
            "id" => $id,
            "status" => "notified",
            "temperature" => $temperature,
            "history_saved" => true
        ];
    } else {
        $failed++;

        $details[] = [
            "id" => $id,
            "status" => "notify_failed",
            "temperature" => $temperature,
            "http_code" => $postResult["http_code"],
            "error" => $postResult["error"]
        ];
    }
}

echo json_encode([
    "success" => true,
    "checked" => $checked,
    "notified" => $notified,
    "failed" => $failed,
    "details" => $details
], JSON_UNESCAPED_UNICODE);

$latestStmt->close();
$updateStmt->close();
$normalStmt->close();
$historyStmt->close();
$conn->close();

?>
