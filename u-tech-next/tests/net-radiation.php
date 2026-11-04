<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/lib/db.php';
use const UTechNext\NET_PENMAN_VERSION;
use const UTechNext\VEGETATIVE_NET_KC;
function check(bool $ok,string $label):void {if(!$ok)throw new RuntimeException($label);}
function near(float $a,float $b,string $label):void {check(abs($a-$b)<1e-10,$label." $a != $b");}
$fixture=json_decode(file_get_contents(__DIR__.'/net-radiation-fixture.json'),true,512,JSON_THROW_ON_ERROR);
$settings=['schema_version'=>2,'formula_version'=>NET_PENMAN_VERSION,'kc_formula_version'=>NET_PENMAN_VERSION,'latitude'=>26.110,'longitude'=>127.683,'albedo'=>.2,'stage'=>'栄養成長期','kc'=>VEGETATIVE_NET_KC,'stage_kc'=>[],'transmission_percent'=>100,'wind_speed'=>.1,'cycles'=>6,'trees'=>array_fill(0,6,['leaf_area'=>15,'flow'=>.71,'nozzles'=>1,'a'=>1,'b'=>0,'irrigation_mode'=>'multiply_add'])];
$settings=UTechNext\validateWaterSettings($settings);
$rows=[];
for($i=0;$i<=24;$i++){$h=$fixture['hours'][min($i,23)];$rows[]=['forecast_for'=>$i===24?'2026-09-23 00:00:00':sprintf('2026-09-22 %02d:00:00',$i),'temperature_2m'=>$h['temperature'],'relative_humidity_2m'=>$h['humidity'],'shortwave_radiation'=>$i===0?0:$fixture['hours'][$i-1]['radiation']];}
$day=UTechNext\calculateWaterDay($fixture['date'],$rows,$settings);
near(array_sum(array_column($day['radiation'],'ra')),33.78997996459783,'Daily Ra');
near(array_sum(array_column($day['radiation'],'rs_inside')),9.646546184738956,'Indoor radiation unchanged');
near(array_sum(array_column($day['radiation'],'et0')),2.9207379127399062,'Agreed hourly ET0');
near($day['trees'][0]['daily_litres'],2.9207379127399062*15*VEGETATIVE_NET_KC,'Calibrated transpiration');
check($day['kc_basis']['temperature_humidity_interpolated_hours']===[10],'Calibration provenance');
$night=UTechNext\netPenmanHour('2026-09-22 00:00:00',25,100,0,$settings);
near($night['cloud_term'],.325,'Night relative radiation');check($night['rn']<0&&$night['raw_et0']<0&&$night['et0']===0,'Clamp only final ET0');
$positive=UTechNext\netPenmanHour('2026-09-22 00:00:00',25,60,100,$settings);
near($positive['rns'],.288,'Night positive shortwave retained');
$bright=UTechNext\netPenmanHour('2026-09-22 07:00:00',25,60,2000,$settings);check($bright['relative_radiation']>1,'Intentional upper branch not capped');
$dark=UTechNext\netPenmanHour('2026-09-22 12:00:00',25,60,0,$settings);near($dark['relative_radiation'],.3,'Lower branch bound');
$missing=$rows;$missing[10]['temperature_2m']=null;$partial=UTechNext\calculateWaterDay($fixture['date'],$missing,$settings);
check($partial['radiation'][10]['et0']===null&&$partial['trees'][0]['daily_litres']===null&&$partial['trees'][0]['hours'][10]['irrigation_litres']===null,'No production interpolation');
$missing=$rows;$missing[24]['shortwave_radiation']=null;check(UTechNext\calculateWaterDay($fixture['date'],$missing,$settings)['radiation'][23]['et0']===null,'24:00 boundary required');
foreach(['latitude'=>null,'longitude'=>null,'albedo'=>null,'kc_formula_version'=>'old'] as $key=>$v){$bad=$settings;$bad[$key]=$v;try{UTechNext\validateWaterSettings($bad);throw new RuntimeException('Invalid new configuration accepted');}catch(InvalidArgumentException $e){}}
$old=$settings;unset($old['formula_version'],$old['kc_formula_version'],$old['latitude'],$old['longitude'],$old['albedo']);$legacy=UTechNext\calculateWaterDay($fixture['date'],$rows,$old);
check($legacy['version']===UTechNext\TRANSPIRATION_VERSION&&!isset($legacy['radiation']),'Legacy engine preserved');
near($legacy['trees'][0]['hours'][12]['et0'],UTechNext\hourlyPenman($rows[12]['temperature_2m'],$rows[12]['relative_humidity_2m'],$rows[13]['shortwave_radiation'],.1,100),'Legacy delta preserved');
if(in_array('--json',$argv,true))echo json_encode(compact('settings','rows','day','legacy','partial'),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);else echo "Net radiation reference, missingness, night, branches, and legacy checks passed.\n";
