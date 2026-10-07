'use strict';
window.NextCharts = (() => {
  const definitions = [
    ['shortwave_radiation','日射','W/m²','rgb(255,205,86)'],
    ['temperature_2m','気温','℃','rgb(255,99,132)'],
    ['relative_humidity_2m','相対湿度','%','rgb(54,162,235)'],
    ['wind_speed_10m','風速','m/s','rgb(75,192,192)'],
    ['vpd','VPD','kPa','rgb(153,102,255)'],
    ['et0','ET0（直前1時間）','mm','rgb(153,102,255)'],
  ];
  let charts = [], hour = null;
  const time = value => `${String(Math.round(value)).padStart(2,'0')}:00`;
  function resetViews() {
    hour=null;
    for(const chart of charts) {
      if(chart.resetZoom)chart.resetZoom('none');
      // Synchronized x ranges are assigned directly, so the zoom plugin can
      // remember them as new originals. Restore our full view explicitly.
      chart.options.scales.x.min=0;chart.options.scales.x.max=23;
      for(const axis of ['y','yRight']){delete chart.options.scales[axis].min;delete chart.options.scales[axis].max;}
      chart.update('none');
    }
    sync(null);
  }
  function sync(value) {
    hour = value;
    for (const chart of charts) {
      const active = value === null ? [] : chart.data.datasets.flatMap((dataset,datasetIndex)=>!chart.isDatasetVisible(datasetIndex) || dataset.data[value].y===null?[]:[{datasetIndex,index:value}]);
      chart.setActiveElements(active);
      chart.tooltip.setActiveElements(active, {x:value === null ? 0 : chart.scales.x.getPixelForValue(value),y:chart.chartArea.bottom});
      const number = value === null ? null : chart.data.datasets[0].data[value].y;
      chart.$readout.textContent = value === null ? 'グラフに触れると時刻と値を表示します。' : `${time(value)} JST　${number === null ? '欠損' : chart.$radiation?`${chart.$raw[value].toFixed(2)} W/m² ／ ${(chart.$raw[value]*.0036).toFixed(3)} MJ/m²/h`:number.toFixed(2) + ' ' + chart.$unit}`;
      if(value!==null && chart.$radiation)chart.$readout.textContent=`${time(value)} JST　`+chart.data.datasets.map((dataset,index)=>{const raw=chart.$rawSeries[index][value];return `${dataset.label}：${raw===null?'欠損':(raw*(chart.$unit==='W/m²'?1:.0036)).toFixed(chart.$unit==='W/m²'?2:3)+' '+chart.$unit}`;}).join(' ／ ');
      chart.draw();
    }
  }
  const plugin = {
    id:'nextSyncedCrosshair',
    afterEvent(chart, args) {
      const event = args.event;
      if (event.type === 'mouseout') {sync(null); return;}
      if (args.inChartArea && ['mousemove','click','touchstart','touchmove'].includes(event.type)) {
        sync(Math.max(0,Math.min(23,Math.round(chart.scales.x.getValueForPixel(event.x)))));
        args.changed = true;
      }
    },
    afterDraw(chart) {
      if (hour === null) return;
      const x = chart.scales.x.getPixelForValue(hour), area = chart.chartArea;
      if (x < area.left || x > area.right) return;
      chart.ctx.save(); chart.ctx.strokeStyle='rgba(0,0,0,.75)'; chart.ctx.lineWidth=1;
      chart.ctx.beginPath(); chart.ctx.moveTo(x,area.top); chart.ctx.lineTo(x,area.bottom); chart.ctx.stroke(); chart.ctx.restore();
      // Numeric labels at the synchronized hour, without tooltip boxes.
      const ctx=chart.ctx, placed=[];
      ctx.save();ctx.font='bold 12px sans-serif';ctx.fillStyle='#111';ctx.textBaseline='middle';
      chart.data.datasets.forEach((dataset,index)=>{
        if(!chart.isDatasetVisible(index))return;
        const point=dataset.data[hour];if(!point || point.y===null)return;
        const mark=chart.getDatasetMeta(index).data[hour];if(!mark || mark.skip || mark.y<area.top || mark.y>area.bottom)return;
        const digits=chart.$field==='relative_humidity_2m'?0:chart.$radiation || chart.$field==='temperature_2m'?1:2;
        const value=point.y.toFixed(digits),width=ctx.measureText(value).width;
        const labelX=x+8+width<=area.right?x+8:Math.max(area.left,x-8-width);
        let labelY=Math.max(area.top+8,Math.min(area.bottom-8,mark.y-12));
        // Separate labels when radiation curves meet or nearly overlap.
        for(let attempt=0;attempt<placed.length+1;attempt++){
          if(!placed.some(y=>Math.abs(y-labelY)<15))break;
          labelY=labelY-16>=area.top+8?labelY-16:Math.min(area.bottom-8,labelY+16*(attempt+1));
        }
        placed.push(labelY);ctx.fillText(value,labelX,labelY);
      });
      ctx.restore();
    },
  };
  function destroy() {for (const chart of charts) chart.destroy(); charts=[]; hour=null;}
  function render(container, rows) {
    destroy(); container.replaceChildren();
    if (!window.Chart) {container.textContent='グラフを読み込めません。時間別データ表またはCSVで値を確認してください。'; return;}
    for (const [field,label,unit,color] of definitions) {
      const card=document.createElement('article'); card.className='chart-card';
      const heading=document.createElement('h3'); heading.textContent=`${label} (${unit})`;
      const reset=document.createElement('button'); reset.type='button'; reset.className='chart-reset-button'; reset.textContent='表示リセット';
      reset.addEventListener('click',resetViews); heading.append(reset);
      const wrapper=document.createElement('div'); wrapper.className='chart-container';
      const canvas=document.createElement('canvas'); canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',`${label}の時間別予報。値は下の時間別データ表でも確認できます。`); wrapper.append(canvas);
      const readout=document.createElement('p'); readout.className='chart-readout'; readout.textContent='グラフに触れると時刻と値を表示します。';
      card.append(heading,wrapper,readout); container.append(card);
      const data=rows.map((row,i)=>({x:i,y:typeof row[field]==='number' && Number.isFinite(row[field]) ? row[field] : null}));
      const chart=new Chart(canvas, {type:'line',data:{datasets:[{label,data,borderColor:color,backgroundColor:field==='shortwave_radiation'?'rgba(255,159,64,.15)':color,fill:field==='shortwave_radiation',pointRadius:3,pointHoverRadius:5,pointBackgroundColor:color,borderWidth:2,tension:0,spanGaps:false}]},plugins:[plugin],options:{
        animation:false,responsive:true,maintainAspectRatio:false,parsing:false,
        interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},zoom:{limits:{x:{min:0,max:23,minRange:1}},pan:{enabled:false},zoom:{wheel:{enabled:false},pinch:{enabled:!matchMedia('(max-width:600px)').matches},drag:{enabled:!matchMedia('(max-width:600px)').matches,backgroundColor:'rgba(30,120,255,.35)',borderColor:'rgba(30,120,255,.8)',borderWidth:1},mode:'xy',onZoomComplete:({chart:changed})=>{for (const other of charts) {if (other===changed) continue;other.options.scales.x.min=changed.scales.x.min;other.options.scales.x.max=changed.scales.x.max;other.update('none');}sync(null);}}},tooltip:{enabled:false,backgroundColor:'rgba(255,255,255,.95)',borderColor:'#b7cddd',borderWidth:1,titleColor:'#000',bodyColor:'#000',callbacks:{title:items=>items.length?time(items[0].parsed.x)+' JST':'',label:item=>`${label}: ${item.parsed.y.toFixed(2)} ${unit}`}}},
        scales:{x:{type:'linear',min:0,max:23,grid:{drawOnChartArea:false},ticks:{color:'#000',stepSize:3,maxTicksLimit:7,maxRotation:0,callback:time}},y:{ticks:{color:'#000'},title:{display:true,text:unit,color:'#000'}},yRight:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#000'},afterDataLimits:scale=>{const left=scale.chart.scales.y;scale.min=left.min;scale.max=left.max;}}},
      }});
      chart.$readout=readout;chart.$unit=unit;chart.$field=field; charts.push(chart);
      chart.$radiation=NextValues.radiation.includes(field);chart.$raw=data.map(point=>point.y);
      if(chart.$radiation) {
        chart.data.datasets[0].label='全天日射';
        for(const [key,name,tint] of [['direct_radiation','直達日射','rgb(255,159,64)'],['diffuse_radiation','散乱日射','rgb(54,162,235)']])chart.data.datasets.push({...chart.data.datasets[0],label:name,data:rows.map((row,i)=>({x:i,y:typeof row[key]==='number' && Number.isFinite(row[key])?row[key]:null})),borderColor:tint,backgroundColor:tint,pointBackgroundColor:tint,fill:false});
        chart.$rawSeries=chart.data.datasets.map(dataset=>dataset.data.map(point=>point.y));
        chart.options.plugins.legend={display:true,labels:{boxWidth:12,font:{size:10}}};
        chart.options.plugins.tooltip.callbacks.label=item=>{const raw=chart.$rawSeries[item.datasetIndex][item.dataIndex];return [`${item.dataset.label}: ${raw.toFixed(2)} W/m²`,`${(raw*.0036).toFixed(3)} MJ/m²/h`];};
        const select=document.createElement('select');select.setAttribute('aria-label',`${label}の単位`);
        for(const text of ['W/m²','MJ/m²/h']) {const option=document.createElement('option');option.textContent=text;select.append(option);}
        card.insertBefore(select,wrapper);
        select.addEventListener('change',()=>{resetViews();chart.$unit=select.value;chart.data.datasets.forEach((dataset,index)=>{dataset.data=chart.$rawSeries[index].map((value,i)=>({x:i,y:value===null?null:value*(select.value==='W/m²'?1:.0036)}));});chart.options.scales.y.title.text=select.value;heading.firstChild.textContent=`${label} (${select.value})`;chart.update('none');sync(hour);});
        chart.update('none');
      }
      if (chart.data.datasets.some(dataset=>dataset.data.some(point=>point.y===null))) {const note=document.createElement('p');note.className='caption';note.textContent='欠損した時間は線をつないでいません。';card.append(note);}
    }
  }
  return {render,destroy,resize:()=>charts.forEach(chart=>chart.resize()),sync};
})();
