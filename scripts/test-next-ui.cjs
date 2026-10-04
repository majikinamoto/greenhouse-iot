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
    assert.equal(await page.locator('.metric').count(),11);
    assert.equal(await page.locator('.chart-card svg').count(),6);
    assert.match(await page.locator('#fetched-at').textContent(),/18:15:04 JST/);
    const et0=page.locator('.metric').filter({hasText:'日積算ET0'});
    assert.match(await et0.textContent(),/2\.40/);
    await page.locator('.hourly summary').click();
    assert.equal(await page.locator('#hourly-table tbody tr').count(),25);
    assert.match(await page.locator('#hourly-table tbody tr').last().textContent(),/2026-10-05 00:00/);
    await page.locator('.hourly summary').click();
    await page.screenshot({path:path.join(os.tmpdir(),'utech-next-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true);
    await page.screenshot({path:path.join(os.tmpdir(),'utech-next-mobile.png'),fullPage:true});
    await choose('2026-10-05');
    assert.equal(await page.locator('.missing').filter({hasText:'欠損あり'}).count(),2);
    assert.match(await page.locator('.chart-card').filter({hasText:'相対湿度'}).textContent(),/欠損した時間/);
    await choose('2026-10-01');
    assert.match(await page.locator('#status').textContent(),/取得失敗/);
    assert.equal(await page.locator('#forecast-content').isVisible(),false);
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
    console.log('UI checks passed: desktop/mobile, forecast aggregates/statuses, ID handoff/history/URL/validation/storage fallback, U-Tech keys unchanged and no page errors.');
    console.log('Screenshots: '+path.join(os.tmpdir(),'utech-next-desktop.png')+' / '+path.join(os.tmpdir(),'utech-next-mobile.png'));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
