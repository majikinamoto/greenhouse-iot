'use strict';
window.NextWater = (() => {
  const version='staff-penman-hourly-v1';
  let livePayload=null, revision=0, token='', liveCharts=[], request=0, selectedDate=null, settingsLoaded=false;
  const $=id=>document.getElementById(id);
  const number=id=>$(id).value.trim()===''?null:Number($(id).value);
  const finite=value=>typeof value==='number' && Number.isFinite(value);
  const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  const text=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
  const fmt=value=>finite(value)?value.toFixed(2):'未確定';
  const hourLabel=value=>value.slice(5,10).replace('-','/')+' '+value.slice(11,16)+'～';
  function penman(t,rh,rs,wind,transmission) {
    if (![t,rh,rs,wind,transmission].every(finite) || t<=-237.3 || rh<0 || rh>100) return null;
    const es=6.1078*Math.exp(17.2694*t/(t+237.3));
    const delta=.4495+.2721e-3*t+.9873e-3*t**2+.2907e-5*t**3+.2538e-6*t**4;
    const latent=2.5-.0024*t;
    if(latent<=0 || delta+.66<=0)return null;
    const value=delta/(delta+.66)*rs*.0036*transmission/100/latent+.66/(delta+.66)*.26*(1+.54*wind)*es*(1-rh/100)/24;
    return finite(value)?Math.max(0,value):null;
  }
  function calculate(date,rows,settings) {
    const indexed=new Map(rows.map(row=>[row.forecast_for,row]));
    const common=settings && finite(settings.transmission_percent) && settings.transmission_percent>=0 && settings.transmission_percent<=100 && finite(settings.wind_speed) && settings.wind_speed>=0 && Number.isInteger(settings.cycles) && settings.cycles>=1;
    const trees=Array.from({length:6},(_,i)=>{
      const tree=settings?.trees[i];const valid=common && finite(tree?.leaf_area) && tree.leaf_area>0 && finite(tree.kc) && tree.kc>=0 && finite(tree.flow) && tree.flow>0;
      let sum=0,complete=!!valid;
      const hours=Array.from({length:24},(_,hour)=>{
        const time=`${date} ${String(hour).padStart(2,'0')}:00:00`;
        const end=hour===23?`${shift(date,1)} 00:00:00`:`${date} ${String(hour+1).padStart(2,'0')}:00:00`;
        const current=indexed.get(time),next=indexed.get(end);
        const et=valid?penman(current?.temperature_2m,current?.relative_humidity_2m,next?.shortwave_radiation,settings.wind_speed,settings.transmission_percent):null;
        let litres=et===null?null:et*tree.kc*tree.leaf_area;if(!finite(litres))litres=null;
        if(litres===null)complete=false;else sum+=litres;
        return {time,litres,cumulative:sum,cumulative_complete:complete};
      });
      const minutes=complete?sum/tree.flow:null;
      return {number:i+1,hours,complete,partial_litres:sum,daily_litres:complete?sum:null,daily_minutes:minutes,cycle_seconds:complete?Math.round(minutes/settings.cycles*60):null};
    });
    return {date,version,settings,trees};
  }
  function input(id,label,group,options={}) {
    const wrapper=text('label',label,'water-field');const field=document.createElement('input');field.id=id;field.type='number';field.step=options.integer?'1':'any';field.min=String(options.min??0);if(options.max!==undefined)field.max=String(options.max);field.required=true;field.setAttribute('aria-describedby',id+'-error');
    const error=text('span','','error');error.id=id+'-error';wrapper.append(field,error);group.append(wrapper);field.addEventListener('input',preview);
  }
  function settingsFromInputs() {return {transmission_percent:number('water-transmission'),wind_speed:number('water-wind'),cycles:number('water-cycles'),trees:Array.from({length:6},(_,i)=>({leaf_area:number(`water-area-${i}`),kc:number(`water-kc-${i}`),flow:number(`water-flow-${i}`)}))};}
  function validate() {
    let valid=true;for(const field of $('water-settings').querySelectorAll('input')) {const error=$(field.id+'-error');error.textContent=field.validity.valueMissing?'入力してください。':!field.checkValidity()?'範囲内の数値を入力してください。':'';if(error.textContent)valid=false;}
    $('water-save').disabled=!valid || !token;
    $('water-validation').textContent=valid?'': '未入力または無効な項目があるため保存できません。各入力欄を確認してください。';return valid;
  }
  function fill(settings) {
    if(!settings)return;
    for(const [id,key] of [['water-transmission','transmission_percent'],['water-wind','wind_speed'],['water-cycles','cycles']])$(id).value=settings[key];
    settings.trees.forEach((tree,i)=>{for(const [key,prefix] of [['leaf_area','area'],['kc','kc'],['flow','flow']])$(`water-${prefix}-${i}`).value=tree[key];});
  }
  function sync(charts,index) {
    for(const chart of charts) {
      const active=index===null?[]:[{datasetIndex:0,index}, {datasetIndex:1+Math.floor(index/24),index:index%24+1}];
      chart.setActiveElements(active);chart.tooltip.setActiveElements(active,{x:index===null?0:chart.scales.x.getPixelForValue(index+.5),y:chart.chartArea.bottom});
      chart.$hour=index;
      const row=index===null?null:chart.$hours[index];
      const readout=chart.$readout;readout.replaceChildren();
      if(!row)readout.append(document.createTextNode('ポインタを合わせると6本の時刻が連動します。'));
      else {
        readout.append(document.createTextNode(`${hourLabel(row.time)}　`));
        const appendNumber=value=>readout.append(value===null?document.createTextNode('欠測・未計算'):text('strong',fmt(value)));
        appendNumber(row.litres);readout.append(document.createTextNode(' L　日累積 '));
        appendNumber(row.cumulative);readout.append(document.createTextNode(` L${row.cumulative_complete?'':'（欠測・未計算あり）'}`));
      }
      chart.draw();
    }
  }
  function render(container,days,mode) {
    liveCharts.forEach(chart=>chart.destroy());
    const charts=[];liveCharts=charts;container.replaceChildren();
    if(!window.Chart){container.append(text('p','グラフを読み込めません。保存値はCSVで確認できます。'));return;}
    const maxHourly=Math.max(1,...days.flatMap(day=>day.trees.flatMap(tree=>tree.hours.map(h=>h.litres??0))));
    const maxDaily=Math.max(1,...days.flatMap(day=>day.trees.map(tree=>tree.partial_litres)));
    for(let tree=0;tree<6;tree++) {
      const card=text('article','','chart-card');card.append(text('h3',`No.${tree+1}`));
      const summaryDays=mode==='live'?days.slice(-1):days;
      for(const day of summaryDays) {const value=day.trees[tree];const seconds=value.cycle_seconds;const summary=text('p','','caption');summary.append(text('strong',`${mode==='live'?'':day.date+'：'}必要水量 ${fmt(value.daily_litres)} L　総時間 ${fmt(value.daily_minutes)} 分　1回 ${seconds===null?'未確定':Math.floor(seconds/60)+'分'+seconds%60+'秒'}${value.complete?'':'（欠測・未計算あり）'}`));card.append(summary);}
      const wrapper=text('div','','chart-container'),canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`No.${tree+1}の3日間の時間別蒸散量と日累積。詳細はCSVで確認できます。`);wrapper.append(canvas);
      const readout=text('p','ポインタを合わせると6本の時刻が連動します。','chart-readout');card.append(wrapper,readout);container.append(card);
      const hours=days.flatMap(day=>day.trees[tree].hours);
      const datasets=[{type:'bar',label:'1時間の推定蒸散量 (L)',data:hours.map((h,i)=>({x:i+.5,y:h.litres})),backgroundColor:'rgba(54,162,235,.65)',yAxisID:'y',barThickness:5}];
      days.forEach((day,d)=>datasets.push({type:'line',label:'日累積 (L)',data:[{x:d*24,y:0},...day.trees[tree].hours.map((h,i)=>({x:d*24+i+1,y:h.litres===null?null:h.cumulative}))],borderColor:'#ed8b24',pointRadius:0,borderWidth:2,yAxisID:'total',spanGaps:false}));
      const plugin={id:'waterCrosshair',afterEvent(chart,args){if(args.event.type==='mouseout'){sync(charts,null);return;}if(args.inChartArea && ['mousemove','click','touchstart','touchmove'].includes(args.event.type)){sync(charts,Math.max(0,Math.min(71,Math.floor(chart.scales.x.getValueForPixel(args.event.x)))));args.changed=true;}},afterDraw(chart){const ctx=chart.ctx,a=chart.chartArea;ctx.save();for(const boundary of [0,24,48,72]){const x=chart.scales.x.getPixelForValue(boundary);ctx.strokeStyle='rgba(80,100,120,.25)';ctx.beginPath();ctx.moveTo(x,a.top);ctx.lineTo(x,a.bottom);ctx.stroke();}if(chart.$hour!==null && chart.$hour!==undefined){const x=chart.scales.x.getPixelForValue(chart.$hour+.5);ctx.strokeStyle='rgba(0,0,0,.65)';ctx.beginPath();ctx.moveTo(x,a.top);ctx.lineTo(x,a.bottom);ctx.stroke();}ctx.restore();}};
      const drawCrosshair=plugin.afterDraw;
      plugin.afterDraw=chart=>{
        const ctx=chart.ctx,a=chart.chartArea;ctx.save();ctx.beginPath();ctx.rect(a.left,a.top,a.right-a.left,a.bottom-a.top);ctx.clip();drawCrosshair(chart);ctx.restore();
        if(chart.$hour===null || chart.$hour===undefined)return;
        ctx.save();ctx.font='bold 12px sans-serif';ctx.fillStyle='#111';ctx.textBaseline='middle';const positions=[];
        for(const [datasetIndex,index] of [[0,chart.$hour],[1+Math.floor(chart.$hour/24),chart.$hour%24+1]]){
          if(!chart.isDatasetVisible(datasetIndex))continue;
          const value=chart.data.datasets[datasetIndex].data[index].y,mark=chart.getDatasetMeta(datasetIndex).data[index];
          if(value===null || !mark || mark.skip || mark.x<a.left || mark.x>a.right || mark.y<a.top || mark.y>a.bottom)continue;
          const label=fmt(value)+' L',width=ctx.measureText(label).width;
          let y=Math.max(a.top+8,Math.min(a.bottom-8,mark.y-12));
          if(positions.some(other=>Math.abs(other-y)<15))y=y-16>=a.top+8?y-16:Math.min(a.bottom-8,y+16);
          positions.push(y);ctx.fillText(label,mark.x+8+width<=a.right?mark.x+8:Math.max(a.left,mark.x-8-width),y);
        }
        ctx.restore();
      };
      const chart=new Chart(canvas,{type:'bar',data:{datasets},plugins:[plugin],options:{animation:false,responsive:true,maintainAspectRatio:false,parsing:false,plugins:{legend:{labels:{filter:item=>item.datasetIndex<2}},tooltip:{enabled:false,callbacks:{title:items=>items.length?hourLabel(hours[Math.min(71,Math.floor(items[0].parsed.x))].time):'',label:item=>`${item.dataset.label}：${fmt(item.parsed.y)}`}}},scales:{x:{type:'linear',min:0,max:72,grid:{display:false},ticks:{stepSize:12,maxRotation:0,callback:value=>{const i=Math.min(71,Math.floor(value));return value===72?'24:00':`${hours[i].time.slice(5,10)} ${hours[i].time.slice(11,16)}`;}}},y:{min:0,max:maxHourly*1.1,title:{display:true,text:'1時間の蒸散量 (L/樹)'}},total:{position:'right',min:0,max:maxDaily*1.1,grid:{drawOnChartArea:false},title:{display:true,text:'日累積 (L/樹)'}}}}});chart.$hours=hours;chart.$readout=readout;charts.push(chart);
      chart.options.plugins.zoom={limits:{x:{min:0,max:72,minRange:1}},pan:{enabled:false},zoom:{wheel:{enabled:false},pinch:{enabled:!matchMedia('(max-width:600px)').matches},drag:{enabled:!matchMedia('(max-width:600px)').matches,backgroundColor:'rgba(30,120,255,.35)',borderColor:'rgba(30,120,255,.8)',borderWidth:1},mode:'xy',onZoomComplete:({chart:changed})=>{for(const other of charts){if(other===changed)continue;other.options.scales.x.min=changed.scales.x.min;other.options.scales.x.max=changed.scales.x.max;other.update('none');}sync(charts,null);}}};
      const reset=text('button','表示リセット','chart-reset-button');reset.type='button';
      reset.addEventListener('click',()=>{for(const item of charts){if(item.resetZoom)item.resetZoom('none');item.options.scales.x.min=0;item.options.scales.x.max=72;item.options.scales.y.min=0;item.options.scales.y.max=maxHourly*1.1;item.options.scales.total.min=0;item.options.scales.total.max=maxDaily*1.1;item.update('none');}sync(charts,null);});
      card.querySelector('h3').append(reset);chart.update('none');
    }
  }
  function preview() {
    validate();if(!livePayload)return;
    const settings=settingsFromInputs();
    const last=livePayload.days[livePayload.days.length-1].date;
    const recalculated=[];
    const days=livePayload.days.map(day=>{
      if(day.date===last)return calculate(day.date,day.forecast,settings);
      if(day.snapshot)return day.snapshot;
      if(day.forecast.length)recalculated.push(day.date);
      return calculate(day.date,day.forecast,settings);
    });
    render($('water-charts'),days,'live');
    $('water-period').textContent=`${days[0].date}〜${last} JST。選択日は入力中の設定で計算します。過去日は保存履歴を優先し、履歴がない日は現在の入力値で再計算します。`+(recalculated.length?` 現在の設定で再計算：${recalculated.join('、')}（当時の保存値ではありません）。`:'');
  }
  async function load(center,initial=false,refresh=false) {
    const sequence=++request;
    try {const response=await fetch('api/water.php'+(center?'?center='+encodeURIComponent(center):''),{cache:'no-store'});const data=await response.json();if(!response.ok || !data.success)throw new Error(data.message);if(sequence!==request)return;
      if(refresh){
        const signature=value=>JSON.stringify(value.days.map(day=>[day.date,day.forecast[0]?.fetched_at,day.forecast.length,day.snapshot?.fetched_at]));
        if(!livePayload || signature(livePayload)!==signature(data)){livePayload=data;preview();}
        return;
      }
      token=data.token;livePayload=data;if(!settingsLoaded){revision=data.revision;fill(data.settings);settingsLoaded=true;}
      preview();
    }catch(error){$('water-message').textContent=error.message;}
  }
  function csv(days) {
    const header=['date_jst','interval_start_jst','interval_end_jst','tree','fetched_at_jst','formula_version','hourly_litres','daily_cumulative_litres','cumulative_complete','daily_litres','daily_minutes','cycle_seconds','leaf_area_m2','kc','nozzle_l_min','transmission_percent','indoor_wind_m_s','cycles_per_day','status'];
    const lines=[header];for(const day of days)for(const tree of day.trees)for(const [i,h] of tree.hours.entries()){const p=day.settings?.trees[tree.number-1];lines.push([day.date,h.time,new Date(Date.parse(h.time.replace(' ','T')+'Z')+3600000).toISOString().slice(0,19).replace('T',' '),tree.number,day.fetched_at,day.version,h.litres,day.settings?h.cumulative:null,h.cumulative_complete?1:0,tree.daily_litres,tree.daily_minutes,tree.cycle_seconds,p?.leaf_area,p?.kc,p?.flow,day.settings?.transmission_percent,day.settings?.wind_speed,day.settings?.cycles,!day.settings?'未計算':h.litres===null?'欠測':'計算済み']);}
    return '\uFEFF'+lines.map(line=>line.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
  }
  function download(days,name) {const url=URL.createObjectURL(new Blob([csv(days)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function initialize() {
    input('water-transmission','平均日射透過率 (%)',$('water-common'),{max:100});input('water-wind','ハウス内風速 (m/s)',$('water-common'));input('water-cycles','1日のかん水回数',$('water-common'),{min:1,integer:true});
    for(let i=0;i<6;i++){const group=text('fieldset','','water-settings-fold');group.append(text('legend',`No.${i+1}`));input(`water-area-${i}`,'葉面積 (m²)',group,{min:.000001});input(`water-kc-${i}`,'作物係数 Kc',group);input(`water-flow-${i}`,'ノズル吐出量 (L/分)',group,{min:.000001});$('water-trees').append(group);}
    $('water-save').addEventListener('click',async()=>{if(!validate())return;$('water-save').disabled=true;try{const response=await fetch('api/water.php',{method:'POST',headers:{'Content-Type':'application/json','X-Water-Token':token},body:JSON.stringify({revision,settings:settingsFromInputs()})});const data=await response.json();if(!response.ok || !data.success)throw new Error(data.message);revision=data.revision;$('water-message').textContent='共通設定を保存しました。次の予報取得から使用します。過去の履歴は変更しません。';}catch(error){$('water-message').textContent=error.message;}finally{validate();}});
    $('water-export').addEventListener('click',async()=>{
      const start=$('csv-start'),end=$('csv-end');if(!start.reportValidity() || !end.reportValidity())return;const count=(Date.parse(end.value.slice(0,10)+'T00:00:00Z')-Date.parse(start.value.slice(0,10)+'T00:00:00Z'))/86400000+1;
      if(start.value>end.value || !Number.isFinite(count) || count>366){$('water-export-message').textContent='期間は開始日時から366日以内にしてください。';return;}
      $('water-export').disabled=true;try{const days=[];for(let i=0;i<count;i++){const date=shift(start.value.slice(0,10),i);const response=await fetch('api/water.php?center='+date,{cache:'no-store'});const data=await response.json();if(!response.ok || !data.success)throw new Error(data.message);const day=data.days[1];days.push(day.snapshot??calculate(date,[],null));}const filtered=days.map(day=>({...day,trees:day.trees.map(tree=>({...tree,hours:tree.hours.filter(h=>{const stamp=h.time.replace(' ','T').slice(0,16);return stamp>=start.value && stamp<=end.value;})}))}));download(filtered,`utech-next-water_${start.value.slice(0,10)}_${end.value.slice(0,10)}.csv`);$('water-export-message').textContent='保存した蒸散量・かん水時間・当時のパラメータを出力しました。未計算・欠測は空欄と状態列で示します。';}catch(error){$('water-export-message').textContent=error.message;}finally{$('water-export').disabled=false;}
    });
    validate();
    setInterval(()=>{if(!document.hidden && livePayload)load(selectedDate?shift(selectedDate,-1):null,false,true);},60000);
  }
  function setDate(date) {selectedDate=date;load(shift(date,-1));}
  return {initialize,penman,calculate,csv,setDate,resize:()=>liveCharts.forEach(chart=>chart.resize())};
})();
