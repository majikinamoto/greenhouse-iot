<?php

// === 通知の実行入口 ===
// CLI専用。引数なしは実送信・DB更新を伴う。--diagnoseは別の読み取り診断へ分岐する。
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        "success" => false,
        "error" => "Forbidden"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Dispatch before loading credentials or entering the notification runner.
if (count($argv) > 1) {
    if ($argv === [$argv[0], '--diagnose']) {
        require __DIR__ . '/scripts/diagnose-alerts.php';
        exit;
    }
    fwrite(STDERR, "Usage: php check_alerts.php [--diagnose]\n");
    exit(2);
}

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/scripts/lib/alert-rules.php';

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);

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

    return '=?UTF-8?B?' . base64_encode($value) . '?=';
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
    $body = alertSmtpData($body);

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

function alertNotificationDateTime() {
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:s') . '（日本時間）';
}

function buildTemperatureMessage($userId, $pointId, $temperature, $threshold, $conditionType, $isRecovery) {
    $dateTime = alertNotificationDateTime();
    $temperatureText = number_format($temperature, 1, ".", "") . "℃";
    $thresholdText = number_format($threshold, 1, ".", "") . "℃";

    if ($isRecovery) {
        $settingText = $conditionType === "above"
            ? $thresholdText . "未満"
            : $thresholdText . "超過";

        return "🟢 正常値に戻りました\n" .
            "確認日時：" . $dateTime . "\n" .
            "対象：" . $userId . " / " . $pointId . "\n" .
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
        "確認日時：" . $dateTime . "\n" .
        "対象：" . $userId . " / " . $pointId . "\n" .
        "現在値：" . $temperatureText . "\n" .
        "設定値：" . $settingText;
}

function buildRecoveryMessage($setting, $temperature, $threshold, $conditionType) {
    $dateTime = alertNotificationDateTime();
    $userId = $setting["user_id"];
    $pointId = $setting["point_id"] ?: "P01";
    $temperatureText = number_format($temperature, 1, ".", "") . "℃";
    $thresholdText = number_format($threshold, 1, ".", "") . "℃";
    $basisText = $conditionType === "above"
        ? $thresholdText . "未満"
        : $thresholdText . "超過";

    return "🟢 【U-Tech復帰通知】\n" .
        "ハウス環境が通常範囲に戻りました。\n\n" .
        "確認日時：" . $dateTime . "\n" .
        "対象：" . $userId . " / " . $pointId . "\n" .
        "項目：温度\n" .
        "現在値：" . $temperatureText . "\n" .
        "基準：" . $basisText . "\n\n" .
        "引き続き、状況を確認してください。";
}

// emailではwebhook_url列をメールアドレスとして使用し、それ以外はWebhookへ送る。
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

// 通常の通知対象は有効なDiscord・メール設定。LINEや無効設定はこの取得に含めない。
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

// 同じ利用者・Pointの非null温度を最新時刻から1件取得する。通常処理に測定値の鮮度制限はない。
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
$logs = [];

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

    if ($conditionType === "above" && alertTemperatureMatches($conditionType, $temperature, $threshold)) {
        $shouldNotify = true;
        $alertType = "temperature_high";
    } elseif ($conditionType === "below" && alertTemperatureMatches($conditionType, $temperature, $threshold)) {
        $shouldNotify = true;
        $alertType = "temperature_low";
    }

    // 条件外で前回alertなら復帰通知へ進む。復帰は下の再通知待ち時間の判定より先に処理する。
    // 復帰の送信成功後だけnormalへ更新して履歴を追加する。失敗ならalertを維持し次回再試行する。
    if (!$shouldNotify) {
        if ($lastStatus === "alert") {
            $alertType = $conditionType === "above"
                ? "temperature_high_recovery"
                : "temperature_low_recovery";
            $message = buildRecoveryMessage($setting, $temperature, $threshold, $conditionType);

            $postResult = sendAlertNotification($setting, $message);
            $logLine = "recovered: id=" . $id .
                " user_id=" . $userId .
                " point_id=" . $pointId .
                " current=" . number_format($temperature, 1, ".", "") .
                " threshold=" . number_format($threshold, 1, ".", "");

            if ($postResult["success"]) {
                // Preserve alert status on delivery failure so the next run retries.
                $normalStmt->bind_param("i", $id);
                $normalStmt->execute();
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
                $logs[] = $logLine;
                $details[] = buildAlertDetail($setting, $temperature, "not_matched", [
                    "status" => "recovered",
                    "temperature" => $temperature,
                    "last_status" => $lastStatus,
                    "new_status" => "normal",
                    "alert_type" => $alertType,
                    "email_to" => $setting["notify_target"] === "email" ? maskEmail($setting["webhook_url"]) : null,
                    "email_send_result" => $postResult["email_send_result"],
                    "email_error" => $postResult["email_error"],
                    "history_saved" => true,
                    "log" => $logLine
                ]);
            } else {
                $failed++;

                $details[] = buildAlertDetail($setting, $temperature, "not_matched", [
                    "status" => "recovery_notify_failed",
                    "temperature" => $temperature,
                    "last_status" => $lastStatus,
                    "new_status" => $lastStatus,
                    "alert_type" => $alertType,
                    "http_code" => $postResult["http_code"],
                    "error" => $postResult["error"],
                    "email_to" => $setting["notify_target"] === "email" ? maskEmail($setting["webhook_url"]) : null,
                    "email_send_result" => $postResult["email_send_result"],
                    "email_error" => $postResult["email_error"],
                    "history_saved" => false,
                    "log" => $logLine . " notify_failed"
                ]);
            }

            continue;
        }

        $details[] = buildAlertDetail($setting, $temperature, "not_matched", [
            "status" => "not_matched",
            "temperature" => $temperature,
            "last_status" => $lastStatus
        ]);
        continue;
    }

    // 待ち時間は前回alertかつ通知日時がある場合のみ適用する。設定が数値でなければ180分。
    // 保存APIの省略時既定30分とは別のフォールバック値。復帰後の再異常にはこの待ちを適用しない。
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

    // 異常通知は配送成功後に通知日時・alert状態を更新し履歴へ追加する。配送失敗では更新しない。
    // 配送とDB更新を一体のトランザクションにする実装ではない。
    $message = buildTemperatureMessage($userId, $pointId, $temperature, $threshold, $conditionType, false);
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
    "success" => $failed === 0,
    "checked" => $checked,
    "notified" => $notified,
    "failed" => $failed,
    "logs" => $logs,
    "details" => $details
], JSON_UNESCAPED_UNICODE);

$latestStmt->close();
$updateStmt->close();
$normalStmt->close();
$historyStmt->close();
$conn->close();
exit($failed > 0 ? 1 : 0);
