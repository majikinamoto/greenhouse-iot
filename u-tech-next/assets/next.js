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
  const cards = [
    ['最高気温',summary.temperature_2m.max,'℃',1],['最低気温',summary.temperature_2m.min,'℃',1],
    ['平均湿度',summary.relative_humidity_2m.mean,'%',1],['最大VPD',summary.vpd.max,'kPa',2],
    ['平均VPD',summary.vpd.mean,'kPa',2],['日積算日射',summary.shortwave_radiation.sum,'MJ/m²/day',2],
    ['日積算ET0',summary.et0.sum,'mm/day',2],['日降水量',summary.precipitation.sum,'mm/day',1],
    ['平均風速',summary.wind_speed_10m.mean,'m/s',2],['最大風速',summary.wind_speed_10m.max,'m/s',2],
    ['日照時間',summary.sunshine_duration.sum === null ? null : summary.sunshine_duration.sum / 3600,'時間/day',2],
  ];
  const container = document.getElementById('summary');
  container.replaceChildren();
  for (const [index, [label, value, unit, digits]] of cards.entries()) {
    const card = element('div',`metric metric-${index}`);
    card.append(element('div','metric-label',label),element('div',value === null ? 'metric-value missing' : 'metric-value',value === null ? '欠損あり' : format(value,digits)),element('div','metric-unit',unit));
    container.append(card);
  }
}
function svgNode(tag, attrs, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key,String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderChart(rows, field, label, unit, color) {
  const card = element('article','chart-card');
  card.append(element('h3','',`${label} (${unit})`));
  const svg = svgNode('svg',{viewBox:'0 0 520 220',role:'img','aria-label':`${label}の00時から23時までの変化。数値は時間別データ表で確認できます。`});
  const values = rows.map(row => row[field]);
  const valid = values.filter(value => typeof value === 'number' && Number.isFinite(value));
  if (!valid.length) {
    card.append(element('p','missing','すべての時間で欠損しています。'));
    return card;
  }
  let min = Math.min(...valid), max = Math.max(...valid);
  const margin = (max - min || Math.max(Math.abs(max) * .1, 1)) * .12;
  min -= margin; max += margin;
  if (field !== 'temperature_2m') min = Math.max(0,min);
  const x = i => 52 + i / 23 * 450;
  const y = value => 178 - (value - min) / (max - min) * 150;
  for (let i = 0; i <= 3; i++) {
    const value = min + (max - min) * i / 3;
    svg.append(svgNode('line',{x1:52,x2:502,y1:y(value),y2:y(value),class:'grid'}),svgNode('text',{x:44,y:y(value)+4,'text-anchor':'end'},value.toFixed(field === 'shortwave_radiation' ? 0 : 1)));
  }
  for (const i of [0,6,12,18,23]) svg.append(svgNode('text',{x:x(i),y:202,'text-anchor':'middle'},`${String(i).padStart(2,'0')}:00`));
  let segment = '';
  values.forEach((value,i) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {segment = ''; return;}
    const point = `${x(i)},${y(value)}`;
    if (segment) svg.append(svgNode('line',{x1:x(i-1),y1:y(values[i-1]),x2:x(i),y2:y(value),class:'line',stroke:color}));
    const dot = svgNode('circle',{cx:x(i),cy:y(value),r:3,fill:color});
    dot.append(svgNode('title',{},`${rows[i].forecast_for}: ${value} ${unit}`));
    svg.append(dot);
    segment = point;
  });
  card.append(svg);
  if (valid.length !== 24) card.append(element('p','caption','欠損した時間は線をつないでいません。'));
  return card;
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
    const charts = document.getElementById('charts'); charts.replaceChildren();
    for (const [field,label,unit,color] of [
      ['shortwave_radiation','全天日射','W/m²','#bb8428'],['temperature_2m','気温','℃','#b76446'],
      ['relative_humidity_2m','相対湿度','%','#477c9b'],['wind_speed_10m','風速','m/s','#37765c'],
      ['vpd','VPD','kPa','#876495'],['et0','ET0（直前1時間）','mm','#417c76'],
    ]) charts.append(renderChart(payload.rows.slice(0,24),field,label,unit,color));
    renderRows(payload.rows);
    document.getElementById('forecast-content').hidden = false;
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
document.getElementById('date-form').addEventListener('submit', event => {event.preventDefault(); if (NextContext.prepare()) loadForecast();});
loadForecast();
