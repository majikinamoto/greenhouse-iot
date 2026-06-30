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

function loadSmtpConfig() {
    $configPath = __DIR__ . "/smtp_config.php";
    if (!is_file($configPath)) {
        return [null, "smtp_config.php not found"];
    }

    $config = require $configPath;
    if (!is_array($config)) {
        return [null, "smtp_config.php must return array"];
    }

    foreach (["host", "port", "username", "password", "from_email"] as $key) {
        if (!isset($config[$key]) || $config[$key] === "") {
            return [null, "smtp config missing: " . $key];
        }
    }

    $config["encryption"] = $config["encryption"] ?? "tls";
    $config["from_name"] = $config["from_name"] ?? "U-Tech";
    $config["timeout"] = isset($config["timeout"]) ? (int)$config["timeout"] : 15;

    return [$config, ""];
}

function smtpRead($socket) {
    $response = "";
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (strlen($line) >= 4 && $line[3] === " ") {
            break;
        }
    }

    $code = (int)substr($response, 0, 3);
    return [$code, trim($response)];
}

function smtpCommand($socket, $command, $expectedCodes, $stage) {
    fwrite($socket, $command . "\r\n");
    [$code, $response] = smtpRead($socket);

    if (!in_array($code, $expectedCodes, true)) {
        return [false, "smtp " . $stage . " failed: " . $code];
    }

    return [true, ""];
}

function encodeSmtpHeader($value) {
    if (function_exists("mb_encode_mimeheader")) {
        return mb_encode_mimeheader($value, "UTF-8");
    }

    return $value;
}

function sendEmailAlert($to, $message) {
    [$config, $configError] = loadSmtpConfig();
    if (!$config) {
        return [
            "success" => false,
            "http_code" => null,
            "error" => $configError
        ];
    }

    $host = (string)$config["host"];
    $port = (int)$config["port"];
    $encryption = strtolower((string)$config["encryption"]);
    $target = $encryption === "ssl" ? "ssl://" . $host : $host;
    $timeout = (int)$config["timeout"];

    $socket = @fsockopen($target, $port, $errno, $errstr, $timeout);
    if (!$socket) {
        return [
            "success" => false,
            "http_code" => null,
            "error" => "smtp connect failed: " . $errno
        ];
    }

    stream_set_timeout($socket, $timeout);
    [$code] = smtpRead($socket);
    if ($code !== 220) {
        fclose($socket);
        return ["success" => false, "http_code" => null, "error" => "smtp greeting failed: " . $code];
    }

    [$ok, $error] = smtpCommand($socket, "EHLO localhost", [250], "ehlo");
    if (!$ok) {
        fclose($socket);
        return ["success" => false, "http_code" => null, "error" => $error];
    }

    if ($encryption === "tls") {
        [$ok, $error] = smtpCommand($socket, "STARTTLS", [220], "starttls");
        if (!$ok) {
            fclose($socket);
            return ["success" => false, "http_code" => null, "error" => $error];
        }

        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($socket);
            return ["success" => false, "http_code" => null, "error" => "smtp tls negotiation failed"];
        }

        [$ok, $error] = smtpCommand($socket, "EHLO localhost", [250], "ehlo_tls");
        if (!$ok) {
            fclose($socket);
            return ["success" => false, "http_code" => null, "error" => $error];
        }
    }

    [$ok, $error] = smtpCommand($socket, "AUTH LOGIN", [334], "auth");
    if (!$ok) {
        fclose($socket);
        return ["success" => false, "http_code" => null, "error" => $error];
    }

    [$ok, $error] = smtpCommand($socket, base64_encode((string)$config["username"]), [334], "auth_user");
    if (!$ok) {
        fclose($socket);
        return ["success" => false, "http_code" => null, "error" => $error];
    }

    [$ok, $error] = smtpCommand($socket, base64_encode((string)$config["password"]), [235], "auth_password");
    if (!$ok) {
        fclose($socket);
        return ["success" => false, "http_code" => null, "error" => $error];
    }

    $fromEmail = (string)$config["from_email"];
    $fromName = (string)$config["from_name"];
    $subject = encodeSmtpHeader("U-Techアラート");
    $headers = [
        "From: " . encodeSmtpHeader($fromName) . " <" . $fromEmail . ">",
        "To: <" . $to . ">",
        "Subject: " . $subject,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8"
    ];
    $body = implode("\r\n", $headers) . "\r\n\r\n" . $message;
    $body = str_replace(["\r\n", "\r", "\n"], "\r\n", $body);
    $body = preg_replace('/^\./m', '..', $body);

    foreach ([
        ["MAIL FROM:<" . $fromEmail . ">", [250], "mail_from"],
        ["RCPT TO:<" . $to . ">", [250, 251], "rcpt_to"],
        ["DATA", [354], "data"]
    ] as $command) {
        [$ok, $error] = smtpCommand($socket, $command[0], $command[1], $command[2]);
        if (!$ok) {
            fclose($socket);
            return ["success" => false, "http_code" => null, "error" => $error];
        }
    }

    [$ok, $error] = smtpCommand($socket, $body . "\r\n.", [250], "data_body");
    smtpCommand($socket, "QUIT", [221], "quit");
    fclose($socket);

    return [
        "success" => $ok,
        "http_code" => null,
        "error" => $ok ? "" : $error
    ];
}

