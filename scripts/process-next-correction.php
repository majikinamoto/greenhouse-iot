<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(403);exit;}
require_once dirname(__DIR__).'/u-tech-next/lib/correction.php';
try{
    if($argc!==1)throw new RuntimeException('This command takes no arguments.');
    $db=UTechNext\connect();$now=(new DateTimeImmutable('now',UTechNext\tokyo()))->format('Y-m-d H:i:s');
    $stmt=$db->prepare("SELECT location_id,forecast_date FROM next_water_correction_jobs WHERE status<>'complete' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY next_attempt_at LIMIT 20");$stmt->execute([$now]);$jobs=$stmt->fetchAll();$failed=false;
    foreach($jobs as $job){try{UTechNext\processCorrectionJob($db,(int)$job['location_id'],$job['forecast_date']);}catch(Throwable $error){$failed=true;fwrite(STDERR,'Correction '.$job['forecast_date'].': '.$error->getMessage()."\n");}}
    if($jobs!==[])fwrite(STDOUT,"Checked ".count($jobs)." correction jobs at $now JST.\n");exit($failed?1:0);
}catch(Throwable $error){fwrite(STDERR,$error->getMessage()."\n");exit(1);}
