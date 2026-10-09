<?php
declare(strict_types=1);
namespace UTechNext;

require_once __DIR__ . '/db.php';
const CORRECTION_VERSION = 'hourly-equal-day-shift-v2';

function validateCorrectionSettings(array $input): array
{
    $user = $input['source_user_id'] ?? null;
    if ($user === '') $user = null;
    if ($user !== null && (!is_string($user) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/D', $user))) throw new \InvalidArgumentException('補正実測先のuser_idを確認してください。');
    $days = $input['comparison_days'] ?? null;
    if (!is_int($days) || $days < 1 || $days > 10) throw new \InvalidArgumentException('比較日数は1〜10日で指定してください。');
    return ['source_user_id'=>$user, 'comparison_days'=>$days];
}

function correctionSettings(\PDO $db, int $locationId, bool $lock = false): array
{
    $stmt=$db->prepare('SELECT source_user_id, comparison_days, revision, updated_at FROM next_water_correction_settings WHERE location_id=?'.($lock?' FOR UPDATE':''));
    $stmt->execute([$locationId]);$row=$stmt->fetch();
    if (!$row) return ['source_user_id'=>null,'comparison_days'=>5,'revision'=>0,'updated_at'=>null];
    return validateCorrectionSettings(['source_user_id'=>$row['source_user_id'],'comparison_days'=>(int)$row['comparison_days']])+['revision'=>(int)$row['revision'],'updated_at'=>$row['updated_at']];
}

function correctionMean(array $values): ?float { return $values === [] ? null : array_sum($values)/count($values); }
function correctionNumber($value): ?float { return (is_int($value)||is_float($value))&&is_finite((float)$value)?(float)$value:null; }

function correctionComparison(string $target, int $count, string $cutoff, array $forecasts, array $measurements): array
{
    $end=substr($cutoff,0,10);$start=forecastDate($end)->modify((1-$count).' days')->format('Y-m-d');
    $earliest=forecastDate($start)->modify('-1 day')->format('Y-m-d');$buckets=[];$indexed=[];
    foreach ($measurements as $row) {
        if (($row['point_id']??'')!=='P01' || !isset($row['recorded_at']) || $row['recorded_at']>$cutoff) continue;
        $key=substr($row['recorded_at'],0,13);if(substr($key,0,10)<$earliest||substr($key,0,10)>$end)continue;
        foreach(['temperature','humidity'] as $field){$v=correctionNumber($row[$field]??null);if($v===null||($field==='humidity'&&($v<0||$v>100))||($field==='temperature'&&$v<=-237.3))continue;$buckets[$key][$field][]=$v;}
    }
    foreach($forecasts as $day)foreach($day['rows'] as $row)$indexed[substr($row['forecast_for'],0,13)]=$row;
    $hours=[];
    for($hour=0;$hour<24;$hour++){
        $output=['hour'=>$hour];$hourString=sprintf('%02d',$hour);
        foreach(['temperature_2m'=>'temperature','relative_humidity_2m'=>'humidity'] as $forecastKey=>$field){
            $todayValues=$buckets[$end.' '.$hourString][$field]??[];$shifted=$todayValues===[];
            $fieldEnd=forecastDate($end)->modify($shifted?'-1 day':'0 days')->format('Y-m-d');$fieldStart=forecastDate($fieldEnd)->modify((1-$count).' days')->format('Y-m-d');$daily=[];$used=[];
            for($i=0;$i<$count;$i++){
                $date=forecastDate($fieldStart)->modify("+$i days")->format('Y-m-d');$key=$date.' '.$hourString;
                $values=$buckets[$key][$field]??[];$measured=correctionMean($values);$forecast=correctionNumber($indexed[$key][$forecastKey]??null);
                if($forecast!==null&&(($field==='humidity'&&($forecast<0||$forecast>100))||($field==='temperature'&&$forecast<=-237.3)))$forecast=null;
                $difference=$forecast!==null&&$measured!==null?$measured-$forecast:null;
                $item=['date'=>$date,'forecast'=>$forecast,'measured'=>$measured,'count'=>count($values),'difference'=>$difference,'reason'=>$measured===null?'measurement_missing':($forecast===null?'forecast_missing':'used')];$daily[]=$item;if($difference!==null)$used[]=$item;
            }
            $output[$forecastKey]=['difference'=>correctionMean(array_column($used,'difference')),'forecast'=>correctionMean(array_column($used,'forecast')),'measured'=>correctionMean(array_column($used,'measured')),'days'=>count($used),'count'=>array_sum(array_column($used,'count')),'start'=>$fieldStart,'end'=>$fieldEnd,'shifted'=>$shifted,'daily'=>$daily];
        }$hours[]=$output;
    }
    return ['target'=>$target,'count'=>$count,'start'=>$start,'end'=>$end,'cutoff'=>$cutoff,'version'=>CORRECTION_VERSION,'hours'=>$hours];
}

function applyCorrection(array $rows, array $comparison): array
{
    foreach($rows as &$row){$hour=(int)substr($row['forecast_for'],11,2);
        foreach(['temperature_2m','relative_humidity_2m'] as $key){$v=correctionNumber($row[$key]??null);$difference=$comparison['hours'][$hour][$key]['difference'];if($v!==null&&$difference!==null)$row[$key]=$v+$difference;}
        $rh=correctionNumber($row['relative_humidity_2m']??null);$row['humidity_clamped']=$rh!==null&&($rh<0||$rh>100);if($rh!==null)$row['relative_humidity_2m']=max(0,min(100,$rh));
        $t=correctionNumber($row['temperature_2m']??null);$rh=correctionNumber($row['relative_humidity_2m']??null);$row['corrected_vpd']=null;$row['corrected_deficit']=null;
        if($t!==null&&$t>-237.3&&$rh!==null){$difference=6.1078*10**(7.5*$t/(237.3+$t))*(1-$rh/100);$row['corrected_vpd']=$difference/10;$row['corrected_deficit']=216.7*$difference/($t+273.15);}
    }unset($row);return $rows;
}

function correctionEvidence(\PDO $db, int $locationId, array $config, string $cutoff): array
{
    if($config['source_user_id']===null)return [[],[]];
    $start=forecastDate(substr($cutoff,0,10))->modify('-'.$config['comparison_days'].' days')->format('Y-m-d');
    $stmt=$db->prepare("SELECT point_id, recorded_at, temperature, humidity FROM measurements WHERE user_id=? AND point_id='P01' AND recorded_at>=? AND recorded_at<=? ORDER BY recorded_at, id");
    $stmt->execute([$config['source_user_id'],$start.' 00:00:00',$cutoff]);$measurements=$stmt->fetchAll();
    foreach($measurements as &$row)foreach(['temperature','humidity'] as $field)$row[$field]=$row[$field]===null?null:(float)$row[$field];unset($row);
    $forecasts=[];for($i=0;$i<=$config['comparison_days'];$i++){$date=forecastDate($start)->modify("+$i days")->format('Y-m-d');$forecasts[]=['date'=>$date,'rows'=>savedRows($db,$locationId,$date)];}
    return [$forecasts,$measurements];
}

function correctionResult(array $context, array $forecasts, array $measurements, string $status): array
{
    $comparison=correctionComparison($context['date'],$context['correction_settings']['comparison_days'],$context['measurement_cutoff'],$forecasts,$measurements);
    $rows=applyCorrection($context['forecast_rows'],$comparison);$result=calculateWaterDay($context['date'],$rows,$context['water_settings']);
    return $result+['fetched_at'=>$context['forecast_fetched_at'],'measurement_cutoff'=>$context['measurement_cutoff'],'comparison'=>$comparison,'rows'=>$rows,'original_rows'=>$context['forecast_rows'],'source_user_id'=>$context['correction_settings']['source_user_id'],'correction_settings'=>$context['correction_settings'],'water_revision'=>$context['water_revision'],'location_id'=>$context['location_id'],'model'=>MODEL,'acquisition_status'=>$status,'output_type'=>'保存履歴','correction_version'=>CORRECTION_VERSION];
}

function enqueueCorrection(\PDO $db, int $locationId, string $date, array $batch, ?array $water): void
{
    $config=correctionSettings($db,$locationId,true);$stmt=$db->prepare('SELECT revision FROM next_water_settings WHERE location_id=? FOR UPDATE');$stmt->execute([$locationId]);$revision=(int)($stmt->fetchColumn()?:0);
    $context=['date'=>$date,'location_id'=>$locationId,'forecast_fetched_at'=>$batch['fetched_at'],'measurement_cutoff'=>$batch['fetched_at'],'forecast_rows'=>$batch['rows'],'correction_settings'=>$config,'water_settings'=>$water,'water_revision'=>$revision,'correction_version'=>CORRECTION_VERSION];
    $stmt=$db->prepare("INSERT INTO next_water_correction_jobs (location_id,forecast_date,forecast_fetched_at,measurement_cutoff,context_json,next_attempt_at,updated_at) VALUES (?,?,?,?,?,?,?)");
    $stmt->execute([$locationId,$date,$batch['fetched_at'],$batch['fetched_at'],json_encode($context,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$batch['fetched_at'],$batch['fetched_at']]);
}

function processCorrectionJob(\PDO $db, int $locationId, string $date, ?string $clock=null): void
{
    $now=$clock??(new \DateTimeImmutable('now',tokyo()))->format('Y-m-d H:i:s');$lock='next_wc_'.$locationId.'_'.$date;
    $stmt=$db->prepare('SELECT GET_LOCK(?,0)');$stmt->execute([$lock]);if((int)$stmt->fetchColumn()!==1)return;
    try{
        $stmt=$db->prepare('SELECT * FROM next_water_correction_jobs WHERE location_id=? AND forecast_date=?');$stmt->execute([$locationId,$date]);$job=$stmt->fetch();
        if(!$job||$job['status']==='complete'||($job['next_attempt_at']!==null&&$job['next_attempt_at']>$now))return;
        $context=json_decode($job['context_json'],true,512,JSON_THROW_ON_ERROR);$attempt=(int)$job['attempts'];$evidence=null;$status=$context['correction_settings']['source_user_id']===null?'source_unset':'success';
        if(isset($context['prepared_result'])){$result=$context['prepared_result'];}
        else {
        if($attempt<6){$attempt++;$retryAt=(new \DateTimeImmutable($now,tokyo()))->modify('+5 minutes')->format('Y-m-d H:i:s');
            $stmt=$db->prepare("UPDATE next_water_correction_jobs SET attempts=?,status='retrying',next_attempt_at=?,updated_at=? WHERE location_id=? AND forecast_date=?");$stmt->execute([$attempt,$retryAt,$now,$locationId,$date]);
            try{$evidence=correctionEvidence($db,$locationId,$context['correction_settings'],$context['measurement_cutoff']);}
            catch(\Throwable $error){error_log('Next correction measurement attempt '.$attempt.': '.$error->getMessage());$stmt=$db->prepare('UPDATE next_water_correction_jobs SET last_error=? WHERE location_id=? AND forecast_date=?');$stmt->execute(['実測値または比較予報の取得失敗',$locationId,$date]);if($attempt<6)return;$status='measurement_fetch_failed';$evidence=[[],[]];}
        }else{$status='measurement_fetch_failed';$evidence=[[],[]];}
        $result=correctionResult($context,$evidence[0],$evidence[1],$status);$result['finalized_at']=$now;
        // Keep a successfully calculated result when the history write needs retry.
        $context['prepared_result']=$result;$stmt=$db->prepare('UPDATE next_water_correction_jobs SET context_json=? WHERE location_id=? AND forecast_date=?');$stmt->execute([json_encode($context,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$locationId,$date]);
        }
        $status=$result['acquisition_status'];$db->beginTransaction();
        try{$stmt=$db->prepare('SELECT result_json FROM next_water_correction_history WHERE location_id=? AND forecast_date=? FOR UPDATE');$stmt->execute([$locationId,$date]);
            if($stmt->fetchColumn()===false){$stmt=$db->prepare('INSERT INTO next_water_correction_history (location_id,forecast_date,forecast_fetched_at,measurement_cutoff,finalized_at,source_user_id,comparison_days,acquisition_status,result_json) VALUES (?,?,?,?,?,?,?,?,?)');$stmt->execute([$locationId,$date,$context['forecast_fetched_at'],$context['measurement_cutoff'],$result['finalized_at'],$context['correction_settings']['source_user_id'],$context['correction_settings']['comparison_days'],$status,json_encode($result,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);}
            $stmt=$db->prepare("UPDATE next_water_correction_jobs SET status='complete',next_attempt_at=NULL,updated_at=? WHERE location_id=? AND forecast_date=?");$stmt->execute([$now,$locationId,$date]);$db->commit();
        }catch(\Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
    }finally{$stmt=$db->prepare('SELECT RELEASE_LOCK(?)');$stmt->execute([$lock]);}
}
