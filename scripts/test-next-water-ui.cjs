'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../u-tech-next');
const sandbox={window:{},Date,Number,Math,Map};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'assets/water.js'),'utf8'),sandbox);
const calc=sandbox.window.NextWater;
const settings={transmission_percent:55,wind_speed:.1,cycles:6,trees:Array.from({length:6},(_,i)=>({leaf_area:10+i,kc:.269,flow:.71}))};
const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function rows(day){return Array.from({length:25},(_,i)=>({forecast_for:new Date(Date.parse(day+'T00:00:00Z')+i*3600000).toISOString().slice(0,19).replace('T',' '),temperature_2m:25.840416666666666,relative_humidity_2m:62.392083333333325,shortwave_radiation:15.94/(24*.0036)}));}
assert.ok(Math.abs(calc.penman(25.840416666666666,62.392083333333325,15.94/(24*.0036),.1,55)*24-3.5400009870301625)<1e-12);
let saved=null,revision=0;
function payload(center){return {success:true,token:'test-token',settings:saved,revision,center,days:[-1,0,1].map(n=>{const date=shift(center,n),forecast=rows(date);if(n===0)forecast[9].relative_humidity_2m=null;const snapshot=calc.calculate(date,forecast,settings);snapshot.fetched_at=shift(date,-1)+' 18:10:00';return {date,forecast,snapshot};})};}
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname.endsWith('/api/water.php')){res.setHeader('Content-Type','application/json');if(req.method==='POST'){let body='';req.on('data',data=>body+=data);req.on('end',()=>{const input=JSON.parse(body);assert.equal(req.headers['x-water-token'],'test-token');if(input.revision!==revision){res.statusCode=409;res.end(JSON.stringify({success:false,message:'別の端末で設定が変更されました。'}));return;}saved=input.settings;res.end(JSON.stringify({success:true,revision:++revision,settings:saved}));});}else res.end(JSON.stringify(payload(url.searchParams.get('center')||'2026-10-06')));return;}
if(url.pathname.endsWith('/api/get_forecasts.php')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,status:'not_available',location:{name:'試験地点'},rows:[]}));return;}
const file=path.resolve(root,url.pathname.replace(/^\/u-tech-next\/?/,'')||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
(async()=>{let browser;try{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:1000}});
if(process.env.NEXT_TEST_ASSETS)await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({path:path.join(process.env.NEXT_TEST_ASSETS,new URL(route.request().url()).pathname.split('/').pop()),contentType:'application/javascript'}));
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/u-tech-next/`);await page.locator('#tab-water').click();await page.waitForFunction(()=>document.querySelectorAll('#water-charts canvas').length===6);
assert.equal(await page.locator('#water-settings input').count(),21);assert.equal(await page.locator('#water-save').isDisabled(),true);assert.match(await page.locator('#water-validation').textContent(),/未入力/);
for(const [id,value] of [['water-transmission',55],['water-wind',.1],['water-cycles',6]])await page.locator('#'+id).fill(String(value));
for(let i=0;i<6;i++)for(const [key,value] of [['area',10+i],['kc',.269],['flow',.71]])await page.locator(`#water-${key}-${i}`).fill(String(value));
assert.equal(await page.locator('#water-save').isEnabled(),true);await page.locator('#water-save').click();await page.waitForFunction(()=>document.getElementById('water-message').textContent.includes('保存しました'));
assert.equal(saved.trees.length,6);const canvas=page.locator('#water-charts canvas').first();await canvas.scrollIntoViewIfNeeded();const hover=await canvas.evaluate(c=>{const chart=Chart.getChart(c),r=c.getBoundingClientRect();return {x:r.left+chart.scales.x.getPixelForValue(60.5),y:r.top+chart.chartArea.top+30};});await page.mouse.move(hover.x,hover.y);await page.waitForFunction(()=>document.querySelector('#water-charts .chart-readout').textContent.includes('12:00'));
assert.equal(await page.locator('#water-charts .chart-readout').filter({hasText:'12:00'}).count(),6);
assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('#water-charts canvas'),c=>Chart.getChart(c).tooltip.getActiveElements().map(e=>e.index))),Array.from({length:6},()=>[60,13]));
const axes=await page.evaluate(()=>Array.from(document.querySelectorAll('#water-charts canvas'),c=>{const ch=Chart.getChart(c);return [ch.scales.y.max,ch.scales.total.max];}));axes.forEach(axis=>assert.deepEqual(axis,axes[0]));
assert.equal(await page.locator('#water-charts .chart-readout strong').count(),12);
assert.equal(await page.locator('#water-charts .caption > strong').count(),6);
assert.equal(await canvas.evaluate(c=>Chart.getChart(c).options.plugins.tooltip.enabled),false);
const drag=await canvas.evaluate(c=>{const ch=Chart.getChart(c),r=c.getBoundingClientRect(),a=ch.chartArea;return {x1:r.left+ch.scales.x.getPixelForValue(48),x2:r.left+ch.scales.x.getPixelForValue(68),y1:r.top+a.top+(a.bottom-a.top)*.2,y2:r.top+a.top+(a.bottom-a.top)*.8};});
await page.mouse.move(drag.x1,drag.y1);await page.mouse.down();await page.mouse.move(drag.x2,drag.y2,{steps:8});await page.mouse.up();
const zoom=await canvas.evaluate(c=>{const ch=Chart.getChart(c);return [ch.scales.x.min,ch.scales.x.max,ch.scales.y.min,ch.scales.y.max,ch.scales.total.min,ch.scales.total.max];});
assert.ok(zoom[0]>0 && zoom[1]<72);assert.ok(zoom[3]-zoom[2]<axes[0][0]);assert.ok(zoom[5]-zoom[4]<axes[0][1]);
await page.locator('#water-charts .chart-reset-button').first().click();
assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('#water-charts canvas'),c=>{const ch=Chart.getChart(c);return [ch.scales.x.min,ch.scales.x.max,ch.scales.y.min,ch.scales.y.max,ch.scales.total.min,ch.scales.total.max];})),axes.map(a=>[0,72,0,a[0],0,a[1]]));
await page.screenshot({path:path.join(os.tmpdir(),'utech-next-water-desktop.png'),fullPage:true});
assert.equal(await page.locator('#tab-review').count(),0);assert.equal(await page.locator('#water-review-panel').count(),0);
assert.match(await page.locator('#water-period').textContent(),/2026-10-05〜2026-10-07/);
const csv=calc.csv(payload('2026-09-10').days.map(day=>day.snapshot));assert.equal(csv.charCodeAt(0),0xfeff);assert.equal(csv.trim().split('\r\n').length,433);assert.match(csv,/2026-09-09 18:10:00/);assert.match(csv,/欠測/);
await page.locator('#tab-export').click();await page.locator('#csv-start').fill('2026-09-10T12:00');await page.locator('#csv-end').fill('2026-09-10T13:00');const exported=page.waitForEvent('download');await page.locator('#water-export').click();const subset=fs.readFileSync(await (await exported).path(),'utf8');assert.equal(subset.trim().split('\r\n').length,13);assert.match(subset,/2026-09-10 14:00:00/);
await page.setViewportSize({width:390,height:844});await page.locator('#tab-water').click();await page.screenshot({path:path.join(os.tmpdir(),'utech-next-water-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
await page.locator('#water-area-2').fill('');assert.equal(await page.locator('#water-save').isDisabled(),true);assert.match(await page.locator('#water-area-2-error').textContent(),/入力/);
assert.deepEqual(errors,[]);console.log('Water UI passed: blank inputs, shared save, immediate recalculation, synchronized 6 graphs/tooltips/axes, frozen centered history, missing data CSV, filtered CSV intervals, mobile layout.');}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
