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
function syncZoom({chart}){if(syncing)return;syncing=true;for(const c of charts){c.options.scales.x.min=chart.scales.x.min;c.options.scales.x.max=chart.scales.x.max;c.update('none');}syncing=false;}
function axis(){const min=Number($('axis-min').value), max=$('axis-max').value===''?undefined:Number($('axis-max').value);if(!Number.isFinite(min)||min<0||(max!==undefined&&(!Number.isFinite(max)||max<=min)))throw new Error('縦軸の最大値は最小値より大きくしてください。');return {min,max};}
function render(){
    charts.forEach(c=>c.destroy());charts=[];$('charts').replaceChildren();
    if(typeof Chart==='undefined')throw new Error('グラフのライブラリを読み込めません。ページを再読み込みしてください。');
    const limits=axis();
    points.forEach((point,index)=>{
        const rows=loaded.rows.filter(r=>r.point_id===point);
        const card=document.createElement('section');card.className='chart-card';
        const title=document.createElement('h3');title.textContent=`No.${index+1} · ${point}`;
        const wrap=document.createElement('div');wrap.className='chart-container';const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`No.${index+1}の風速グラフ`);canvas.setAttribute('role','img');wrap.append(canvas);
        const readout=document.createElement('p');readout.className='chart-readout';
        const valid=rows.filter(r=>numeric(r.wind_speed_avg)!==null||numeric(r.wind_speed_max)!==null);const last=valid.at(-1);
        readout.textContent=last ? `最新測定 ${last.recorded_at} JST ｜ 平均 ${numeric(last.wind_speed_avg)?.toFixed(2)??'—'} / 最大 ${numeric(last.wind_speed_max)?.toFixed(2)??'—'} m/s` : 'この期間の風速データはありません。';
        card.append(title,wrap,readout);$('charts').append(card);
        charts.push(new Chart(canvas,{type:'line',data:{datasets:[['wind_speed_avg','10分平均風速','rgb(0,135,120)'],['wind_speed_max','10分最大風速','rgb(210,90,40)']].map(([key,label,color])=>({label,borderColor:color,borderWidth:2,pointRadius:0,tension:.2,spanGaps:false,data:rows.map(r=>({x:stamp(r.recorded_at),y:numeric(r[key])})).filter(r=>Number.isFinite(r.x))}))},options:{responsive:true,maintainAspectRatio:false,animation:false,parsing:false,interaction:{mode:'nearest',intersect:false},scales:{x:{type:'linear',min:loaded.startMs,max:loaded.endMs,ticks:{maxTicksLimit:6,callback:timeLabel}},y:{...limits,title:{display:true,text:'風速（m/s）'},ticks:{callback:v=>Number(v).toFixed(1)}}},plugins:{tooltip:{callbacks:{title:items=>items.length?timeLabel(items[0].parsed.x)+' JST':'',label:item=>`${item.dataset.label}: ${item.parsed.y.toFixed(2)} m/s`}},zoom:{zoom:{drag:{enabled:true},mode:'x',onZoomComplete:syncZoom}}}}}));
    });
}
async function load(event){event?.preventDefault();if(!$('data-form').reportValidity())return;
    const user=$('user-id').value.trim(),start=$('start').value,end=$('end').value;
    const startMs=stamp(start.replace('T',' ')+':00'),endMs=stamp(end.replace('T',' ')+':00');
    if(endMs<startMs||endMs-startMs>366*86400000){status('開始・終了日時を確認してください（最大366日）。');return;}
    const id=++requestId;loaded=null;$('csv').disabled=true;charts.forEach(c=>c.destroy());charts=[];$('charts').replaceChildren();status('風速データを読み込み中です。');
    try{const query=new URLSearchParams({user_id:user,start:start.replace('T',' ')+':00',end:end.replace('T',' ')+':00'});const response=await fetch('data.php?'+query,{cache:'no-store'});const body=await response.json();if(id!==requestId)return;if(!response.ok)throw new Error(body.message||'取得できませんでした。');if(!Array.isArray(body.rows))throw new Error('データの形式を確認してください。');loaded={user,start,end,startMs,endMs,rows:body.rows};render();localStorage.setItem('g_flow_user_id',user);$('csv').disabled=false;status(`${user} ｜ ${start.replace('T',' ')}〜${end.replace('T',' ')} JST ｜ ${body.rows.length}件`);
    }catch(error){if(id!==requestId)return;loaded=null;$('csv').disabled=true;status(error.message);}
}
function csvCell(value){const text=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';}
function download(){if(!loaded)return;const lines=[['user_id','ハウス名','point_id','測定日時（JST）','10分平均風速（m/s）','10分最大風速（m/s）'],...loaded.rows.map(r=>[loaded.user,`No.${points.indexOf(r.point_id)+1}`,r.point_id,r.recorded_at,r.wind_speed_avg,r.wind_speed_max])];const blob=new Blob(['\uFEFF'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`G-Flow_${loaded.user}_${loaded.start.replace(/\D/g,'')}_${loaded.end.replace(/\D/g,'')}_JST.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
recent();$('user-id').value=localStorage.getItem('g_flow_user_id')||localStorage.getItem('usui_user_id')||'';
$('data-form').addEventListener('submit',load);$('last72').addEventListener('click',()=>{recent();load();});
$('axis-form').addEventListener('submit',event=>{event.preventDefault();try{const limits=axis();charts.forEach(c=>{c.options.scales.y.min=limits.min;c.options.scales.y.max=limits.max;c.update('none');});}catch(error){status(error.message);}});
$('reset').addEventListener('click',()=>{if(!loaded)return;charts.forEach(c=>{c.options.scales.x.min=loaded.startMs;c.options.scales.x.max=loaded.endMs;c.update('none');});});$('csv').addEventListener('click',download);
