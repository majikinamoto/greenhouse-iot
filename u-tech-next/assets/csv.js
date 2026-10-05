'use strict';
window.NextCsv = (() => {
  let fields = [];
  const storageKey='utech_next_csv_selection_v1';
  const metadata=[['forecast_date','予報日',true],['fetched_at_jst','取得日時（JST）',true],['location_id','地点ID',false],['location_name','地点名',false],['latitude','緯度',false],['longitude','経度',false],['model','モデル',false],['timezone','タイムゾーン',false],['is_boundary','境界値の印',false],['sources','データの由来（source列）',false]];
  function settings() {return Object.fromEntries(Array.from(document.querySelectorAll('#csv-metadata input'),input=>[input.value,input.checked]));}
  function saveSelection() {
    try {localStorage.setItem(storageKey,JSON.stringify({version:1,fields:Array.from(document.querySelectorAll('#csv-fields input:checked'),input=>input.value),dailyFields:Array.from(document.querySelectorAll('#csv-daily-fields input:checked'),input=>input.value),metadata:settings()}));} catch (_) {}
    document.getElementById('csv-history-warning').hidden=settings().forecast_date || settings().fetched_at_jst;
  }
  const raw = new Set(['temperature_2m','relative_humidity_2m','shortwave_radiation','precipitation','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','pressure_msl']);
  const intervals = new Set(['shortwave_radiation','direct_radiation','diffuse_radiation','et0','precipitation','sunshine_duration']);
  const source = key => (raw.has(key)?'JMA_MSM_via_OpenMeteo':'OpenMeteo_derived_from_JMA_MSM') + (intervals.has(key)?';preceding_hour':'');
  const quote = value => '"'+String(value ?? '').replace(/"/g,'""')+'"';
  function build(payload, selected, options=settings()) {
    const isDaily=options.mode==='daily';
    const chosen=(isDaily?NextValues.daily:fields).filter(([key])=>selected.includes(key));
    const columns=['forecast_date','forecast_for_jst','fetched_at_jst','location_id','location_name','latitude','longitude','model','timezone','is_boundary'].filter(key=>key==='forecast_for_jst' || options[key]);
    if(isDaily) {columns.splice(columns.indexOf('forecast_for_jst'),1);if(!columns.includes('forecast_date')) columns.unshift('forecast_date');const boundary=columns.indexOf('is_boundary');if(boundary>=0) columns.splice(boundary,1);}
    const header=[...columns];
    for (const [key,,unit] of chosen) {header.push(`${key} (${unit})`);if(options.sources) header.push(`${key}_source`);}
    const lines=[header];
    for (const row of payload.rows) {
      const location=payload.location;
      const day=row.forecast_date ?? payload.forecast_date;
      const values={forecast_date:day,forecast_for_jst:row.forecast_for,fetched_at_jst:row.fetched_at ?? payload.fetched_at,location_id:location.id,location_name:location.name,latitude:location.latitude,longitude:location.longitude,model:payload.model,timezone:payload.timezone,is_boundary:!isDaily && row.forecast_for.slice(0,10)!==day?1:0};
      const line=columns.map(key=>values[key]);
      for (const [key,,,base,stat] of chosen) {line.push(isDaily?row[key]:NextValues.hourly(row,key));if(options.sources) line.push(isDaily?`UTechNext_daily_${stat};${source(base)}`:key.endsWith('_mj')?`UTechNext_unit_conversion;${source(key.slice(0,-3))}`:source(key));}
      lines.push(line);
    }
    return '\uFEFF'+lines.map(line=>line.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  function initialize(definitions) {
    fields=[...definitions,...NextValues.converted];
    let saved=null;try {const parsed=JSON.parse(localStorage.getItem(storageKey));if(parsed?.version===1 && Array.isArray(parsed.fields) && parsed.metadata && typeof parsed.metadata==='object') saved=parsed;} catch (_) {}
    for(const [key,label,checked] of metadata) {const option=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=typeof saved?.metadata[key]==='boolean'?saved.metadata[key]:checked;option.append(input,document.createTextNode(label));document.getElementById('csv-metadata').append(option);}
    const groups=[['温度・湿度',['temperature_2m','relative_humidity_2m','dew_point_2m','vpd']],['日射・日照',['shortwave_radiation','shortwave_radiation_mj','direct_radiation','direct_radiation_mj','diffuse_radiation','diffuse_radiation_mj','sunshine_duration']],['ET0・降水',['et0','precipitation']],['風',['wind_speed_10m','wind_direction_10m']],['雲・気圧・天気',['cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','pressure_msl','surface_pressure','weather_code']]];
    for (const [name,keys] of groups) {
      const group=document.createElement('details');group.open=true;
      const heading=document.createElement('summary');heading.textContent=name;group.append(heading);
      const options=document.createElement('div');options.className='csv-options';
      for (const key of keys) {const [,label,unit]=fields.find(field=>field[0]===key);const option=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=key;checkbox.checked=true;option.append(checkbox,document.createTextNode(`${label} (${unit})`));options.append(option);}
      group.append(options);document.getElementById('csv-fields').append(group);
    }
    if(saved) document.querySelectorAll('#csv-fields input').forEach(input=>{input.checked=saved.fields.includes(input.value);});
    for(const [key,label,unit] of NextValues.daily) {const option=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=true;option.append(input,document.createTextNode(`${label} (${unit})`));document.getElementById('csv-daily-fields').append(option);}
    if(Array.isArray(saved?.dailyFields)) document.querySelectorAll('#csv-daily-fields input').forEach(input=>{input.checked=saved.dailyFields.includes(input.value);});
    const mode=document.getElementById('csv-mode');
    mode.addEventListener('change',()=>{
      const daily=mode.value==='daily';
      document.getElementById('csv-fields').hidden=daily;document.getElementById('csv-daily-fields').hidden=!daily;document.getElementById('csv-daily-note').hidden=!daily;
      document.getElementById('csv-hourly-note').hidden=daily;
      document.getElementById('csv-history-warning').hidden=daily || settings().forecast_date || settings().fetched_at_jst;
      for(const id of ['csv-start','csv-end']) {const input=document.getElementById(id),value=input.value;input.type=daily?'date':'datetime-local';input.step=daily?'1':'60';input.value=daily?value.slice(0,10):value+(id==='csv-start'?'T00:00':'T23:00');}
    });
    for(const id of ['csv-fields','csv-daily-fields','csv-metadata']) document.getElementById(id).addEventListener('change',saveSelection);
    for (const [id,checked] of [['csv-all',true],['csv-none',false]]) document.getElementById(id).addEventListener('click',()=>{document.querySelectorAll((mode.value==='daily'?'#csv-daily-fields':'#csv-fields')+' input').forEach(input=>{input.checked=checked;});saveSelection();});
    document.getElementById('csv-history-warning').hidden=settings().forecast_date || settings().fetched_at_jst;
    document.getElementById('csv-download').addEventListener('click',async()=>{
      const selected=Array.from(document.querySelectorAll((mode.value==='daily'?'#csv-daily-fields':'#csv-fields')+' input:checked'),input=>input.value);
      const options={...settings(),mode:mode.value};
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
          if(options.mode==='daily') {rows.push(NextValues.aggregate(batch));continue;}
          for (const row of batch.rows) {const stamp=row.forecast_for.replace(' ','T').slice(0,16);if (stamp>=first && stamp<=last) rows.push({...row,forecast_date:day});}
        }
        if (!rows.length) {message.textContent='指定期間に保存済みの予報はありません。';return;}
        rows.sort((a,b)=>(a.forecast_for ?? a.forecast_date).localeCompare(b.forecast_for ?? b.forecast_date)||a.forecast_date.localeCompare(b.forecast_date));
        const url=URL.createObjectURL(new Blob([build({...payload,rows},selected,options)],{type:'text/csv;charset=utf-8'}));
        const site=String(payload.location.name).replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,80);
        const model=String(payload.model).replace(/[^A-Za-z0-9_-]/g,'_');
        const link=document.createElement('a');link.href=url;link.download=`utech-next_${site}_${model}_${first.replace(/[:T]/g,'-')}_${last.replace(/[:T]/g,'-')}_${options.mode}_JST.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
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
