'use strict';
window.NextValues = (() => {
  const radiation=['shortwave_radiation','direct_radiation','diffuse_radiation'];
  const converted=radiation.map((key,i)=>[key+'_mj',['全天日射','直達日射','散乱日射'][i],'MJ/m²/h']);
  const daily=[];
  for (const [key,label,unit,stats] of [
    ['temperature_2m','気温','℃',['min','max','mean']],
    ['relative_humidity_2m','湿度','%',['min','max','mean']],
    ['vpd','VPD','kPa',['max','mean']],['wind_speed_10m','風速','m/s',['max','mean']],
    ...radiation.map((key,i)=>[key,['全天日射','直達日射','散乱日射'][i],'MJ/m²/day',['sum']]),
    ['et0','ET0','mm/day',['sum']],['precipitation','降水量','mm/day',['sum']],['sunshine_duration','日照時間','時間/day',['sum']],
  ]) for(const stat of stats) daily.push([key+'_'+stat,({'min':'最低','max':'最大','mean':'平均','sum':'日積算'})[stat]+label,unit,key,stat]);
  function hourly(row,key) {if(key.endsWith('_mj')) {const value=row[key.slice(0,-3)];return typeof value==='number' && Number.isFinite(value)?value*.0036:null;}return row[key];}
  function aggregate(batch) {
    const result={forecast_date:batch.forecast_date,fetched_at:batch.fetched_at};
    for(const [key,,,base,stat] of daily) {
      const rows=stat==='sum'?batch.rows.slice(1,25):batch.rows.slice(0,24);
      const values=rows.map(row=>row[base]);
      const complete=rows.length===24 && values.every(value=>typeof value==='number' && Number.isFinite(value));
      result[key]=!complete?null:stat==='min'?Math.min(...values):stat==='max'?Math.max(...values):values.reduce((a,b)=>a+b,0)*(stat==='mean'?1/24:radiation.includes(base)?.0036:base==='sunshine_duration'?1/3600:1);
    }
    return result;
  }
  return {radiation,converted,daily,hourly,aggregate};
})();
