<?php
declare(strict_types=1);
namespace UTechNext;

const TRANSPIRATION_VERSION = 'staff-penman-hourly-v1';

function validateWaterSettings(array $settings): array
{
    $errors = [];
    $check = static function ($value, string $label, float $min, ?float $max = null, bool $integer = false) use (&$errors): void {
        if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || $value < $min || ($max !== null && $value > $max) || ($integer && floor($value) !== (float)$value)) {
            $errors[] = $label . 'を有効な数値で入力してください。';
        }
    };
    $check($settings['transmission_percent'] ?? null, '平均日射透過率（0〜100%）', 0, 100);
    $check($settings['wind_speed'] ?? null, 'ハウス内風速（0以上）', 0);
    $check($settings['cycles'] ?? null, 'かん水回数（1以上の整数）', 1, null, true);
    if (!isset($settings['trees']) || !is_array($settings['trees']) || count($settings['trees']) !== 6 || array_keys($settings['trees']) !== range(0, 5)) {
        $errors[] = 'No.1〜No.6の設定を入力してください。';
    } else {
        foreach ($settings['trees'] as $i => $tree) {
            $tree = is_array($tree) ? $tree : [];
            $check($tree['leaf_area'] ?? null, 'No.' . ($i + 1) . 'の葉面積（0より大きい値）', 0.000001);
            $check($tree['kc'] ?? null, 'No.' . ($i + 1) . 'のKc（0以上）', 0);
            $check($tree['flow'] ?? null, 'No.' . ($i + 1) . 'のノズル吐出量（0より大きい値）', 0.000001);
        }
    }
    if ($errors !== []) throw new \InvalidArgumentException(implode("\n", $errors));
    return ['transmission_percent' => $settings['transmission_percent'], 'wind_speed' => $settings['wind_speed'], 'cycles' => $settings['cycles'], 'trees' => array_map(static function ($tree) { return array_intersect_key($tree, array_flip(['leaf_area', 'kc', 'flow'])); }, $settings['trees'])];
}

// The staff workbook uses a radiation term in MJ/m²/day and an aerodynamic
// term in mm/day. Integrate the latter over one hour (1/24 day).
// Indoor wind is used directly; the outdoor measurement-height correction is omitted.
function hourlyPenman(?float $temperature, ?float $humidity, ?float $radiation, float $wind, float $transmission): ?float
{
    if ($temperature === null || $humidity === null || $radiation === null || $temperature <= -237.3 || $humidity < 0 || $humidity > 100) return null;
    $es = 6.1078 * exp(17.2694 * $temperature / ($temperature + 237.3));
    $delta = 0.4495 + 0.2721e-3 * $temperature + 0.9873e-3 * $temperature ** 2 + 0.2907e-5 * $temperature ** 3 + 0.2538e-6 * $temperature ** 4;
    $latent = 2.5 - 0.0024 * $temperature;
    if ($latent <= 0 || $delta + 0.66 <= 0) return null;
    $value = $delta / ($delta + 0.66) * $radiation * 0.0036 * $transmission / 100 / $latent
        + 0.66 / ($delta + 0.66) * 0.26 * (1 + 0.54 * $wind) * $es * (1 - $humidity / 100) / 24;
    return is_finite($value) ? max(0, $value) : null;
}

function calculateWaterDay(string $date, array $rows, ?array $settings): array
{
    $indexed = array_column($rows, null, 'forecast_for');
    $trees = [];
    for ($tree = 0; $tree < 6; $tree++) {
        $hours = []; $sum = 0.0; $complete = $settings !== null;
        for ($hour = 0; $hour < 24; $hour++) {
            $start = forecastDate($date)->modify("+$hour hours");
            $current = $indexed[$start->format('Y-m-d H:i:s')] ?? [];
            $next = $indexed[$start->modify('+1 hour')->format('Y-m-d H:i:s')] ?? [];
            // Instantaneous temperature/humidity at interval start; radiation at
            // interval end describes the same preceding hour, including 24:00.
            $et = $settings === null ? null : hourlyPenman($current['temperature_2m'] ?? null, $current['relative_humidity_2m'] ?? null, $next['shortwave_radiation'] ?? null, (float)$settings['wind_speed'], (float)$settings['transmission_percent']);
            $litres = $et === null ? null : $et * $settings['trees'][$tree]['kc'] * $settings['trees'][$tree]['leaf_area'];
            if ($litres !== null && !is_finite($litres)) $litres = null;
            if ($litres === null) $complete = false; else $sum += $litres;
            $hours[] = ['time' => $start->format('Y-m-d H:i:s'), 'litres' => $litres, 'cumulative' => $sum, 'cumulative_complete' => $complete];
        }
        $minutes = $complete ? $sum / $settings['trees'][$tree]['flow'] : null;
        $seconds = $minutes === null ? null : (int)round($minutes / $settings['cycles'] * 60);
        $trees[] = ['number' => $tree + 1, 'hours' => $hours, 'complete' => $complete, 'partial_litres' => $sum, 'daily_litres' => $complete ? $sum : null, 'daily_minutes' => $minutes, 'cycle_seconds' => $seconds];
    }
    return ['date' => $date, 'version' => TRANSPIRATION_VERSION, 'settings' => $settings, 'trees' => $trees];
}

function waterSettings(\PDO $db, int $locationId): ?array
{
    $query = $db->prepare('SELECT settings_json FROM next_water_settings WHERE location_id = ?');
    $query->execute([$locationId]);
    $raw = $query->fetchColumn();
    return $raw === false ? null : validateWaterSettings(json_decode($raw, true, 512, JSON_THROW_ON_ERROR));
}

function saveWaterSnapshot(\PDO $db, int $locationId, string $date, array $batch, ?array $settings): void
{
    $result = calculateWaterDay($date, $batch['rows'], $settings);
    $result['fetched_at'] = $batch['fetched_at'];
    $query = $db->prepare('INSERT INTO next_water_history (location_id, forecast_date, fetched_at, result_json) VALUES (?, ?, ?, ?)');
    $query->execute([$locationId, $date, $batch['fetched_at'], json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
}
