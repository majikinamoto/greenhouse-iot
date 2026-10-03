<?php
declare(strict_types=1);

namespace UTechNext;

require_once __DIR__ . '/forecast.php';

function fetchForecast(string $date): array
{
    if (!function_exists('curl_init')) {
        throw new \RuntimeException('PHP cURL extension is required.');
    }
    $hours = expectedHours($date);
    $query = http_build_query([
        'latitude' => LATITUDE,
        'longitude' => LONGITUDE,
        'models' => MODEL,
        'hourly' => implode(',', array_column(VARIABLES, 0)),
        'timezone' => 'Asia/Tokyo',
        'wind_speed_unit' => 'ms',
        'temperature_unit' => 'celsius',
        'precipitation_unit' => 'mm',
        'start_hour' => $hours[0],
        'end_hour' => $hours[24],
    ], '', '&', PHP_QUERY_RFC3986);
    $handle = curl_init('https://api.open-meteo.com/v1/forecast?' . $query);
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => 'U-Tech-Next/1.0',
    ]);
    try {
        $body = curl_exec($handle);
        $received = new \DateTimeImmutable('now', tokyo());
        $httpStatus = curl_getinfo($handle, CURLINFO_HTTP_CODE);
        if ($body === false || $httpStatus !== 200) {
            throw new \RuntimeException('Open-Meteo request failed: HTTP ' . $httpStatus . ' ' . curl_error($handle));
        }
        $payload = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($payload) || !empty($payload['error'])) {
            throw new \RuntimeException('Invalid Open-Meteo response.');
        }
        return ['rows' => validateForecast($payload, $date), 'fetched_at' => $received->format('Y-m-d H:i:s')];
    } finally {
        // CurlHandle is released automatically on PHP 8+ (curl_close is deprecated in 8.5).
        unset($handle);
    }
}