function maskEmail($email) {
    if (!is_string($email) || strpos($email, "@") === false) {
        return "";
    }

    [$local, $domain] = explode("@", $email, 2);
    $localMasked = substr($local, 0, 1) . "***";

    return $localMasked . "@" . $domain;
}

function buildAlertDetail($setting, $currentValue, $matchStatus, $extra = []) {
    return array_merge([
        "id" => (int)$setting["id"],
        "setting_id" => (int)$setting["id"],
        "user_id" => $setting["user_id"],
        "point_id" => $setting["point_id"] ?: "P01",
        "sensor_type" => $setting["sensor_type"] ?? "temperature",
        "notify_target" => $setting["notify_target"] ?? "",
        "condition_type" => $setting["condition_type"] ?? "",
        "threshold_value" => isset($setting["temperature_threshold"]) ? (float)$setting["temperature_threshold"] : null,
        "current_value" => $currentValue,
        "matched" => $matchStatus === "matched",
        "match_status" => $matchStatus,
        "email_send_result" => null,
        "email_error" => null
    ], $extra);
}

function buildTemperatureMessage($pointId, $temperature, $threshold, $conditionType, $isRecovery) {
    $temperatureText = number_format($temperature, 1, ".", "") . "℃";
    $thresholdText = number_format($threshold, 1, ".", "") . "℃";

    if ($isRecovery) {
        $settingText = $conditionType === "above"
            ? $thresholdText . "未満"
            : $thresholdText . "超過";

        return "🟢 正常値に戻りました\n" .
            "対象：" . $pointId . "\n" .
            "現在値：" . $temperatureText . "\n" .
            "設定値：" . $settingText;
    }

    $title = $conditionType === "above"
        ? "🔴 高温になりました"
        : "🔴 低温になりました";
    $settingText = $conditionType === "above"
        ? $thresholdText . "以上"
        : $thresholdText . "以下";

    return $title . "\n" .
        "対象：" . $pointId . "\n" .
        "現在値：" . $temperatureText . "\n" .
        "設定値：" . $settingText;
}

