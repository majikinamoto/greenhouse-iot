const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const elements = Object.fromEntries(['alertStatusCard', 'activeAlertSetting', 'userId'].map(id => [id, {value:'TEST', innerHTML:''}]));
const context = vm.createContext({document:{getElementById:id => elements[id]}, getAlertStatusText:()=> '正常',
    formatAlertTemperature:()=> '-', getAlertConditionText:()=> '30℃以上', getAlertPointLabel:()=> 'P01', getSelectedAlertPointId:()=> 'P01'});
for(const name of ['escapeHtml','formatAlertSettingUpdatedAt','renderAlertStatusCard','renderActiveAlertSetting']){
    const match = new RegExp(`function ${name}\\(`).exec(html);
    assert.ok(match, name);
    const tail = html.slice(match.index);
    const next = /\n(?:async )?function \w+\(|<\/script>/.exec(tail);
    vm.runInContext(tail.slice(0, next ? next.index : undefined), context);
}
for(const value of [null, undefined, '', '<img src=x>', 'invalid']){
    context.input = value;
    assert.equal(vm.runInContext('formatAlertSettingUpdatedAt(input)', context), '記録なし');
}
context.setting = {enabled:1, user_id:'TEST', point_id:'P01', temperature_threshold:30, cooldown_minutes:30,
    setting_updated_at:'2026-10-26 14:30:59', updated_at:'2026-10-27 20:00:00'};
vm.runInContext('renderAlertStatusCard(setting, null, null); renderActiveAlertSetting(setting);', context);
for(const id of ['alertStatusCard','activeAlertSetting']){
    assert.ok(elements[id].innerHTML.includes('最終更新：2026/10/26 14:30（日本時間）'));
    assert.ok(!elements[id].innerHTML.includes('2026/10/27'));
}
context.setting.setting_updated_at = null;
vm.runInContext('renderAlertStatusCard(setting, null, null); renderActiveAlertSetting(setting);', context);
assert.ok(elements.alertStatusCard.innerHTML.includes('最終更新：記録なし'));
assert.ok(elements.activeAlertSetting.innerHTML.includes('最終更新：記録なし'));
// Both insert and update explicitly stamp JST; notification state changes never touch the dedicated column.
const save = fs.readFileSync(path.join(root,'save_alert_setting.php'),'utf8');
assert.equal((save.match(/DATE_ADD\(UTC_TIMESTAMP\(\), INTERVAL 9 HOUR\)/g)||[]).length,2);
assert.ok(fs.readFileSync(path.join(root,'disable_all_alerts.php'),'utf8').includes('setting_updated_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 9 HOUR)'));
assert.ok(!fs.readFileSync(path.join(root,'check_alerts.php'),'utf8').includes('setting_updated_at'));
console.log('PASS: settings timestamp display, legacy records, notification isolation and storage SQL');
