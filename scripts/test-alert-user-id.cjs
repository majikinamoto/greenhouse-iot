const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = name => {
    const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
    assert.ok(match, `Missing function ${name}`);
    const tail = html.slice(match.index);
    const next = /\n(?:async )?function \w+\(|<\/script>/.exec(tail);
    return tail.slice(0, next ? next.index : undefined);
};
const reply = value => ({ ok:true, text:async () => JSON.stringify(value) });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise,resolve,reject }; };
function fixture() {
    const elements = Object.fromEntries(['userId','alertUserId','alertPointId','alertTemperatureThreshold',
        'alertConditionType','alertNotifyTarget','alertWebhookUrl','alertCooldownMinutes','alertEnabled',
        'alertMessage','alertDestinationLabel','alertSaveButton','alertDisableAllButton'].map(id => [id, {value:'', innerText:'', checked:true, disabled:false}]));
    Object.assign(elements.userId, {value:'NS001'});
    Object.assign(elements.alertUserId, {value:'NS001'});
    elements.alertPointId.value='P01';
    elements.alertTemperatureThreshold.value='29.8';
    elements.alertConditionType.value='above';
    elements.alertNotifyTarget.value='discord';
    elements.alertCooldownMinutes.value='60';
    const calls = {load:[], history:[], applied:[], active:[]};
    const context = vm.createContext({document:{getElementById:id => elements[id]}, console:{log(){}}, window:{confirm:()=>true},
        alert:message => { throw new Error(message); },
        loadActiveAlertSetting:(...args) => calls.load.push(args),
        renderActiveAlertSettingEmpty:()=>{}, renderAlertStatusCard:()=>{}, loadAlertStatusCard:()=>{},
        renderAlertHistory:rows => calls.history.push(rows),
        applyAlertSettingToForm:setting => calls.applied.push(setting),
        renderActiveAlertSetting:setting => calls.active.push(setting), loadAlertHistory:()=>{},
        fetch:async () => reply({success:true, setting:null})});
    vm.runInContext('let alertFormUserId="NS001"; let activeAlertSettingExists=true; let alertSettingsBusy=false;', context);
    for(const name of ['handleAlertNotifyTargetChange','clearAlertForm','clearAlertFormIfUserChanged',
        'handleAlertUserIdInput','getSelectedAlertPointId','setAlertSettingsBusy','disableAllAlerts','saveAlertSetting']) vm.runInContext(source(name), context);
    return {elements,calls,context};
}
(async () => {
    // Compile every inline script as well as testing actual functions from the page.
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
    assert.match(html, /id="alertUserId"[\s\S]*?oninput="handleAlertUserIdInput\(\)"/);
    let f=fixture();
    f.elements.alertWebhookUrl.value='previous-user-secret';
    f.elements.alertUserId.value=' NS002 ';
    f.context.handleAlertUserIdInput();
    assert.equal(f.elements.userId.value,'NS002');
    assert.equal(f.elements.alertWebhookUrl.value,'');
    assert.equal(f.elements.alertTemperatureThreshold.value,'');
    assert.equal(f.calls.load[0][0],'NS002');
    assert.equal(vm.runInContext('activeAlertSettingExists',f.context),false);
    f.elements.userId.value='NS003';
    f.context.clearAlertFormIfUserChanged();
    assert.equal(f.elements.alertUserId.value,'NS003');
    f.elements.alertUserId.value='';
    f.context.handleAlertUserIdInput();
    assert.equal(f.elements.userId.value,'');
    assert.equal(f.calls.load.at(-1)[0],'');

    f=fixture();
    vm.runInContext(source('loadActiveAlertSetting'),f.context);
    f.elements.alertUserId.value='';
    await f.context.loadActiveAlertSetting('NS001');
    assert.equal(f.elements.alertUserId.value,'NS001');
    const pending=deferred();
    f.context.fetch=()=>pending.promise;
    const loading=f.context.loadActiveAlertSetting('NS001');
    f.elements.userId.value='NS002';
    pending.resolve(reply({success:true,setting:{user_id:'NS001'}}));
    await loading;
    assert.equal(f.calls.applied.length,1); // Only the earlier initial load was applied.

    f=fixture();
    let payload;
    f.context.fetch=async (url,options) => { payload=JSON.parse(options.body); return reply({success:true}); };
    await f.context.saveAlertSetting();
    assert.equal(payload.user_id,'NS001');
    assert.equal(payload.point_id,'P01');
    assert.equal(payload.temperature_threshold,29.8);
    assert.equal(f.elements.alertMessage.innerText,'保存しました');

    f=fixture();
    const savingReply=deferred();
    f.context.fetch=()=>savingReply.promise;
    const saving=f.context.saveAlertSetting();
    f.elements.alertUserId.value='NS002';
    f.context.handleAlertUserIdInput();
    f.elements.alertWebhookUrl.value='new-user-input';
    savingReply.resolve(reply({success:true}));
    await saving;
    assert.equal(f.elements.userId.value,'NS002');
    assert.equal(f.elements.alertWebhookUrl.value,'new-user-input');
    assert.notEqual(f.elements.alertMessage.innerText,'保存しました');
    assert.equal(f.calls.load.length,1);

    f=fixture();
    vm.runInContext(source('loadAlertHistory'),f.context);
    const historyReply=deferred();
    f.context.fetch=()=>historyReply.promise;
    const history=f.context.loadAlertHistory('NS001');
    f.elements.userId.value='NS002';
    historyReply.resolve(reply({success:true,history:[{user_id:'NS001'}]}));
    await history;
    assert.equal(f.calls.history.length,0);
    // Cancellation must never reach the mutation API.
    f=fixture();
    let requests=0;
    f.context.window.confirm=()=>false;
    f.context.fetch=async()=>{ requests++; throw new Error('Unexpected request'); };
    await f.context.disableAllAlerts();
    assert.equal(requests,0);

    f=fixture();
    f.context.fetch=async(url,options)=>{
        assert.equal(url,'disable_all_alerts.php');
        assert.deepEqual(JSON.parse(options.body),{scope:'user',user_id:'NS001',confirmed:true});
        return {ok:true,json:async()=>({success:true,disabled_count:3})};
    };
    f.context.loadActiveAlertSetting=async()=>{ vm.runInContext('activeAlertSettingExists=false',f.context); };
    await f.context.disableAllAlerts();
    assert.equal(f.elements.alertEnabled.checked,false);
    assert.match(f.elements.alertMessage.innerText,/3件/);
    assert.equal(f.elements.alertSaveButton.disabled,false);
    assert.equal(f.elements.alertDisableAllButton.disabled,false);

    f=fixture();
    const disableReply=deferred();
    f.context.fetch=()=>{ requests++; return disableReply.promise; };
    const disabling=f.context.disableAllAlerts();
    assert.equal(f.elements.alertSaveButton.disabled,true);
    const before=requests;
    await f.context.disableAllAlerts();
    await f.context.saveAlertSetting();
    assert.equal(requests,before);
    disableReply.resolve({ok:false,json:async()=>({success:false,error:'test failure'})});
    await disabling;
    assert.match(f.elements.alertMessage.innerText,/一括解除失敗/);
    assert.equal(f.elements.alertDisableAllButton.disabled,false);
    assert.equal(f.elements.alertEnabled.checked,true);
    console.log('PASS alert user_id input, bidirectional sync, credential clearing, initial restore, save target, stale setting/save/history responses; all inline scripts compile.');
    f=fixture();
    f.elements.userId.value='   ';
    f.context.fetch=async()=>{ throw new Error('Blank user must not send a request'); };
    f.context.window.confirm=()=>{ throw new Error('Blank user must not ask for confirmation'); };
    await f.context.disableAllAlerts();
    assert.match(f.elements.alertMessage.innerText,/user_idを入力/);

    f=fixture();
    let confirmation;
    f.context.window.confirm=text=>{ confirmation=text; return true; };
    const staleDisable=deferred();
    f.context.fetch=()=>staleDisable.promise;
    const staleDisabling=f.context.disableAllAlerts();
    assert.match(confirmation,/NS001/);
    f.elements.userId.value='NS002';
    f.elements.alertMessage.innerText='NS002の設定';
    staleDisable.resolve({ok:true,json:async()=>({success:true,disabled_count:2})});
    await staleDisabling;
    assert.equal(f.calls.load.length,0);
    assert.equal(f.elements.alertEnabled.checked,true);
    assert.equal(f.elements.alertMessage.innerText,'NS002の設定');
    assert.equal(f.elements.alertDisableAllButton.disabled,false);
    console.log('PASS disable confirmation, user scope, blank user, stale response, refresh, duplicate/save exclusion, failure recovery.');
})().catch(error => { console.error(error); process.exitCode=1; });
