<?php
declare(strict_types=1);
namespace UTechNext;

const NET_PENMAN_VERSION='staff-penman-net-radiation-hourly-v2';
const VEGETATIVE_NET_KC=0.4888563516;

function usesNetRadiation(?array $settings): bool {return ($settings['formula_version']??null)===NET_PENMAN_VERSION;}

function netKcBasis(?array $settings): ?array
{
    if(!usesNetRadiation($settings))return null;
    if(($settings['stage']??'')!=='栄養成長期'||abs(($settings['kc']??-1)-VEGETATIVE_NET_KC)>1e-12)return ['type'=>'手入力','formula_version'=>NET_PENMAN_VERSION];
    return ['type'=>'栄養成長期の校正値','formula_version'=>NET_PENMAN_VERSION,'date'=>'2026-09-22','latitude'=>26.110,'longitude'=>127.683,'albedo'=>0.20,'wind_speed'=>0.1,'leaf_area_m2'=>15.0,'transpiration_litres'=>21.417319198013953,'hourly_et0_sum'=>2.9207379127399062,'kc'=>VEGETATIVE_NET_KC,'temperature_humidity_interpolated_hours'=>[10],'transpiration_interpolated_hours'=>[10,11,14,17,18],'transpiration_night_proxy_hours'=>[0,1,2,3,4,5,21,22,23],'note'=>'1日分の校正。Li-6800 Eはmol/m²/s。正時の値をその時刻から1時間へ適用。気象の補間は検証限定で、本番の欠測補完には使わない。'];
}

// Excel declination/distance/solar constant; hourly interval and solar-time correction follow FAO-56 eq.28–33.
function hourlyExtraterrestrialRadiation(string $time,float $latitude,float $longitude): ?float
{
    if(!is_finite($latitude)||abs($latitude)>=90||!is_finite($longitude)||abs($longitude)>180)return null;
    $date=\DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',$time,new \DateTimeZone('Asia/Tokyo'));
    if(!$date||$date->format('Y-m-d H:i:s')!==$time)return null;
    $j=(int)$date->format('z')+1;$phi=deg2rad($latitude);
    $decl=deg2rad(23.45*cos(($j-173)*.966*3.1416/180));
    $distance=1+.01676*cos(deg2rad(.977*($j-186)));
    $ws=acos(max(-1,min(1,-tan($phi)*tan($decl))));
    $b=2*M_PI*($j-81)/364;$sc=.1645*sin(2*$b)-.1255*cos($b)-.025*sin($b);
    $hour=(int)$date->format('H')+(int)$date->format('i')/60+(int)$date->format('s')/3600;
    $offset=($longitude-135)/15+$sc;
    $lo=max(-$ws,M_PI/12*($hour+$offset-12));$hi=min($ws,M_PI/12*($hour+1+$offset-12));
    if($hi<=$lo)return 0.0;
    $ra=.00137/$distance**2*43200/M_PI*(($hi-$lo)*sin($phi)*sin($decl)+cos($phi)*cos($decl)*(sin($hi)-sin($lo)));
    return is_finite($ra)?max(0,$ra):null;
}

function netRadiationSettingsValid(?array $settings): bool
{
    if(!usesNetRadiation($settings)||($settings['kc_formula_version']??null)!==NET_PENMAN_VERSION)return false;
    foreach(['latitude','longitude','albedo'] as $key)if((!is_int($settings[$key]??null)&&!is_float($settings[$key]??null))||!is_finite((float)$settings[$key]))return false;
    return abs($settings['latitude'])<90&&abs($settings['longitude'])<=180&&$settings['albedo']>=0&&$settings['albedo']<=1;
}

function netPenmanHour(string $time,?float $temperature,?float $humidity,?float $radiation,array $settings): array
{
    $out=['time'=>$time,'ra'=>null,'rs_inside'=>null,'rns'=>null,'rnl'=>null,'rn'=>null,'es'=>null,'ea'=>null,'delta'=>null,'latent'=>null,'relative_radiation'=>null,'cloud_term'=>null,'radiation_et'=>null,'aerodynamic_et'=>null,'raw_et0'=>null,'et0'=>null];
    if(!netRadiationSettingsValid($settings))return $out;
    $out['ra']=hourlyExtraterrestrialRadiation($time,(float)$settings['latitude'],(float)$settings['longitude']);
    $wind=$settings['wind_speed']??null;$transmission=$settings['transmission_percent']??null;
    if($radiation!==null&&is_finite($radiation)&&$radiation>=0&&is_numeric($transmission)&&is_finite((float)$transmission)&&$transmission>=0&&$transmission<=100){$out['rs_inside']=$radiation*.0036*$transmission/100;$out['rns']=(1-$settings['albedo'])*$out['rs_inside'];}
    if($out['ra']===null||$out['rs_inside']===null)return $out;
    $q=$out['ra']===0.0?.5:$out['rs_inside']/(.75*$out['ra']);
    if($out['ra']>0&&$out['rs_inside']/$out['ra']<=.3)$q=max(.3,min(1,$q));
    $out['relative_radiation']=$q;$out['cloud_term']=1.35*$q-.35;
    if($temperature===null||$humidity===null||!is_finite($temperature)||!is_finite($humidity)||$temperature<=-237.3||$humidity<0||$humidity>100||!is_numeric($wind)||!is_finite((float)$wind)||$wind<0)return $out;
    $t=$temperature;$rh=$humidity;$es=6.1078*exp(17.2694*$t/($t+237.3));$ea=$es*$rh/100;
    $delta=.4495+.2721e-1*$t+.9873e-3*$t**2+.2907e-5*$t**3+.2538e-6*$t**4;$latent=2.5-.0024*$t;
    if(!is_finite($es)||$latent<=0||$delta+.66<=0)return $out;
    $rnl=4.9e-9/24*($t+273.16)**4*(.34-.14*sqrt($ea/10))*$out['cloud_term'];$rn=$out['rns']-$rnl;
    $first=$delta/($delta+.66)*$rn/$latent;$second=.66/($delta+.66)*.26*(1+.54*$wind)*($es-$ea)/24;$raw=$first+$second;
    if(!is_finite($raw))return $out;
    return array_replace($out,['rnl'=>$rnl,'rn'=>$rn,'es'=>$es,'ea'=>$ea,'delta'=>$delta,'latent'=>$latent,'radiation_et'=>$first,'aerodynamic_et'=>$second,'raw_et0'=>$raw,'et0'=>max(0,$raw)]);
}
