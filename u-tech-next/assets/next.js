'use strict';

const fields = [
  ['temperature_2m','気温','℃'],['relative_humidity_2m','湿度','%'],['dew_point_2m','露点','℃'],
  ['vpd','VPD','kPa'],['shortwave_radiation','全天日射','W/m²'],['direct_radiation','直達日射','W/m²'],
  ['diffuse_radiation','散乱日射','W/m²'],['et0','ET0','mm'],['wind_speed_10m','風速','m/s'],
  ['wind_direction_10m','風向','°'],['precipitation','降水量','mm'],['cloud_cover','全雲量','%'],
  ['cloud_cover_low','下層雲量','%'],['cloud_cover_mid','中層雲量','%'],['cloud_cover_high','上層雲量','%'],
  ['pressure_msl','海面更正気圧','hPa'],['surface_pressure','地表面気圧','hPa'],
  ['sunshine_duration','日照時間','秒'],['weather_code','天気コード','WMO'],
];
const dateInput = document.getElementById('forecast-date');
const statusElement = document.getElementById('status');
let activeRequest;

function japanDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function format(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}
function renderSummary(summary) {
  const entries = [
    ['最高気温',summary.temperature_2m.max,'℃',1],['最低気温',summary.temperature_2m.min,'℃',1],
    ['平均湿度',summary.relative_humidity_2m.mean,'%',1],['最大VPD',summary.vpd.max,'kPa',2],
    ['平均VPD',summary.vpd.mean,'kPa',2],['日積算日射',summary.shortwave_radiation.sum,'MJ/m²/day',2],
    ['日積算ET0',summary.et0.sum,'mm/day',2],['日降水量',summary.precipitation.sum,'mm/day',1],
    ['平均風速',summary.wind_speed_10m.mean,'m/s',2],['最大風速',summary.wind_speed_10m.max,'m/s',2],
    ['日照時間',summary.sunshine_duration.sum === null ? null : summary.sunshine_duration.sum / 3600,'時間/day',2],
  ];
  const container = document.getElementById('summary');
  container.replaceChildren();
  const groups=['temperature','temperature','humidity','vpd','vpd','radiation','et0','precipitation','wind','wind','radiation'];
  for (let offset=0;offset<entries.length;offset+=3) {
  const table = element('table','summary-table');
  table.setAttribute('aria-labelledby','summary-title');
  const head = element('thead'), header = element('tr');
  for (const label of ['項目','値','単位']) {const th=element('th','',label);th.scope='col';header.append(th);}
  head.append(header);
  const body = element('tbody');
  for (const [localIndex, [label, value, unit, digits]] of entries.slice(offset,offset+3).entries()) {
    const index=offset+localIndex;
    const row=element('tr',`summary-${groups[index]}`);
    const name=element('th','',label);name.scope='row';
    row.append(name,element('td',value === null ? 'summary-value missing' : 'summary-value',value === null ? '欠損あり' : format(value,digits)),element('td','summary-unit',unit));
    body.append(row);
  }
  table.append(head,body);container.append(table);
  }
}
function renderRows(rows) {
  const table = document.getElementById('hourly-table');
  const head = element('thead'), header = element('tr');
  const timeHeader = element('th','','予報対象日時 JST'); timeHeader.scope = 'col'; header.append(timeHeader);
  for (const [,label,unit] of fields) {const th = element('th','',`${label} (${unit})`); th.scope = 'col'; header.append(th);}
  head.append(header);
  const body = element('tbody');
  rows.forEach(row => {
    const tr = element('tr');
    const time = element('th','',row.forecast_for.slice(0,16)); time.scope = 'row'; tr.append(time);
    for (const [field] of fields) tr.append(element('td','',row[field] === null ? '—' : String(row[field])));
    body.append(tr);
  });
  table.replaceChildren(head,body);
}
async function loadForecast() {
  if (!dateInput.checkValidity()) {dateInput.reportValidity(); return;}
  if (activeRequest) activeRequest.abort();
  const controller = new AbortController(); activeRequest = controller;
  NextCharts.destroy();
  NextCsv.setForecast(null);
  document.getElementById('forecast-content').hidden = true;
  document.getElementById('fetched-at').textContent = '取得日時：—';
  statusElement.className = '';
  statusElement.textContent = '予報を読み込み中です。';
  const button = document.querySelector('#date-form button'); button.disabled = true;
  try {
    const response = await fetch('api/get_forecasts.php?date=' + encodeURIComponent(dateInput.value), {cache:'no-store',signal:controller.signal});
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.message || '予報を読み込めません。');
    document.getElementById('location-name').textContent = payload.location.name;
    if (payload.status !== 'saved' || !payload.rows.length) {
      const messages = {fetching:'予報を取得中です。',retrying:'取得に失敗したため再試行しています。',failed:'取得失敗：すべての再試行が終了しました。',not_available:'この日の予報はまだ保存されていません。'};
      statusElement.textContent = messages[payload.status] || messages.not_available;
      return;
    }
    document.getElementById('fetched-at').textContent = `取得日時：${payload.fetched_at} JST`;
    statusElement.textContent = `${payload.forecast_date} の予報`;
    renderSummary(payload.summary);
    renderRows(payload.rows);
    document.getElementById('forecast-content').hidden = false;
    NextCharts.render(document.getElementById('charts'),payload.rows.slice(0,24));
    NextCsv.setForecast(payload);
  } catch (error) {
    if (error.name === 'AbortError') return;
    statusElement.className = 'error';
    statusElement.textContent = error instanceof SyntaxError ? '予報APIの応答を読み込めません。サーバー設定を確認してください。' : error.message;
  } finally {
    if (activeRequest === controller) button.disabled = false;
  }
}
dateInput.value = japanDate(new Date(Date.now() + 86400000));
NextContext.initialize();
NextCsv.initialize(fields);
const tabs = Array.from(document.querySelectorAll('.next-tabs [role=tab]'));
function selectTab(tab) {
  for (const item of tabs) {const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;document.getElementById(item.getAttribute('aria-controls')).hidden=!selected;}
  NextCharts.sync(null);
  if (tab.id==='tab-forecast') NextCharts.resize();
}
for (const tab of tabs) {
  tab.addEventListener('click',()=>selectTab(tab));
  tab.addEventListener('keydown',event=>{if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {event.preventDefault();const target=event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:tabs[(tabs.indexOf(tab)+1)%tabs.length];selectTab(target);target.focus();}});
}
document.getElementById('date-form').addEventListener('submit', event => {event.preventDefault(); if (NextContext.prepare()) loadForecast();});
loadForecast();
