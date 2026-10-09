<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/lib/correction.php';
header('Content-Type: application/json; charset=UTF-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');ini_set('display_errors','0');
session_start(['cookie_httponly'=>true,'cookie_samesite'=>'Strict','cookie_secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off']);
$_SESSION['correction_token']=$_SESSION['correction_token']??bin2hex(random_bytes(32));
function correctionReply(array $data,int $status=200): void {http_response_code($status);echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;}
function correctionHistory(PDO $db,int $id,string $date): ?array {$stmt=$db->prepare('SELECT result_json FROM next_water_correction_history WHERE location_id=? AND forecast_date=?');$stmt->execute([$id,$date]);$raw=$stmt->fetchColumn();return $raw===false?null:json_decode($raw,true,512,JSON_THROW_ON_ERROR);}
try{
    $method=$_SERVER['REQUEST_METHOD']??'GET';if(!in_array($method,['GET','POST'],true)){header('Allow: GET, POST');correctionReply(['success'=>false,'message'=>'GETまたはPOSTを使用してください。'],405);}
    $db=UTechNext\connect();$location=UTechNext\location($db);$id=(int)$location['id'];$now=(new DateTimeImmutable('now',UTechNext\tokyo()))->format('Y-m-d H:i:s');$tomorrow=(new DateTimeImmutable('tomorrow',UTechNext\tokyo()))->format('Y-m-d');
    $latest=$db->prepare('SELECT MAX(forecast_date) FROM forecasts WHERE location_id=? AND model=? AND forecast_date<=?');$latest->execute([$id,UTechNext\MODEL,$tomorrow]);$latestDate=$latest->fetchColumn()?:null;$trialDate=$latestDate===$tomorrow?$tomorrow:null;
    if($method==='POST'){
        if(!hash_equals($_SESSION['correction_token'],$_SERVER['HTTP_X_CORRECTION_TOKEN']??''))correctionReply(['success'=>false,'message'=>'画面を再読み込みしてください。'],403);
        $body=json_decode(file_get_contents('php://input'),true,512,JSON_THROW_ON_ERROR);if(!is_array($body))throw new InvalidArgumentException('設定の形式を確認してください。');$config=UTechNext\validateCorrectionSettings($body['settings']??[]);
        if(($body['action']??'save')==='save'){
            $revision=$body['revision']??null;if(!is_int($revision)||$revision<0)throw new InvalidArgumentException('設定の版を確認してください。');
            if($revision===0){try{$stmt=$db->prepare('INSERT INTO next_water_correction_settings (location_id,source_user_id,comparison_days,revision,updated_at) VALUES (?,?,?,1,?)');$stmt->execute([$id,$config['source_user_id'],$config['comparison_days'],$now]);}catch(PDOException $error){if($error->getCode()!=='23000')throw $error;correctionReply(['success'=>false,'message'=>'別の端末で設定が変更されました。再読み込みして確認してください。'],409);}}
            else{$stmt=$db->prepare('UPDATE next_water_correction_settings SET source_user_id=?,comparison_days=?,revision=revision+1,updated_at=? WHERE location_id=? AND revision=?');$stmt->execute([$config['source_user_id'],$config['comparison_days'],$now,$id,$revision]);if($stmt->rowCount()!==1)correctionReply(['success'=>false,'message'=>'別の端末で設定が変更されました。再読み込みして確認してください。'],409);}
            correctionReply(['success'=>true,'settings'=>$config+['revision'=>$revision+1,'updated_at'=>$now]]);
        }
        if($body['action']!=='trial')throw new InvalidArgumentException('操作を確認してください。');
        $date=$body['date']??null;if(!is_string($date)||$date!==$trialDate)throw new InvalidArgumentException('試算は今回取得した翌日の予報のみ利用できます。');
        $water=$body['water_settings']??null;if($water!==null)$water=UTechNext\validateWaterSettings($water);
        $rows=UTechNext\savedRows($db,$id,$date);$context=['date'=>$date,'location_id'=>$id,'forecast_fetched_at'=>$rows[0]['fetched_at'],'measurement_cutoff'=>$now,'forecast_rows'=>$rows,'correction_settings'=>$config+['revision'=>null],'water_settings'=>$water,'water_revision'=>null];
        [$forecasts,$measurements]=UTechNext\correctionEvidence($db,$id,$config,$now);$result=UTechNext\correctionResult($context,$forecasts,$measurements,$config['source_user_id']===null?'source_unset':'success');$result['output_type']='試算';
        correctionReply(['success'=>true,'result'=>$result]);
    }
    if(isset($_GET['start'])||isset($_GET['end'])){
        $start=$_GET['start']??null;$end=$_GET['end']??null;if(!is_string($start)||!is_string($end))throw new InvalidArgumentException('開始日と終了日を指定してください。');$from=UTechNext\forecastDate($start);$to=UTechNext\forecastDate($end);$count=(int)$from->diff($to)->format('%r%a')+1;if($count<1||$count>366)throw new InvalidArgumentException('期間は366日以内で指定してください。');
        $stmt=$db->prepare('SELECT forecast_date,result_json FROM next_water_correction_history WHERE location_id=? AND forecast_date BETWEEN ? AND ? ORDER BY forecast_date');$stmt->execute([$id,$start,$end]);$history=[];foreach($stmt->fetchAll() as $row)$history[$row['forecast_date']]=json_decode($row['result_json'],true,512,JSON_THROW_ON_ERROR);$days=[];for($i=0;$i<$count;$i++){$date=$from->modify("+$i days")->format('Y-m-d');$days[]=['date'=>$date,'snapshot'=>$history[$date]??null];}correctionReply(['success'=>true,'days'=>$days]);
    }
    $date=$_GET['date']??$latestDate??substr($now,0,10);if(!is_string($date))throw new InvalidArgumentException('日付を指定してください。');$selected=UTechNext\forecastDate($date);$days=[];
    for($offset=-2;$offset<=0;$offset++){$day=$selected->modify("$offset days")->format('Y-m-d');$stmt=$db->prepare('SELECT status,attempts,next_attempt_at FROM next_water_correction_jobs WHERE location_id=? AND forecast_date=?');$stmt->execute([$id,$day]);$job=$stmt->fetch();if($job)$job['attempts']=(int)$job['attempts'];$days[]=['date'=>$day,'snapshot'=>correctionHistory($db,$id,$day),'job'=>$job?:null];}
    correctionReply(['success'=>true,'token'=>$_SESSION['correction_token'],'settings'=>UTechNext\correctionSettings($db,$id),'trial_date'=>$trialDate,'selected_date'=>$date,'days'=>$days]);
}catch(InvalidArgumentException|JsonException $error){correctionReply(['success'=>false,'message'=>$error->getMessage()],400);}
catch(Throwable $error){error_log('Next correction API: '.$error->getMessage());correctionReply(['success'=>false,'message'=>'補正データを読み込めません。DB接続と補正用テーブルを確認してください。'],503);}
