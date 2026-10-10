'use strict';
const $=id=>document.getElementById(id);
const points=['P61','P62','P63','P64'];
let charts=[], loaded=null, requestId=0, syncing=false;
const jst=ms=>new Date(ms+9*3600000).toISOString().slice(0,16);
const timeLabel=ms=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);
const numeric=value=>value===null || value===undefined || value==='' || !Number.isFinite(Number(value)) ? null : Number(value);
const stamp=value=>Date.parse(value.replace(' ','T')+'+09:00');
function recent(){const now=Date.now();$('end').value=jst(now);$('start').value=jst(now-72*3600000);}
function status(message){$('status').textContent=message;}
function emptyGraphs(message){
 charts.forEach(c=>c.destroy());charts=[];$('charts').replaceChildren();
 points.forEach((point,index)=>{const card=document.createElement('section');card.className='chart-card';const title=document.createElement('h3');title.textContent=`No.${index+1} · ${point}`;const wrap=document.createElement('div');wrap.className='chart-container';const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`No.${index+1}の風速グラフ`);wrap.append(canvas);const note=document.createElement('p');note.className='chart-readout';note.textContent=message;card.append(title,wrap,note);$('charts').append(card);});
}
function history(){try{const values=JSON.parse(localStorage.getItem('g_flow_user_id_history')||'[]');return Array.isArray(values)?values.filter(v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v)).slice(0,10):[];}catch{return [];}}
function updateHistory(){const select=$('user-history');select.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='履歴';select.append(prompt);for(const user of history()){const option=document.createElement('option');option.value=user;option.textContent=user;select.append(option);}}
function remember(user){try{localStorage.setItem('g_flow_user_id',user);localStorage.setItem('g_flow_user_id_history',JSON.stringify([user,...history().filter(v=>v!==user)].slice(0,10)));}catch{status('user_idの履歴を端末へ保存できません。');}updateHistory();}
function switchTab(name){for(const tab of ['main','export']){const selected=tab===name;$('tab-'+tab).setAttribute('aria-selected',String(selected));$('tab-'+tab).tabIndex=selected?0:-1;$(tab+'-panel').hidden=!selected;}if(name==='main')requestAnimationFrame(()=>charts.forEach(c=>{c.resize();c.update('none');}));}
let cursorTime=null;
function midnightTimes(min,max){const day=86400000,offset=9*3600000,result=[];for(let t=Math.ceil((min+offset)/day)*day-offset;t<=max;t+=day)result.push(t);return result;}
function syncCursor(time){cursorTime=time;for(const chart of charts){const active=[];if(time!==null)chart.data.datasets.forEach((dataset,datasetIndex)=>{let best=-1,distance=Infinity;dataset.data.forEach((p,index)=>{const delta=Math.abs(p.x-time);if(p.y!==null&&delta<distance){best=index;distance=delta;}});if(best>=0&&distance<=600000)active.push({datasetIndex,index:best});});chart.setActiveElements(active);chart.tooltip.setActiveElements(active,{x:time===null?chart.chartArea.left:chart.scales.x.getPixelForValue(time),y:chart.chartArea.top});chart.update('none');}}
const flowGuides={id:'flowGuides',afterEvent(chart,args){const e=args.event,a=chart.chartArea;if(!a)return;if(e.type==='mouseout'){syncCursor(null);return;}if(!['mousemove','touchstart','touchmove'].includes(e.type))return;if(e.x<a.left||e.x>a.right||e.y<a.top||e.y>a.bottom){syncCursor(null);return;}const target=chart.scales.x.getValueForPixel(e.x);const times=chart.data.datasets.flatMap(d=>d.data.map(p=>p.x));const nearest=times.reduce((best,t)=>Math.abs(t-target)<Math.abs(best-target)?t:best,times[0]??target);syncCursor(nearest);args.changed=true;},afterDraw(chart){const a=chart.chartArea,x=chart.scales.x,c=chart.ctx;if(!a||!x)return;c.save();c.beginPath();c.rect(a.left,a.top,a.right-a.left,a.bottom-a.top);c.clip();c.lineWidth=1;const line=(time,color)=>{const px=x.getPixelForValue(time);c.strokeStyle=color;c.beginPath();c.moveTo(px,a.top);c.lineTo(px,a.bottom);c.stroke();};for(const time of midnightTimes(x.min,x.max))line(time,'rgba(0,0,0,0.28)');if(cursorTime!==null&&cursorTime>=x.min&&cursorTime<=x.max)line(cursorTime,'rgba(0,0,0,0.75)');c.restore();}};
function syncZoom({chart}){if(syncing)return;syncing=true;for(const c of charts){c.options.scales.x.min=chart.scales.x.min;c.options.scales.x.max=chart.scales.x.max;c.update('none');}matchWindAxes();syncing=false;}
function axisKey(){return 'g_flow_axes_v1_'+loaded.user;}
function readAxes(){try{return JSON.parse(localStorage.getItem(axisKey()))||{};}catch{return {};}}
function saveAxes(settings){try{localStorage.setItem(axisKey(),JSON.stringify(settings));}catch{status('縦軸設定を端末へ保存できません。');}}
function ownAxis(chart){const saved=readAxes()[chart.$point]||{};chart.options.scales.y.min=0;delete chart.options.scales.y.max;if(Number.isFinite(saved.max)&&saved.max>0)chart.options.scales.y.max=saved.max;}
function matchWindAxes(){const source=charts[0];if(!source)return;for(const chart of charts.slice(1))if(chart.$link.checked){chart.options.scales.y.min=source.scales.y.min;chart.options.scales.y.max=source.scales.y.max;chart.update('none');}}
function resetViews(){if(!loaded)return;for(const c of charts){if(c.resetZoom)c.resetZoom('none');c.options.scales.x.min=loaded.startMs;c.options.scales.x.max=loaded.endMs;ownAxis(c);c.update('none');}matchWindAxes();}
function addAxes(card,chart,index){
 const controls=document.createElement('div');controls.className='measured-axes';
 const label=document.createElement('label');label.textContent='m/s：';
 const min=document.createElement('input');min.type='number';min.value='0';min.readOnly=true;min.setAttribute('aria-label',chart.$point+' 最小');
 const max=document.createElement('input');max.type='number';max.step='any';max.min='0';max.placeholder='最大';max.value=chart.options.scales.y.max??'';max.setAttribute('aria-label',chart.$point+' 最大');
 const apply=document.createElement('button');apply.type='button';apply.textContent='縦軸反映';
 const error=document.createElement('span');error.className='error';error.setAttribute('role','alert');
 label.append(min,max);controls.append(label,apply,error);
 apply.onclick=()=>{const value=max.value===''?undefined:Number(max.value);if(value!==undefined&&(!Number.isFinite(value)||value<=0)){error.textContent='最大は0より大きくしてください。';return;}error.textContent='';const saved=readAxes();saved[chart.$point]={...saved[chart.$point],max:value};saveAxes(saved);ownAxis(chart);chart.update('none');matchWindAxes();};
 if(index){const linked=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=readAxes()[chart.$point]?.matchesP61!==false;checkbox.setAttribute('aria-label',chart.$point+' P61と同じ縦軸');linked.append(checkbox,document.createTextNode('P61と同じ縦軸'));controls.append(linked);chart.$link=checkbox;
 const setControls=()=>{max.disabled=checkbox.checked;apply.disabled=checkbox.checked;};
 checkbox.onchange=()=>{const saved=readAxes();saved[chart.$point]={...saved[chart.$point],matchesP61:checkbox.checked};saveAxes(saved);setControls();ownAxis(chart);chart.update('none');matchWindAxes();};setControls();}
 card.insertBefore(controls,card.children[1]);
}
function render(){
    charts.forEach(c=>c.destroy());charts=[];$('charts').replaceChildren();
    if(typeof Chart==='undefined')throw new Error('グラフのライブラリを読み込めません。ページを再読み込みしてください。');

    points.forEach((point,index)=>{
        const rows=loaded.rows.filter(r=>r.point_id===point);
        const card=document.createElement('section');card.className='chart-card';
        const title=document.createElement('h3');title.textContent=`No.${index+1} · ${point}`;
        const reset=document.createElement('button');reset.type='button';reset.className='chart-reset-button';reset.textContent='表示リセット';reset.onclick=resetViews;title.append(reset);
        const wrap=document.createElement('div');wrap.className='chart-container';const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`No.${index+1}の風速グラフ`);canvas.setAttribute('role','img');wrap.append(canvas);
        const readout=document.createElement('p');readout.className='chart-readout';
        const valid=rows.filter(r=>numeric(r.wind_speed_avg)!==null||numeric(r.wind_speed_max)!==null);const last=valid.at(-1);
        readout.textContent=last ? `最新測定 ${last.recorded_at} JST ｜ 平均 ${numeric(last.wind_speed_avg)?.toFixed(2)??'—'} / 最大 ${numeric(last.wind_speed_max)?.toFixed(2)??'—'} m/s` : 'この期間の風速データはありません。';
        card.append(title,wrap,readout);$('charts').append(card);
        charts.push(new Chart(canvas,{type:'line',plugins:[flowGuides],data:{datasets:[['wind_speed_avg','10分平均風速','rgb(0,135,120)'],['wind_speed_max','10分最大風速','rgb(210,90,40)']].map(([key,label,color])=>({label,borderColor:color,borderWidth:2,pointRadius:0,tension:.2,spanGaps:false,data:rows.map(r=>({x:stamp(r.recorded_at),y:numeric(r[key])})).filter(r=>Number.isFinite(r.x))}))},options:{responsive:true,maintainAspectRatio:false,animation:false,parsing:false,interaction:{mode:'nearest',intersect:false},scales:{x:{type:'linear',min:loaded.startMs,max:loaded.endMs,ticks:{maxTicksLimit:6,callback:timeLabel}},y:{min:0,title:{display:true,text:'風速（m/s）'},ticks:{callback:v=>Number(v).toFixed(1)}}},plugins:{tooltip:{enabled:true,backgroundColor:'rgba(255,255,255,.95)',borderColor:'#b7cddd',borderWidth:1,titleColor:'#000',bodyColor:'#000',callbacks:{title:items=>items.length?timeLabel(items[0].parsed.x)+' JST':'',label:item=>`${item.dataset.label}: ${item.parsed.y.toFixed(2)} m/s`}},zoom:{limits:{x:{min:loaded.startMs,max:loaded.endMs,minRange:600000},y:{min:0}},zoom:{drag:{enabled:true,backgroundColor:'rgba(30,120,255,.35)',borderColor:'rgba(30,120,255,.8)',borderWidth:1},mode:'xy',onZoomStart:()=>{syncCursor(null);},onZoomComplete:syncZoom}}}}}));
        const chart=charts.at(-1);chart.$point=point;ownAxis(chart);chart.update('none');addAxes(card,chart,index);
    });
    matchWindAxes();
}
async function load(event){event?.preventDefault();if(!$('data-form').reportValidity())return;
    const now=Date.now();const user=$('user-id').value.trim(),start=jst(now-72*3600000),end=jst(now);
    const startMs=stamp(start.replace('T',' ')+':00'),endMs=stamp(end.replace('T',' ')+':00');
    if(endMs<startMs||endMs-startMs>366*86400000){status('開始・終了日時を確認してください（最大366日）。');return;}
    const id=++requestId;loaded=null;$('export-context').textContent='出力対象：読み込み中';emptyGraphs('風速データを読み込み中です。');status('風速データを読み込み中です。');
    try{const query=new URLSearchParams({user_id:user,start:start.replace('T',' ')+':00',end:end.replace('T',' ')+':00'});const response=await fetch('data.php?'+query,{cache:'no-store'});const body=await response.json();if(id!==requestId)return;if(!response.ok)throw new Error(body.message||'取得できませんでした。');if(!Array.isArray(body.rows))throw new Error('データの形式を確認してください。');loaded={user,start,end,startMs,endMs,rows:body.rows};render();remember(user);$('export-context').textContent=`出力対象：${user} ｜ ${start.replace('T',' ')}〜${end.replace('T',' ')} JST ｜ ${body.rows.length}件`;status(`${user} ｜ ${start.replace('T',' ')}〜${end.replace('T',' ')} JST ｜ ${body.rows.length}件`);
    }catch(error){if(id!==requestId)return;loaded=null;$('export-context').textContent='出力対象：未選択';emptyGraphs('データを取得できませんでした。再度「表示」を押してください。');status(error.message);}
}
function csvCell(value){const text=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';}
function download(loaded){if(!loaded)return;const groups=points.map(point=>loaded.rows.filter(row=>row.point_id===point).sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at)));
const fields=['user_id','point_id','ハウス名','測定日時（JST）','10分最大風速（m/s）','10分平均風速（m/s）'];
const lines=[points.flatMap((point,index)=>index?[ '',...fields]:fields)];
for(let rowIndex=0;rowIndex<Math.max(0,...groups.map(group=>group.length));rowIndex++){
 lines.push(groups.flatMap((group,index)=>{const row=group[rowIndex];const cells=row?[loaded.user,points[index],`No.${index+1}`,row.recorded_at,row.wind_speed_max,row.wind_speed_avg]:Array(6).fill('');return index?['',...cells]:cells;}));
}const blob=new Blob(['\uFEFF'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`G-Flow_${loaded.user}_${loaded.start.replace(/\D/g,'')}_${loaded.end.replace(/\D/g,'')}_JST.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
recent();$('user-id').value=localStorage.getItem('g_flow_user_id')||localStorage.getItem('usui_user_id')||'';
$('data-form').addEventListener('submit',load);
$('export-form').addEventListener('submit',async event=>{event.preventDefault();if(!$('data-form').reportValidity()||!$('export-form').reportValidity())return;const user=$('user-id').value.trim(),start=$('start').value,end=$('end').value,startMs=stamp(start.replace('T',' ')+':00'),endMs=stamp(end.replace('T',' ')+':00');if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<startMs||endMs-startMs>366*86400000){$('export-context').textContent='開始・終了日時を確認してください（最大366日）。';return;}$('csv').disabled=true;$('export-context').textContent='CSVデータを取得中です。';try{const query=new URLSearchParams({user_id:user,start:start.replace('T',' ')+':00',end:end.replace('T',' ')+':00'}),response=await fetch('data.php?'+query,{cache:'no-store'}),body=await response.json();if(!response.ok||!Array.isArray(body.rows))throw new Error(body.message||'CSVデータを取得できませんでした。');download({user,start,end,rows:body.rows});$('export-context').textContent=`出力対象：${user} ｜ ${start.replace('T',' ')}〜${end.replace('T',' ')} JST ｜ ${body.rows.length}件`;}catch(error){$('export-context').textContent=error.message;}finally{$('csv').disabled=false;}});

updateHistory();
$('user-history').addEventListener('change',()=>{if($('user-history').value)$('user-id').value=$('user-history').value;});
for(const name of ['main','export']){
 $('tab-'+name).addEventListener('click',()=>switchTab(name));
 $('tab-'+name).addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const target=event.key==='Home'?'main':event.key==='End'?'export':name==='main'?'export':'main';switchTab(target);$('tab-'+target).focus();});
}
