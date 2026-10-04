'use strict';
window.NextCharts = (() => {
  const definitions = [
    ['shortwave_radiation','全天日射','W/m²','rgb(255,205,86)'],
    ['temperature_2m','気温','℃','rgb(255,99,132)'],
    ['relative_humidity_2m','相対湿度','%','rgb(54,162,235)'],
    ['wind_speed_10m','風速','m/s','rgb(75,192,192)'],
    ['vpd','VPD','kPa','rgb(153,102,255)'],
    ['et0','ET0（直前1時間）','mm','rgb(153,102,255)'],
  ];
  let charts = [], hour = null;
  const time = value => `${String(Math.round(value)).padStart(2,'0')}:00`;
  function sync(value) {
    hour = value;
    for (const chart of charts) {
      const active = value === null || chart.data.datasets[0].data[value].y === null ? [] : [{datasetIndex:0,index:value}];
      chart.setActiveElements(active);
      chart.tooltip.setActiveElements(active, {x:value === null ? 0 : chart.scales.x.getPixelForValue(value),y:chart.chartArea.bottom});
      const number = value === null ? null : chart.data.datasets[0].data[value].y;
      chart.$readout.textContent = value === null ? 'グラフに触れると時刻と値を表示します。' : `${time(value)} JST　${number === null ? '欠損' : number.toFixed(2) + ' ' + chart.$unit}`;
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
      reset.addEventListener('click',()=>{for (const item of charts) {if (item.resetZoom) item.resetZoom();item.options.scales.x.min=0;item.options.scales.x.max=23;item.update('none');} sync(null);}); heading.append(reset);
      const wrapper=document.createElement('div'); wrapper.className='chart-container';
      const canvas=document.createElement('canvas'); canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',`${label}の時間別予報。値は下の時間別データ表でも確認できます。`); wrapper.append(canvas);
      const readout=document.createElement('p'); readout.className='chart-readout'; readout.textContent='グラフに触れると時刻と値を表示します。';
      card.append(heading,wrapper,readout); container.append(card);
      const data=rows.map((row,i)=>({x:i,y:typeof row[field]==='number' && Number.isFinite(row[field]) ? row[field] : null}));
      const chart=new Chart(canvas, {type:'line',data:{datasets:[{label,data,borderColor:color,backgroundColor:field==='shortwave_radiation'?'rgba(255,159,64,.15)':color,fill:field==='shortwave_radiation',pointRadius:0,pointHoverRadius:3,borderWidth:2,tension:.2,spanGaps:false}]},plugins:[plugin],options:{
        animation:false,responsive:true,maintainAspectRatio:false,parsing:false,
        interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},zoom:{limits:{x:{min:0,max:23,minRange:1}},pan:{enabled:false},zoom:{wheel:{enabled:false},pinch:{enabled:!matchMedia('(max-width:600px)').matches},drag:{enabled:!matchMedia('(max-width:600px)').matches,backgroundColor:'rgba(30,120,255,.35)',borderColor:'rgba(30,120,255,.8)',borderWidth:1},mode:'x',onZoomComplete:({chart:changed})=>{for (const other of charts) {if (other===changed) continue;other.options.scales.x.min=changed.scales.x.min;other.options.scales.x.max=changed.scales.x.max;other.update('none');}sync(null);}}},tooltip:{backgroundColor:'rgba(255,255,255,.95)',borderColor:'#b7cddd',borderWidth:1,titleColor:'#000',bodyColor:'#000',callbacks:{title:items=>items.length?time(items[0].parsed.x)+' JST':'',label:item=>`${label}: ${item.parsed.y.toFixed(2)} ${unit}`}}},
        scales:{x:{type:'linear',min:0,max:23,grid:{drawOnChartArea:false},ticks:{color:'#000',stepSize:3,maxTicksLimit:7,maxRotation:0,callback:time}},y:{ticks:{color:'#000'},title:{display:true,text:unit,color:'#000'}},yRight:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#000'},afterDataLimits:scale=>{const left=scale.chart.scales.y;scale.min=left.min;scale.max=left.max;}}},
      }});
      chart.$readout=readout;chart.$unit=unit; charts.push(chart);
      if (data.some(point=>point.y===null)) {const note=document.createElement('p');note.className='caption';note.textContent='欠損した時間は線をつないでいません。';card.append(note);}
    }
  }
  return {render,destroy,resize:()=>charts.forEach(chart=>chart.resize()),sync};
})();
