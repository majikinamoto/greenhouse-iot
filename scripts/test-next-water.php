<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/u-tech-next/lib/db.php';
$checks=0;
function waterCheck(bool $value,string $message): void { global $checks; if(!$value)throw new RuntimeException($message);$checks++; }
$settings=['transmission_percent'=>55,'wind_speed'=>0.1,'cycles'=>6,'trees'=>array_fill(0,6,['leaf_area'=>17.8,'kc'=>0.268765290840795,'flow'=>0.71])];
UTechNext\validateWaterSettings($settings);
$date='2026-10-07';$rows=[];
foreach(UTechNext\expectedHours($date) as $time)$rows[]=['forecast_for'=>str_replace('T',' ',$time).':00','temperature_2m'=>25.840416666666666,'relative_humidity_2m'=>62.392083333333325,'shortwave_radiation'=>15.94/(24*0.0036)];
$daily=UTechNext\calculateWaterDay($date,$rows,$settings);
// Workbook reference with its outdoor wind-height correction reproduces the
// stored 3.5177546104; indoor wind used directly gives 3.5400009870.
$indoor=UTechNext\hourlyPenman($rows[0]['temperature_2m'],$rows[0]['relative_humidity_2m'],$rows[1]['shortwave_radiation'],.1,55)*24;
waterCheck(abs($indoor-3.5400009870301625)<1e-12,'Hourly integration equals daily staff equation with indoor wind');
$outdoor=UTechNext\hourlyPenman($rows[0]['temperature_2m'],$rows[0]['relative_humidity_2m'],$rows[1]['shortwave_radiation'],.1*log(200)/log(4600),55)*24;
waterCheck(abs($outdoor-3.5177546104335344)<1e-12,'Original workbook sample reproduced');
waterCheck($daily['trees'][0]['complete'] && $daily['trees'][0]['cycle_seconds']===239,'Indoor wind intentionally changes cycle time from workbook');
$smaller=$settings;$smaller['trees'][1]['leaf_area']*=.7;
$result=UTechNext\calculateWaterDay($date,$rows,$smaller);
waterCheck(abs($result['trees'][1]['daily_litres']/$result['trees'][0]['daily_litres']-.7)<1e-12,'Direct per-tree leaf-area scaling');
$missing=$rows;$missing[24]['shortwave_radiation']=null;
$result=UTechNext\calculateWaterDay($date,$missing,$settings)['trees'][0];
waterCheck($result['hours'][23]['litres']===null && $result['daily_litres']===null && $result['cycle_seconds']===null && $result['partial_litres']>0,'24:00 boundary missing, partial cumulative retained, daily irrigation withheld');
$zero=$rows;foreach($zero as &$row){$row['shortwave_radiation']=0;$row['relative_humidity_2m']=100;}unset($row);
$result=UTechNext\calculateWaterDay($date,$zero,$settings)['trees'][0];
waterCheck($result['complete'] && $result['daily_litres']===0.0 && $result['cycle_seconds']===0,'Valid zero distinct from missing');
waterCheck(UTechNext\hourlyPenman(25,100,-100,.1,55)===0.0,'Negative clipped to zero');
$result=UTechNext\calculateWaterDay($date,$rows,null)['trees'][0];
waterCheck($result['hours'][0]['litres']===null && $result['cycle_seconds']===null,'Unset settings never produce defaults');
foreach(['cycles'=>0,'wind_speed'=>null,'transmission_percent'=>101] as $key=>$value){$bad=$settings;$bad[$key]=$value;try{UTechNext\validateWaterSettings($bad);throw new RuntimeException('Invalid settings accepted');}catch(InvalidArgumentException $error){waterCheck(true,'Invalid input rejected');}}
$tomorrow=UTechNext\calculateWaterDay('2026-10-08',[],null);
waterCheck($tomorrow['trees'][0]['hours'][0]['cumulative']===0.0,'Daily reset');
echo "Passed $checks water calculation checks; no DB or HTTP operations.\n";
