'use strict';
// UI integration tests with synthetic forecast data; no PHP or DB requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..', 'u-tech-next');

const keys = ['temperature_2m','relative_humidity_2m','dew_point_2m','vpd','shortwave_radiation','direct_radiation','diffuse_radiation','et0','wind_speed_10m','wind_direction_10m','precipitation','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','pressure_msl','surface_pressure','sunshine_duration','weather_code'];
function fixture(date) {
  const rows = Array.from({length:25}, (_,i) => {
    const instant = new Date(`${date}T00:00:00Z`); instant.setUTCHours(i);
    const row = Object.fromEntries(keys.map(key => [key,0]));
    Object.assign(row, {
      forecast_for:instant.toISOString().slice(0,19).replace('T',' '),
      fetched_at:'2026-10-03 18:15:04',temperature_2m:26+3*Math.sin(i/24*Math.PI*2),
      relative_humidity_2m:80-8*Math.sin(i/24*Math.PI*2),
      shortwave_radiation:Math.max(0,700*Math.sin((i-6)/12*Math.PI)),
      vpd:.5+i*.02,wind_speed_10m:2+i*.04,et0:i===0?9:.1,
      sunshine_duration:1800,
    });
    return row;
  });
  if (date === '2026-10-05') {rows[5].relative_humidity_2m = null; rows[24].et0 = null;}
  const summary = {};
  for (const key of ['temperature_2m','relative_humidity_2m','vpd','wind_speed_10m']) {
    const values = rows.slice(0,24).map(row=>row[key]); const complete = !values.includes(null);
    summary[key] = {complete,min:complete?Math.min(...values):null,max:complete?Math.max(...values):null,mean:complete?values.reduce((a,b)=>a+b,0)/24:null};
  }
  for (const [key,factor] of Object.entries({shortwave_radiation:.0036,et0:1,precipitation:1,sunshine_duration:1})) {
    const values=rows.slice(1).map(row=>row[key]); const complete=!values.includes(null);
    summary[key]={complete,sum:complete?values.reduce((a,b)=>a+b,0)*factor:null};
  }
  const statuses={'2026-10-01':'failed','2026-10-02':'retrying','2026-09-30':'not_available'};
  const status=statuses[date] || 'saved';
  return {success:true,forecast_date:date,model:'jma_msm',timezone:'Asia/Tokyo',location:{name:'沖縄県農業研究センター'},status,fetched_at:status==='saved'?'2026-10-03 18:15:04':null,rows:status==='saved'?rows:[],summary:status==='saved'?summary:null};
}
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/u-tech-next/api/get_forecasts.php') {
    const date=url.searchParams.get('date');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if (date==='2026-09-29') {res.statusCode=503;res.end(JSON.stringify({success:false,message:'予報データを読み込めません。'}));return;}
    res.end(JSON.stringify(fixture(date)));return;
  }
  const relative = url.pathname.replace(/^\/u-tech-next\/?/,'') || 'index.html';
  const file=path.resolve(root,relative);
  if (!file.startsWith(root+path.sep) || !['.html','.css','.js'].includes(path.extname(file)) || !fs.existsSync(file)) {res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'})[path.extname(file)]);
  res.end(fs.readFileSync(file));
});
(async()=>{
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:1000}});
    if (process.env.NEXT_TEST_ASSETS) await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({path:path.join(process.env.NEXT_TEST_ASSETS,new URL(route.request().url()).pathname.split('/').pop()),contentType:'application/javascript'}));
    const page=await context.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await context.addInitScript(() => {
      if (!localStorage.getItem('usui_user_id')) {
        localStorage.setItem('usui_user_id','TEST_MAIN');
        localStorage.setItem('usui_user_id_history',JSON.stringify(['TEST_MAIN','TEST_OLD']));
        localStorage.setItem('usui_outside_source_user_id','TEST_OUTSIDE');
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/u-tech-next/`);
    const choose=async date=>{
      await page.locator('#forecast-date').fill(date);
      await Promise.all([page.waitForResponse(response=>response.url().includes('date='+date)),page.locator('#date-form button').click()]);
      await page.waitForFunction(()=>!document.querySelector('#date-form button').disabled);
    };
    await page.waitForFunction(()=>!document.querySelector('#date-form button').disabled);
    assert.equal(await page.locator('#next-user-id').inputValue(),'TEST_MAIN');
    assert.equal(await page.locator('#next-point-id').inputValue(),'');
    assert.match(await page.locator('#mapping-status').textContent(),/未設定/);
    assert.equal(await page.locator('#next-user-history option').count(),3);
    await page.locator('#next-point-id').fill('P_TEST');
    await choose('2026-10-04');
    assert.match(await page.locator('#selected-context').textContent(),/TEST_MAIN.*P_TEST/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('usui_user_id')),'TEST_MAIN');
    assert.equal(await page.evaluate(()=>localStorage.getItem('usui_user_id_history')),JSON.stringify(['TEST_MAIN','TEST_OLD']));
    assert.equal(await page.evaluate(()=>localStorage.getItem('usui_outside_source_user_id')),'TEST_OUTSIDE');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('utech_next_selection_v1'))),{user_id:'TEST_MAIN',point_id:'P_TEST'});
    assert.equal(await page.locator('.summary-table tbody tr').count(),12);
    assert.equal(await page.locator('.summary-table').count(),4);
    assert.equal(await page.locator('.summary-table tbody tr').filter({hasText:'平均気温'}).locator('.summary-value').textContent(),'26.0');
    assert.equal(await page.locator('.chart-card canvas').count(),8);
    await page.waitForFunction(()=>typeof Chart !== 'undefined' && Chart.getChart(document.querySelector('canvas')));
    await page.locator('select[aria-label="全天日射の単位"]').selectOption('MJ/m²/h');
    const radiationValue=await page.locator('canvas').first().evaluate(canvas=>Chart.getChart(canvas).data.datasets[0].data[12].y);
    assert.ok(Math.abs(radiationValue-2.52)<1e-10);
    await page.locator('select[aria-label="全天日射の単位"]').selectOption('W/m²');
    await page.locator('canvas').first().scrollIntoViewIfNeeded();
    const hover = await page.locator('canvas').first().evaluate(canvas=>{
      const chart=Chart.getChart(canvas), rect=canvas.getBoundingClientRect();
      return {x:rect.left+chart.scales.x.getPixelForValue(12),y:rect.top+chart.chartArea.top+20};
    });
    await page.mouse.move(hover.x,hover.y);
    await page.waitForFunction(()=>document.querySelector('.chart-readout').textContent.includes('12:00 JST'));
    assert.equal(await page.locator('.chart-readout').filter({hasText:'12:00 JST'}).count(),8);
    assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('canvas'),canvas=>Chart.getChart(canvas).tooltip.getActiveElements().map(item=>item.index))),Array.from({length:8},()=>[12]));
    const drag=await page.locator('canvas').first().evaluate(canvas=>{const chart=Chart.getChart(canvas),rect=canvas.getBoundingClientRect();return {x1:rect.left+chart.scales.x.getPixelForValue(6),x2:rect.left+chart.scales.x.getPixelForValue(18),y:rect.top+chart.chartArea.top+40};});
    await page.mouse.move(drag.x1,drag.y);await page.mouse.down();await page.mouse.move(drag.x2,drag.y,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>Chart.getChart(document.querySelector('canvas')).scales.x.min>0);
    const ranges=await page.evaluate(()=>Array.from(document.querySelectorAll('canvas'),canvas=>{const chart=Chart.getChart(canvas);return [chart.scales.x.min,chart.scales.x.max];}));
    for (const range of ranges) assert.deepEqual(range,ranges[0]);
    await page.locator('.chart-reset-button').first().click();
    assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('canvas'),canvas=>{const chart=Chart.getChart(canvas);return [chart.scales.x.min,chart.scales.x.max];})),Array.from({length:8},()=>[0,23]));
    await page.locator('#tab-export').click();
    assert.equal(await page.locator('#export-panel').isVisible(),true);
    assert.equal(await page.locator('#forecast-panel').isVisible(),false);
    assert.equal(await page.locator('#csv-metadata input[value=sources]').isChecked(),false);
    await page.locator('#csv-metadata input[value=sources]').check();
    await page.locator('#csv-none').click();
    await page.locator('#csv-download').click();
    assert.match(await page.locator('#csv-message').textContent(),/1つ以上/);
    await page.locator('#csv-fields input[value=temperature_2m]').check();
    await page.locator('#csv-fields input[value=precipitation]').check();
    await page.locator('#csv-start').fill('2026-10-04T06:00');
    await page.locator('#csv-end').fill('2026-10-05T03:00');
    const downloadPromise=page.waitForEvent('download');await page.locator('#csv-download').click();
    const download=await downloadPromise;
    const downloaded=fs.readFileSync(await download.path(),'utf8');
    assert.equal(downloaded.charCodeAt(0),0xFEFF);
    assert.equal(downloaded.trim().split('\r\n').length,24);
    assert.match(downloaded,/temperature_2m_source/);
    assert.match(downloaded,/JMA_MSM_via_OpenMeteo;preceding_hour/);
    assert.doesNotMatch(downloaded,/relative_humidity_2m|user_id|point_id/);
    assert.match(downloaded,/2026-10-05 00:00/);
    assert.match(downloaded,/"0"/);
    assert.equal(download.suggestedFilename(),'utech-next_沖縄県農業研究センター_jma_msm_2026-10-04-06-00_2026-10-05-03-00_hourly_JST.csv');
    assert.doesNotMatch(downloaded.split('\r\n')[0],/location_name|latitude|is_boundary/);
    await page.locator('#csv-metadata input[value=sources]').uncheck();
    await page.locator('#csv-metadata input[value=forecast_date]').uncheck();
    await page.locator('#csv-metadata input[value=fetched_at_jst]').uncheck();
    assert.equal(await page.locator('#csv-history-warning').isVisible(),true);
    const compactPromise=page.waitForEvent('download');await page.locator('#csv-download').click();
    const compact=fs.readFileSync(await (await compactPromise).path(),'utf8');
    assert.equal(compact.split('\r\n')[0],'\uFEFF"forecast_for_jst","temperature_2m (℃)","precipitation (mm)"');
    await page.reload();
    await page.waitForFunction(()=>!document.querySelector('#date-form button').disabled);
    assert.equal(await page.locator('#csv-fields input:checked').count(),2);
    assert.equal(await page.locator('#csv-metadata input[value=forecast_date]').isChecked(),false);
    assert.equal(await page.locator('#csv-metadata input[value=sources]').isChecked(),false);
    await choose('2026-10-04');
    await page.locator('#tab-export').click();
    await page.locator('#csv-metadata input[value=forecast_date]').check();
    await page.locator('#csv-metadata input[value=fetched_at_jst]').check();
    assert.equal(await page.locator('#csv-history-warning').isVisible(),false);
    await page.locator('#csv-all').click();
    assert.equal(await page.locator('#csv-fields input:checked').count(),22);
    await page.locator('#tab-forecast').click();
    assert.match(await page.locator('#fetched-at').textContent(),/18:15:04 JST/);
    const et0=page.locator('.summary-table tbody tr').filter({hasText:'日積算ET0'});
    assert.match(await et0.textContent(),/2\.40/);
    await page.locator('.hourly > summary').click();
    assert.equal(await page.locator('#hourly-table tbody tr').count(),25);
    assert.match(await page.locator('#hourly-table tbody tr').last().textContent(),/2026-10-05 00:00/);
    await page.locator('.hourly > summary').click();
    await page.screenshot({path:path.join(os.tmpdir(),'utech-next-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true);
    await page.screenshot({path:path.join(os.tmpdir(),'utech-next-mobile.png'),fullPage:true});
    await choose('2026-10-05');
    await page.evaluate(()=>NextCharts.sync(5));
    assert.match(await page.locator('.chart-card').filter({hasText:'相対湿度'}).locator('.chart-readout').textContent(),/05:00 JST.*欠損/);
    await page.locator('#tab-export').click();
    await page.locator('#csv-start').fill('2026-10-05T00:00');
    await page.locator('#csv-end').fill('2026-10-06T00:00');
    const missingDownloadPromise=page.waitForEvent('download');await page.locator('#csv-download').click();
    const missingDownload=await missingDownloadPromise;
    const missingCsv=fs.readFileSync(await missingDownload.path(),'utf8');
    const csvLines=missingCsv.slice(1).trim().split('\r\n').map(line=>line.slice(1,-1).split('\",\"'));
    const humidityIndex=csvLines[0].findIndex(name=>name.startsWith('relative_humidity_2m ('));
    const et0Index=csvLines[0].findIndex(name=>name.startsWith('et0 ('));
    assert.equal(csvLines[6][humidityIndex],'');
    assert.equal(csvLines[25][et0Index],'');
    assert.equal(csvLines[26][1],'2026-10-06 00:00:00');
    await page.locator('#csv-mode').selectOption('daily');
    await page.locator('#csv-start').fill('2026-10-04');await page.locator('#csv-end').fill('2026-10-05');
    const dailyPromise=page.waitForEvent('download');await page.locator('#csv-download').click();
    const dailyCsv=fs.readFileSync(await (await dailyPromise).path(),'utf8').slice(1).trim().split('\r\n').map(line=>line.slice(1,-1).split('\",\"'));
    assert.equal(dailyCsv.length,3);
    assert.ok(!dailyCsv[0].includes('forecast_for_jst'));
    const meanIndex=dailyCsv[0].findIndex(name=>name.startsWith('temperature_2m_mean ('));
    const sumIndex=dailyCsv[0].findIndex(name=>name.startsWith('et0_sum ('));
    assert.ok(Math.abs(Number(dailyCsv[1][meanIndex])-26)<1e-10);
    assert.ok(Math.abs(Number(dailyCsv[1][sumIndex])-2.4)<1e-10);
    assert.equal(dailyCsv[2][sumIndex],'');
    await page.locator('#csv-mode').selectOption('hourly');
    await page.locator('#csv-start').fill('2026-10-05T00:00');await page.locator('#csv-end').fill('2026-10-06T00:00');
    await page.locator('#csv-start').fill('2026-10-06T01:00');
    await page.locator('#csv-download').click();
    assert.match(await page.locator('#csv-message').textContent(),/開始日時は終了日時以前/);
    await page.locator('#csv-start').fill('2026-10-01T00:00');
    await page.locator('#csv-end').fill('2026-10-02T23:00');
    await page.locator('#csv-download').click();
    await page.waitForFunction(()=>!document.getElementById('csv-download').disabled);
    assert.match(await page.locator('#csv-message').textContent(),/保存済みの予報はありません/);
    await page.locator('#csv-start').fill('2026-09-29T00:00');
    await page.locator('#csv-end').fill('2026-09-29T23:00');
    await page.locator('#csv-download').click();
    await page.waitForFunction(()=>!document.getElementById('csv-download').disabled);
    assert.match(await page.locator('#csv-message').textContent(),/CSVは出力していません/);
    await page.locator('#csv-start').fill('2026-10-05T00:00');
    await page.locator('#csv-end').fill('2026-10-06T00:00');
    // A changed, unapplied date must not relabel the loaded CSV.
    await page.locator('#forecast-date').fill('2026-10-06');
    assert.match(await page.locator('#export-date').textContent(),/2026-10-05 の予報/);
    await page.screenshot({path:path.join(os.tmpdir(),'utech-next-export-mobile.png'),fullPage:true});
    await page.locator('#tab-forecast').click();
    assert.equal(await page.locator('.missing').filter({hasText:'欠損あり'}).count(),2);
    assert.match(await page.locator('.chart-card').filter({hasText:'相対湿度'}).textContent(),/欠損した時間/);
    await choose('2026-10-01');
    assert.match(await page.locator('#status').textContent(),/取得失敗/);
    assert.equal(await page.locator('#forecast-content').isVisible(),false);
    await page.locator('#tab-export').click();assert.equal(await page.locator('#csv-download').isDisabled(),false);
    await page.locator('#tab-forecast').click();
    assert.equal(await page.locator('#fetched-at').textContent(),'取得日時：—');
    await choose('2026-10-02');assert.match(await page.locator('#status').textContent(),/再試行/);
    await choose('2026-09-30');assert.match(await page.locator('#status').textContent(),/まだ保存/);
    await choose('2026-09-29');assert.match(await page.locator('#status').textContent(),/読み込めません/);
    await choose('2026-10-04');assert.equal(await page.locator('#forecast-content').isVisible(),true);
    await page.locator('#next-user-id').fill('TEST_NEXT');
    assert.equal(await page.locator('#next-point-id').inputValue(),'');
    await choose('2026-10-04');
    assert.match(await page.locator('#selected-context').textContent(),/TEST_NEXT/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('usui_user_id')),'TEST_MAIN');
    await page.locator('#next-user-id').fill('<script>');
    await page.locator('#date-form button').click();
    assert.match(await page.locator('#context-error').textContent(),/半角英数字/);
    assert.match(await page.locator('#selected-context').textContent(),/TEST_NEXT/);
    await page.locator('#next-user-history').selectOption('TEST_MAIN');
    assert.equal(await page.locator('#next-user-id').inputValue(),'TEST_MAIN');
    await page.goto(`http://127.0.0.1:${server.address().port}/u-tech-next/?user_id=TEST_URL&point_id=P_URL`);
    await page.waitForFunction(()=>!document.querySelector('#date-form button').disabled);
    assert.equal(await page.locator('#next-user-id').inputValue(),'TEST_URL');
    assert.equal(await page.locator('#next-point-id').inputValue(),'P_URL');
    assert.match(await page.locator('#mapping-status').textContent(),/未設定/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('usui_user_id')),'TEST_MAIN');
    await page.goto(`http://127.0.0.1:${server.address().port}/u-tech-next/`);
    await page.waitForFunction(()=>!document.querySelector('#date-form button').disabled);
    assert.equal(await page.locator('#next-user-id').inputValue(),'TEST_MAIN');
    assert.equal(await page.locator('#next-point-id').inputValue(),'');
    // Unavailable/corrupt browser storage must not prevent public forecasts.
    const blocked = await browser.newContext({viewport:{width:390,height:844}});
    if (process.env.NEXT_TEST_ASSETS) await blocked.route('https://cdn.jsdelivr.net/**', route => route.fulfill({path:path.join(process.env.NEXT_TEST_ASSETS,new URL(route.request().url()).pathname.split('/').pop()),contentType:'application/javascript'}));
    await blocked.addInitScript(()=>{
      Object.defineProperty(Storage.prototype,'getItem',{value:()=>{throw new Error('blocked');}});
      Object.defineProperty(Storage.prototype,'setItem',{value:()=>{throw new Error('blocked');}});
    });
    const blockedPage=await blocked.newPage(); blockedPage.on('pageerror',error=>errors.push(error.message));
    await blockedPage.goto(`http://127.0.0.1:${server.address().port}/u-tech-next/`);
    await blockedPage.waitForFunction(()=>!document.querySelector('#date-form button').disabled);
    assert.equal(await blockedPage.locator('#forecast-content').isVisible(),true);
    await blockedPage.locator('#next-user-id').fill('TEST_BLOCKED');
    await blockedPage.locator('#date-form button').click();
    await blockedPage.waitForFunction(()=>!document.querySelector('#date-form button').disabled);
    assert.match(await blockedPage.locator('#context-error').textContent(),/保存できません/);
    assert.match(await blockedPage.locator('#selected-context').textContent(),/TEST_BLOCKED/);
    await blocked.close();
    assert.deepEqual(errors,[]);
    console.log('UI checks passed: desktop/mobile, synchronized crosshairs/tooltips/drag zoom/reset, CSV selection/download/BOM/25 timestamps/nulls/metadata, forecast aggregates/statuses, ID handoff/history/URL/validation/storage fallback, U-Tech keys unchanged and no page errors.');
    console.log('Screenshots: '+path.join(os.tmpdir(),'utech-next-desktop.png')+' / '+path.join(os.tmpdir(),'utech-next-mobile.png'));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
