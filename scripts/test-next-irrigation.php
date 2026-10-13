<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/u-tech-next/lib/transpiration.php';
function irrigationCheck(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
$settings=['schema_version'=>2,'stage'=>'果実肥大期','kc'=>.269,'stage_kc'=>[],'transmission_percent'=>60,'wind_speed'=>.1,'cycles'=>6,'trees'=>array_fill(0,6,['leaf_area'=>17.8,'flow'=>.7,'nozzles'=>2,'a'=>1.2,'b'=>2,'irrigation_mode'=>'multiply_add'])];
$settings=UTechNext\validateWaterSettings($settings);irrigationCheck($settings['stage_kc']['果実肥大期']===.269,'stage registration');
$hours=[];for($h=0;$h<24;$h++)$hours[]=['time'=>sprintf('2026-10-13 %02d:00:00',$h),'litres'=>$h===0?2.0:($h===1?8.0:0.0),'et0'=>1.0,'cumulative'=>$h===0?2.0:10.0,'cumulative_complete'=>true];
$base=['number'=>1,'hours'=>$hours,'complete'=>true,'daily_litres'=>10.0,'partial_litres'=>10.0,'daily_minutes'=>null,'cycle_seconds'=>null];$outputs=[];
foreach(['multiply'=>12,'add'=>12,'multiply_add'=>14,'add_multiply'=>14.4] as $mode=>$expected){$s=$settings;$s['trees'][0]['irrigation_mode']=$mode;$r=UTechNext\applyDailyIrrigation($base,$s,0);irrigationCheck(abs($r['irrigation_litres']-$expected)<1e-12,'mode '.$mode);irrigationCheck(abs(array_sum(array_column($r['hours'],'irrigation_litres'))-$expected)<1e-12,'allocation total');irrigationCheck(abs($r['hours'][0]['irrigation_litres']-$expected*.2)<1e-12,'proportion');irrigationCheck(abs($r['daily_minutes']-$expected/1.4)<1e-12,'nozzle count');$outputs[$mode]=['settings'=>$s,'result'=>$r];}
$zero=$base;$zero['daily_litres']=0;foreach($zero['hours'] as &$h)$h['litres']=0;unset($h);$r=UTechNext\applyDailyIrrigation($zero,$settings,0);irrigationCheck(abs($r['hours'][0]['irrigation_litres']-2/24)<1e-12,'zero equal allocation');
$negative=$settings;$negative['trees'][0]['b']=-100;$r=UTechNext\applyDailyIrrigation($base,$negative,0);irrigationCheck($r['irrigation_litres']===0,'negative clamp');
$missing=$base;$missing['complete']=false;$missing['daily_litres']=null;$missing['hours'][0]['litres']=null;$r=UTechNext\applyDailyIrrigation($missing,$settings,0);irrigationCheck($r['daily_minutes']===null&&$r['hours'][1]['irrigation_litres']===null&&$r['hours'][1]['litres']===8.0,'missing remains unknown');
foreach(['a','b','nozzles','irrigation_mode'] as $key){$bad=$settings;unset($bad['trees'][0][$key]);try{UTechNext\validateWaterSettings($bad);throw new RuntimeException('accepted missing '.$key);}catch(InvalidArgumentException $e){}}
if(($argv[1]??'')==='--json'){echo json_encode(['settings'=>$settings,'base'=>$base,'outputs'=>$outputs],JSON_THROW_ON_ERROR);exit;}
echo "Irrigation checks passed: four modes, stage Kc, nozzle count, zero, negative, missing, allocation conservation.\n";
