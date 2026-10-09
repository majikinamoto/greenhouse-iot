<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/u-tech-next/lib/correction.php';
function checkCorrection(bool $value,string $label): void {if(!$value)throw new RuntimeException($label);}
$cutoff='2026-10-09 18:10:03';$forecasts=[];$measurements=[];
for($i=4;$i<=9;$i++){$date=sprintf('2026-10-%02d',$i);$rows=[];for($h=0;$h<24;$h++){$stamp=$date.sprintf(' %02d:00:00',$h);$rows[]=['forecast_for'=>$stamp,'temperature_2m'=>25.0,'relative_humidity_2m'=>60.0];if($i<9||$h<18)$measurements[]=['point_id'=>'P01','recorded_at'=>$stamp,'temperature'=>27.0,'humidity'=>70.0];}$forecasts[]=['date'=>$date,'rows'=>$rows];}
$measurements[]=['point_id'=>'P01','recorded_at'=>'2026-10-09 13:05:00','temperature'=>29.0,'humidity'=>null];
$measurements[]=['point_id'=>'P01','recorded_at'=>'2026-10-09 20:00:00','temperature'=>99.0,'humidity'=>99.0];
$comparison=UTechNext\correctionComparison('2026-10-10',5,$cutoff,$forecasts,$measurements);
checkCorrection($comparison['hours'][13]['temperature_2m']['days']===5,'today used');
checkCorrection(abs($comparison['hours'][13]['temperature_2m']['difference']-2.2)<1e-12,'equal weight of each daily mean');
checkCorrection($comparison['hours'][20]['temperature_2m']['days']===5&&$comparison['hours'][20]['temperature_2m']['start']==='2026-10-04','unmeasured today shifts back to full range');
checkCorrection($comparison['hours'][20]['temperature_2m']['difference']===2.0,'after-cutoff measurements excluded');
$one=UTechNext\correctionComparison('2026-10-10',1,$cutoff,$forecasts,$measurements);checkCorrection($one['hours'][20]['temperature_2m']['days']===1,'one day falls back to yesterday');
$different=$measurements;foreach($different as &$row)if(str_starts_with($row['recorded_at'],'2026-10-09 13'))$row['humidity']=null;unset($row);
$independent=UTechNext\correctionComparison('2026-10-10',5,$cutoff,$forecasts,$different);checkCorrection(!$independent['hours'][13]['temperature_2m']['shifted']&&$independent['hours'][13]['relative_humidity_2m']['shifted'],'independent shifts');
$empty=UTechNext\correctionComparison('2026-10-10',5,$cutoff,$forecasts,[]);checkCorrection($empty['hours'][13]['temperature_2m']['difference']===null,'missing remains null');
$targetRows=[];foreach(UTechNext\expectedHours('2026-10-10') as $time)$targetRows[]=['forecast_for'=>str_replace('T',' ',$time).':00','temperature_2m'=>25.0,'relative_humidity_2m'=>95.0,'shortwave_radiation'=>200.0];
$settings=['transmission_percent'=>55,'wind_speed'=>.1,'cycles'=>6,'trees'=>array_fill(0,6,['leaf_area'=>17.8,'kc'=>.269,'flow'=>.71])];
$context=['date'=>'2026-10-10','location_id'=>1,'forecast_fetched_at'=>$cutoff,'measurement_cutoff'=>$cutoff,'forecast_rows'=>$targetRows,'correction_settings'=>['source_user_id'=>'TEST','comparison_days'=>5,'revision'=>1],'water_settings'=>$settings,'water_revision'=>1];
$result=UTechNext\correctionResult($context,$forecasts,$measurements,'success');checkCorrection($result['rows'][0]['relative_humidity_2m']===100&&$result['rows'][0]['humidity_clamped'],'humidity clamp');checkCorrection($result['trees'][0]['complete'],'water result');
$missingSettings=$context;$missingSettings['water_settings']=null;$missingResult=UTechNext\correctionResult($missingSettings,$forecasts,$measurements,'success');checkCorrection($missingResult['trees'][0]['daily_litres']===null&&$missingResult['comparison']['hours'][13]['temperature_2m']['days']===5,'unset plant settings retains correction evidence');
foreach([0,11,'5'] as $days){try{UTechNext\validateCorrectionSettings(['source_user_id'=>null,'comparison_days'=>$days]);throw new RuntimeException('accepted bad days');}catch(InvalidArgumentException $e){}}
if(($argv[1]??'')==='--json'){echo json_encode(['context'=>$context,'forecasts'=>$forecasts,'measurements'=>$measurements,'result'=>$result],JSON_THROW_ON_ERROR);exit;}
echo "Correction PHP checks passed: cutoff, shifted periods, independent fields, equal weights, missing settings, clamps.\n";
