<?php
declare(strict_types=1);

require_once __DIR__ . '/alert-rules.php';

/** Mirror the current runner without sending notifications or updating state. */
function diagnoseAlertDecision(array $setting, ?array $latest, int $now): array
{
    $result = [
        'setting_id' => (int)$setting['id'],
        'user_id' => $setting['user_id'],
        'point_id' => $setting['point_id'] ?: 'P01',
        'notify_target' => $setting['notify_target'],
        'enabled' => (int)$setting['enabled'] === 1,
        'temperature' => $latest === null ? null : (float)$latest['temperature'],
        'recorded_at' => $latest['recorded_at'] ?? null,
        'threshold' => (float)$setting['temperature_threshold'],
        'condition_type' => $setting['condition_type'],
        'last_status' => $setting['last_status'] ?? 'normal',
        'last_notified_at' => $setting['last_notified_at'] ?? null,
        'warnings' => [],
    ];
    // Do not include webhook URLs, email addresses, or SMTP credentials.
    $destination = trim((string)($setting['webhook_url'] ?? ''));
    $result['destination_configured'] = $destination !== '';
    if ($destination === '') $result['warnings'][] = '通知先が未設定です。';
    if ($result['notify_target'] === 'email' && !filter_var($destination, FILTER_VALIDATE_EMAIL)) {
        $result['warnings'][] = '通知先メールアドレスの形式が不正です。';
    }
    if ($result['notify_target'] === 'discord' &&
        (!filter_var($destination, FILTER_VALIDATE_URL) || parse_url($destination, PHP_URL_SCHEME) !== 'https')) {
        $result['warnings'][] = 'Discord通知先のHTTPS URLを確認してください。';
    }
    if (!$result['enabled']) {
        $result['decision'] = 'disabled';
    } elseif (!in_array($result['notify_target'], ['discord', 'email'], true)) {
        $result['decision'] = 'unsupported_target';
        $result['warnings'][] = '現在の通知処理はDiscordとメールのみが対象です。';
    } elseif ($latest === null) {
        $result['decision'] = 'no_temperature';
    } else {
        $temperature = $result['temperature'];
        $threshold = $result['threshold'];
        $condition = $result['condition_type'];
        if (!in_array($condition, ['above', 'below'], true)) {
            $result['decision'] = 'invalid_condition';
            return $result;
        }
        $matched = alertTemperatureMatches($condition, $temperature, $threshold);
        $result['matched'] = $matched;
        $result['ui_matched'] = $condition === 'above' ? $temperature >= $threshold : $temperature <= $threshold;
        $recorded = strtotime((string)$result['recorded_at']);
        $result['measurement_age_seconds'] = $recorded === false ? null : $now - $recorded;
        if ($recorded === false || $now - $recorded > 3600 || $recorded > $now) {
            $result['warnings'][] = '測定日時を確認してください。現在の通知処理にはデータ鮮度の制限がありません。';
        }
        if (!$matched) {
            $result['decision'] = $result['last_status'] === 'alert' ? 'would_send_recovery' : 'not_matched';
        } else {
            $cooldown = isset($setting['cooldown_minutes']) && is_numeric($setting['cooldown_minutes'])
                ? (int)$setting['cooldown_minutes'] : 180;
            $last = $result['last_notified_at'] ? strtotime((string)$result['last_notified_at']) : false;
            $remaining = $result['last_status'] === 'alert' && $last !== false
                ? max(0, $cooldown * 60 - ($now - $last)) : 0;
            $result['cooldown_remaining_seconds'] = $remaining;
            $result['decision'] = $remaining > 0 ? 'cooldown' : 'would_send_alert';
        }
    }
    return $result;
}
