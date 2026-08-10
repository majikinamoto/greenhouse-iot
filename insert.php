<?php

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/api_config.php';

$received_api_key = $_SERVER['HTTP_X_API_KEY'] ?? '';

if ($received_api_key !== '') {
    if (!hash_equals(IOT_API_KEY, $received_api_key)) {
        http_response_code(403);
        echo "Forbidden";
        exit;
    }
} elseif (IOT_API_KEY_REQUIRED) {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

ini_set('display_errors', 1);
error_reporting(E_ALL);

// ===== DB接続 =====
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);

if ($conn->connect_error) {
    die("DB接続失敗: " . $conn->connect_error);
}

// ===== JSON受信 =====
$json = file_get_contents('php://input');

$data = json_decode($json, true);

if (!$data) {
    die("JSONデータが空、または解析できません");
}

// ===== データ取得 =====
$user_id  = isset($data["user_id"]) ? $data["user_id"] : null;
$point_id = isset($data["point_id"]) ? $data["point_id"] : "P01";

$temperature = isset($data["temperature"]) ? floatval($data["temperature"]) : null;
$humidity    = isset($data["humidity"]) ? floatval($data["humidity"]) : null;
$co2         = isset($data["co2"]) ? floatval($data["co2"]) : null;
$solar_radiation = isset($data["solar_radiation"]) ? floatval($data["solar_radiation"]) : null;
$voltage     = isset($data["voltage"]) ? floatval($data["voltage"]) : null;
$has_rainfall = array_key_exists("rainfall_cumulative", $data);
$has_rainfall_tip_count = array_key_exists("rainfall_tip_count", $data);

if (!$user_id) {
    die("user_idが必要です");
}

// 雨量を含まない既存データは、従来どおりDB側のrecorded_at既定値で保存する。
if (!$has_rainfall) {
    $sql = "INSERT INTO measurements
    (user_id, point_id, temperature, humidity, co2, solar_radiation, voltage)
    VALUES (?, ?, ?, ?, ?, ?, ?)";

    $stmt = $conn->prepare($sql);

    if (!$stmt) {
        die("SQLエラー: " . $conn->error);
    }

    // s=文字列, d=数値
    $stmt->bind_param(
        "ssddddd",
        $user_id,
        $point_id,
        $temperature,
        $humidity,
        $co2,
        $solar_radiation,
        $voltage
    );

    if ($stmt->execute()) {
        echo "OK";
    } else {
        echo "NG: " . $stmt->error;
    }

    $stmt->close();
    $conn->close();
    exit;
}

if (!is_numeric($data["rainfall_cumulative"])) {
    http_response_code(400);
    $conn->close();
    die("rainfall_cumulativeは数値で指定してください");
}

$rainfall_cumulative = round((float)$data["rainfall_cumulative"], 2);

if (!is_finite($rainfall_cumulative)) {
    http_response_code(400);
    $conn->close();
    die("rainfall_cumulativeは有限の数値で指定してください");
}

$rainfall_tip_count = null;

if ($has_rainfall_tip_count) {
    $validated_tip_count = filter_var(
        $data["rainfall_tip_count"],
        FILTER_VALIDATE_INT,
        ["options" => ["min_range" => 0, "max_range" => 4294967295]]
    );

    if (
        $validated_tip_count === false ||
        (!is_int($data["rainfall_tip_count"]) && !is_string($data["rainfall_tip_count"]))
    ) {
        http_response_code(400);
        $conn->close();
        die("rainfall_tip_countは0以上4294967295以下の整数で指定してください");
    }

    $rainfall_tip_count = $validated_tip_count;
}

$recorded_at = null;

if (array_key_exists("recorded_at", $data)) {
    if (!is_string($data["recorded_at"])) {
        http_response_code(400);
        $conn->close();
        die("recorded_atはYYYY-MM-DD HH:MM:SS形式で指定してください");
    }

    $recorded_at = trim($data["recorded_at"]);
    $recorded_date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $recorded_at);
    $recorded_errors = DateTimeImmutable::getLastErrors();

    if (
        !$recorded_date ||
        ($recorded_errors !== false &&
            ($recorded_errors['warning_count'] > 0 || $recorded_errors['error_count'] > 0)) ||
        $recorded_date->format('Y-m-d H:i:s') !== $recorded_at
    ) {
        http_response_code(400);
        $conn->close();
        die("recorded_atはYYYY-MM-DD HH:MM:SS形式で指定してください");
    }
}

$transaction_started = false;

