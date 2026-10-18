<?php
declare(strict_types=1);

// Local HTTP integration test of the real endpoint, using a fake mysqli class.
// -n prevents real database extensions; credentials and production are not used.
$temp = sys_get_temp_dir() . '/utech-disable-test-' . bin2hex(random_bytes(6));
mkdir($temp);
$server = null;
$lock = null;
function checkDisable(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
try {
    copy(dirname(__DIR__) . '/disable_all_alerts.php', $temp . '/disable_all_alerts.php');
    file_put_contents($temp . '/db_config.php', <<<'PHP'
<?php
define('DB_HOST','unused'); define('DB_USER','unused'); define('DB_PASS','unused'); define('DB_GREENHOUSE','unused');
define('MYSQLI_REPORT_ERROR',1); define('MYSQLI_REPORT_STRICT',2);
function mysqli_report($flags) {}
class mysqli {
    public int $affected_rows = 0;
    function __construct(...$args) {}
    function set_charset($charset) {}
    function prepare($sql) {
        if ($sql !== 'UPDATE alert_settings SET enabled = 0 WHERE user_id = ? AND enabled = 1') throw new RuntimeException('Unexpected SQL');
        return new DisableStatement();
    }
    function close() {}
}
class DisableStatement {
    public int $affected_rows = 0;
    private string $userId;
    function bind_param($types, &$userId) {
        if ($types !== 's') throw new RuntimeException('Unexpected parameter type');
        $this->userId = $userId;
    }
    function execute() {
        if (is_file(__DIR__ . '/fail')) throw new RuntimeException('SECRET database failure');
        $rows = json_decode(file_get_contents(__DIR__ . '/rows.json'), true);
        foreach ($rows as &$row) {
            if ($row['user_id'] === $this->userId && $row['enabled'] === 1) { $row['enabled'] = 0; $this->affected_rows++; }
        }
        file_put_contents(__DIR__ . '/rows.json', json_encode($rows));
    }
    function close() {}
}
PHP);
    $rows = [
        ['user_id'=>'NS001','point_id'=>'P01','enabled'=>1,'threshold'=>28,'webhook'=>'keep-a'],
        ['user_id'=>'NS002','point_id'=>'P11','enabled'=>1,'threshold'=>29.7,'webhook'=>'keep-b'],
        ['user_id'=>'TEST001','point_id'=>'P01','enabled'=>0,'threshold'=>35,'webhook'=>'keep-c'],
        ['user_id'=>'NS001','point_id'=>'P11','enabled'=>1,'threshold'=>32,'webhook'=>'keep-d'],
    ];
    file_put_contents($temp . '/rows.json', json_encode($rows));
    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    if ($socket === false) throw new RuntimeException('Cannot reserve test port');
    $address = stream_socket_get_name($socket, false); fclose($socket);
    $server = proc_open([PHP_BINARY,'-n','-S',$address,'-t',$temp],
        [0=>['pipe','r'],1=>['file',$temp . '/server.log','a'],2=>['file',$temp . '/server.log','a']], $pipes);
    if (!is_resource($server)) throw new RuntimeException('Cannot start test server');
    fclose($pipes[0]);
    $ready = false;
    for ($i=0; $i<40; $i++) {
        $connection = @stream_socket_client('tcp://' . $address, $errno, $error, .1);
        if ($connection !== false) { fclose($connection); $ready=true; break; }
        usleep(50000);
    }
    checkDisable($ready, 'Test server did not start');
    $request = static function (string $method, string $body, string $type='application/json', ?string $origin=null) use ($address): array {
        $context = stream_context_create(['http'=>['method'=>$method,'ignore_errors'=>true,'timeout'=>5,
            'header'=>"Content-Type: $type\r\nOrigin: " . ($origin ?? 'http://' . $address) . "\r\n",'content'=>$body]]);
        $text = file_get_contents('http://' . $address . '/disable_all_alerts.php',false,$context);
        $headers = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : ($http_response_header ?? []);
        preg_match('/\s(\d{3})\s/', $headers[0] ?? '', $match);
        return [(int)($match[1] ?? 0),json_decode($text, true,512,JSON_THROW_ON_ERROR)];
    };
    $valid = '{"scope":"user","user_id":" NS001 ","confirmed":true}';
    foreach ([['GET',$valid,'application/json',null,405],
        ['POST',$valid,'text/plain',null,415],
        ['POST','{}','application/json',null,400],
        ['POST','{"scope":"all","confirmed":"true"}','application/json',null,400],
        ['POST','{"scope":"all","confirmed":true}','application/json',null,400],
        ['POST','{"scope":"all","user_id":"NS001","confirmed":true}','application/json',null,400],
        ['POST','{"scope":"user","confirmed":true}','application/json',null,400],
        ['POST','{"scope":"user","user_id":"  ","confirmed":true}','application/json',null,400],
        ['POST','{"scope":"user","user_id":[],"confirmed":true}','application/json',null,400],
        ['POST','{"scope":"user","user_id":"NS001","confirmed":"true"}','application/json',null,400],
        ['POST','invalid json','application/json',null,400],
        ['POST',$valid,'application/json','https://other.invalid',403]] as [$method,$body,$type,$origin,$expected]) {
        [$status,$result] = $request($method,$body,$type,$origin);
        checkDisable($status===$expected && $result['success']===false,'Invalid request was accepted');
        checkDisable(json_decode(file_get_contents($temp . '/rows.json'),true)===$rows,'Rejected request changed settings');
    }
    echo "PASS method, JSON, explicit confirmation, malformed input, cross-origin guards\n";
    $lock = fopen(sys_get_temp_dir() . '/utech-alerts.lock','c');
    checkDisable(flock($lock,LOCK_EX | LOCK_NB),'Cannot acquire test lock');
    [$status,$result] = $request('POST',$valid);
    checkDisable($status===409 && $result['success']===false,'Running notification batch was not protected');
    checkDisable(json_decode(file_get_contents($temp . '/rows.json'),true)===$rows,'Busy request changed settings');
    flock($lock,LOCK_UN); fclose($lock); $lock=null;
    echo "PASS cron lock conflict leaves rules unchanged\n";
    [$status,$result] = $request('POST',$valid);
    checkDisable($status===200 && $result['success']===true && $result['disabled_count']===2,'Incorrect disable result');
    checkDisable($result['user_id']==='NS001','Response target differs from request');
    $expected = array_map(static function($row){if ($row['user_id']==='NS001') $row['enabled']=0; return $row;},$rows);
    checkDisable(json_decode(file_get_contents($temp . '/rows.json'),true)===$expected,'Other users or existing settings changed, or a target point was not disabled');
    [$status,$result] = $request('POST','{"scope":"user","user_id":"unknown","confirmed":true}');
    checkDisable($status===200 && $result['disabled_count']===0,'Unknown user affected settings');
    checkDisable(json_decode(file_get_contents($temp . '/rows.json'),true)===$expected,'Unknown user changed settings');
    [$status,$result] = $request('POST',$valid);
    checkDisable($status===200 && $result['disabled_count']===0,'Repeated disable was not idempotent');
    echo "PASS target user points disabled, other users and settings retained, unknown/repeated request returns zero\n";
    file_put_contents($temp . '/fail','1');
    [$status,$result] = $request('POST',$valid);
    checkDisable($status===500 && $result['success']===false && !str_contains(json_encode($result),'SECRET'),'DB failure was hidden or leaked details');
    echo "PASS database error response\n";
} finally {
    if (is_resource($lock)) { flock($lock,LOCK_UN); fclose($lock); }
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    foreach (['disable_all_alerts.php','db_config.php','rows.json','server.log','fail'] as $name) {
        if (is_file($temp . '/' . $name)) unlink($temp . '/' . $name);
    }
    rmdir($temp);
}
