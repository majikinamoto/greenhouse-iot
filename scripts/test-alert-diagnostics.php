<?php
declare(strict_types=1);
require __DIR__ . '/lib/alert-diagnostics.php';
$checks = 0;
function checkDecision(bool $ok, string $message): void {
    global $checks;
    if (!$ok) throw new RuntimeException($message);
    $checks++;
}
$now = strtotime('2026-10-17 12:00:00');
$setting = ['id'=>1,'user_id'=>'test','point_id'=>'P01','enabled'=>1,'notify_target'=>'discord',
    'webhook_url'=>'https://discord.com/api/webhooks/secret','temperature_threshold'=>30,
    'condition_type'=>'above','cooldown_minutes'=>30,'last_status'=>'normal'];
$row = ['temperature'=>31,'recorded_at'=>'2026-10-17 11:59:00'];
$run = static function (array $changes = [], ?array $measurement = null) use ($setting, $row, $now): array {
    return diagnoseAlertDecision(array_replace($setting,$changes), $measurement ?? $row, $now);
};
checkDecision($run()['decision'] === 'would_send_alert', 'High temperature');
$equal = $run([], array_replace($row,['temperature'=>30]));
checkDecision($equal['decision'] === 'would_send_alert' && $equal['ui_matched'], 'High threshold includes equality');
checkDecision($run(['condition_type'=>'below'],array_replace($row,['temperature'=>30]))['decision'] === 'would_send_alert', 'Low threshold includes equality');
checkDecision($run(['condition_type'=>'below'],array_replace($row,['temperature'=>29]))['decision'] === 'would_send_alert', 'Low temperature');
checkDecision($run(['last_status'=>'alert','last_notified_at'=>'2026-10-17 11:45:00'])['cooldown_remaining_seconds'] === 900, 'Cooldown');
checkDecision($run(['last_status'=>'alert','last_notified_at'=>'2026-10-17 11:30:00'])['decision'] === 'would_send_alert', 'Cooldown boundary');
checkDecision($run(['last_status'=>'alert'],array_replace($row,['temperature'=>29]))['decision'] === 'would_send_recovery', 'Recovery');
checkDecision($run(['enabled'=>0])['decision'] === 'disabled', 'Disabled');
checkDecision($run(['notify_target'=>'line'])['decision'] === 'unsupported_target', 'LINE unsupported');
checkDecision(diagnoseAlertDecision($setting,null,$now)['decision'] === 'no_temperature', 'No measurements');
checkDecision($run(['condition_type'=>'bad'])['decision'] === 'invalid_condition', 'Bad condition');
checkDecision(count($run([],array_replace($row,['recorded_at'=>'2026-10-16 12:00:00']))['warnings']) > 0, 'Stale measurement');
checkDecision(strpos(json_encode($run()), 'secret') === false, 'Secret not exposed');
checkDecision(count($run(['notify_target'=>'email','webhook_url'=>'invalid'])['warnings']) > 0, 'Bad email');
checkDecision(alertSmtpData("From: test\r\nTo: test\r\n\r\nfirst\n.second\rlast") === "From: test\r\nTo: test\r\n\r\nfirst\r\n..second\r\nlast", 'Mixed newlines normalized without corrupting headers; dot stuffing');
echo "Passed $checks diagnostic checks; no DB or notification operations.\n";
