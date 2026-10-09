'use strict';
window.NextCorrection=(()=>{
  const $=id=>document.getElementById(id),finite=v=>typeof v==='number'&&Number.isFinite(v);
  const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const japanStamp=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  const definitions=[['temperature_2m','temperature','温度','℃'],['relative_humidity_2m','humidity','湿度','％ポイント']];
  const fmt=v=>finite(v)?v.toFixed(1):'—';
  const node=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
  let payload=null,settings=null,active=false,sequence=0,controller=null,charts=[],result=[],comparisons=[],cache=null;
  const userStorageKey='utech_next_correction_user_v1',historyStorageKey='utech_next_correction_user_history_v1';
  const validUser=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
  let userHistory=[],stored=null,token='',revision=0,shared=null,trial=false,automaticPreview=false,loadedDate=null,sharedLoaded=false,conflict=false;
  const selectedDate=()=>payload?.days[payload.days.length-1]?.date;
  const config=()=>({source_user_id:$('correction-user').value.trim()||null,comparison_days:Number($('correction-days').value)});
  const canTrial=()=>Boolean(stored);
  function renderUserHistory(){const select=$('correction-user-history');select.replaceChildren(new Option('履歴',''));for(const user of userHistory)select.append(new Option(user,user));}
  function rememberUser(user){
    if(user)userHistory=[user,...userHistory.filter(value=>value!==user)].slice(0,10);
    renderUserHistory();
    try{localStorage.setItem(userStorageKey,user);localStorage.setItem(historyStorageKey,JSON.stringify(userHistory));$('correction-user-storage').textContent='前回のIDと履歴はこのブラウザーに保存します。補正の共有設定とは別です。';}
    catch{$('correction-user-storage').textContent='ブラウザーへID履歴を保存できません。この画面内では選択できます。';}
  }
  function aggregate(target,count,forecastDays,measurements,end=japanStamp().slice(0,10)){
    const start=shift(end,1-count),buckets=new Map();
    for(const row of measurements){if(row.point_id!=='P01'||typeof row.recorded_at!=='string')continue;const key=row.recorded_at.slice(0,13);if(key.slice(0,10)<shift(start,-1)||key.slice(0,10)>end)continue;
      if(!buckets.has(key))buckets.set(key,{temperature:[],humidity:[]});
      for(const [,field] of definitions)if(finite(row[field])&&(field!=='humidity'||row[field]>=0&&row[field]<=100)&&(field!=='temperature'||row[field]>-237.3))buckets.get(key)[field].push(row[field]);
    }
    const byDate=new Map(forecastDays.map(day=>[day.date,new Map(day.rows.map(row=>[row.forecast_for.slice(0,13),row]))]));
    const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
    const hours=Array.from({length:24},(_,hour)=>{
      const output={hour,temperature_2m:null,relative_humidity_2m:null};
      for(const [forecastKey,field] of definitions){const daily=[],shifted=!(buckets.get(end+' '+String(hour).padStart(2,'0'))?.[field]?.length),fieldEnd=shifted?shift(end,-1):end,fieldStart=shift(fieldEnd,1-count);
        for(let i=0;i<count;i++){const date=shift(fieldStart,i),key=date+' '+String(hour).padStart(2,'0'),forecast=byDate.get(date)?.get(key)?.[forecastKey],values=buckets.get(key)?.[field]||[];
          const valid=finite(forecast)&&(field!=='humidity'||forecast>=0&&forecast<=100)&&(field!=='temperature'||forecast>-237.3);
          const measured=mean(values);daily.push({date,forecast:valid?forecast:null,measured,count:values.length,difference:valid&&measured!==null?measured-forecast:null});
        }
        const used=daily.filter(day=>finite(day.difference));output[forecastKey]={difference:mean(used.map(day=>day.difference)),forecast:mean(used.map(day=>day.forecast)),measured:mean(used.map(day=>day.measured)),days:used.length,count:used.reduce((sum,day)=>sum+day.count,0),start:fieldStart,end:fieldEnd,shifted,daily};
      }return output;
    });return {target,start,end,count,hours};
  }
  function correctedRows(rows,comparison){return rows.map(row=>{
    const hour=Number(row.forecast_for.slice(11,13)),info=comparison.hours[hour],copy={...row};
    for(const [key] of definitions){const difference=info[key].difference;if(finite(copy[key])&&finite(difference))copy[key]+=difference;}
    copy.humidity_clamped=finite(copy.relative_humidity_2m)&&(copy.relative_humidity_2m<0||copy.relative_humidity_2m>100);
    if(finite(copy.relative_humidity_2m))copy.relative_humidity_2m=Math.max(0,Math.min(100,copy.relative_humidity_2m));
    if(finite(copy.temperature_2m)&&copy.temperature_2m>-237.3&&finite(copy.relative_humidity_2m)){
      const difference=6.1078*10**(7.5*copy.temperature_2m/(237.3+copy.temperature_2m))*(1-copy.relative_humidity_2m/100);
      copy.corrected_vpd=difference/10;copy.corrected_deficit=216.7*difference/(copy.temperature_2m+273.15);
    }else {copy.corrected_vpd=null;copy.corrected_deficit=null;}
    return copy;
  });}
  async function json(url,signal){const response=await fetch(url,{cache:'no-store',signal});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'補正データを取得できません。');return data;}
  function clear(){charts.forEach(chart=>chart.destroy());charts=[];for(const chart of $('correction-water-charts').$waterCharts||[])chart.destroy();$('correction-water-charts').$waterCharts=[];for(const id of ['correction-water-charts','correction-differences','correction-table'])$(id).replaceChildren();result=[];comparisons=[];$('correction-csv').disabled=true;$('correction-export-trial').disabled=true;$('correction-period').textContent='';$('correction-export-note').textContent='翌日の実測値補正を試算すると出力できます。';}
  function controls(){const valid=!config().source_user_id||validUser(config().source_user_id);$('correction-save').disabled=!token||!valid||conflict;$('correction-recalculate').disabled=!token||!canTrial()||!valid;$('correction-restore').disabled=!stored||!trial;}
  function fillConfig(value){$('correction-user').value=value?.source_user_id||'';$('correction-days').value=String(value?.comparison_days||5);}
  function display(days,current,isTrial){clear();result=days;comparisons=days.filter(day=>day.comparison).map(day=>day.comparison);NextWater.render($('correction-water-charts'),days,'live');
    if(current?.comparison){renderComparison(current.comparison);const comp=current.comparison;$('correction-period').textContent='比較期間：'+comp.start+'〜'+comp.end+'（'+comp.count+'日間）。比較最終日の実測がない時間帯・項目は1日前へずらします。実際の期間・有効日数は比較表に表示します。'+(current.output_type==='保存履歴'?'予報採用時に固定した保存値です。':'現在の設定による'+current.output_type+'です。履歴には保存しません。');}
    const missing=stored.days.filter(day=>!day.snapshot).map(day=>day.date),job=stored.days[stored.days.length-1].job;
    const reconstructed=days.filter(day=>day.output_type==='再計算').map(day=>day.date),unavailable=days.filter(day=>day.missing_history).map(day=>day.date);
    $('correction-message').textContent=(isTrial&&current?.output_type!=='保存履歴'?(current?.output_type==='再計算'?'再計算中：':'試算中：')+config().comparison_days+'日':'保存値')+'　補正実測先：'+(current?.source_user_id||config().source_user_id||'未設定')+(current?.acquisition_status==='source_unset'?'（実測先未設定・補正なし）':current?.acquisition_status==='measurement_fetch_failed'?'（実測取得失敗・補正なし）':'')+(reconstructed.length?'　現在の設定で再計算：'+reconstructed.join('、'):'')+(unavailable.length?'　保存履歴・予報データなし：'+unavailable.join('、'):'')+(!isTrial&&missing.length?'　保存履歴なし：'+missing.join('、'):'')+(!current&&job&&job.status!=='complete'?'　補正結果の保存待ち（取得試行'+job.attempts+'回）':'');
    if(isTrial){const available=days.filter(day=>day.comparison&&day.output_type!=='保存履歴');$('correction-csv').disabled=!available.length;$('correction-export-trial').disabled=!available.length;$('correction-export-note').textContent='画面の再計算・試算を出力します。当時の保存履歴とは別です。';}
    $('correction-history-csv').disabled=!stored.days.some(day=>day.snapshot);controls();
  }
  function savedDays(){return stored.days.map(day=>day.snapshot||{...NextWater.calculate(day.date,[],null),output_type:'保存履歴なし',missing_history:true});}
  function restore(){if(!stored)return;trial=false;automaticPreview=false;fillConfig(shared);display(savedDays(),stored.days[stored.days.length-1].snapshot,false);}
  async function run(){if(!payload||!active)return;const runId=++sequence;if(controller)controller.abort();controller=new AbortController();const signal=controller.signal;clear();controls();$('correction-message').textContent='保存した補正結果を読み込み中です。';
    try{const data=await json('api/correction.php?date='+selectedDate(),signal);if(runId!==sequence)return;stored=data;token=data.token;loadedDate=selectedDate();
      if(!sharedLoaded||conflict){shared=data.settings;revision=data.settings.revision;sharedLoaded=true;conflict=false;fillConfig(shared);}restore();if(data.days.some(day=>!day.snapshot))await runTrial(true);
    }catch(error){if(error.name!=='AbortError'&&runId===sequence){stored=null;token='';controls();$('correction-message').textContent=error.message;}}
  }
  function validWater(){if(!settings)return null;const common=finite(settings.transmission_percent)&&settings.transmission_percent>=0&&settings.transmission_percent<=100&&finite(settings.wind_speed)&&settings.wind_speed>=0&&Number.isInteger(settings.cycles)&&settings.cycles>=1;return common&&settings.trees.length===6&&settings.trees.every(tree=>finite(tree.leaf_area)&&tree.leaf_area>0&&finite(tree.kc)&&tree.kc>=0&&finite(tree.flow)&&tree.flow>0)?settings:null;}
  async function post(body){return jsonPost('api/correction.php',body,controller?.signal);}
  async function jsonPost(url,body,signal){const response=await fetch(url,{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json','X-Correction-Token':token},body:JSON.stringify(body)});const data=await response.json();if(!response.ok||!data.success){if(response.status===409)conflict=true;throw new Error(data.message||'補正設定を保存できません。');}return data;}
  async function runTrial(reconstruct=false){if(!stored||!canTrial())return;
    const value=config();if(value.source_user_id&&!validUser(value.source_user_id)){$('correction-message').textContent='user_idを確認してください。';controls();return;}
    const runId=++sequence;if(controller)controller.abort();controller=new AbortController();clear();$('correction-message').textContent='保存済み予報と実測値から計算中です。';trial=true;automaticPreview=reconstruct===true;controls();rememberUser(value.source_user_id||'');
    try{const data=await post({action:reconstruct===true?'reconstruct':'trial',date:selectedDate(),settings:value,water_settings:validWater()});if(runId!==sequence)return;const fallback=savedDays(),days=data.days?data.days.map((day,i)=>day.result||fallback[i]):fallback;if(!data.days&&data.result)days[days.length-1]=data.result;display(days,data.result,true);}
    catch(error){if(error.name!=='AbortError'&&runId===sequence){if(reconstruct===true)restore();$('correction-message').textContent=error.message;controls();}}
  }
  async function save(){const value=config();if(value.source_user_id&&!validUser(value.source_user_id))return;$('correction-save').disabled=true;
    try{const data=await jsonPost('api/correction.php',{action:'save',revision,settings:value});shared=data.settings;revision=shared.revision;rememberUser(value.source_user_id||'');$('correction-save-message').textContent='補正設定を保存しました。次回の予報採用から使用します。過去の履歴と今回の保存値は変更しません。';}
    catch(error){$('correction-save-message').textContent=error.message;}finally{controls();}
  }
  function download(days,type){if(!days.length)return;const url=URL.createObjectURL(new Blob([csv(days)],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='utech-next-correction_'+type+'_'+days[0].date+'_'+days[days.length-1].date+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function exportHistory(){const start=$('csv-start').value,end=$('csv-end').value,message=$('correction-history-message');if(!start||!end||start>end){message.textContent='開始・終了日時を確認してください。';return;}$('correction-export-history').disabled=true;
    try{const data=await json('api/correction.php?'+new URLSearchParams({start:start.slice(0,10),end:end.slice(0,10)}));const missing=data.days.filter(day=>!day.snapshot).map(day=>day.date);const days=data.days.filter(day=>day.snapshot).map(day=>({...day.snapshot,trees:day.snapshot.trees.map(tree=>({...tree,hours:tree.hours.filter(h=>{const time=h.time.replace(' ','T').slice(0,16);return time>=start&&time<=end;})}))}));if(days.some(day=>day.trees.some(tree=>tree.hours.length)))download(days,'history');message.textContent=(days.length?'保存履歴を出力しました。':'保存履歴がありません。')+(missing.length?' 保存履歴なし：'+missing.join('、'):'');}
    catch(error){message.textContent=error.message;}finally{$('correction-export-history').disabled=false;}
  }
  function description(info,unit){return `${info.start||''}〜${info.end||''}　予報平均 ${fmt(info.forecast)}　実測平均 ${fmt(info.measured)}　補正差 ${fmt(info.difference)} ${unit}　使用${info.days}日／測定${info.count}件`+(info.count===1?'（測定1件）':'')+(info.difference===null?'　補正なし（データ不足）':'');}
  function renderComparison(comparison){
    const table=$('correction-table'),head=node('tr','');for(const title of ['時間帯','温度（予報・実測・差・件数）','湿度（予報・実測・差・件数）','補正後の気温・湿度','補正後の飽差'])head.append(node('th',title));table.append(head);
    for(const info of comparison.hours){const row=node('tr','');row.append(node('th',`${String(info.hour).padStart(2,'0')}:00～`));for(const [key,,,unit] of definitions)row.append(node('td',description(info[key],unit)));const corrected=result[result.length-1].rows.find(value=>value.forecast_for===comparison.target+' '+String(info.hour).padStart(2,'0')+':00:00');row.append(node('td',`${fmt(corrected?.temperature_2m)} ℃　${fmt(corrected?.relative_humidity_2m)} ％${corrected?.humidity_clamped?'（範囲調整）':''}`),node('td',`${fmt(corrected?.corrected_deficit)} g/m³　${finite(corrected?.corrected_vpd)?corrected.corrected_vpd.toFixed(2):'—'} kPa`));table.append(row);}
    if(!window.Chart)return;
    function sync(hour){for(const chart of charts){chart.$hour=hour;chart.$readout.textContent=hour===null?'ポインタを合わせると時刻が連動します。':`${String(hour).padStart(2,'0')}:00～　`+description(comparison.hours[hour][chart.$key],chart.$unit);chart.draw();}}
    for(const [key,,title,unit] of definitions){const card=node('article','','chart-card'),heading=node('h3',title+'の補正差'),reset=node('button','表示リセット','chart-reset-button');reset.type='button';heading.append(reset);const wrap=node('div','','chart-container'),canvas=document.createElement('canvas'),readout=node('p','ポインタを合わせると時刻が連動します。','chart-readout');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',title+'の時間帯別補正差。詳細は比較表に表示。');wrap.append(canvas);card.append(heading,wrap,readout);$('correction-differences').append(card);
      const data=[{label:'平均差',data:comparison.hours.map(info=>({x:info.hour+.5,y:info[key].difference})),borderColor:key==='temperature_2m'?'#dc5575':'#329bcc',borderWidth:3,pointRadius:2,spanGaps:false}];
      for(let i=-1;i<comparison.count;i++){const date=shift(comparison.start,i);data.push({label:date,data:comparison.hours.map(info=>({x:info.hour+.5,y:info[key].daily.find(day=>day.date===date)?.difference??null})),borderColor:'rgba(90,120,150,.3)',borderWidth:1,pointRadius:0,spanGaps:false});}
      const plugin={id:'correctionCrosshair',afterEvent(chart,args){if(args.event.type==='mouseout')sync(null);else if(args.inChartArea&&['mousemove','click','touchstart','touchmove'].includes(args.event.type))sync(Math.max(0,Math.min(23,Math.floor(chart.scales.x.getValueForPixel(args.event.x)))));},afterDraw(chart){const ctx=chart.ctx,a=chart.chartArea;ctx.save();ctx.beginPath();ctx.rect(a.left,a.top,a.right-a.left,a.bottom-a.top);ctx.clip();const zero=chart.scales.y.getPixelForValue(0);ctx.strokeStyle='#8796a7';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(a.left,zero);ctx.lineTo(a.right,zero);ctx.stroke();ctx.setLineDash([]);if(chart.$hour!==null&&chart.$hour!==undefined){const hour=chart.$hour,x=chart.scales.x.getPixelForValue(hour+.5),v=comparison.hours[hour][key].difference;ctx.strokeStyle='rgba(0,0,0,.6)';ctx.beginPath();ctx.moveTo(x,a.top);ctx.lineTo(x,a.bottom);ctx.stroke();if(finite(v)){ctx.font='bold 12px sans-serif';ctx.fillStyle='#111';const label=fmt(v)+' '+unit;ctx.fillText(label,Math.max(a.left,Math.min(a.right-ctx.measureText(label).width,x+6)),Math.max(a.top+14,Math.min(a.bottom-5,chart.scales.y.getPixelForValue(v)-8)));}}ctx.restore();}};
      const chart=new Chart(canvas,{type:'line',data:{datasets:data},plugins:[plugin],options:{animation:false,responsive:true,maintainAspectRatio:false,parsing:false,plugins:{tooltip:{enabled:false},legend:{labels:{filter:item=>item.datasetIndex===0}},zoom:{pan:{enabled:false},zoom:{drag:{enabled:!matchMedia('(max-width:600px)').matches},mode:'xy',onZoomComplete:({chart:changed})=>{for(const other of charts)if(other!==changed){other.options.scales.x.min=changed.scales.x.min;other.options.scales.x.max=changed.scales.x.max;other.update('none');}sync(null);}}}},scales:{x:{type:'linear',min:0,max:24,ticks:{stepSize:6,callback:value=>String(value).padStart(2,'0')+':00'}},y:{suggestedMin:0,suggestedMax:0,title:{display:true,text:unit}}}}});chart.$key=key;chart.$unit=unit;chart.$readout=readout;charts.push(chart);
      reset.onclick=()=>{for(const item of charts){item.resetZoom?.('none');item.options.scales.x.min=0;item.options.scales.x.max=24;delete item.options.scales.y.min;delete item.options.scales.y.max;item.update('none');}sync(null);};
    }
  }
  function csv(days){const lines=[['output_type','target_date','fetched_at_jst','source_user_id','comparison_days','comparison_start','comparison_end','interval_start_jst','tree','hourly_litres','cumulative_litres','cumulative_complete','daily_litres','daily_minutes','cycle_seconds','temperature_difference_c','temperature_used_days','temperature_measurements','humidity_difference_points','humidity_used_days','humidity_measurements','corrected_temperature_c','corrected_humidity_percent','corrected_deficit_g_m3','corrected_vpd_kpa','humidity_clamped','temperature_status','humidity_status','formula_version','leaf_area_m2','kc','nozzle_l_min','transmission_percent','indoor_wind_m_s','cycles_per_day','temperature_comparison_start','temperature_comparison_end','humidity_comparison_start','humidity_comparison_end','measurement_cutoff_jst','acquisition_status','calculation_status','temperature_daily_evidence_json','humidity_daily_evidence_json']];
    for(const day of days)for(const tree of day.trees)for(const h of tree.hours){const hour=Number(h.time.slice(11,13)),t=day.comparison.hours[hour].temperature_2m,r=day.comparison.hours[hour].relative_humidity_2m,row=day.rows.find(row=>row.forecast_for===h.time),p=day.settings?.trees[tree.number-1];lines.push([day.output_type||'試算',day.date,day.fetched_at,day.source_user_id,day.comparison.count,day.comparison.start,day.comparison.end,h.time,tree.number,h.litres,h.cumulative,h.cumulative_complete?1:0,tree.daily_litres,tree.daily_minutes,tree.cycle_seconds,t.difference,t.days,t.count,r.difference,r.days,r.count,row?.temperature_2m,row?.relative_humidity_2m,row?.corrected_deficit,row?.corrected_vpd,row?.humidity_clamped?1:0,t.difference===null?'補正なし（データ不足）':'補正あり',r.difference===null?'補正なし（データ不足）':'補正あり',day.version,p?.leaf_area,p?.kc,p?.flow,day.settings?.transmission_percent,day.settings?.wind_speed,day.settings?.cycles,t.start,t.end,r.start,r.end,day.measurement_cutoff,day.acquisition_status,!day.settings?'未計算':h.litres===null?'欠測':'計算済み',JSON.stringify(t.daily),JSON.stringify(r.daily)]);}
    return '\uFEFF'+lines.map(line=>line.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
  }
  function initialize(){for(let i=1;i<=10;i++)$('correction-days').append(new Option(i+'日間',String(i),false,i===5));
    try{const saved=localStorage.getItem(userStorageKey),history=JSON.parse(localStorage.getItem(historyStorageKey)||'[]');userHistory=Array.isArray(history)?[...new Set(history.filter(validUser))].slice(0,10):[];if(validUser(saved))$('correction-user').value=saved;}catch{}
    renderUserHistory();$('correction-user-history').onchange=event=>{if(event.target.value){$('correction-user').value=event.target.value;runTrial();}};
    $('correction-form').onsubmit=event=>{event.preventDefault();runTrial();};$('correction-days').onchange=runTrial;$('correction-user').onchange=runTrial;$('correction-save').onclick=save;$('correction-restore').onclick=()=>{sequence++;controller?.abort();restore();};
    const tabs=[$('water-estimate-tab'),$('water-correction-tab'),$('water-rules-tab')];function select(tab){active=tab===tabs[1];for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;$(item.getAttribute('aria-controls')).hidden=!selected;}if(active){if(stored&&loadedDate===selectedDate())resize();else run();}else if(tab===tabs[0])NextWater.resize();}
    for(const tab of tabs){tab.onclick=()=>select(tab);tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const target=event.key==='Home'?tabs[0]:event.key==='End'?tabs[2]:tabs[(tabs.indexOf(tab)+(event.key==='ArrowLeft'?2:1))%3];select(target);target.focus();}};}
    $('correction-csv').onclick=()=>{if(trial&&result.length)download(result.filter(day=>day.comparison&&day.output_type!=='保存履歴'),'preview');};$('correction-export-trial').onclick=$('correction-csv').onclick;
    $('correction-history-csv').onclick=()=>download(stored.days.filter(day=>day.snapshot).map(day=>day.snapshot),'history');$('correction-export-history').onclick=exportHistory;controls();
    setInterval(()=>{if(active&&(!trial||automaticPreview)&&config().source_user_id===(shared?.source_user_id||null)&&config().comparison_days===shared?.comparison_days&&stored?.days.some(day=>day.job&&day.job.status!=='complete'))run();},60000);
  }
  function resize(){[...charts,...($('correction-water-charts').$waterCharts||[])].forEach(chart=>chart.resize());}
  function refresh(data,parameters){const old=selectedDate(),changed=JSON.stringify(settings)!==JSON.stringify(parameters);payload=data;settings=parameters;if(old!==selectedDate()){sequence++;controller?.abort();stored=null;trial=false;loadedDate=null;clear();if(active)run();}else if(active&&changed&&canTrial())runTrial();}
  return {initialize,aggregate,correctedRows,csv,refresh,resize};
})();
