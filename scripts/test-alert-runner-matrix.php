<?php
declare(strict_types=1);

// Exercise the unmodified runner. All DB and cURL calls are local test doubles;
// subprocesses use -n so no real mysqli/cURL extensions or credentials are loaded.
$root = dirname(__DIR__);
$temp = sys_get_temp_dir() . '/utech-alert-matrix-' . bin2hex(random_bytes(6));
mkdir($temp . '/scripts/lib', 0777, true);
$files = [];
function expectMatrix(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
try {
    foreach (['check_alerts.php', 'scripts/lib/alert-rules.php'] as $file) {
        copy($root . '/' . $file, $temp . '/' . $file);
        $files[] = $temp . '/' . $file;
    }
    $fake = <<<'PHP'
<?php
define('DB_HOST', 'unused'); define('DB_USER', 'unused');
define('DB_PASS', 'unused'); define('DB_GREENHOUSE', 'unused');
$scenario = json_decode(file_get_contents(__DIR__ . '/scenario.json'), true);
$events = ['writes' => [], 'deliveries' => []];
register_shutdown_function(function () {
    file_put_contents(__DIR__ . '/events.json', json_encode($GLOBALS['events']));
});
foreach (['CURLOPT_POST','CURLOPT_HTTPHEADER','CURLOPT_POSTFIELDS','CURLOPT_RETURNTRANSFER',
    'CURLOPT_TIMEOUT','CURLINFO_HTTP_CODE'] as $i => $constant) define($constant, $i + 1);
function curl_init($url) { return (object)['url' => $url, 'payload' => null]; }
function curl_setopt($ch, $option, $value) {
    if ($option === CURLOPT_POSTFIELDS) $ch->payload = json_decode($value, true);
    return true;
}
function curl_exec($ch) {
    $GLOBALS['events']['deliveries'][] = ['url' => $ch->url, 'payload' => $ch->payload];
    return '';
}
function curl_getinfo($ch, $option) { return $GLOBALS['scenario']['http_code'] ?? 204; }
function curl_error($ch) { return $GLOBALS['scenario']['curl_error'] ?? ''; }
function curl_close($ch) {}
class MatrixResult {
    function __construct(private array $rows) {}
    function fetch_assoc() { return array_shift($this->rows); }
}
class MatrixStatement {
    private array $values = [];
    function __construct(private string $sql) {}
    function bind_param($types, &...$values) { $this->values = &$values; }
    function execute() {
        if (!preg_match('/^\s*SELECT /', $this->sql)) {
            $GLOBALS['events']['writes'][] = ['sql' => $this->sql, 'values' => array_values($this->values)];
        }
    }
    function get_result() {
        if (!str_contains($this->sql, 'WHERE user_id = ?') || !str_contains($this->sql, 'AND point_id = ?')) {
            throw new RuntimeException('Measurement lookup lost user/point isolation');
        }
        $key = $this->values[0] . '/' . $this->values[1];
        $temperature = $GLOBALS['scenario']['temperatures'][$key] ?? null;
        return new MatrixResult($temperature === null ? [] : [['temperature' => $temperature]]);
    }
    function close() {}
}
class mysqli {
    public $connect_error = null;
    function __construct(...$args) {}
    function set_charset($value) {}
    function query($sql) {
        if (!str_contains($sql, 'WHERE enabled = 1') || !str_contains($sql, "notify_target IN ('discord', 'email')")) {
            throw new RuntimeException('Runner lost enabled/target filter');
        }
        return new MatrixResult(array_values(array_filter($GLOBALS['scenario']['settings'],
            fn($s) => $s['enabled'] === 1 && in_array($s['notify_target'], ['discord', 'email'], true))));
    }
    function prepare($sql) { return new MatrixStatement($sql); }
    function close() {}
}
PHP;
    file_put_contents($temp . '/db_config.php', $fake);
    $files[] = $temp . '/db_config.php';
    $files[] = $temp . '/scenario.json';
    $files[] = $temp . '/events.json';
    $base = ['id' => 8, 'user_id' => 'NS001', 'point_id' => 'P01', 'sensor_type' => 'temperature',
        'enabled' => 1, 'notify_target' => 'discord', 'webhook_url' => 'https://example.invalid/test-only',
        'temperature_threshold' => 29.8, 'condition_type' => 'above', 'cooldown_minutes' => 60,
        'last_status' => 'normal', 'last_notified_at' => null];
    $cases = [
        ['below threshold', [], 29.51, 'not_matched', 0, 0],
        ['equal threshold', [], 29.8, 'notified', 1, 2],
        ['above threshold', [], 30, 'notified', 1, 2],
        ['low threshold equality', ['condition_type' => 'below'], 29.8, 'notified', 1, 2],
        ['low threshold matched', ['condition_type' => 'below'], 29, 'notified', 1, 2],
        ['low threshold not matched', ['condition_type' => 'below'], 30, 'not_matched', 0, 0],
        ['cooldown active', ['last_status' => 'alert', 'last_notified_at' => date('Y-m-d H:i:s', time() - 1800)], 30, 'cooldown', 0, 0],
        ['cooldown elapsed', ['last_status' => 'alert', 'last_notified_at' => date('Y-m-d H:i:s', time() - 3660)], 30, 'notified', 1, 2],
        ['new incident ignores old cooldown', ['last_notified_at' => date('Y-m-d H:i:s')], 30, 'notified', 1, 2],
        ['high recovery', ['last_status' => 'alert'], 29.51, 'recovered', 1, 2],
        ['low recovery', ['last_status' => 'alert', 'condition_type' => 'below'], 30, 'recovered', 1, 2],
        ['no temperature', [], null, 'no_temperature', 0, 0],
        ['disabled', ['enabled' => 0], 30, null, 0, 0],
        ['unsupported LINE', ['notify_target' => 'line'], 30, null, 0, 0],
        ['Discord 404 alert', [], 30, 'notify_failed', 1, 0, ['http_code' => 404]],
        ['Discord 429 recovery', ['last_status' => 'alert'], 29, 'recovery_notify_failed', 1, 0, ['http_code' => 429]],
        ['Discord 500 alert', [], 30, 'notify_failed', 1, 0, ['http_code' => 500]],
        ['transport failure', [], 30, 'notify_failed', 1, 0, ['http_code' => 0, 'curl_error' => 'simulated timeout']],
    ];
    $run = static function (array $scenario) use ($temp): array {
        file_put_contents($temp . '/scenario.json', json_encode($scenario));
        $process = proc_open([PHP_BINARY, '-n', $temp . '/check_alerts.php'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Cannot start test runner');
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]); fclose($pipes[1]);
        $stderr = stream_get_contents($pipes[2]); fclose($pipes[2]);
        $exit = proc_close($process);
        expectMatrix($stderr === '', 'Unexpected runner stderr: ' . $stderr);
        return [json_decode($stdout, true, 512, JSON_THROW_ON_ERROR),
            json_decode(file_get_contents($temp . '/events.json'), true, 512, JSON_THROW_ON_ERROR), $exit];
    };
    foreach ($cases as [$name, $overrides, $temperature, $status, $deliveries, $writes]) {
        $index = array_search($name, array_column($cases, 0), true);
        [$result, $events, $exit] = $run(array_replace(['settings' => [array_replace($base, $overrides)],
            'temperatures' => ['NS001/P01' => $temperature]], $cases[$index][6] ?? []));
        expectMatrix(($result['details'][0]['status'] ?? null) === $status, $name . ': unexpected status');
        expectMatrix(count($events['deliveries']) === $deliveries, $name . ': unexpected delivery count');
        expectMatrix(count($events['writes']) === $writes, $name . ': unexpected DB writes');
        $failed = in_array($status, ['notify_failed', 'recovery_notify_failed'], true);
        expectMatrix($exit === ($failed ? 1 : 0) && $result['success'] === !$failed, $name . ': incorrect exit/success');
        expectMatrix($result['failed'] === ($failed ? 1 : 0), $name . ': incorrect failure count');
        expectMatrix($result['notified'] === ($writes === 2 ? 1 : 0), $name . ': incorrect success count');
        if ($writes === 2) {
            $history = $events['writes'][1]['values'];
            expectMatrix($history[0] === 8 && $history[1] === 'NS001' && $history[2] === 'P01', $name . ': incorrect history owner');
            expectMatrix((float)$history[4] === (float)$temperature && (float)$history[5] === 29.8, $name . ': incorrect history values');
            $message = $events['deliveries'][0]['payload']['content'];
            expectMatrix(str_contains($message, 'NS001 / P01') && str_contains($message, '日本時間'), $name . ': message lost identity/timezone');
        }
        echo 'PASS ' . $name . PHP_EOL;
    }
    // An old NS002 rule must never supply the measurement for NS001.
    $old = array_replace($base, ['id' => 10, 'user_id' => 'NS002', 'temperature_threshold' => 29.7]);
    [$result, $events] = $run(['settings' => [$base, $old], 'temperatures' => ['NS001/P01' => 29.51, 'NS002/P01' => 29.77]]);
    expectMatrix($result['checked'] === 2 && $result['notified'] === 1 && $result['details'][0]['status'] === 'not_matched', 'Two users were mixed');
    expectMatrix(count($events['deliveries']) === 1 && str_contains($events['deliveries'][0]['payload']['content'], 'NS002 / P01'), 'Wrong user notified');
    echo "PASS independent NS001/NS002 rules\n";
    $old['enabled'] = 0;
    [$result, $events] = $run(['settings' => [$base, $old], 'temperatures' => ['NS001/P01' => 29.51, 'NS002/P01' => 30]]);
    expectMatrix($result['checked'] === 1 && $events['deliveries'] === [] && $events['writes'] === [], 'Disabled NS002 still notified');
    echo "PASS disabled NS002 exclusion\n";
    echo 'Passed ' . (count($cases) + 2) . " real-runner scenarios; no network, real DB, or notifications.\n";
} finally {
    foreach ($files as $file) if (is_file($file)) unlink($file);
    rmdir($temp . '/scripts/lib'); rmdir($temp . '/scripts'); rmdir($temp);
}
