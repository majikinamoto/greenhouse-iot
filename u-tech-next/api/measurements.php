<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/db.php';
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
ini_set('display_errors', '0');
function measuredReply(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') measuredReply(['success'=>false,'message'=>'GETを使用してください。'],405);
try {
    $user = $_GET['user_id'] ?? '';
    if (!is_string($user) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/D', $user)) throw new InvalidArgumentException('user_idを指定してください。');
    $zone = new DateTimeZone('Asia/Tokyo');
    $now = new DateTimeImmutable('now', $zone);
    $dates = [];
    foreach (['start','end'] as $key) {
        $value = $_GET[$key] ?? ($key === 'start' ? $now->modify('-72 hours') : $now)->format('Y-m-d H:i:s');
        if (!is_string($value)) throw new InvalidArgumentException('日時が正しくありません。');
        $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, $zone);
        if (!$date || $date->format('Y-m-d H:i:s') !== $value) throw new InvalidArgumentException('日時が正しくありません。');
        $dates[$key] = $date;
    }
    if ($dates['end'] < $dates['start'] || $dates['end']->getTimestamp()-$dates['start']->getTimestamp() > 366*86400) throw new InvalidArgumentException('開始・終了日時を確認してください（最大366日）。');
} catch (InvalidArgumentException $e) {
    measuredReply(['success'=>false,'message'=>$e->getMessage()],400);
}
try {
    $db = UTechNext\connect();
    $stmt = $db->prepare("SELECT point_id, recorded_at, temperature, humidity, co2, solar_radiation, wind_speed_avg, wind_speed_max FROM measurements WHERE user_id=? AND point_id IN ('P01','P21','P31','P61') AND recorded_at>=? AND recorded_at<=? ORDER BY recorded_at, point_id");
    $stmt->execute([$user,$dates['start']->format('Y-m-d H:i:s'),$dates['end']->format('Y-m-d H:i:s')]);
    $rows=$stmt->fetchAll();
    foreach ($rows as &$row) foreach (['temperature','humidity','co2','solar_radiation','wind_speed_avg','wind_speed_max'] as $key) $row[$key]=$row[$key]===null?null:(float)$row[$key];
    unset($row);
    measuredReply(['success'=>true,'user_id'=>$user,'start'=>$dates['start']->format('Y-m-d H:i:s'),'end'=>$dates['end']->format('Y-m-d H:i:s'),'rows'=>$rows]);
} catch (Throwable $e) {
    error_log('Next measurements: '.$e->getMessage());
    measuredReply(['success'=>false,'message'=>'実測値を取得できません。DBの測定項目と接続設定を確認してください。'],503);
}
