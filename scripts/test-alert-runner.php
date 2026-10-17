<?php
declare(strict_types=1);

// Run the real runner against a fake DB and deliberately missing SMTP config.
// This reproduces delivery failure without network or real credentials.
$root = dirname(__DIR__);
$temp = sys_get_temp_dir() . '/utech-alert-test-' . bin2hex(random_bytes(6));
mkdir($temp . '/scripts/lib', 0777, true);
$files = [];
try {
    foreach (['check_alerts.php','scripts/lib/alert-rules.php'] as $name) {
        copy($root . '/' . $name, $temp . '/' . $name);
        $files[] = $temp . '/' . $name;
    }
    $fake = <<<'PHP'
<?php
define('DB_HOST', 'unused'); define('DB_USER', 'unused');
define('DB_PASS', 'unused'); define('DB_GREENHOUSE', 'unused');
class FakeResult {
    private $rows;
    function __construct($rows) { $this->rows = $rows; }
    function fetch_assoc() { return array_shift($this->rows); }
}
class FakeStatement {
    private $sql;
    function __construct($sql) { $this->sql = $sql; }
    function bind_param($types, &...$values) {}
    function execute() {
        if (!preg_match('/^\s*SELECT /', $this->sql)) {
            throw new RuntimeException('State/history write attempted after failed notification');
        }
    }
    function get_result() { return new FakeResult([['temperature'=>20]]); }
    function close() {}
}
class mysqli {
    public $connect_error = null;
    function __construct(...$args) {}
    function set_charset($value) {}
    function query($sql) {
        return new FakeResult([['id'=>1,'user_id'=>'test','point_id'=>'P01',
            'notify_target'=>'email','webhook_url'=>'recipient@example.com',
            'temperature_threshold'=>30,'condition_type'=>'above',
            'last_status'=>'alert','cooldown_minutes'=>180]]);
    }
    function prepare($sql) { return new FakeStatement($sql); }
    function close() {}
}
PHP;
    file_put_contents($temp . '/db_config.php', $fake);
    $files[] = $temp . '/db_config.php';
    $process = proc_open([PHP_BINARY, '-n', $temp . '/check_alerts.php'],
        [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes);
    if (!is_resource($process)) throw new RuntimeException('Cannot start runner test');
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($process);
    $result = json_decode($stdout, true, 512, JSON_THROW_ON_ERROR);
    if ($code !== 1 || $result['success'] !== false || $result['failed'] !== 1 ||
        $result['details'][0]['status'] !== 'recovery_notify_failed' ||
        $result['details'][0]['new_status'] !== 'alert' || $stderr !== '') {
        throw new RuntimeException('Recovery failure did not preserve retry state: ' . $stdout . $stderr);
    }
    echo "Passed real-runner recovery failure test: no DB writes, no delivery, alert state retained, nonzero failure exit.\n";
} finally {
    foreach ($files as $file) unlink($file);
    rmdir($temp . '/scripts/lib'); rmdir($temp . '/scripts'); rmdir($temp);
}
