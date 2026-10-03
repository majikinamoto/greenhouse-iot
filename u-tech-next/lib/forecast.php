<?php
declare(strict_types=1);

namespace UTechNext;

const MODEL = 'jma_msm';
const LATITUDE = 26.110374;
const LONGITUDE = 127.686838;
const VARIABLES = [
    'temperature_2m' => ['temperature_2m', '°C'],
    'relative_humidity_2m' => ['relative_humidity_2m', '%'],
    'dew_point_2m' => ['dew_point_2m', '°C'],
    'vpd' => ['vapour_pressure_deficit', 'kPa'],
    'shortwave_radiation' => ['shortwave_radiation', 'W/m²'],
    'direct_radiation' => ['direct_radiation', 'W/m²'],
    'diffuse_radiation' => ['diffuse_radiation', 'W/m²'],
    'et0' => ['et0_fao_evapotranspiration', 'mm'],
    'wind_speed_10m' => ['wind_speed_10m', 'm/s'],
    'wind_direction_10m' => ['wind_direction_10m', '°'],
    'precipitation' => ['precipitation', 'mm'],
    'cloud_cover' => ['cloud_cover', '%'],
    'cloud_cover_low' => ['cloud_cover_low', '%'],
    'cloud_cover_mid' => ['cloud_cover_mid', '%'],
    'cloud_cover_high' => ['cloud_cover_high', '%'],
    'pressure_msl' => ['pressure_msl', 'hPa'],
    'surface_pressure' => ['surface_pressure', 'hPa'],
    'sunshine_duration' => ['sunshine_duration', 's'],
    'weather_code' => ['weather_code', 'wmo code'],
];

function tokyo(): \DateTimeZone
{
    return new \DateTimeZone('Asia/Tokyo');
}

function forecastDate(string $value): \DateTimeImmutable
{
    $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value, tokyo());
    if ($date === false || $date->format('Y-m-d') !== $value) {
        throw new \InvalidArgumentException('日付はYYYY-MM-DDで指定してください。');
    }
    return $date;
}

function expectedHours(string $date): array
{
    $start = forecastDate($date);
    $hours = [];
    for ($hour = 0; $hour <= 24; $hour++) {
        $hours[] = $start->modify("+$hour hours")->format('Y-m-d\TH:i');
    }
    return $hours;
}

// Keep the original API timestamps. Radiation is a preceding-hour mean;
// ET0, precipitation and sunshine duration are preceding-hour sums.
function validateForecast(array $payload, string $date): array
{
    if (($payload['timezone'] ?? null) !== 'Asia/Tokyo' ||
        ($payload['utc_offset_seconds'] ?? null) !== 32400 ||
        ($payload['hourly']['time'] ?? null) !== expectedHours($date)) {
        throw new \RuntimeException('Timezone or 25 hourly timestamps do not match.');
    }
    $rows = array_fill(0, 25, []);
    foreach (VARIABLES as $column => [$apiName, $unit]) {
        if (($payload['hourly_units'][$apiName] ?? null) !== $unit) {
            throw new \RuntimeException("Unexpected unit: $apiName");
        }
        $values = $payload['hourly'][$apiName] ?? null;
        if (!is_array($values) || array_keys($values) !== range(0, 24)) {
            throw new \RuntimeException("Invalid hourly array: $apiName");
        }
        foreach ($values as $index => $value) {
            if ($value !== null && ((!is_int($value) && !is_float($value)) || !is_finite((float)$value))) {
                throw new \RuntimeException("Invalid numeric value: $apiName");
            }
            if ($column === 'weather_code' && $value !== null &&
                ($value < 0 || $value > 65535 || floor((float)$value) !== (float)$value)) {
                throw new \RuntimeException('Invalid weather code.');
            }
            $rows[$index][$column] = $value;
        }
    }
    foreach (expectedHours($date) as $index => $time) {
        $rows[$index]['forecast_for'] = str_replace('T', ' ', $time) . ':00';
    }
    return $rows;
}

function summarize(array $rows): array
{
    $summary = [];
    foreach (['temperature_2m', 'relative_humidity_2m', 'vpd', 'wind_speed_10m'] as $column) {
        $values = array_column(array_slice($rows, 0, 24), $column);
        $complete = count($values) === 24 && !in_array(null, $values, true);
        $summary[$column] = [
            'complete' => $complete,
            'min' => $complete ? min($values) : null,
            'max' => $complete ? max($values) : null,
            'mean' => $complete ? array_sum($values) / 24 : null,
        ];
    }
    foreach (['shortwave_radiation' => 0.0036, 'et0' => 1, 'precipitation' => 1, 'sunshine_duration' => 1] as $column => $factor) {
        $values = array_column(array_slice($rows, 1, 24), $column);
        $complete = count($values) === 24 && !in_array(null, $values, true);
        $summary[$column] = ['complete' => $complete, 'sum' => $complete ? array_sum($values) * $factor : null];
    }
    return $summary;
}

function stateDirectory(): string
{
    $configured = getenv('UTECH_NEXT_STATE_DIR');
    $path = $configured !== false && $configured !== '' ? $configured : '/var/lib/utech-next';
    $resolved = realpath($path);
    if ($resolved === false || !is_dir($resolved)) {
        throw new \RuntimeException('Configure an existing UTECH_NEXT_STATE_DIR outside the web root.');
    }
    $webRoot = realpath(dirname(__DIR__, 2));
    $normalized = strtolower(str_replace('\\', '/', $resolved));
    $root = strtolower(str_replace('\\', '/', (string)$webRoot));
    if ($normalized === $root || strpos($normalized, $root . '/') === 0) {
        throw new \RuntimeException('State directory must be outside the web root.');
    }
    return $resolved;
}

function readStatus(string $date): string
{
    try {
        $raw = @file_get_contents(stateDirectory() . '/status-' . forecastDate($date)->format('Y-m-d') . '.json');
        $state = $raw === false ? null : json_decode($raw, true);
        $status = is_array($state) ? ($state['status'] ?? '') : '';
        return in_array($status, ['fetching', 'retrying', 'failed', 'saved'], true) ? $status : 'not_available';
    } catch (\Throwable $error) {
        return 'not_available';
    }
}
