const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const requests=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.endsWith('.php')){
  requests.push(url);
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/get_rainfall_data.php'){
   const c=url.searchParams.get('mode')==='tip'?Number(url.searchParams.get('coefficient')):1;
   const x=Date.now()-3600000;
   return res.end(JSON.stringify({success:true,has_data:true,display_start:x-3600000,end:Date.now(),hourly:[{x,hour_start:'2026-10-30 01:00:00',hour_end:'2026-10-30 01:59:59',date_key:'2026-10-30',hourly_rainfall:2*c,daily_cumulative:2*c,missing:false}]}));
  }
  if(url.pathname==='/get_drainage_data.php'){
   const volume=Number(url.searchParams.get('coefficient'));
   const start=Date.parse('2026-10-27T12:30:00+09:00'),end=Date.parse('2026-10-30T12:30:00+09:00');
   const hourly=[];let cumulative=0,lastDate='';
   for(let x=start-1800000;x<=end;x+=3600000){
    const stamp=new Date(x+9*3600000).toISOString().slice(0,19).replace('T',' '),date=stamp.slice(0,10);
    if(date!==lastDate){cumulative=0;lastDate=date;}
    const missing=stamp==='2026-10-29 10:00:00';if(!missing)cumulative+=volume;
    hourly.push({x,hour_start:stamp,date_key:date,hourly_rainfall:missing?null:volume,daily_cumulative:missing?null:cumulative,missing});
   }
   return res.end(JSON.stringify({success:true,display_start:start,end,daily_totals:{today:3*volume,yesterday:0,day_before_yesterday:null},hourly}));
  }
  if(url.pathname==='/get_data.php'){
   const end=url.searchParams.get('end')?new Date(url.searchParams.get('end').replace(' ','T')):new Date();
   const start=url.searchParams.get('start')?new Date(url.searchParams.get('start').replace(' ','T')):new Date(end-72*3600000);
   const rows=[];for(let t=+start;t<=+end;t+=3600000){const d=new Date(t);const stamp=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')+' '+[d.getHours(),d.getMinutes(),d.getSeconds()].map(v=>String(v).padStart(2,'0')).join(':');rows.push({recorded_at:stamp,rainfall_interval:1,rainfall_tip_interval:2,temperature:28+Math.sin(t/3600000),humidity:70,co2:500,solar_radiation:300,voltage:12.5,wind_speed_avg:1,wind_speed_max:2});}
   return res.end(JSON.stringify(rows));
  }
  if(/alert/.test(url.pathname))return res.end(JSON.stringify({success:true,data:[],settings:[],history:[]}));
  return res.end(JSON.stringify({success:true,data:[],rows:[]}));
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
});
(async()=>{
 let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({timezoneId:'Asia/Tokyo',viewport:{width:1440,height:1000}});
 await context.route('https://**/*',async route=>{
  if(route.request().url().includes('cdn.jsdelivr.net'))return route.continue();
  return route.fulfill({json:{}});
 });
 const errors=[];const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack);});
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/');await page.waitForTimeout(1500);
 assert.equal(await page.locator('.tab-button').count(),5);
 assert.equal(await page.locator('#tab-maintenance').count(),0);
 assert.equal(await page.evaluate(()=>typeof loadActiveAlertSetting),'undefined');
 assert.equal(await page.evaluate(()=>typeof loadTomorrowForecast),'function');
 assert.equal(await page.evaluate(()=>typeof updateFarmCalendarInfo),'function');
 assert.match(await page.locator('#headerSunInfo').textContent(),/日の出/);
 assert.match(await page.locator('#farmCalendarInfo').textContent(),/旧暦/);
 await page.locator('#userId').fill('MAIN01');await page.getByRole('button',{name:'表示',exact:true}).first().click();await page.waitForTimeout(1600);
 assert.equal(await page.evaluate(()=>!!Chart.getChart('tempChartP01')),true);
 assert(!requests.some(u=>/alert/.test(u.pathname)));
 assert.equal(await page.locator('input[name="rainfallCalculationMode"]').count(),3);
 await page.locator('#rainfallCollectorArea').evaluate(e=>e.value='100');
 await page.locator('#rainfallTipVolume').evaluate(e=>e.value='5');
 await page.locator('input[name="rainfallCalculationMode"][value="tip"]').check();
 await page.waitForFunction(()=>Chart.getChart('rainChart')?.data.datasets[0].data[0].y===1);
 assert.match(await page.locator('#rainfallTipResult').textContent(),/0.5000 mm/);
 await page.locator('input[name="rainfallCalculationMode"][value="water"]').check();
 await page.locator('#rainfallWaterVolume').fill('5');await page.locator('#rainfallWaterVolume').blur();
 await page.waitForFunction(()=>Chart.getChart('rainChart')?.data.datasets[0].data[0].y===10);
 assert.equal(await page.locator('#rainfallCollectorArea').isDisabled(),true);
 assert.equal(await page.evaluate(()=>Chart.getChart('rainChart').options.scales.yHourly.title.text),'1時間水量 (mL)');
 await page.evaluate(()=>{const c=Chart.getChart('rainChart');showRainfallTooltip(c,c.$rainfallBuckets[0],{clientX:100,clientY:100});});
 assert.match(await page.locator('#rainfallTooltip').textContent(),/10.00 mL/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('utechRainfallWaterVolume')),'5');
 await page.locator('input[name="rainfallCalculationMode"][value="rainfall"]').check();
 await page.waitForFunction(()=>Chart.getChart('rainChart')?.data.datasets[0].data[0].y===2);
 assert.equal(await page.evaluate(()=>Chart.getChart('rainChart').options.scales.yHourly.title.text),'1時間雨量 (mm)');
 const plusRequestStart=requests.length;
 await page.getByRole('button',{name:'U-Tech Plusへ移動',exact:true}).click();await page.waitForTimeout(1800);
 assert.equal(await page.locator('.tab-button').count(),6);
 assert.equal(await page.locator('.tab-panel.active').getAttribute('id'),'tab-maintenance');
 assert.equal(await page.locator('#maintenanceUserId').inputValue(),'MAIN01');
 assert.equal(await page.locator('.header-detail-area, #utechAreaSelect, #headerSunInfo, #farmCalendarInfo, #tomorrowForecastInfo').count(),0);
 assert.match(await page.locator('#headerTimeInfo').textContent(),/現在日時：\d+年/);
 assert.equal(await page.evaluate(()=>typeof handleUtechAreaChange),'undefined');
 assert.equal(await page.evaluate(()=>typeof loadTomorrowForecast),'undefined');
 assert.equal(await page.evaluate(()=>typeof loadTideCalendarInfo),'undefined');
 assert.equal(await page.evaluate(()=>typeof updateFarmCalendarInfo),'undefined');
 assert.equal(await page.evaluate(()=>typeof calculateSunTime),'function');
 assert.equal(await page.evaluate(()=>!!Chart.getChart('tempChartP02')),true);
 assert.deepEqual(await page.locator('#tab-maintenance .grid > div h4 > span').evaluateAll(elements=>elements.slice(0,6).map(e=>e.textContent)),
  ['ハウス内（P01）','ハウス内（P02）','ハウス内（P01−P02_差）','外気（P11）','外気（P12）','外気（P11−P12_差）']);
 for(const id of ['maintenanceTempChartP01','maintenanceTempChartP11']){
  assert.equal(await page.evaluate(id=>Chart.getChart(id).data.datasets.length,id),2);
 }
 for(const point of ['P01','P11'])assert.equal(requests.slice(plusRequestStart).filter(u=>u.pathname==='/get_data.php'&&u.searchParams.get('point_id')===point).length,1);
 await page.locator('#tempMinP01').fill('15');await page.locator('#tempMaxP01').fill('45');
 await page.locator('#maintenanceTempChartP01').locator('..').locator('..').getByRole('button',{name:'縦軸反映',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>{const c=Chart.getChart('maintenanceTempChartP01');return [c.options.scales.yTemp.min,c.options.scales.yTemp.max];}),[15,45]);
 await page.evaluate(()=>{const c=Chart.getChart('maintenanceTempChartP01');c.zoomScale('yTemp',{min:22,max:32},'none');syncMaintenanceZoom(c);});
 for(const id of ['tempChartP02','maintenanceTempChartP11','tempChartP12'])assert.equal(await page.evaluate(id=>Chart.getChart(id).options.scales.yTemp.min,id),22);
 await page.locator('#maintenanceTempChartP01').locator('..').locator('..').getByRole('button',{name:'ズームリセット',exact:true}).click();
 await page.locator('#maintenanceRangeCustom').check();
 await page.locator('#maintenanceStartDate').fill('2026-10-01');
 await page.getByRole('button',{name:'表示する',exact:true}).click();
 await page.waitForFunction(()=>{const r=getMaintenanceRange().range;return ['maintenanceTempChartP01','maintenanceTempChartP11'].every(id=>{const c=Chart.getChart(id);return c&&c.scales.x.min===+r.startTime&&c.scales.x.max===+r.endTime;});});
 await page.getByRole('button',{name:'最新72時間へ戻す',exact:true}).click();await page.waitForTimeout(900);
 const voltageRequest=requests.findLast(u=>u.pathname==='/get_data.php'&&u.searchParams.get('point_id')==='P91');
 assert.equal(new Date(voltageRequest.searchParams.get('end').replace(' ','T'))-new Date(voltageRequest.searchParams.get('start').replace(' ','T')),30*86400000);
 await page.locator('#maintenanceUserId').fill('MAINT02');await page.locator('#tab-maintenance .plus-user-controls button').click();await page.waitForTimeout(1000);
 await page.locator('[aria-controls="tab-review"]').click();await page.locator('#reviewUserId').fill('REVIEW03');await page.locator('#tab-review .plus-user-controls button').click();await page.waitForTimeout(1800);
 assert.equal(await page.evaluate(()=>!!Chart.getChart('reviewTempChartP01')),true);
 assert.equal(await page.locator('#maintenanceUserId').inputValue(),'MAINT02');
 assert.equal(await page.evaluate(()=>localStorage.getItem('usui_user_id')),'MAIN01');
 await page.reload();await page.waitForTimeout(900);
 assert.equal(await page.locator('.tab-panel.active').getAttribute('id'),'tab-review');assert.equal(await page.locator('#reviewUserId').inputValue(),'REVIEW03');
 await page.goto(base+'/u-tech-plus/?user_id=HANDOFF04');await page.waitForTimeout(800);
 assert.equal(await page.locator('#reviewUserId').inputValue(),'HANDOFF04');assert.equal(await page.locator('#maintenanceUserId').inputValue(),'MAINT02');
 assert(!page.url().includes('user_id='));
 await page.locator('[aria-controls="tab-analysis"]').click();await page.locator('#analysisPointIdA').fill('P01');await page.getByRole('button',{name:'表示',exact:true}).first().click();await page.waitForTimeout(900);
 await page.locator('[aria-controls="tab-wbgt"]').click();await page.locator('#wbgtUserId').fill('WBGT05');await page.getByRole('button',{name:'設定を適用',exact:true}).click();await page.waitForTimeout(1000);
 assert.equal(await page.evaluate(()=>!!Chart.getChart('wbgtGlobeChart')),true);
 await page.locator('[aria-controls="tab-alert"]').click();await page.locator('#alertUserId').fill('ALERT06');await page.locator('#alertPointId').focus();await page.waitForTimeout(800);
 assert.equal(await page.locator('#maintenanceUserId').inputValue(),'MAINT02');assert.equal(await page.locator('#wbgtUserId').inputValue(),'WBGT05');
 await page.locator('[aria-controls="tab-drainage"]').click();
 assert.equal(await page.locator('.tab-button').first().getAttribute('aria-controls'),'tab-drainage');
 await page.locator('#drainageUserId').fill('DRAIN07');
 for(let i=1;i<=3;i++){assert.equal(await page.locator('#drainagePoint'+i).inputValue(),'P'+(40+i));await page.locator('#drainageVolume'+i).fill('5');}
 await page.getByRole('button',{name:'表示・更新',exact:true}).click();
 await page.waitForFunction(()=>!!Chart.getChart('drainageChart3'));
 assert.equal(await page.evaluate(()=>Chart.getChart('drainageChart1').data.datasets[0].data[0].y),0.005);
 assert.deepEqual(await page.evaluate(()=>{const c=Chart.getChart('drainageChart1');return [c.scales.y.position,c.scales.daily.position,c.scales.x.type,c.data.datasets.length];}),['left','right','linear',5]);
 assert.equal(await page.evaluate(()=>{const lines=Chart.getChart('drainageChart1').data.datasets.slice(1);return lines.every(line=>new Set(line.data.map(p=>new Date(p.x+9*3600000).toISOString().slice(0,10))).size===1)&&lines.some(line=>line.data.some(p=>p.y===null));}),true);
 assert.deepEqual(await page.evaluate(()=>{const c=Chart.getChart('drainageChart1'),times=[];drainageMidnightPlugin.afterDraw({scales:{x:{min:c.scales.x.min,max:c.scales.x.max,getPixelForValue:t=>{times.push(t);return 10;}}},chartArea:{left:0,right:20,top:0,bottom:20},ctx:{save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}}});return times.map(t=>new Date(t).toISOString());}),['2026-10-27T15:00:00.000Z','2026-10-28T15:00:00.000Z','2026-10-29T15:00:00.000Z']);
 assert.equal(await page.evaluate(()=>{const c=Chart.getChart('drainageChart1');return c.scales.x.max-c.scales.x.min;}),72*3600000);
 assert.equal(await page.locator('.drainage-card').first().evaluate(e=>Math.round(e.getBoundingClientRect().width)),400);
 assert.equal(requests.filter(u=>u.pathname==='/get_drainage_data.php').every(u=>u.searchParams.get('display_hours')==='72'),true);
 const hover=await page.evaluate(()=>{const c=Chart.getChart('drainageChart1');return {x:c.chartArea.left+(c.chartArea.right-c.chartArea.left)*0.4,y:c.chartArea.top+40};});
 const bounds=await page.locator('#drainageChart1').boundingBox();await page.mouse.move(bounds.x+hover.x,bounds.y+hover.y);
 await page.waitForFunction(()=>Chart.getChart('drainageChart1').tooltip.getActiveElements().length===2);
 assert.equal(await page.evaluate(()=>[1,2,3].every(i=>Chart.getChart('drainageChart'+i).tooltip.getActiveElements().length===2)),true);
 assert.equal(await page.evaluate(()=>getChartSyncGroup(Chart.getChart('drainageChart1'))),'drainage');
 await page.screenshot({path:path.join(os.tmpdir(),'u-tech-drainage-desktop-test.png'),fullPage:true});
 assert.match(await page.locator('#drainageStatus1').textContent(),/0.015 L/);
 assert.equal(await page.locator('#maintenanceUserId').inputValue(),'MAINT02');
 await page.reload();await page.waitForFunction(()=>!!Chart.getChart('drainageChart3'));
 assert.equal(await page.locator('#drainageUserId').inputValue(),'DRAIN07');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(os.tmpdir(),'u-tech-drainage-mobile-test.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('[aria-controls="tab-maintenance"]').click();await page.waitForTimeout(700);
 await page.screenshot({path:path.join(os.tmpdir(),'u-tech-plus-desktop-test.png'),fullPage:false});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
 await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,{},{timeout:5000});
 for(const [added,existing]of [['maintenanceTempChartP01','tempChartP02'],['maintenanceTempChartP11','tempChartP12']]){
  assert.deepEqual(await page.evaluate(([a,b])=>{const first=Chart.getChart(a),second=Chart.getChart(b);return [first.scales.x.min===second.scales.x.min,first.scales.x.max===second.scales.x.max];},[added,existing]),[true,true]);
 }
 await page.screenshot({path:path.join(os.tmpdir(),'u-tech-plus-mobile-test.png'),fullPage:false});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
  JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,6).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right})))));
 await page.getByRole('button',{name:'U-Techへ移動',exact:true}).click();await page.waitForTimeout(800);
 assert.equal(await page.locator('#userId').inputValue(),'MAINT02');
 await page.getByRole('button',{name:'表示・非表示設定',exact:true}).click();await page.getByRole('button',{name:'すべて非表示',exact:true}).click();
 assert.equal(await page.locator('[data-main-info]:visible, [data-main-graph]:visible').count(),0);
 assert.equal(await page.getByRole('button',{name:'U-Tech Plusへ移動',exact:true}).isVisible(),true);
 await page.getByRole('button',{name:'すべて表示',exact:true}).click();
 await page.goto(base+'/u-tech-plus/');await page.waitForTimeout(800);
 for(const tab of ['analysis','wbgt','review','alert','maintenance']){
  await page.locator('[aria-controls="tab-'+tab+'"]').click();await page.waitForTimeout(700);
 }
 const empty=await browser.newContext({timezoneId:'Asia/Tokyo',viewport:{width:390,height:844}});
 await empty.route('**/*.php*',route=>route.fulfill({json:[]}));
 await empty.route('https://**/*',route=>route.request().url().includes('cdn.jsdelivr.net')?route.continue():route.fulfill({json:{}}));
 const blank=await empty.newPage();blank.on('pageerror',e=>errors.push(e.message));
 await blank.goto(base+'/u-tech-plus/');await blank.waitForTimeout(600);
 assert.equal(await blank.locator('.tab-panel.active').getAttribute('id'),'tab-maintenance');
 assert.equal(await blank.locator('#maintenanceUserId').inputValue(),'');
 await blank.locator('#maintenanceUserId').fill('EMPTY');await blank.locator('#tab-maintenance .plus-user-controls button').click();await blank.waitForTimeout(600);
 assert.equal(await blank.evaluate(()=>!!Chart.getChart('tempChartP02')),false);
 for(const id of ['maintenanceTempChartP01','maintenanceTempChartP11'])assert.equal(await blank.evaluate(id=>!!Chart.getChart(id),id),false);
 await empty.close();
 assert.deepEqual(errors,[]);
 console.log('Passed: main charts/visibility; password-free handoff; six tabs; drainage conversion/settings/mobile; maintenance 30-day voltage; review, analysis, WBGT/P51; independent IDs/history; saved-tab restore; mobile layout; empty data. No page errors.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
