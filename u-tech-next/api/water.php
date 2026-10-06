<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/db.php';
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
ini_set('display_errors', '0');
session_start(['cookie_httponly' => true, 'cookie_samesite' => 'Strict', 'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
$_SESSION['water_token'] = $_SESSION['water_token'] ?? bin2hex(random_bytes(32));
function waterJson(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit;
}
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'POST'], true)) { header('Allow: GET, POST'); waterJson(['success'=>false,'message'=>'GETまたはPOSTを使用してください。'],405); }
    $db = UTechNext\connect(); $location = UTechNext\location($db); $id = (int)$location['id'];
    if ($method === 'POST') {
        if (!hash_equals($_SESSION['water_token'], $_SERVER['HTTP_X_WATER_TOKEN'] ?? '')) waterJson(['success'=>false,'message'=>'画面を再読み込みしてください。'],403);
        $body = json_decode(file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($body)) throw new InvalidArgumentException('設定の形式が正しくありません。');
        $settings = UTechNext\validateWaterSettings($body['settings'] ?? []);
        $revision = $body['revision'] ?? null;
        if (!is_int($revision) || $revision < 0) throw new InvalidArgumentException('設定の版が正しくありません。');
        $now = (new DateTimeImmutable('now', UTechNext\tokyo()))->format('Y-m-d H:i:s');
        $raw = json_encode($settings, JSON_THROW_ON_ERROR);
        if ($revision === 0) {
            try { $stmt = $db->prepare('INSERT INTO next_water_settings (location_id, settings_json, revision, updated_at) VALUES (?, ?, 1, ?)'); $stmt->execute([$id,$raw,$now]); }
            catch (PDOException $error) { if ($error->getCode() !== '23000') throw $error; waterJson(['success'=>false,'message'=>'別の端末で設定が保存されました。再読み込みして確認してください。'],409); }
        } else {
            $stmt = $db->prepare('UPDATE next_water_settings SET settings_json = ?, revision = revision + 1, updated_at = ? WHERE location_id = ? AND revision = ?');
            $stmt->execute([$raw,$now,$id,$revision]);
            if ($stmt->rowCount() !== 1) waterJson(['success'=>false,'message'=>'別の端末で設定が変更されました。再読み込みして確認してください。'],409);
        }
        waterJson(['success'=>true,'settings'=>$settings,'revision'=>$revision+1]);
    }
    $stmt = $db->prepare('SELECT revision, updated_at FROM next_water_settings WHERE location_id = ?'); $stmt->execute([$id]); $metadata = $stmt->fetch();
    $settings = UTechNext\waterSettings($db,$id);
    $center = $_GET['center'] ?? null;
    if ($center === null) {
        $tomorrow = (new DateTimeImmutable('tomorrow', UTechNext\tokyo()))->format('Y-m-d');
        $stmt = $db->prepare('SELECT MAX(forecast_date) FROM forecasts WHERE location_id = ? AND model = ? AND forecast_date <= ?'); $stmt->execute([$id,UTechNext\MODEL,$tomorrow]);
        $latest = $stmt->fetchColumn() ?: (new DateTimeImmutable('today', UTechNext\tokyo()))->format('Y-m-d');
        $center = UTechNext\forecastDate($latest)->modify('-1 day')->format('Y-m-d');
    }
    if (!is_string($center)) throw new InvalidArgumentException('日付を指定してください。');
    $middle = UTechNext\forecastDate($center); $days = [];
    for ($offset = -1; $offset <= 1; $offset++) {
        $date = $middle->modify("$offset days")->format('Y-m-d');
        $stmt = $db->prepare('SELECT result_json FROM next_water_history WHERE location_id = ? AND forecast_date = ?'); $stmt->execute([$id,$date]); $raw = $stmt->fetchColumn();
        $days[] = ['date'=>$date,'forecast'=>UTechNext\savedRows($db,$id,$date),'snapshot'=>$raw === false ? null : json_decode($raw,true,512,JSON_THROW_ON_ERROR)];
    }
    waterJson(['success'=>true,'settings'=>$settings,'revision'=>$metadata ? (int)$metadata['revision'] : 0,'token'=>$_SESSION['water_token'],'center'=>$center,'days'=>$days]);
} catch (InvalidArgumentException | JsonException $error) { waterJson(['success'=>false,'message'=>$error->getMessage()],400); }
catch (Throwable $error) { error_log('Next water: '.$error->getMessage()); waterJson(['success'=>false,'message'=>'蒸散量データを読み込めません。DBの追加テーブルと設定を確認してください。'],503); }