try {
    if (!$conn->begin_transaction()) {
        throw new RuntimeException("トランザクションを開始できませんでした");
    }
    $transaction_started = true;

    // recorded_at省略時も、同一トランザクション内で確定したDB時刻を使用する。
    if ($recorded_at === null) {
        $time_result = $conn->query(
            "SELECT DATE_FORMAT(CURRENT_TIMESTAMP, '%Y-%m-%d %H:%i:%s') AS recorded_at"
        );

        if (!$time_result) {
            throw new RuntimeException("DB時刻を取得できませんでした: " . $conn->error);
        }

        $time_row = $time_result->fetch_assoc();
        $recorded_at = $time_row['recorded_at'];
        $time_result->free();
    }

    // 同一キーの行をロックして確認し、重複なら既存行を変更せず正常終了する。
    $duplicate_stmt = $conn->prepare(
        "SELECT 1
         FROM measurements
         WHERE user_id = ? AND point_id = ? AND recorded_at = ?
         LIMIT 1
         FOR UPDATE"
    );

    if (!$duplicate_stmt) {
        throw new RuntimeException("重複確認SQLエラー: " . $conn->error);
    }

    $duplicate_stmt->bind_param("sss", $user_id, $point_id, $recorded_at);

    if (!$duplicate_stmt->execute()) {
        throw new RuntimeException("重複確認エラー: " . $duplicate_stmt->error);
    }

    $duplicate_stmt->store_result();
    $is_duplicate = $duplicate_stmt->num_rows > 0;
    $duplicate_stmt->close();

    if ($is_duplicate) {
        $conn->commit();
        $conn->close();
        echo "OK";
        exit;
    }

    // 今回より新しい行があれば、過去時刻データとして差分を算出しない。
    $newer_stmt = $conn->prepare(
        "SELECT 1
         FROM measurements
         WHERE user_id = ? AND point_id = ? AND recorded_at > ?
         ORDER BY recorded_at ASC
         LIMIT 1
         FOR UPDATE"
    );

    if (!$newer_stmt) {
        throw new RuntimeException("新しい時刻の確認SQLエラー: " . $conn->error);
    }

    $newer_stmt->bind_param("sss", $user_id, $point_id, $recorded_at);

    if (!$newer_stmt->execute()) {
        throw new RuntimeException("新しい時刻の確認エラー: " . $newer_stmt->error);
    }

    $newer_stmt->store_result();
    $has_newer_measurement = $newer_stmt->num_rows > 0;
    $newer_stmt->close();

    $rainfall_interval = null;
    $rainfall_tip_interval = null;

    if (!$has_newer_measurement) {
        $previous_stmt = $conn->prepare(
            "SELECT rainfall_cumulative
             FROM measurements
             WHERE user_id = ?
               AND point_id = ?
               AND rainfall_cumulative IS NOT NULL
               AND recorded_at < ?
             ORDER BY recorded_at DESC
             LIMIT 1
             FOR UPDATE"
        );

        if (!$previous_stmt) {
            throw new RuntimeException("前回雨量取得SQLエラー: " . $conn->error);
        }

        $previous_stmt->bind_param("sss", $user_id, $point_id, $recorded_at);

        if (!$previous_stmt->execute()) {
            throw new RuntimeException("前回雨量取得エラー: " . $previous_stmt->error);
        }

        $previous_stmt->bind_result($previous_rainfall_cumulative);

        if ($previous_stmt->fetch()) {
            $previous_rainfall_cumulative = (float)$previous_rainfall_cumulative;
            $rainfall_interval = $rainfall_cumulative >= $previous_rainfall_cumulative
                ? round($rainfall_cumulative - $previous_rainfall_cumulative, 2)
                : $rainfall_cumulative;
        } else {
            $rainfall_interval = 0.00;
        }

        $previous_stmt->close();

        if ($has_rainfall_tip_count) {
            $previous_tip_stmt = $conn->prepare(
                "SELECT rainfall_tip_count
                 FROM measurements
                 WHERE user_id = ?
                   AND point_id = ?
                   AND rainfall_tip_count IS NOT NULL
                   AND recorded_at < ?
                 ORDER BY recorded_at DESC
                 LIMIT 1
                 FOR UPDATE"
            );

            if (!$previous_tip_stmt) {
                throw new RuntimeException("前回転倒ますカウント取得SQLエラー: " . $conn->error);
            }

            $previous_tip_stmt->bind_param("sss", $user_id, $point_id, $recorded_at);

            if (!$previous_tip_stmt->execute()) {
                throw new RuntimeException(
                    "前回転倒ますカウント取得エラー: " . $previous_tip_stmt->error
                );
            }

            $previous_tip_stmt->bind_result($previous_rainfall_tip_count);

            if ($previous_tip_stmt->fetch()) {
                $previous_rainfall_tip_count = (int)$previous_rainfall_tip_count;
                $rainfall_tip_interval = $rainfall_tip_count >= $previous_rainfall_tip_count
                    ? $rainfall_tip_count - $previous_rainfall_tip_count
                    : 0;
            }

            $previous_tip_stmt->close();
        }
    }

    $insert_stmt = $conn->prepare(
        "INSERT INTO measurements
         (user_id, point_id, temperature, humidity, co2, solar_radiation, voltage,
          rainfall_cumulative, rainfall_interval, rainfall_tip_count, rainfall_tip_interval,
          recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    if (!$insert_stmt) {
        throw new RuntimeException("SQLエラー: " . $conn->error);
    }

    $insert_stmt->bind_param(
        "ssdddddddiis",
        $user_id,
        $point_id,
        $temperature,
        $humidity,
        $co2,
        $solar_radiation,
        $voltage,
        $rainfall_cumulative,
        $rainfall_interval,
        $rainfall_tip_count,
        $rainfall_tip_interval,
        $recorded_at
    );

    if (!$insert_stmt->execute()) {
        throw new RuntimeException("INSERTエラー: " . $insert_stmt->error);
    }

    $insert_stmt->close();
    $conn->commit();
    $conn->close();
    echo "OK";
} catch (Throwable $error) {
    if ($transaction_started) {
        $conn->rollback();
    }

    $conn->close();
    http_response_code(500);
    echo "NG: " . $error->getMessage();
}

exit;

?>
