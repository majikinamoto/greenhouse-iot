'use strict';
window.NextCsv = (() => {
  let fields = [];
  const raw = new Set(['temperature_2m','relative_humidity_2m','shortwave_radiation','precipitation','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','pressure_msl']);
  const intervals = new Set(['shortwave_radiation','direct_radiation','diffuse_radiation','et0','precipitation','sunshine_duration']);
  const source = key => (raw.has(key)?'JMA_MSM_via_OpenMeteo':'OpenMeteo_derived_from_JMA_MSM') + (intervals.has(key)?';preceding_hour':'');
  const quote = value => '"'+String(value ?? '').replace(/"/g,'""')+'"';
  function build(payload, selected) {
    const chosen=fields.filter(([key])=>selected.includes(key));
    const header=['forecast_date','forecast_for_jst','fetched_at_jst','location_id','location_name','latitude','longitude','model','timezone','is_boundary'];
    for (const [key,,unit] of chosen) header.push(`${key} (${unit})`,`${key}_source`);
    const lines=[header];
    for (const row of payload.rows) {
      const location=payload.location;
      const day=row.forecast_date ?? payload.forecast_date;
      const line=[day,row.forecast_for,row.fetched_at ?? payload.fetched_at,location.id,location.name,location.latitude,location.longitude,payload.model,payload.timezone,row.forecast_for.slice(0,10)!==day?1:0];
      for (const [key] of chosen) line.push(row[key],source(key));
      lines.push(line);
    }
    return '\uFEFF'+lines.map(line=>line.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  function initialize(definitions) {
    fields=definitions;
    const groups=[['温度・湿度',['temperature_2m','relative_humidity_2m','dew_point_2m','vpd']],['日射・日照',['shortwave_radiation','direct_radiation','diffuse_radiation','sunshine_duration']],['ET0・降水',['et0','precipitation']],['風',['wind_speed_10m','wind_direction_10m']],['雲・気圧・天気',['cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','pressure_msl','surface_pressure','weather_code']]];
    for (const [name,keys] of groups) {
      const group=document.createElement('details');group.open=true;
      const heading=document.createElement('summary');heading.textContent=name;group.append(heading);
      const options=document.createElement('div');options.className='csv-options';
      for (const key of keys) {const [,label,unit]=fields.find(field=>field[0]===key);const option=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=key;checkbox.checked=true;option.append(checkbox,document.createTextNode(`${label} (${unit})`));options.append(option);}
      group.append(options);document.getElementById('csv-fields').append(group);
    }
    for (const [id,checked] of [['csv-all',true],['csv-none',false]]) document.getElementById(id).addEventListener('click',()=>document.querySelectorAll('#csv-fields input').forEach(input=>{input.checked=checked;}));
    document.getElementById('csv-download').addEventListener('click',async()=>{
      const selected=Array.from(document.querySelectorAll('#csv-fields input:checked'),input=>input.value);
      if (!selected.length) {document.getElementById('csv-message').textContent='出力項目を1つ以上選択してください。';return;}
      const start=document.getElementById('csv-start'),end=document.getElementById('csv-end');
      if (!start.reportValidity() || !end.reportValidity()) return;
      const first=start.value,last=end.value;
      const days=(Date.parse(last.slice(0,10)+'T00:00:00Z')-Date.parse(first.slice(0,10)+'T00:00:00Z'))/86400000+1;
      const message=document.getElementById('csv-message'),button=document.getElementById('csv-download');
      if (first>last || days>366 || !Number.isFinite(days)) {message.textContent='開始日時は終了日時以前、期間は366日以内にしてください。';return;}
      button.disabled=true;message.textContent='指定期間の予報を読み込み中です。';
      try {
        let payload=null;const rows=[],missing=[];
        for (let i=0;i<days;i++) {
          const day=new Date(Date.parse(first.slice(0,10)+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);
          const response=await fetch('api/get_forecasts.php?date='+encodeURIComponent(day),{cache:'no-store'});
          const batch=await response.json();
          if (!response.ok || !batch.success) throw new Error(`${day} の予報を読み込めません。CSVは出力していません。`);
          if (batch.status!=='saved' || !batch.rows.length) {missing.push(day);continue;}
          if (payload && (String(payload.location.id)!==String(batch.location.id) || payload.model!==batch.model)) throw new Error('期間内の地点またはモデルが一致しません。');
          payload=batch;
          for (const row of batch.rows) {const stamp=row.forecast_for.replace(' ','T').slice(0,16);if (stamp>=first && stamp<=last) rows.push({...row,forecast_date:day});}
        }
        if (!rows.length) {message.textContent='指定期間に保存済みの予報はありません。';return;}
        rows.sort((a,b)=>a.forecast_for.localeCompare(b.forecast_for)||a.forecast_date.localeCompare(b.forecast_date));
        const url=URL.createObjectURL(new Blob([build({...payload,rows},selected)],{type:'text/csv;charset=utf-8'}));
        const link=document.createElement('a');link.href=url;link.download=`utech-next_${first.replace(/[:T]/g,'-')}_${last.replace(/[:T]/g,'-')}_${payload.model}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        message.textContent=`${selected.length}項目・${rows.length}レコードのCSVを出力しました。`+(missing.length?` 未保存：${missing.join('、')}`:'');
      } catch(error) {message.textContent=error.message || 'CSVを出力できません。';}
      finally {button.disabled=false;}
    });
  }
  function setForecast(payload) {
    if (payload && !document.getElementById('csv-start').value) {document.getElementById('csv-start').value=payload.forecast_date+'T00:00';document.getElementById('csv-end').value=payload.forecast_date+'T23:00';}
    document.getElementById('export-date').textContent=payload?`${payload.forecast_date} の予報 ／ 取得：${payload.fetched_at} JST ／ ${payload.location.name}`:'保存済みの予報を選択してください。';
    document.getElementById('csv-message').textContent='';
  }
  return {initialize,setForecast,build};
})();
