<?php
declare(strict_types=1);
namespace UTechNext;
const WATER_STAGES=['栄養成長期','花芽分化期','出蕾期','開花結実期','生理落果期','果実肥大期','成熟期'];
const IRRIGATION_MODES=['multiply','add','multiply_add','add_multiply'];

function validateIrrigationSettings(array $settings): array
{
    $number=static function($value,string $name,float $min=-INF,bool $integer=false): void {
        if((!is_int($value)&&!is_float($value))||!is_finite((float)$value)||$value<$min||($integer&&floor($value)!==$value*1.0))throw new \InvalidArgumentException($name.'を有効な数値で入力してください。');
    };
    if(!in_array($settings['stage']??null,WATER_STAGES,true))throw new \InvalidArgumentException('生育ステージを選択してください。');
    $number($settings['kc']??null,'6本共通Kc',0);
    $map=$settings['stage_kc']??[];if(!is_array($map))throw new \InvalidArgumentException('ステージ別Kcを確認してください。');
    foreach($map as $stage=>$kc){if(!in_array($stage,WATER_STAGES,true))throw new \InvalidArgumentException('ステージ別Kcを確認してください。');$number($kc,'登録Kc',0);}
    $map[$settings['stage']]=$settings['kc'];
    if(!isset($settings['trees'])||!is_array($settings['trees'])||count($settings['trees'])!==6)throw new \InvalidArgumentException('6本の設定を入力してください。');
    foreach($settings['trees'] as $i=>$tree){if(!is_array($tree))throw new \InvalidArgumentException('樹の設定を確認してください。');$number($tree['nozzles']??null,'No.'.($i+1).' ノズル本数',1,true);$number($tree['a']??null,'補正A',0);$number($tree['b']??null,'補正B');if(isset($tree['flow'])&&is_numeric($tree['flow'])&&!is_finite($tree['flow']*$tree['nozzles']))throw new \InvalidArgumentException('ノズルの合計吐出量を確認してください。');if(!in_array($tree['irrigation_mode']??null,IRRIGATION_MODES,true))throw new \InvalidArgumentException('かん水補正の適用方法を選択してください。');}
    $settings['schema_version']=2;$settings['stage_kc']=$map;
    foreach($settings['trees'] as &$tree)$tree['kc']=$settings['kc'];unset($tree);
    return $settings;
}

function applyDailyIrrigation(array $tree,?array $settings,int $index): array
{
    if(($settings['schema_version']??1)!==2)return $tree;
    $p=$settings['trees'][$index];$water=null;$flow=$p['flow']*$p['nozzles'];
    if($tree['complete']){
        $e=$tree['daily_litres'];
        $water=match($p['irrigation_mode']){'multiply'=>$e*$p['a'],'add'=>$e+$p['b'],'multiply_add'=>$e*$p['a']+$p['b'],'add_multiply'=>($e+$p['b'])*$p['a']};
        $water=is_finite($water)?max(0,$water):null;
    }
    $remaining=$water;$last=count($tree['hours'])-1;
    // Allocate without rounding; the final non-zero share absorbs floating-point residue.
    if($tree['complete']&&$tree['daily_litres']>0){foreach($tree['hours'] as $i=>$h)if($h['litres']>0)$last=$i;}
    foreach($tree['hours'] as $i=>&$hour){
        $allocated=$water===null?null:($tree['daily_litres']>0?$water*$hour['litres']/$tree['daily_litres']:$water/24);
        if($allocated!==null){if($i===$last)$allocated=max(0,$remaining);$remaining-=$allocated;}
        $hour['irrigation_litres']=$allocated;$hour['irrigation_adjustment']=$allocated===null?null:$allocated-$hour['litres'];$hour['irrigation_minutes']=$allocated===null?null:$allocated/$flow;
    }unset($hour);
    $tree['irrigation_litres']=$water;$tree['total_flow']=$flow;$tree['daily_minutes']=$water===null?null:$water/$flow;$tree['cycle_seconds']=$water===null?null:(int)round($tree['daily_minutes']/$settings['cycles']*60);
    return $tree;
}
