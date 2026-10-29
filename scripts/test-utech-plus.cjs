const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const requests=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.endsWith('.php')){
  requests.push(url);
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/get_data.php'){
   const end=url.searchParams.get('end')?new Date(url.searchParams.get('end').replace(' ','T')):new Date();
   const start=url.searchParams.get('start')?new Date(url.searchParams.get('start').replace(' ','T')):new Date(end-72*3600000);
   const rows=[];for(let t=+start;t<=+end;t+=3600000){const d=new Date(t);const stamp=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')+' '+[d.getHours(),d.getMinutes(),d.getSeconds()].map(v=>String(v).padStart(2,'0')).join(':');rows.push({recorded_at:stamp,temperature:28+Math.sin(t/3600000),humidity:70,co2:500,solar_radiation:300,voltage:12.5,wind_speed_avg:1,wind_speed_max:2});}
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
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
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
 await page.locator('#userId').fill('MAIN01');await page.getByRole('button',{name:'表示',exact:true}).first().click();await page.waitForTimeout(1600);
 assert.equal(await page.evaluate(()=>!!Chart.getChart('tempChartP01')),true);
 assert(!requests.some(u=>/alert/.test(u.pathname)));
 await page.getByRole('button',{name:'U-Tech Plusへ移動',exact:true}).click();await page.waitForTimeout(1800);
 assert.equal(await page.locator('.tab-button').count(),5);
 assert.equal(await page.locator('.tab-panel.active').getAttribute('id'),'tab-maintenance');
 assert.equal(await page.locator('#maintenanceUserId').inputValue(),'MAIN01');
 assert.equal(await page.evaluate(()=>!!Chart.getChart('tempChartP02')),true);
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
 await page.locator('[aria-controls="tab-maintenance"]').click();await page.waitForTimeout(700);
 await page.screenshot({path:path.join(os.tmpdir(),'u-tech-plus-desktop-test.png'),fullPage:false});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
 await page.screenshot({path:path.join(os.tmpdir(),'u-tech-plus-mobile-test.png'),fullPage:false});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
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
 const empty=await browser.newContext({viewport:{width:390,height:844}});
 await empty.route('**/*.php*',route=>route.fulfill({json:[]}));
 await empty.route('https://**/*',route=>route.request().url().includes('cdn.jsdelivr.net')?route.continue():route.fulfill({json:{}}));
 const blank=await empty.newPage();blank.on('pageerror',e=>errors.push(e.message));
 await blank.goto(base+'/u-tech-plus/');await blank.waitForTimeout(600);
 assert.equal(await blank.locator('.tab-panel.active').getAttribute('id'),'tab-maintenance');
 assert.equal(await blank.locator('#maintenanceUserId').inputValue(),'');
 await blank.locator('#maintenanceUserId').fill('EMPTY');await blank.locator('#tab-maintenance .plus-user-controls button').click();await blank.waitForTimeout(600);
 assert.equal(await blank.evaluate(()=>!!Chart.getChart('tempChartP02')),false);
 await empty.close();
 assert.deepEqual(errors,[]);
 console.log('Passed: main charts/visibility; password-free handoff; five tabs; maintenance 30-day voltage; review, analysis, WBGT/P51; independent IDs/history; saved-tab restore; mobile layout; empty data. No page errors.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
