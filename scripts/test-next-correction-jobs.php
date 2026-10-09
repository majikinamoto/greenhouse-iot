<?php
declare(strict_types=1);
require_once __DIR__.'/test-next-correction.php';
// Stateful PDO substitute exercises the job control flow without production DB writes.
class CorrectionTestDb extends PDO {
    public array $job;public ?array $history=null;public int $readCalls=0;public int $failReads=0;public int $failWrites=0;private bool $transaction=false;private ?array $backup=null;
    public function __construct(array $context){$this->job=['location_id'=>1,'forecast_date'=>$context['date'],'context_json'=>json_encode($context),'status'=>'pending','attempts'=>0,'next_attempt_at'=>$context['measurement_cutoff']];}
    public function prepare(string $query,array $options=[]): PDOStatement|false{return new CorrectionTestStatement($this,$query);}
    public function beginTransaction(): bool{$this->backup=[$this->job,$this->history];$this->transaction=true;return true;}
    public function commit(): bool{$this->transaction=false;return true;}
    public function rollBack(): bool{[$this->job,$this->history]=$this->backup;$this->transaction=false;return true;}
    public function inTransaction(): bool{return $this->transaction;}
}
class CorrectionTestStatement extends PDOStatement {
    private CorrectionTestDb $db;private string $sql;private $result=false;
    public function __construct(CorrectionTestDb $db,string $sql){$this->db=$db;$this->sql=$sql;}
    public function execute(?array $params=null): bool{
        $d=$this->db;$s=$this->sql;
        if(str_contains($s,'GET_LOCK')||str_contains($s,'RELEASE_LOCK'))$this->result=1;
        elseif(str_starts_with($s,'SELECT * FROM next_water_correction_jobs'))$this->result=$d->job;
        elseif(str_starts_with($s,'UPDATE next_water_correction_jobs SET attempts')){[$d->job['attempts'],$d->job['next_attempt_at']]=$params;$d->job['status']='retrying';}
        elseif(str_starts_with($s,'SELECT point_id')){$d->readCalls++;if($d->failReads>0){$d->failReads--;throw new RuntimeException('simulated measurement failure');}$this->result=[];}
        elseif(str_contains($s,'FROM forecasts'))$this->result=[];
        elseif(str_starts_with($s,'UPDATE next_water_correction_jobs SET last_error'))$d->job['last_error']=$params[0];
        elseif(str_starts_with($s,'UPDATE next_water_correction_jobs SET context_json'))$d->job['context_json']=$params[0];
        elseif(str_starts_with($s,'SELECT result_json'))$this->result=$d->history===null?false:json_encode($d->history);
        elseif(str_starts_with($s,'INSERT INTO next_water_correction_history')){if($d->failWrites>0){$d->failWrites--;throw new RuntimeException('simulated history write failure');}$d->history=json_decode($params[8],true);}
        elseif(str_starts_with($s,"UPDATE next_water_correction_jobs SET status='complete'")){$d->job['status']='complete';$d->job['next_attempt_at']=null;}
        else throw new RuntimeException('unexpected SQL in test: '.$s);
        return true;
    }
    public function fetch(int $mode=PDO::FETCH_DEFAULT,int $orientation=PDO::FETCH_ORI_NEXT,int $offset=0): mixed{return $this->result;}
    public function fetchColumn(int $column=0): mixed{return $this->result;}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args): array{return $this->result===false?[]:$this->result;}
}
$db=new CorrectionTestDb($context);$db->failReads=2;
UTechNext\processCorrectionJob($db,1,'2026-10-10',$cutoff);checkCorrection($db->job['attempts']===1&&$db->history===null,'first measurement failure pending');
UTechNext\processCorrectionJob($db,1,'2026-10-10','2026-10-09 18:14:00');checkCorrection($db->readCalls===1,'retry not before five minutes');
UTechNext\processCorrectionJob($db,1,'2026-10-10','2026-10-09 18:15:03');UTechNext\processCorrectionJob($db,1,'2026-10-10','2026-10-09 18:20:03');checkCorrection($db->job['status']==='complete'&&$db->history['measurement_cutoff']===$cutoff,'success after retries uses fixed cutoff');
$snapshot=$db->history;UTechNext\processCorrectionJob($db,1,'2026-10-10','2026-10-09 18:40:00');checkCorrection($db->history===$snapshot&&$db->readCalls===3,'complete history immutable');
$db=new CorrectionTestDb($context);$db->failReads=6;for($i=0;$i<6;$i++)UTechNext\processCorrectionJob($db,1,'2026-10-10',(new DateTimeImmutable($cutoff))->modify('+'.($i*5).' minutes')->format('Y-m-d H:i:s'));checkCorrection($db->job['attempts']===6&&$db->history['acquisition_status']==='measurement_fetch_failed','six measurement failures saved without correction');
$db=new CorrectionTestDb($context);$db->failWrites=1;try{UTechNext\processCorrectionJob($db,1,'2026-10-10',$cutoff);throw new RuntimeException('write failure ignored');}catch(RuntimeException $e){checkCorrection($e->getMessage()==='simulated history write failure','history write failure propagates');}
checkCorrection($db->job['status']!=='complete'&&isset(json_decode($db->job['context_json'],true)['prepared_result']),'prepared result retained');
UTechNext\processCorrectionJob($db,1,'2026-10-10','2026-10-09 18:15:03');checkCorrection($db->readCalls===1&&$db->history['acquisition_status']==='success','write retry does not acquire again');
$unset=$context;$unset['correction_settings']['source_user_id']=null;$db=new CorrectionTestDb($unset);UTechNext\processCorrectionJob($db,1,'2026-10-10',$cutoff);checkCorrection($db->readCalls===0&&$db->history['acquisition_status']==='source_unset','unset source creates history without query');
echo "Correction job checks passed: fixed context, due time, retries, fallback, immutable history, write recovery.\n";
