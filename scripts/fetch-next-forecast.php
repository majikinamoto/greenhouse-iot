<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}

require_once dirname(__DIR__) . '/u-tech-next/lib/db.php';
require_once dirname(__DIR__) . '/u-tech-next/lib/open_meteo.php';

function nextStatus(string $directory, string $date, string $status, int $attempt): void
{
    $path = $directory . '/status-' . $date . '.json';
    $temporary = $path . '.tmp';
    $body = json_encode(['status' => $status, 'attempt' => $attempt,
        'updated_at' => (new DateTimeImmutable('now', UTechNext\tokyo()))->format(DATE_ATOM)], JSON_THROW_ON_ERROR);
    if (file_put_contents($temporary, $body, LOCK_EX) === false || !rename($temporary, $path)) {
        throw new RuntimeException('Cannot write forecast status.');
    }
}

$date = (new DateTimeImmutable('tomorrow', UTechNext\tokyo()))->format('Y-m-d');
$lock = null;
$settingsCaptured = false;
$settings = null;
try {
    if ($argc !== 1) {
        throw new RuntimeException('This command takes no arguments; target is tomorrow in JST.');
    }
    $directory = UTechNext\stateDirectory();
    $lock = fopen($directory . '/fetch.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        throw new RuntimeException('Another forecast fetch is running, or lock is unavailable.');
    }
    for ($attempt = 1; $attempt <= 6; $attempt++) {
        $started = microtime(true);
        try {
            // Reconnect each attempt, including after ambiguous commit failures.
            $db = UTechNext\connect();
            $location = UTechNext\location($db);
            if (!$settingsCaptured) {
                $settings = UTechNext\waterSettings($db, (int)$location['id']);
                $settingsCaptured = true;
            }
            if (UTechNext\savedRows($db, (int)$location['id'], $date) !== []) {
                nextStatus($directory, $date, 'saved', $attempt);
                fwrite(STDOUT, "Forecast already saved for $date; no API request made.\n");
                exit(0);
            }
            nextStatus($directory, $date, 'fetching', $attempt);
            $batch = UTechNext\fetchForecast($date);
            UTechNext\saveForecast($db, (int)$location['id'], $date, $batch, $settings);
            nextStatus($directory, $date, 'saved', $attempt);
            fwrite(STDOUT, "Saved 25 rows for $date; fetched at {$batch['fetched_at']} JST.\n");
            exit(0);
        } catch (Throwable $error) {
            fwrite(STDERR, (new DateTimeImmutable('now', UTechNext\tokyo()))->format(DATE_ATOM) . " target=$date attempt=$attempt " . $error->getMessage() . "\n");
            $db = null;
            nextStatus($directory, $date, $attempt < 6 ? 'retrying' : 'failed', $attempt);
            if ($attempt < 6) {
                // Five minutes between attempt starts, rather than adding request time.
                usleep((int) max(0, (300 - (microtime(true) - $started)) * 1000000));
            }
        }
    }
    exit(1);
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
} finally {
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
