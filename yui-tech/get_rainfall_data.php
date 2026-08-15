<?php

declare(strict_types=1);

date_default_timezone_set('Asia/Tokyo');

$yuiDbConfig = __DIR__ . '/db_config.php';
$parentDbConfig = dirname(__DIR__) . '/db_config.php';
if (is_file($yuiDbConfig)) {
    require_once $yuiDbConfig;
} elseif (is_file($parentDbConfig)) {
    require_once $parentDbConfig;
} else {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'db_config.php が見つかりません';
    exit;
}

const RAINFALL_TIMEZONE = 'Asia/Tokyo';
const RAINFALL_POINT_ID = 'P41';
const RAINFALL_ALLOWED_DISPLAY_HOURS = [48, 72];

function sendRainfallJson(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function rainfallEpochMilliseconds(DateTimeInterface $date): int
{
    return ((int)$date->format('U')) * 1000;
}

function rainfallValueToHundredths($value): ?int
{
    if ($value === null || !is_numeric($value)) {
        return null;
    }

    return (int)round(((float)$value) * 100);
}

function rainfallHundredthsToNumber(?int $value): ?float
{
    return $value === null ? null : $value / 100;
}

function buildRainfallAggregation(
    array $rows,
    DateTimeImmutable $queryStart,
    DateTimeImmutable $displayStart,
    DateTimeImmutable $end,
    DateTimeZone $timezone,
    string $mode = 'rainfall',
    float $coefficient = 0.20
): array {
    $currentHour = $end->setTime(
        (int)$end->format('H'),
        0,
        0
    );
    $buckets = [];

    for ($cursor = $queryStart; $cursor <= $currentHour; $cursor = $cursor->modify('+1 hour')) {
        $key = $cursor->format('Y-m-d H');
        $buckets[$key] = [
            'start' => $cursor,
            'sample_count' => 0,
            'valid_interval_count' => 0,
            'rainfall_hundredths' => 0,
        ];
    }

    $dailyTotals = [];
    $displayStartDateKey = $displayStart->format('Y-m-d');
    $displayStartHundredths = 0;
    $displayStartValidCount = 0;
    $recordCount = 0;

    foreach ($rows as $row) {
        $recordedAt = DateTimeImmutable::createFromFormat(
            '!Y-m-d H:i:s',
            (string)($row['recorded_at'] ?? ''),
            $timezone
        );

        if (!$recordedAt || $recordedAt < $queryStart || $recordedAt > $end) {
            continue;
        }

        $bucketKey = $recordedAt->format('Y-m-d H');

        if (!isset($buckets[$bucketKey])) {
            continue;
        }

        $recordCount++;
        $buckets[$bucketKey]['sample_count']++;

        $rainfallValue = $mode === 'tip'
            ? $row['rainfall_tip_interval'] ?? null
            : $row['rainfall_interval'] ?? null;

        if ($mode === 'tip' && $rainfallValue !== null && is_numeric($rainfallValue)) {
            $rainfallValue = ((float)$rainfallValue) * $coefficient;
        }

        $rainfallHundredths = rainfallValueToHundredths($rainfallValue);

        if ($rainfallHundredths === null) {
            continue;
        }

        $buckets[$bucketKey]['valid_interval_count']++;
        $buckets[$bucketKey]['rainfall_hundredths'] += $rainfallHundredths;

        $dateKey = $recordedAt->format('Y-m-d');

        if (!isset($dailyTotals[$dateKey])) {
            $dailyTotals[$dateKey] = [
                'valid_interval_count' => 0,
                'rainfall_hundredths' => 0,
            ];
        }

        $dailyTotals[$dateKey]['valid_interval_count']++;
        $dailyTotals[$dateKey]['rainfall_hundredths'] += $rainfallHundredths;

        if ($dateKey === $displayStartDateKey && $recordedAt <= $displayStart) {
            $displayStartValidCount++;
            $displayStartHundredths += $rainfallHundredths;
        }
    }

    $hourly = [];
    $runningDateKey = null;
    $runningHundredths = 0;

    foreach ($buckets as $bucket) {
        /** @var DateTimeImmutable $hourStart */
        $hourStart = $bucket['start'];
        $dateKey = $hourStart->format('Y-m-d');

        if ($dateKey !== $runningDateKey) {
            $runningDateKey = $dateKey;
            $runningHundredths = 0;
        }

        $missing = $bucket['sample_count'] === 0 || $bucket['valid_interval_count'] === 0;
        $hourlyRainfall = null;
        $dailyCumulative = null;

        if (!$missing) {
            $runningHundredths += $bucket['rainfall_hundredths'];
            $hourlyRainfall = rainfallHundredthsToNumber($bucket['rainfall_hundredths']);
            $dailyCumulative = rainfallHundredthsToNumber($runningHundredths);
        }

        $hourEnd = $hourStart->setTime((int)$hourStart->format('H'), 59, 59);

        $hourly[] = [
            'hour_start' => $hourStart->format('Y-m-d H:i:s'),
            'hour_end' => $hourEnd->format('Y-m-d H:i:s'),
            'x' => rainfallEpochMilliseconds($hourStart),
            'date_key' => $dateKey,
            'sample_count' => $bucket['sample_count'],
            'valid_interval_count' => $bucket['valid_interval_count'],
            'hourly_rainfall' => $hourlyRainfall,
            'daily_cumulative' => $dailyCumulative,
            'missing' => $missing,
            'is_current_hour' => $hourStart == $currentHour,
        ];
    }

    $today = $end->setTime(0, 0, 0);
    $yesterday = $today->modify('-1 day');
    $dayBeforeYesterday = $today->modify('-2 days');

    $getDailyTotal = static function (string $dateKey) use ($dailyTotals): ?float {
        if (
            !isset($dailyTotals[$dateKey]) ||
            $dailyTotals[$dateKey]['valid_interval_count'] === 0
        ) {
            return null;
        }

        return rainfallHundredthsToNumber($dailyTotals[$dateKey]['rainfall_hundredths']);
    };

    return [
        'hourly' => $hourly,
        'daily_totals' => [
            'day_before_yesterday' => $getDailyTotal($dayBeforeYesterday->format('Y-m-d')),
            'yesterday' => $getDailyTotal($yesterday->format('Y-m-d')),
            'today' => $getDailyTotal($today->format('Y-m-d')),
        ],
        'display_start_date_key' => $displayStartDateKey,
        'display_start_daily_cumulative' => $displayStartValidCount > 0
            ? rainfallHundredthsToNumber($displayStartHundredths)
            : null,
        'record_count' => $recordCount,
        'has_data' => $recordCount > 0,
    ];
}

function runRainfallApi(): void
{
    ini_set('display_errors', '0');
    error_reporting(E_ALL);

    $userIdInput = $_GET['user_id'] ?? '';
    $pointIdInput = $_GET['point_id'] ?? RAINFALL_POINT_ID;
    $userId = is_string($userIdInput) ? trim($userIdInput) : '';
    $pointId = is_string($pointIdInput) ? trim($pointIdInput) : '';
    $displayHoursInput = $_GET['display_hours'] ?? '72';
    $modeInput = $_GET['mode'] ?? 'rainfall';
    $mode = is_string($modeInput) ? trim($modeInput) : '';
    $coefficientInput = $_GET['coefficient'] ?? '0.20';

    if (!preg_match('/\A[A-Za-z0-9][A-Za-z0-9_-]{0,63}\z/D', $userId)) {
        sendRainfallJson([
            'success' => false,
            'error' => 'user_idの形式が正しくありません',
        ], 400);
    }

    if ($pointId !== RAINFALL_POINT_ID) {
        sendRainfallJson([
            'success' => false,
            'error' => 'point_idはP41を指定してください',
        ], 400);
    }

    $displayHours = filter_var(
        $displayHoursInput,
        FILTER_VALIDATE_INT,
        ['options' => ['min_range' => 1, 'max_range' => 168]]
    );

    if ($displayHours === false || !in_array($displayHours, RAINFALL_ALLOWED_DISPLAY_HOURS, true)) {
        sendRainfallJson([
            'success' => false,
            'error' => 'display_hoursは48または72で指定してください',
        ], 400);
    }

    if (!in_array($mode, ['rainfall', 'tip'], true)) {
        sendRainfallJson([
            'success' => false,
            'error' => 'modeはrainfallまたはtipで指定してください',
        ], 400);
    }

    $coefficient = filter_var($coefficientInput, FILTER_VALIDATE_FLOAT);

    if (
        $mode === 'tip' &&
        ($coefficient === false || !is_finite((float)$coefficient) || (float)$coefficient <= 0)
    ) {
        sendRainfallJson([
            'success' => false,
            'error' => 'coefficientは0より大きい数値で指定してください',
        ], 400);
    }

    $coefficient = $coefficient === false ? 0.20 : (float)$coefficient;

    $timezone = new DateTimeZone(RAINFALL_TIMEZONE);
    $end = new DateTimeImmutable('now', $timezone);
    $displayStart = $end->modify('-' . $displayHours . ' hours');
    $queryStart = $displayStart->setTime(0, 0, 0);

    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conn = null;
    $stmt = null;

    try {
        $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);
        $conn->set_charset('utf8mb4');
        $conn->query("SET time_zone = '+09:00'");

        $sql = "SELECT
                    DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at,
                    rainfall_interval,
                    rainfall_tip_interval
                FROM measurements
                WHERE user_id = ?
                  AND point_id = ?
                  AND recorded_at >= ?
                  AND recorded_at <= ?
                ORDER BY recorded_at ASC";
        $stmt = $conn->prepare($sql);
        $queryStartSql = $queryStart->format('Y-m-d H:i:s');
        $endSql = $end->format('Y-m-d H:i:s');
        $stmt->bind_param('ssss', $userId, $pointId, $queryStartSql, $endSql);
        $stmt->execute();
        $result = $stmt->get_result();
        $rows = [];

        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }

        $aggregation = buildRainfallAggregation(
            $rows,
            $queryStart,
            $displayStart,
            $end,
            $timezone,
            $mode,
            $coefficient
        );

        $stmt->close();
        $conn->close();

        sendRainfallJson([
            'success' => true,
            'timezone' => RAINFALL_TIMEZONE,
            'user_id' => $userId,
            'point_id' => $pointId,
            'display_hours' => $displayHours,
            'mode' => $mode,
            'coefficient' => $coefficient,
            'display_start' => rainfallEpochMilliseconds($displayStart),
            'query_start' => rainfallEpochMilliseconds($queryStart),
            'end' => rainfallEpochMilliseconds($end),
            'display_start_date_key' => $aggregation['display_start_date_key'],
            'display_start_daily_cumulative' => $aggregation['display_start_daily_cumulative'],
            'record_count' => $aggregation['record_count'],
            'has_data' => $aggregation['has_data'],
            'hourly' => $aggregation['hourly'],
            'daily_totals' => $aggregation['daily_totals'],
        ]);
    } catch (Throwable $error) {
        if ($stmt instanceof mysqli_stmt) {
            $stmt->close();
        }
        if ($conn instanceof mysqli) {
            $conn->close();
        }

        error_log('Rainfall API error: ' . $error->getMessage());
        sendRainfallJson([
            'success' => false,
            'error' => '雨量データの取得に失敗しました',
        ], 500);
    }
}

if (!defined('RAINFALL_API_TEST_MODE')) {
    runRainfallApi();
}

