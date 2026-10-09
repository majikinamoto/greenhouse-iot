'use strict';
window.NextCorrection=(()=>{
  const $=id=>document.getElementById(id),finite=v=>typeof v==='number'&&Number.isFinite(v);
  const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const definitions=[['temperature_2m','temperature','温度','℃'],['relative_humidity_2m','humidity','湿度','％ポイント']];
  const fmt=v=>finite(v)?v.toFixed(1):'—';
  const node=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
  let payload=null,settings=null,active=false,sequence=0,controller=null,charts=[],result=[],comparisons=[],cache=null;
  function aggregate(target,count,forecastDays,measurements){
    const end=shift(target,-2),start=shift(end,1-count),buckets=new Map();
    for(const row of measurements){if(row.point_id!=='P01'||typeof row.recorded_at!=='string')continue;const key=row.recorded_at.slice(0,13);if(key.slice(0,10)<start||key.slice(0,10)>end)continue;
      if(!buckets.has(key))buckets.set(key,{temperature:[],humidity:[]});
      for(const [,field] of definitions)if(finite(row[field])&&(field!=='humidity'||row[field]>=0&&row[field]<=100)&&(field!=='temperature'||row[field]>-237.3))buckets.get(key)[field].push(row[field]);
    }
    const byDate=new Map(forecastDays.map(day=>[day.date,new Map(day.rows.map(row=>[row.forecast_for.slice(0,13),row]))]));
    const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
    const hours=Array.from({length:24},(_,hour)=>{
      const output={hour,temperature_2m:null,relative_humidity_2m:null};
      for(const [forecastKey,field] of definitions){const daily=[];
        for(let i=0;i<count;i++){const date=shift(start,i),key=date+' '+String(hour).padStart(2,'0'),forecast=byDate.get(date)?.get(key)?.[forecastKey],values=buckets.get(key)?.[field]||[];
          const valid=finite(forecast)&&(field!=='humidity'||forecast>=0&&forecast<=100)&&(field!=='temperature'||forecast>-237.3);
          const measured=mean(values);daily.push({date,forecast:valid?forecast:null,measured,count:values.length,difference:valid&&measured!==null?measured-forecast:null});
        }
        const used=daily.filter(day=>finite(day.difference));output[forecastKey]={difference:mean(used.map(day=>day.difference)),forecast:mean(used.map(day=>day.forecast)),measured:mean(used.map(day=>day.measured)),days:used.length,count:used.reduce((sum,day)=>sum+day.count,0),daily};
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
  function clear(){charts.forEach(chart=>chart.destroy());charts=[];for(const chart of $('correction-water-charts').$waterCharts||[])chart.destroy();$('correction-water-charts').$waterCharts=[];for(const id of ['correction-water-charts','correction-differences','correction-table'])$(id).replaceChildren();result=[];comparisons=[];$('correction-csv').disabled=true;$('correction-export-trial').disabled=true;$('correction-period').textContent='';$('correction-export-note').textContent='実測値補正タブで試算してください。補正の保存履歴CSVはDB対応後に利用できます。';}
  async function run(){if(!payload||!active)return;const runId=++sequence;if(controller)controller.abort();controller=new AbortController();const signal=controller.signal;clear();
    const user=$('correction-user').value.trim(),count=Number($('correction-days').value);if(user&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(user)){$('correction-message').textContent='user_idは64文字以内の半角英数字・ハイフン・アンダースコアで入力してください。';return;}
    $('correction-message').textContent='補正の試算を計算中です。';
    try{const days=payload.days,last=days[days.length-1].date,start=shift(days[0].date,-count-1),end=shift(last,-2),key=JSON.stringify([user,count,days.map(day=>[day.date,day.forecast])]);
      if(cache?.key!==key){let measured=[],forecastDays=[];if(user){const [data,forecasts]=await Promise.all([json('api/measurements.php?'+new URLSearchParams({user_id:user,start:start+' 00:00:00',end:end+' 23:59:59'}),signal),Promise.all(Array.from({length:Math.round((Date.parse(end)-Date.parse(start))/86400000)+1},(_,i)=>{const date=shift(start,i);return json('api/water.php?center='+date,signal).then(data=>({date,rows:data.days.find(day=>day.date===date)?.forecast||[]}));}))]);measured=data.rows;forecastDays=forecasts;}
        if(runId!==sequence)return;cache={key,measured,forecastDays};}
      if(runId!==sequence)return;
      comparisons=days.map(day=>aggregate(day.date,count,cache.forecastDays,cache.measured));
      result=days.map((day,i)=>{const rows=correctedRows(day.forecast,comparisons[i]),calculated=NextWater.calculate(day.date,rows,settings);return {...calculated,fetched_at:day.forecast[0]?.fetched_at,comparison:comparisons[i],rows,source_user_id:user};});
      renderComparison(comparisons[comparisons.length-1]);NextWater.render($('correction-water-charts'),result,'live');
      const current=comparisons[comparisons.length-1],clamped=result.flatMap(day=>day.rows).filter(row=>row.humidity_clamped).length;
      $('correction-message').textContent=(user?'補正実測先：'+user:'補正実測先が未設定')+`　試算中：${count}日。補正設定の共有保存は未接続です。`+(clamped?` 湿度を0〜100％に調整した時刻：${clamped}件。`:'');
      $('correction-period').textContent=`${days[0].date}〜${last}の3日分を現在の設定で試算。選択日${last}の比較期間：${current.start}〜${current.end}。各対象日の2日前までを使用します。保存履歴ではありません。`;
      $('correction-csv').disabled=false;$('correction-export-trial').disabled=false;
      $('correction-export-note').textContent=`試算：${days[0].date}〜${last}　実測先：${user||'未設定'}　比較${count}日。保存履歴ではありません。`;
    }catch(error){if(error.name!=='AbortError'&&runId===sequence){clear();$('correction-message').textContent=error.message+' 元の予報への切替で取得エラーを隠さず、試算を停止しています。';}}
  }
  function description(info,unit){return `予報平均 ${fmt(info.forecast)}　実測平均 ${fmt(info.measured)}　補正差 ${fmt(info.difference)} ${unit}　使用${info.days}日／測定${info.count}件`+(info.count===1?'（測定1件）':'')+(info.difference===null?'　補正なし（データ不足）':'');}
  function renderComparison(comparison){
    const table=$('correction-table'),head=node('tr','');for(const title of ['時間帯','温度（予報・実測・差・件数）','湿度（予報・実測・差・件数）','補正後の気温・湿度','補正後の飽差'])head.append(node('th',title));table.append(head);
    for(const info of comparison.hours){const row=node('tr','');row.append(node('th',`${String(info.hour).padStart(2,'0')}:00～`));for(const [key,,,unit] of definitions)row.append(node('td',description(info[key],unit)));const corrected=result[result.length-1].rows.find(value=>value.forecast_for===comparison.target+' '+String(info.hour).padStart(2,'0')+':00:00');row.append(node('td',`${fmt(corrected?.temperature_2m)} ℃　${fmt(corrected?.relative_humidity_2m)} ％${corrected?.humidity_clamped?'（範囲調整）':''}`),node('td',`${fmt(corrected?.corrected_deficit)} g/m³　${finite(corrected?.corrected_vpd)?corrected.corrected_vpd.toFixed(2):'—'} kPa`));table.append(row);}
    if(!window.Chart)return;
    function sync(hour){for(const chart of charts){chart.$hour=hour;chart.$readout.textContent=hour===null?'ポインタを合わせると時刻が連動します。':`${String(hour).padStart(2,'0')}:00～　`+description(comparison.hours[hour][chart.$key],chart.$unit);chart.draw();}}
    for(const [key,,title,unit] of definitions){const card=node('article','','chart-card'),heading=node('h3',title+'の補正差'),reset=node('button','表示リセット','chart-reset-button');reset.type='button';heading.append(reset);const wrap=node('div','','chart-container'),canvas=document.createElement('canvas'),readout=node('p','ポインタを合わせると時刻が連動します。','chart-readout');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',title+'の時間帯別補正差。詳細は比較表に表示。');wrap.append(canvas);card.append(heading,wrap,readout);$('correction-differences').append(card);
      const data=[{label:'平均差',data:comparison.hours.map(info=>({x:info.hour+.5,y:info[key].difference})),borderColor:key==='temperature_2m'?'#dc5575':'#329bcc',borderWidth:3,pointRadius:2,spanGaps:false}];
      for(let i=0;i<comparison.count;i++)data.push({label:shift(comparison.start,i),data:comparison.hours.map(info=>({x:info.hour+.5,y:info[key].daily[i].difference})),borderColor:'rgba(90,120,150,.3)',borderWidth:1,pointRadius:0,spanGaps:false});
      const plugin={id:'correctionCrosshair',afterEvent(chart,args){if(args.event.type==='mouseout')sync(null);else if(args.inChartArea&&['mousemove','click','touchstart','touchmove'].includes(args.event.type))sync(Math.max(0,Math.min(23,Math.floor(chart.scales.x.getValueForPixel(args.event.x)))));},afterDraw(chart){const ctx=chart.ctx,a=chart.chartArea;ctx.save();ctx.beginPath();ctx.rect(a.left,a.top,a.right-a.left,a.bottom-a.top);ctx.clip();const zero=chart.scales.y.getPixelForValue(0);ctx.strokeStyle='#8796a7';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(a.left,zero);ctx.lineTo(a.right,zero);ctx.stroke();ctx.setLineDash([]);if(chart.$hour!==null&&chart.$hour!==undefined){const hour=chart.$hour,x=chart.scales.x.getPixelForValue(hour+.5),v=comparison.hours[hour][key].difference;ctx.strokeStyle='rgba(0,0,0,.6)';ctx.beginPath();ctx.moveTo(x,a.top);ctx.lineTo(x,a.bottom);ctx.stroke();if(finite(v)){ctx.font='bold 12px sans-serif';ctx.fillStyle='#111';const label=fmt(v)+' '+unit;ctx.fillText(label,Math.max(a.left,Math.min(a.right-ctx.measureText(label).width,x+6)),Math.max(a.top+14,Math.min(a.bottom-5,chart.scales.y.getPixelForValue(v)-8)));}}ctx.restore();}};
      const chart=new Chart(canvas,{type:'line',data:{datasets:data},plugins:[plugin],options:{animation:false,responsive:true,maintainAspectRatio:false,parsing:false,plugins:{tooltip:{enabled:false},legend:{labels:{filter:item=>item.datasetIndex===0}},zoom:{pan:{enabled:false},zoom:{drag:{enabled:!matchMedia('(max-width:600px)').matches},mode:'xy',onZoomComplete:({chart:changed})=>{for(const other of charts)if(other!==changed){other.options.scales.x.min=changed.scales.x.min;other.options.scales.x.max=changed.scales.x.max;other.update('none');}sync(null);}}}},scales:{x:{type:'linear',min:0,max:24,ticks:{stepSize:6,callback:value=>String(value).padStart(2,'0')+':00'}},y:{suggestedMin:0,suggestedMax:0,title:{display:true,text:unit}}}}});chart.$key=key;chart.$unit=unit;chart.$readout=readout;charts.push(chart);
      reset.onclick=()=>{for(const item of charts){item.resetZoom?.('none');item.options.scales.x.min=0;item.options.scales.x.max=24;delete item.options.scales.y.min;delete item.options.scales.y.max;item.update('none');}sync(null);};
    }
  }
  function csv(days){const lines=[['output_type','target_date','fetched_at_jst','source_user_id','comparison_days','comparison_start','comparison_end','interval_start_jst','tree','hourly_litres','cumulative_litres','cumulative_complete','daily_litres','daily_minutes','cycle_seconds','temperature_difference_c','temperature_used_days','temperature_measurements','humidity_difference_points','humidity_used_days','humidity_measurements','corrected_temperature_c','corrected_humidity_percent','corrected_deficit_g_m3','corrected_vpd_kpa','humidity_clamped','temperature_status','humidity_status','formula_version','leaf_area_m2','kc','nozzle_l_min','transmission_percent','indoor_wind_m_s','cycles_per_day']];
    for(const day of days)for(const tree of day.trees)for(const [hour,h] of tree.hours.entries()){const t=day.comparison.hours[hour].temperature_2m,r=day.comparison.hours[hour].relative_humidity_2m,row=day.rows.find(row=>row.forecast_for===h.time),p=day.settings?.trees[tree.number-1];lines.push(['試算',day.date,day.fetched_at,day.source_user_id,day.comparison.count,day.comparison.start,day.comparison.end,h.time,tree.number,h.litres,h.cumulative,h.cumulative_complete?1:0,tree.daily_litres,tree.daily_minutes,tree.cycle_seconds,t.difference,t.days,t.count,r.difference,r.days,r.count,row?.temperature_2m,row?.relative_humidity_2m,row?.corrected_deficit,row?.corrected_vpd,row?.humidity_clamped?1:0,t.difference===null?'補正なし（データ不足）':'補正あり',r.difference===null?'補正なし（データ不足）':'補正あり',day.version,p?.leaf_area,p?.kc,p?.flow,day.settings?.transmission_percent,day.settings?.wind_speed,day.settings?.cycles]);}
    return '\uFEFF'+lines.map(line=>line.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
  }
  function initialize(){for(let i=1;i<=10;i++)$('correction-days').append(new Option(i+'日間',String(i),false,i===5));
    $('correction-form').onsubmit=event=>{event.preventDefault();run();};$('correction-days').onchange=run;$('correction-user').onchange=run;
    const tabs=[$('water-estimate-tab'),$('water-correction-tab')];function select(tab){active=tab===tabs[1];for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;$(item.getAttribute('aria-controls')).hidden=!selected;}if(active)run();else NextWater.resize();}
    for(const tab of tabs){tab.onclick=()=>select(tab);tab.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const target=event.key==='Home'?tabs[0]:event.key==='End'?tabs[1]:tabs[1-tabs.indexOf(tab)];select(target);target.focus();}};}
    $('correction-csv').onclick=()=>{if(!result.length)return;const url=URL.createObjectURL(new Blob([csv(result)],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`utech-next-correction_trial_${result[result.length-1].date}_${$('correction-days').value}days.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $('correction-export-trial').onclick=$('correction-csv').onclick;
  }
  return {initialize,aggregate,correctedRows,csv,refresh:(data,parameters)=>{payload=data;settings=parameters;if(active)run();},resize:()=>[...charts,...($('correction-water-charts').$waterCharts||[])].forEach(chart=>chart.resize())};
})();
