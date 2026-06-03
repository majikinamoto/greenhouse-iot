<?php

header('Content-Type: application/json; charset=UTF-8');

function send_json($payload, $status_code = 200) {
    http_response_code($status_code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function fetch_url($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        $body = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($body !== false && $httpCode >= 200 && $httpCode < 300) {
            return [$body, ""];
        }

        return [null, $error ?: "HTTP " . $httpCode];
    }

    if (!in_array("https", stream_get_wrappers(), true)) {
        return [null, "PHP https wrapper unavailable"];
    }

    $context = stream_context_create([
        "http" => [
            "timeout" => 10,
            "header" => "User-Agent: U-Tech Greenhouse Monitor\r\n"
        ],
        "ssl" => [
            "verify_peer" => false,
            "verify_peer_name" => false
        ]
    ]);
    $body = @file_get_contents($url, false, $context);

    return $body === false ? [null, "fetch failed"] : [$body, ""];
}

function format_tide_time($value) {
    $value = str_pad((string)$value, 4, " ", STR_PAD_LEFT);
    if (trim($value) === "" || trim($value) === "9999") {
        return null;
    }

    $hour = trim(substr($value, 0, 2));
    $minute = trim(substr($value, 2, 2));

    if ($hour === "" || $minute === "" || !is_numeric($hour) || !is_numeric($minute)) {
        return null;
    }

    $hour = (int)$hour;
    $minute = (int)$minute;

    if ($hour < 0 || $hour > 23 || $minute < 0 || $minute > 59) {
        return null;
    }

    return sprintf("%02d:%02d", $hour, $minute);
}

function parse_tide_items($text) {
    $items = [];

    for ($i = 0; $i < 4; $i++) {
        $chunk = substr($text, $i * 7, 7);
        if (strlen($chunk) < 7) {
            continue;
        }

        $time = format_tide_time(substr($chunk, 0, 4));
        $level = trim(substr($chunk, 4, 3));

        if ($time === null || $level === "999") {
            continue;
        }

        $items[] = [
            "time" => $time,
            "level_cm" => is_numeric($level) ? (int)$level : null
        ];
    }

    return $items;
}

try {
    $timezone = new DateTimeZone("Asia/Tokyo");
    $dateText = isset($_GET["date"]) ? trim((string)$_GET["date"]) : "";
    $date = $dateText !== ""
        ? new DateTime($dateText, $timezone)
        : new DateTime("now", $timezone);

    $year = (int)$date->format("Y");
    $month = (int)$date->format("n");
    $day = (int)$date->format("j");
    $year2 = (int)$date->format("y");

    $cacheDir = __DIR__ . "/cache";
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0775, true);
    }

    $cacheFile = $cacheDir . "/jma_tide_NH_" . $year . ".txt";
    $body = null;

    if (is_file($cacheFile) && time() - filemtime($cacheFile) < 30 * 24 * 60 * 60) {
        $body = file_get_contents($cacheFile);
    } else {
        $url = "https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/" . $year . "/NH.txt";
        [$body, $error] = fetch_url($url);

        if ($body === null) {
            if (is_file($cacheFile)) {
                $body = file_get_contents($cacheFile);
            } else {
                send_json([
                    "success" => false,
                    "error" => $error ?: "気象庁潮位表データを取得できません"
                ], 502);
            }
        } else {
            @file_put_contents($cacheFile, $body);
        }
    }

    $line = null;
    foreach (preg_split("/\r\n|\r|\n/", (string)$body) as $row) {
        if (strlen($row) < 136) {
            continue;
        }

        $rowYear = (int)trim(substr($row, 72, 2));
        $rowMonth = (int)trim(substr($row, 74, 2));
        $rowDay = (int)trim(substr($row, 76, 2));
        $station = trim(substr($row, 78, 2));

        if ($rowYear === $year2 && $rowMonth === $month && $rowDay === $day && $station === "NH") {
            $line = $row;
            break;
        }
    }

    if ($line === null) {
        send_json([
            "success" => false,
            "error" => "指定日の那覇潮位表データが見つかりません"
        ], 404);
    }

    send_json([
        "success" => true,
        "station" => "NH",
        "station_name" => "那覇",
        "date" => $date->format("Y-m-d"),
        "high_tides" => parse_tide_items(substr($line, 80, 28)),
        "low_tides" => parse_tide_items(substr($line, 108, 28)),
        "source" => "気象庁潮位表データ"
    ]);

} catch (Throwable $e) {
    send_json([
        "success" => false,
        "error" => "潮汐情報を取得できません"
    ], 500);
}
