<?php
declare(strict_types=1);

namespace UTechNext;

require_once __DIR__ . '/forecast.php';
require_once __DIR__ . '/transpiration.php';

function connect(): \PDO
{
    require_once dirname(__DIR__, 2) . '/db_config.php';
    $db = new \PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_GREENHOUSE . ';charset=utf8mb4', DB_USER, DB_PASS, [
        \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
        \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
        \PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $db->exec("SET time_zone = '+09:00'");
    return $db;
}

function location(\PDO $db): array
{
    $stmt = $db->prepare('SELECT id, name, latitude, longitude, elevation, timezone, address FROM locations WHERE latitude = ? AND longitude = ? AND timezone = ?');
    $stmt->execute([LATITUDE, LONGITUDE, 'Asia/Tokyo']);
    $locations = $stmt->fetchAll();
    if (count($locations) !== 1) {
        throw new \RuntimeException('Expected exactly one configured representative location.');
    }
    return $locations[0];
}

function savedRows(\PDO $db, int $locationId, string $date): array
{
    $columns = implode(', ', array_keys(VARIABLES));
    $stmt = $db->prepare("SELECT forecast_for, fetched_at, $columns FROM forecasts WHERE location_id = ? AND model = ? AND forecast_date = ? ORDER BY forecast_for");
    $stmt->execute([$locationId, MODEL, $date]);
    $rows = $stmt->fetchAll();
    if ($rows !== []) {
        $expected = array_map(static function ($time) { return str_replace('T', ' ', $time) . ':00'; }, expectedHours($date));
        if (array_column($rows, 'forecast_for') !== $expected || count(array_unique(array_column($rows, 'fetched_at'))) !== 1) {
            throw new \RuntimeException('Stored forecast batch is incomplete or inconsistent.');
        }
    }
    foreach ($rows as &$row) {
        foreach (VARIABLES as $column => $definition) {
            $row[$column] = $row[$column] === null ? null : ($column === 'weather_code' ? (int)$row[$column] : (float)$row[$column]);
        }
    }
    unset($row);
    return $rows;
}

function saveForecast(\PDO $db, int $locationId, string $date, array $batch, ?array $settings = null, bool $withCorrection = false): void
{
    $columns = array_merge(['location_id', 'forecast_date', 'forecast_for', 'fetched_at', 'model'], array_keys(VARIABLES));
    $sql = 'INSERT INTO forecasts (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')';
    $db->beginTransaction();
    try {
        if ($withCorrection) {
            require_once __DIR__ . '/correction.php';
            $query=$db->prepare('SELECT settings_json FROM next_water_settings WHERE location_id=? FOR UPDATE');$query->execute([$locationId]);$raw=$query->fetchColumn();
            $settings=$raw===false?null:validateWaterSettings(json_decode($raw,true,512,JSON_THROW_ON_ERROR));
        }
        $stmt = $db->prepare($sql);
        foreach ($batch['rows'] as $row) {
            $values = [$locationId, $date, $row['forecast_for'], $batch['fetched_at'], MODEL];
            foreach (VARIABLES as $column => $definition) {
                $values[] = $row[$column];
            }
            $stmt->execute($values);
        }
        saveWaterSnapshot($db, $locationId, $date, $batch, $settings);
        if ($withCorrection) enqueueCorrection($db,$locationId,$date,$batch,$settings);
        $db->commit();
    } catch (\Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
}
