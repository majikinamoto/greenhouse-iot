<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/u-tech-next/lib/db.php';

$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}
function rejects(callable $callback, string $message): void
{
    try { $callback(); } catch (Throwable $error) { check(true, $message); return; }
    check(false, $message);
}

$date = '2026-12-31';
$payload = ['timezone' => 'Asia/Tokyo', 'utc_offset_seconds' => 32400,
    'hourly' => ['time' => UTechNext\expectedHours($date)], 'hourly_units' => []];
foreach (UTechNext\VARIABLES as $column => [$api, $unit]) {
    $payload['hourly_units'][$api] = $unit;
    $payload['hourly'][$api] = range(0, 24);
}
$rows = UTechNext\validateForecast($payload, $date);
check(count($rows) === 25 && $rows[24]['forecast_for'] === '2027-01-01 00:00:00', 'Year boundary');
check(UTechNext\expectedHours('2028-02-29')[24] === '2028-03-01T00:00', 'Leap-day boundary');
rejects(static function () { UTechNext\forecastDate('2026-02-30'); }, 'Invalid calendar date');
rejects(static function () { UTechNext\forecastDate('2026-1-01'); }, 'Noncanonical date');
$summary = UTechNext\summarize($rows);
check($summary['temperature_2m']['min'] === 0 && $summary['temperature_2m']['max'] === 23, 'Instant values exclude boundary');
check($summary['temperature_2m']['mean'] === 11.5, 'Instant sample mean');
check(abs($summary['shortwave_radiation']['sum'] - 1.08) < 0.000001, 'Radiation uses hours 1..24 and 0.0036');
check($summary['et0']['sum'] === 300 && $summary['precipitation']['sum'] === 300, 'Period values include boundary and exclude hour zero');
$withNull = $payload;
$withNull['hourly']['temperature_2m'][5] = null;
$withNull['hourly']['et0_fao_evapotranspiration'][24] = null;
$nullRows = UTechNext\validateForecast($withNull, $date);
check($nullRows[5]['temperature_2m'] === null, 'Null preserved, not zero');
$nullSummary = UTechNext\summarize($nullRows);
check($nullSummary['temperature_2m']['mean'] === null && !$nullSummary['temperature_2m']['complete'], 'Missing instant sample invalidates aggregate');
check($nullSummary['et0']['sum'] === null && $nullSummary['precipitation']['complete'], 'Boundary null invalidates only its own aggregate');
$zero = $payload;
$zero['hourly']['precipitation'] = array_fill(0, 25, 0);
check(UTechNext\summarize(UTechNext\validateForecast($zero, $date))['precipitation']['sum'] === 0, 'Zero remains valid');
foreach (['time', 'unit', 'length', 'string', 'infinite', 'timezone', 'offset', 'code'] as $case) {
    $bad = $payload;
    if ($case === 'time') $bad['hourly']['time'][5] = $bad['hourly']['time'][4];
    if ($case === 'unit') $bad['hourly_units']['wind_speed_10m'] = 'km/h';
    if ($case === 'length') array_pop($bad['hourly']['precipitation']);
    if ($case === 'string') $bad['hourly']['temperature_2m'][0] = '27';
    if ($case === 'infinite') $bad['hourly']['temperature_2m'][0] = INF;
    if ($case === 'timezone') $bad['timezone'] = 'UTC';
    if ($case === 'offset') $bad['utc_offset_seconds'] = 0;
    if ($case === 'code') $bad['hourly']['weather_code'][0] = 2.5;
    rejects(static function () use ($bad, $date) { UTechNext\validateForecast($bad, $date); }, "Reject $case");
}

// In-memory PDO doubles only; do not connect to any database.
class NextTestStatement extends PDOStatement
{
    public array $results = [];
    public array $inserts = [];
    public int $failAt = 0;
    public function execute(?array $params = null): bool
    {
        $this->inserts[] = $params;
        if ($this->failAt === count($this->inserts)) throw new RuntimeException('Simulated insert error');
        return true;
    }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array { return $this->results; }
}
class NextTestDb extends PDO
{
    public NextTestStatement $statement;
    public array $events = [];
    private bool $transaction = false;
    public function __construct() { $this->statement = new NextTestStatement(); }
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        check(strpos($query, 'UPDATE') === false && strpos($query, 'REPLACE') === false, 'No overwrite SQL');
        return $this->statement;
    }
    public function beginTransaction(): bool { $this->events[] = 'begin'; $this->transaction = true; return true; }
    public function commit(): bool { $this->events[] = 'commit'; $this->transaction = false; return true; }
    public function inTransaction(): bool { return $this->transaction; }
    public function rollBack(): bool { $this->events[] = 'rollback'; $this->transaction = false; return true; }
}
$batch = ['rows' => $rows, 'fetched_at' => '2026-12-30 18:15:04'];
$db = new NextTestDb();
UTechNext\saveForecast($db, 1, $date, $batch);
check(count($db->statement->inserts) === 25 && $db->events === ['begin','commit'], 'Atomic batch success');
check(count(array_unique(array_column($db->statement->inserts, 3))) === 1, 'Shared actual fetched time');
check($db->statement->inserts[24][1] === $date, 'Boundary belongs to selected forecast date');
$db = new NextTestDb(); $db->statement->failAt = 8;
rejects(static function () use ($db, $date, $batch) { UTechNext\saveForecast($db, 1, $date, $batch); }, 'Insert failure propagated');
check($db->events === ['begin','rollback'], 'Partial save rollback');
$db = new NextTestDb();
$db->statement->results = array_map(static function ($row) use ($batch) { return $row + ['fetched_at' => $batch['fetched_at']]; }, $rows);
check(count(UTechNext\savedRows($db, 1, $date)) === 25, 'Complete stored batch read');
$db->statement->results[24]['fetched_at'] = '2026-12-30 18:20:04';
rejects(static function () use ($db, $date) { UTechNext\savedRows($db, 1, $date); }, 'Mixed acquisition times rejected');
$db->statement->results[24]['fetched_at'] = $batch['fetched_at'];
array_pop($db->statement->results);
rejects(static function () use ($db, $date) { UTechNext\savedRows($db, 1, $date); }, 'Partial stored batch rejected');
fwrite(STDOUT, "Passed $checks checks; no DB or HTTP operations.\n");
