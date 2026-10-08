'use strict';
window.NextMeasured=(()=>{
  const $=id=>document.getElementById(id), tolerance=10*60*1000;
  const defs=[['温度','P01',[['temperature','温度','℃',1,'#ff6384']]],['湿度','P01',[['humidity','湿度','%',0,'#36a2eb']]],['日射','P31',[['solar_radiation','日射','W/m²',1,'#e89b22']]],['風速','P61',[['wind_speed_avg','平均風速','m/s',1,'#4bc0c0'],['wind_speed_max','最大風速','m/s',1,'#ed8b24']]],['飽差・VPD','P01',[['deficit','飽差','g/m³',1,'#9966ff'],['vpd','VPD','kPa',2,'#ed8b24']]],['CO₂','P21',[['co2','CO₂','ppm',0,'#36a2eb']]]];
  let charts=[],rows=[],user='',end=0,controller=null,loaded=false;
  const number=v=>v===null || v===undefined || v==='' || !Number.isFinite(Number(v))?null:Number(v);
  function derive(row){
    const result={...row,x:Date.parse(row.recorded_at.replace(' ','T')+'+09:00'),deficit:null,vpd:null};
    const t=number(row.temperature),h=number(row.humidity);
    if(t!==null && h!==null && t>-237.3 && h>=0 && h<=100){const difference=6.1078*10**(7.5*t/(237.3+t))*(1-h/100);result.vpd=difference/10;result.deficit=216.7*difference/(t+273.15);}
    return result;
  }
  const sql=value=>new Date(value+9*3600000).toISOString().slice(0,19).replace('T',' ');
  const stamp=value=>sql(value).slice(5,16);
  const storageKey=()=> 'utech_next_measured_axes_v1_'+user;
  const readAxes=()=>{try{return JSON.parse(localStorage.getItem(storageKey()))||{};}catch{return {};}};
  function nearest(data,time,latest){
    const valid=data.filter(p=>Number.isFinite(p.y) && (!latest || p.x<=time));
    const point=latest?valid[valid.length-1]:valid.reduce((best,p)=>!best || Math.abs(p.x-time)<Math.abs(best.x-time)?p:best,null);
    return point && Math.abs(point.x-time)<=tolerance?point:null;
  }
  function sync(time,latest=false){
    for(const chart of charts){chart.$cursor=time;chart.$labels=[];chart.$readout.replaceChildren();
      if(time===null){chart.$readout.textContent='カーソルで時刻を連動。右側の余白で最新値を表示。';chart.draw();continue;}
      chart.$readout.append(document.createTextNode((latest?'最新　':stamp(time)+'　')));
      chart.data.datasets.forEach((dataset,i)=>{
        if(!chart.isDatasetVisible(i))return;
        const point=nearest(dataset.data,time,latest),def=chart.$definitions[i];
        chart.$readout.append(document.createTextNode((i?'　':'')+def[1]+'：'));
        if(point){const strong=document.createElement('strong');strong.textContent=point.y.toFixed(def[3]);chart.$readout.append(strong,document.createTextNode(' '+def[2]+'（'+stamp(point.x)+'）'));chart.$labels.push({point,i,text:strong.textContent+' '+def[2]});}
        else chart.$readout.append(document.createTextNode(latest?'最新データなし':'該当データなし'));
      });chart.draw();
    }
  }
  function reset(){for(const chart of charts){if(chart.resetZoom)chart.resetZoom('none');chart.options.scales.x.min=end-72*3600000;chart.options.scales.x.max=end;for(const axis of ['y','right'])if(chart.options.scales[axis]){delete chart.options.scales[axis].min;delete chart.options.scales[axis].max;}applyAxes(chart);chart.update('none');}sync(null);}
  function applyAxes(chart){const saved=readAxes()[chart.$name]||{};for(const axis of ['y','right'])if(chart.options.scales[axis])for(const bound of ['min','max'])if(Number.isFinite(saved[axis]?.[bound]))chart.options.scales[axis][bound]=saved[axis][bound];}
  function render(){
    for(const chart of charts)chart.destroy();charts=[];$('measured-charts').replaceChildren();
    if(!window.Chart){$('measured-message').textContent='グラフを読み込めません。';return;}
    for(const [name,point,definitions] of defs){
      const card=document.createElement('article');card.className='chart-card';const title=document.createElement('h3');title.textContent=name+'（'+point+'）';
      const button=document.createElement('button');button.className='chart-reset-button';button.textContent='表示リセット';button.onclick=reset;title.append(button);
      const controls=document.createElement('div');controls.className='measured-axes';
      const wrapper=document.createElement('div');wrapper.className='chart-container';const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',name+'の過去72時間の実測値');wrapper.append(canvas);
      const readout=document.createElement('p');readout.className='chart-readout';card.append(title,controls,wrapper,readout);$('measured-charts').append(card);
      const data=rows.filter(r=>r.point_id===point);
      const datasets=definitions.map((d,i)=>({label:d[1]+' ('+d[2]+')',data:data.map(r=>({x:r.x,y:number(r[d[0]])})),borderColor:d[4],pointBackgroundColor:d[4],pointRadius:1.5,borderWidth:1.5,spanGaps:false,yAxisID:i===1 && name==='飽差・VPD'?'right':'y'}));
      const plugin={id:'measuredCursor',afterEvent(chart,args){const e=args.event,a=chart.chartArea;if(e.type==='mouseout'){sync(null);return;}if(!['mousemove','touchstart','touchmove'].includes(e.type))return;if(e.y<a.top || e.y>a.bottom){sync(null);return;}if(e.x>a.right)sync(Date.now(),true);else if(args.inChartArea)sync(chart.scales.x.getValueForPixel(e.x));else sync(null);},afterDraw(chart){const c=chart.ctx,a=chart.chartArea;c.save();c.beginPath();c.rect(a.left,a.top,a.right-a.left,a.bottom-a.top);c.clip();for(let day=new Date(end+9*3600000);day.getTime()-9*3600000>=end-72*3600000;day=new Date(day.getTime()-86400000)){day.setUTCHours(0,0,0,0);const x=chart.scales.x.getPixelForValue(day.getTime()-9*3600000);c.strokeStyle='rgba(80,100,120,.25)';c.beginPath();c.moveTo(x,a.top);c.lineTo(x,a.bottom);c.stroke();}if(chart.$cursor!==null && chart.$cursor!==undefined){const x=chart.scales.x.getPixelForValue(chart.$cursor);c.strokeStyle='#333';c.beginPath();c.moveTo(x,a.top);c.lineTo(x,a.bottom);c.stroke();}c.restore();c.save();c.font='bold 11px sans-serif';c.fillStyle='#111';const occupied=[];for(const label of chart.$labels||[]){const axis=chart.scales[chart.data.datasets[label.i].yAxisID],x=chart.scales.x.getPixelForValue(label.point.x),y=axis.getPixelForValue(label.point.y);if(x<a.left || x>a.right || y<a.top || y>a.bottom)continue;let ly=Math.max(a.top+12,Math.min(a.bottom-4,y-8));while(occupied.some(v=>Math.abs(v-ly)<14) && ly-15>=a.top+12)ly-=15;occupied.push(ly);c.fillText(label.text,Math.max(a.left,Math.min(a.right-c.measureText(label.text).width,x+5)),ly);}c.restore();}};
      const scales={x:{type:'linear',min:end-72*3600000,max:end,offset:false,ticks:{maxTicksLimit:7,maxRotation:0,callback:stamp},grid:{display:false}},y:{title:{display:true,text:definitions[0][2]}}};
      if(name==='飽差・VPD')scales.right={position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'kPa'}};
      const chart=new Chart(canvas,{type:'line',data:{datasets},plugins:[plugin],options:{animation:false,parsing:false,responsive:true,maintainAspectRatio:false,plugins:{legend:{display:definitions.length>1,labels:{boxWidth:10,font:{size:10}}},tooltip:{enabled:false},zoom:{limits:{x:{min:end-72*3600000,max:end,minRange:600000}},zoom:{drag:{enabled:!matchMedia('(max-width:600px)').matches},pinch:{enabled:true},mode:'xy',onZoomComplete:({chart:source})=>{for(const other of charts)if(other!==source){other.options.scales.x.min=source.scales.x.min;other.options.scales.x.max=source.scales.x.max;other.update('none');}sync(null);}}}},scales}});
      chart.$name=name;chart.$definitions=definitions;chart.$readout=readout;chart.$cursor=null;charts.push(chart);applyAxes(chart);
      const inputs=[];
      for(const axis of Object.keys(scales).filter(k=>k!=='x')){const label=document.createElement('label');label.textContent=scales[axis].title.text+'：';for(const bound of ['min','max']){const input=document.createElement('input');input.type='number';input.step='any';input.placeholder=bound==='min'?'最小':'最大';input.setAttribute('aria-label',name+' '+axis+' '+bound);input.value=chart.options.scales[axis][bound]??'';label.append(input);inputs.push({axis,bound,input});}controls.append(label);}
      const apply=document.createElement('button');apply.textContent='縦軸反映';const error=document.createElement('span');error.className='error';apply.onclick=()=>{const axes={};for(const {axis,bound,input} of inputs){axes[axis]??={};if(input.value!==''){const value=Number(input.value);if(!Number.isFinite(value)){error.textContent='数値を確認してください。';return;}axes[axis][bound]=value;}}for(const value of Object.values(axes))if(value.min!==undefined && value.max!==undefined && value.min>=value.max){error.textContent='最小は最大より小さくしてください。';return;}error.textContent='';const all=readAxes();all[name]=axes;try{localStorage.setItem(storageKey(),JSON.stringify(all));}catch{error.textContent='端末へ保存できません。';}for(const axis of Object.keys(axes)){delete chart.options.scales[axis].min;delete chart.options.scales[axis].max;Object.assign(chart.options.scales[axis],axes[axis]);}chart.update('none');};controls.append(apply,error);chart.update('none');
    }sync(null);
  }
  async function request(id,start,finish,signal){const params=new URLSearchParams({user_id:id,start:sql(start),end:sql(finish)});const response=await fetch('api/measurements.php?'+params,{cache:'no-store',signal});const payload=await response.json();if(!response.ok || !payload.success)throw new Error(payload.message||'実測値を取得できません。');return payload.rows.map(derive).filter(r=>Number.isFinite(r.x));}
  async function load(){if(controller)controller.abort();const current=new AbortController();controller=current;user=NextContext.selection().user_id;loaded=true;for(const chart of charts)chart.destroy();charts=[];$('measured-charts').replaceChildren();if(!user){$('measured-message').textContent='上部でuser_idを指定して「表示」を押してください。';return;}$('measured-message').textContent='実測値を読み込み中です。';end=Date.now();try{rows=await request(user,end-72*3600000,end,current.signal);if(controller!==current)return;render();$('measured-message').textContent=rows.length?`${user}　${stamp(end-72*3600000)}～${stamp(end)} JST（自動更新なし）`:'過去72時間の測定データがありません。';}catch(e){if(e.name!=='AbortError')$('measured-message').textContent=e.message;}}
  async function download(){const message=$('measured-export-message'),button=$('measured-export');const id=NextContext.selection().user_id;const start=Date.parse($('measured-start').value+':00+09:00'),finish=Date.parse($('measured-end').value+':00+09:00');if(!id || !Number.isFinite(start) || !Number.isFinite(finish) || finish<start || finish-start>366*86400000){message.textContent='user_idと開始・終了日時を確認してください（最大366日）。';return;}button.disabled=true;message.textContent='実測値を取得中です。';try{const data=await request(id,start,finish);if(!data.length){message.textContent='指定期間の測定データがありません。';return;}const columns=['user_id','point_id','recorded_at_jst','temperature (℃)','humidity (%)','solar_radiation (W/m²)','wind_speed_avg (m/s)','wind_speed_max (m/s)','co2 (ppm)','deficit (g/m³)','vpd (kPa)'];const keys=['temperature','humidity','solar_radiation','wind_speed_avg','wind_speed_max','co2','deficit','vpd'];const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const lines=[columns,...data.map(r=>[id,r.point_id,r.recorded_at,...keys.map(key=>((r.point_id==='P01' && ['temperature','humidity','deficit','vpd'].includes(key)) || (r.point_id==='P31' && key==='solar_radiation') || (r.point_id==='P61' && key.startsWith('wind_')) || (r.point_id==='P21' && key==='co2'))?number(r[key]):null)])];const blob=new Blob(['\uFEFF'+lines.map(line=>line.map(quote).join(',')).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`utech-next_measured_${id}_${sql(start).replaceAll(/[: ]/g,'-')}_${sql(finish).replaceAll(/[: ]/g,'-')}_JST.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent=data.length+'件を出力しました。';}catch(e){message.textContent=e.message;}finally{button.disabled=false;}}
  function initialize(){const now=Date.now();$('measured-start').value=sql(now-72*3600000).slice(0,16).replace(' ','T');$('measured-end').value=sql(now).slice(0,16).replace(' ','T');$('measured-refresh').onclick=load;$('measured-export').onclick=download;}
  return {initialize,load,open:()=>{if(!loaded)load();else charts.forEach(chart=>chart.resize());},invalidate:()=>{loaded=false;load();},derive,nearest};
})();
