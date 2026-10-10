<?php
declare(strict_types=1);
require_once __DIR__.'/auth.php';
header('Content-Type: application/json; charset=UTF-8');
function reply(array $body, int $status=200): void { http_response_code($status); echo json_encode($body, JSON_UNESCAPED_UNICODE); exit; }
if (!flowAuthorized()) reply(['message'=>'パスワードを入力してください。'],401);
session_write_close();
$user = $_GET['user_id'] ?? '';
if (!is_string($user) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/D',$user)) reply(['message'=>'user_idを確認してください。'],400);
$dates=[];
foreach (['start','end'] as $key) {
    $value=$_GET[$key] ?? '';
    if (!is_string($value)) reply(['message'=>'日時を確認してください。'],400);
    $date=DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',$value,new DateTimeZone('Asia/Tokyo'));
    if (!$date || $date->format('Y-m-d H:i:s')!==$value) reply(['message'=>'日時を確認してください。'],400);
    $dates[$key]=$date;
}
$span=$dates['end']->getTimestamp()-$dates['start']->getTimestamp();
if ($span<0 || $span>366*86400) reply(['message'=>'期間は開始から終了まで最大366日です。'],400);
try {
    require_once dirname(__DIR__).'/u-tech-next/lib/db.php';
    $stmt=UTechNext\connect()->prepare("SELECT point_id,recorded_at,wind_speed_avg,wind_speed_max FROM measurements WHERE user_id=? AND point_id IN ('P61','P62','P63','P64') AND recorded_at>=? AND recorded_at<=? ORDER BY recorded_at,point_id");
    $stmt->execute([$user,$dates['start']->format('Y-m-d H:i:s'),$dates['end']->format('Y-m-d H:i:s')]);
    reply(['rows'=>$stmt->fetchAll()]);
} catch (Throwable $e) { error_log('G-Flow: '.$e->getMessage()); reply(['message'=>'風速データを取得できませんでした。'],503); }