function sendAlertNotification($setting, $message) {
    if ($setting["notify_target"] === "email") {
        $result = sendEmailAlert($setting["webhook_url"], $message);
        $result["email_send_result"] = $result["success"] ? "success" : "failed";
        $result["email_error"] = $result["error"];
        return $result;
    }

    $result = postWebhook($setting["webhook_url"], ["content" => $message]);
    $result["email_send_result"] = null;
    $result["email_error"] = null;
    return $result;
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
        $details[] = buildAlertDetail($setting, null, "not_matched", [
            "status" => "no_temperature"
        ]);
        continue;
    }

    $temperature = (float)$latest["temperature"];
    $threshold = (float)$setting["temperature_threshold"];
    $conditionType = $setting["condition_type"];
    $lastStatus = $setting["last_status"] ?? "normal";
    $shouldNotify = false;
    $alertType = "";

    if ($conditionType === "above" && $temperature > $threshold) {
        $shouldNotify = true;
        $alertType = "temperature_high";
    } elseif ($conditionType === "below" && $temperature < $threshold) {
        $shouldNotify = true;
        $alertType = "temperature_low";
    }

    if (!$shouldNotify) {
        if ($lastStatus === "alert") {
            $normalStmt->bind_param("i", $id);
            $normalStmt->execute();

            $details[] = buildAlertDetail($setting, $temperature, "not_matched", [
                "status" => "back_to_normal",
                "temperature" => $temperature,
                "last_status" => $lastStatus,
                "new_status" => "normal"
            ]);
            continue;
        }

        $details[] = buildAlertDetail($setting, $temperature, "not_matched", [
            "status" => "not_matched",
            "temperature" => $temperature,
            "last_status" => $lastStatus
        ]);
        continue;
    }

    $cooldownMinutes = isset($setting["cooldown_minutes"]) && is_numeric($setting["cooldown_minutes"])
        ? (int)$setting["cooldown_minutes"]
        : 180;
    $lastNotifiedAt = $setting["last_notified_at"] ?? null;

    if ($lastStatus === "alert" && $lastNotifiedAt) {
        $lastNotifiedTime = strtotime($lastNotifiedAt);

        if ($lastNotifiedTime !== false && time() - $lastNotifiedTime < $cooldownMinutes * 60) {
            $details[] = buildAlertDetail($setting, $temperature, "matched", [
                "status" => "cooldown",
                "temperature" => $temperature,
                "last_status" => $lastStatus,
                "email_send_result" => $setting["notify_target"] === "email" ? "skipped_cooldown" : null,
                "email_error" => null
            ]);
            continue;
        }
    }

    $message = buildTemperatureMessage($pointId, $temperature, $threshold, $conditionType, false);
    $postResult = sendAlertNotification($setting, $message);

    if ($postResult["success"]) {
        $updateStmt->bind_param("i", $id);
        $updateStmt->execute();

        $historyMessage = $setting["notify_target"] === "email"
            ? $message . " email_send_result=success email_to=" . maskEmail($setting["webhook_url"])
            : $message;

        $historyStmt->bind_param(
            "isssdds",
            $id,
            $userId,
            $pointId,
            $alertType,
            $temperature,
            $threshold,
            $historyMessage
        );
        $historyStmt->execute();
        $notified++;

        $details[] = buildAlertDetail($setting, $temperature, "matched", [
            "status" => "notified",
            "temperature" => $temperature,
            "last_status" => $lastStatus,
            "alert_type" => $alertType,
            "email_to" => $setting["notify_target"] === "email" ? maskEmail($setting["webhook_url"]) : null,
            "email_send_result" => $postResult["email_send_result"],
            "email_error" => $postResult["email_error"],
            "history_saved" => true
        ]);
    } else {
        $failed++;

        $details[] = buildAlertDetail($setting, $temperature, "matched", [
            "status" => "notify_failed",
            "temperature" => $temperature,
            "last_status" => $lastStatus,
            "alert_type" => $alertType,
            "http_code" => $postResult["http_code"],
            "error" => $postResult["error"],
            "email_to" => $setting["notify_target"] === "email" ? maskEmail($setting["webhook_url"]) : null,
            "email_send_result" => $postResult["email_send_result"],
            "email_error" => $postResult["email_error"],
            "history_saved" => false
        ]);
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
