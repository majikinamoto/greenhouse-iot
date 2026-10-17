<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}
require_once __DIR__ . '/lib/alert-diagnostics.php';

$report = [
    'mode' => 'diagnose', 'success' => false,
    'notifications_sent' => 0, 'database_writes' => 0,
    'checked_at' => date(DATE_ATOM), 'php_timezone' => date_default_timezone_get(),
    'transport_tested' => false, 'scheduler_tested' => false,
    'schema' => [], 'settings' => [],
    'notes' => [
        '現在の通常処理の判定を再現します。診断では設定・状態を変更しません。',
        'SMTP・Webhookへの接続、送信、cron設定の確認は行いません。',
        '測定日時と通知日時は通常処理と同じPHPタイムゾーンで解釈します。',
    ],
];
$db = null;
$stage = 'configuration';
try {
    if (!extension_loaded('mysqli')) throw new RuntimeException('mysqli extension missing');
    require dirname(__DIR__) . '/db_config.php';
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $stage = 'database_connection';
    $db = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);
    $db->set_charset('utf8mb4');
    // Fail closed if the server cannot enforce a read-only transaction.
    $db->begin_transaction(MYSQLI_TRANS_START_READ_ONLY);
    $stage = 'schema';
    $required = [
        'alert_settings' => ['id','user_id','point_id','sensor_type','temperature_threshold','condition_type',
            'notify_target','webhook_url','cooldown_minutes','enabled','last_notified_at','last_status','created_at'],
        'measurements' => ['user_id','point_id','temperature','recorded_at'],
        'alert_history' => ['setting_id','user_id','point_id','sensor_type','alert_type','value','threshold_value','message','notified_at'],
    ];
    $missing = false;
    foreach ($required as $table => $columns) {
        // Identifiers come exclusively from the fixed list above.
        try {
            $rows = $db->query('SHOW COLUMNS FROM `' . $table . '`')->fetch_all(MYSQLI_ASSOC);
            $absent = array_values(array_diff($columns, array_column($rows, 'Field')));
            $report['schema'][$table] = ['readable' => true, 'missing_columns' => $absent];
            if ($absent !== []) $missing = true;
        } catch (mysqli_sql_exception $error) {
            $report['schema'][$table] = ['readable' => false, 'error_code' => $error->getCode()];
            $missing = true;
        }
    }
    $report['database_clock'] = $db->query('SELECT NOW() AS db_now, @@session.time_zone AS session_timezone')->fetch_assoc();
    $report['smtp_config_present'] = is_file(dirname(__DIR__) . '/smtp_config.php');
    $report['curl_available'] = function_exists('curl_init');
    $report['openssl_available'] = extension_loaded('openssl');
    if (!$report['smtp_config_present']) $report['notes'][] = 'メール送信にはsmtp_config.phpが必要です。';
    if ($missing) {
        $report['notes'][] = '必要なDB構造が不足、または参照権限がありません。通知処理が停止する可能性があります。';
    }
    // SELECT * permits diagnosing even when optional/new setting columns are absent.
    if ($report['schema']['alert_settings']['readable'] && $report['schema']['measurements']['readable'] &&
        $report['schema']['measurements']['missing_columns'] === [] &&
        array_diff(['id','user_id','point_id','temperature_threshold','condition_type','notify_target','enabled'],
            array_column($db->query('SHOW COLUMNS FROM alert_settings')->fetch_all(MYSQLI_ASSOC), 'Field')) === []) {
        $stage = 'settings';
        $settings = $db->query('SELECT * FROM alert_settings ORDER BY id ASC');
        $latest = $db->prepare('SELECT temperature, recorded_at FROM measurements WHERE user_id = ? AND point_id = ? AND temperature IS NOT NULL ORDER BY recorded_at DESC LIMIT 1');
        $now = time();
        while ($setting = $settings->fetch_assoc()) {
            $user = $setting['user_id'];
            $point = $setting['point_id'] ?: 'P01';
            $latest->bind_param('ss', $user, $point);
            $latest->execute();
            $row = $latest->get_result()->fetch_assoc();
            $report['settings'][] = diagnoseAlertDecision($setting, $row ?: null, $now);
        }
        $latest->close();
    }
    $report['success'] = !$missing;
} catch (Throwable $error) {
    // Never print raw DB errors: they can contain host/user names and credentials.
    $report['error'] = ['stage' => $stage, 'code' => $error->getCode(),
        'message' => '診断を完了できませんでした。設定、PHP拡張、DB接続・参照権限を確認してください。'];
} finally {
    if ($db instanceof mysqli) {
        try { $db->rollback(); } catch (Throwable $ignored) {}
        $db->close();
    }
}
echo json_encode($report, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE) . PHP_EOL;
exit($report['success'] ? 0 : 1);
