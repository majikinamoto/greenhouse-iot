const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{set value(v){this._value=String(v)}get value(){return this._value}constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.listeners={};this.checked=false;this.chartArea={};}append(...children){this.children.push(...children)}replaceChildren(){this.children=[]}setAttribute(){}addEventListener(k,f){this.listeners[k]=f}insertBefore(c,b){this.children.splice(this.children.indexOf(b),0,c)}reportValidity(){return true}click(){} }
const elements={}, storage=new Map();let blob;
class Chart{static Tooltip={positioners:{}};static getChart(){} constructor(canvas,config){Object.assign(this,config);this.canvas=canvas;this.scales={};this.update();this.tooltip={setActiveElements(){}};this.chartArea={top:0,bottom:280,left:0,right:400};}update(){for(const [key,value]of Object.entries(this.options.scales))this.scales[key]={...value,min:value.min??0,max:value.max??1};}destroy(){}resetZoom(){this.options.plugins?.zoom?.zoom?.onZoomComplete?.({chart:this});}setActiveElements(){} }
const context=vm.createContext({console,Chart,Date,Intl,Number,Map,JSON,Array,Object,String,Math,Infinity,NaN,Blob:class{constructor(parts){blob=parts.join('')}},URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},URLSearchParams,setTimeout(){},requestAnimationFrame:f=>f(),window:{matchMedia:()=>({matches:false})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:id=>elements[id]??(elements[id]=new Element()),createElement:tag=>new Element(tag),createTextNode:s=>s}});
for(const file of ['temperature.js','latest.js','deficit.js','flow.js'])vm.runInContext(fs.readFileSync('g-flow/'+file,'utf8'),context);
vm.runInContext(`loaded={user:'TEST',start:'2026-11-10T00:00',end:'2026-11-11T00:00',startMs:1794236400000,endMs:1794322800000,rows:[...points,...temperaturePoints].flatMap(point=>[0,1].map(i=>({point_id:point,recorded_at:'2026-11-10 00:'+String(i*10).padStart(2,'0')+':00',temperature:i?null:25,humidity:60,wind_speed_avg:.1,wind_speed_max:.2})))};render();`,context);
assert.equal(vm.runInContext('charts.length',context),16);
assert.equal(elements['vpd-charts'].children.length,4);assert.equal(elements['vapor-charts'].children.length,4);
assert.equal(vm.runInContext('charts.filter(c=>c.$kind==="vapor").every(c=>!c.options.scales.yRight)',context),true);
assert.equal(elements['temperature-charts'].children.length,4);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(charts[4].data.datasets.map(d=>[d.yAxisID,d.borderColor]))',context)),[['yHum','rgb(0, 100, 255)'],['yTemp','rgb(255, 0, 0)']]);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(getTempHumAxis("P01"))',context)),{humMin:30,humMax:90,tempMin:10,tempMax:30});
const card=elements['temperature-charts'].children[0],controls=card.children[1];controls.children[0].children[0].value='30';controls.children[1].children[0].value='15';controls.children[2].onclick();
assert.equal(vm.runInContext('charts[4].scales.yHum.min',context),30);assert.equal(vm.runInContext('charts[4].scales.yTemp.min',context),15);
vm.runInContext('resetViews();syncZoom({chart:charts[4]});',context);assert.equal(vm.runInContext('charts[4].scales.yTemp.min',context),15);
vm.runInContext('render();',context);
assert.equal(vm.runInContext('charts[4].scales.yHum.min',context),30);
assert.equal(vm.runInContext('charts[4].scales.yTemp.min',context),15);
assert.equal(elements['temperature-charts'].children[0].children[1].children[0].children[0].value,'30');
vm.runInContext("download(loaded,['P62','P01']);",context);assert.ok(blob.startsWith('\uFEFF'));assert.match(blob,/P62/);assert.match(blob,/P01/);assert.doesNotMatch(blob,/P61|P02/);assert.match(blob,/温度（℃）/);assert.equal(blob.trim().split('\r\n').length,3);
vm.runInContext("download(loaded,['P04']);",context);assert.doesNotMatch(blob,/風速/);assert.match(blob,/湿度（%）/);
vm.runInContext("loaded.rows=[];render();",context);assert.equal(vm.runInContext('charts.length',context),4);assert.equal(elements['temperature-charts'].children.length,4);
vm.runInContext("flowGuides.afterEvent({}, {replay:true});",context);
console.log('G-Flow passed: 16 charts, dual axes/colors, saved axes/reset, sync, selected mixed CSV, nulls, empty data.');


// Latest rows are selected per sensor, without replacing missing fields with old values.
vm.runInContext(`
const summaryNow=stamp('2026-11-24 12:00:00');
const summaryRows=[
 {point_id:'P01',recorded_at:'2026-11-24 11:50:00',temperature:28.54,humidity:72.34},
 {point_id:'P61',recorded_at:'2026-11-24 11:39:59',wind_speed_avg:0,wind_speed_max:0.856},
 {point_id:'P02',recorded_at:'2026-11-24 11:40:00',temperature:null,humidity:60},
 {point_id:'P02',recorded_at:'2026-11-24 11:30:00',temperature:25,humidity:70},
 {point_id:'P64',recorded_at:'2026-11-20 10:00:00',wind_speed_avg:0.2,wind_speed_max:0.5}
];renderLatestCards(summaryRows,'',summaryNow);`,context);
const text=e=>typeof e==='string'?e:(e.textContent??'')+(e.children??[]).map(text).join('');
const latest=elements['latest-cards'].children;
assert.equal(latest.length,4);
assert.match(text(latest[0]),/28.5℃/);assert.match(text(latest[0]),/72.3%/);
assert.match(text(latest[0]),/0.00m\/s/);assert.match(text(latest[0]),/0.86m\/s/);
assert.equal((text(latest[0]).match(/更新が遅れています/g)||[]).length,1);
assert.match(text(latest[1]),/—℃/);assert.doesNotMatch(text(latest[1]),/更新が遅れています/);
assert.match(text(latest[2]),/データなし/);assert.match(text(latest[3]),/11\/20/);
vm.runInContext("renderLatestCards([], '読み込み中');",context);
assert.doesNotMatch(text(elements['latest-cards']),/28.5/);
assert.match(text(elements['latest-cards']),/読み込み中/);
console.log('Latest cards passed: pairing, separate timestamps, 20-minute boundary, zero/null, missing/stopped sensors, loading reset.');

const derived=JSON.parse(vm.runInContext('JSON.stringify(flowDeficit({temperature:25,humidity:60}))',context));
assert.ok(Math.abs(derived.deficit-9.2)<0.05);assert.ok(Math.abs(derived.vpd-1.267)<0.01);
for(const row of [{temperature:null,humidity:60},{temperature:25,humidity:101},{temperature:-237.3,humidity:50}])assert.equal(vm.runInContext('flowDeficit('+JSON.stringify(row)+').deficit',context),null);
assert.equal(vm.runInContext('flowDeficit({temperature:25,humidity:100}).vpd',context),0);
vm.runInContext("loaded.rows=[{point_id:'P01',recorded_at:'2026-11-10 00:00:00',temperature:25,humidity:60},{point_id:'P01',recorded_at:'2026-11-10 00:10:00',temperature:null,humidity:60}];render();",context);

assert.equal(vm.runInContext('charts.filter(c=>c.$kind==="vpd").length',context),1);
assert.equal(vm.runInContext('charts.filter(c=>c.$kind==="vapor").length',context),1);
assert.match(text(elements['vpd-charts']),/VPD 1.27 kPa/);
assert.doesNotMatch(text(elements['vpd-charts']),/g\/㎥/);
assert.match(text(elements['vapor-charts']),/飽和水蒸気量 23.0 g\/㎥／水蒸気量 13.8 g\/㎥／飽差 9.2 g\/㎥/);
const vaporControls=elements['vapor-charts'].children[0].children[1];
assert.equal(vaporControls.children[0].children[0].readOnly,true);
vaporControls.children[0].children[2].value='35';vaporControls.children[1].onclick();
const vpdControls=elements['vpd-charts'].children[0].children[1];vpdControls.children[0].children[2].value='3';vpdControls.children[1].onclick();
vm.runInContext('render();resetViews();',context);
assert.equal(vm.runInContext('charts.find(c=>c.$kind==="vapor").scales.y.max',context),35);
assert.equal(vm.runInContext('charts.find(c=>c.$kind==="vpd").scales.y.max',context),3);
assert.equal(vm.runInContext('charts.find(c=>c.$kind==="vapor").scales.y.min',context),0);
assert.equal(vm.runInContext('charts.find(c=>c.$kind==="vapor").data.datasets[2].fill',context),true);
assert.equal(vm.runInContext('flowDeficit({temperature:25,humidity:null}).saturated.toFixed(1)',context),'23.0');
assert.ok(Math.abs(derived.deficit-(vm.runInContext('flowDeficit({temperature:25,humidity:60}).saturated-flowDeficit({temperature:25,humidity:60}).vapor',context)))<1e-10);
vm.runInContext("download(loaded,['P01','vpd:P01','vapor:P01']);",context);
assert.match(blob,/飽和水蒸気量（g\/㎥）/);assert.match(blob,/VPD（kPa）/);assert.match(blob,/"23.0","13.8","9.2"/);
assert.ok(blob.trim().split('\r\n')[2].endsWith('"","",""'));
vm.runInContext("emptyGraphs('読み込み中');",context);assert.equal(elements['vpd-charts'].children.length,4);assert.equal(elements['vapor-charts'].children.length,4);assert.doesNotMatch(text(elements['vapor-charts']),/9.2/);
console.log('Moisture passed: separate VPD/vapor groups, 3 series, fill, zero minima, separate saved maxima, missing humidity, CSV widths and loading.');

// Zoom No.2 in each group: both temperature axes, same-kind peers only, all x ranges.
vm.runInContext(`loaded.rows=[...points,...temperaturePoints].map(point=>({point_id:point,recorded_at:'2026-11-10 00:00:00',temperature:25,humidity:60,wind_speed_avg:0.1,wind_speed_max:0.2}));render();charts[2].$link.checked=false;`,context);
const savedBefore=JSON.stringify([...storage]);
for(const group of ['temperature','wind','vpd','vapor']){
 vm.runInContext(`resetViews();const source${group}=charts.filter(c=>zoomGroup(c)==='${group}')[1];source${group}.options.scales.x.min=loaded.startMs+600000;source${group}.options.scales.x.max=loaded.endMs-600000;for(const id of (${JSON.stringify(group==='temperature'?['yHum','yTemp']:['y'])})){source${group}.options.scales[id].min=2;source${group}.options.scales[id].max=8;}source${group}.update();`,context);
 const otherBefore=vm.runInContext(`JSON.stringify(charts.filter(c=>zoomGroup(c)!=='${group}').map(c=>Object.fromEntries(Object.entries(c.scales).filter(([id])=>id!=='x').map(([id,a])=>[id,[a.min,a.max]]))))`,context);
 vm.runInContext(`syncZoom({chart:source${group}});`,context);
 assert.equal(vm.runInContext(`charts.filter(c=>zoomGroup(c)==='${group}').every(c=>${JSON.stringify(group==='temperature'?['yHum','yTemp']:['y'])}.every(id=>c.scales[id].min===2&&c.scales[id].max===8))`,context),true);
 assert.equal(vm.runInContext(`charts.every(c=>c.scales.x.min===loaded.startMs+600000&&c.scales.x.max===loaded.endMs-600000)`,context),true);
 assert.equal(vm.runInContext(`JSON.stringify(charts.filter(c=>zoomGroup(c)!=='${group}').map(c=>Object.fromEntries(Object.entries(c.scales).filter(([id])=>id!=='x').map(([id,a])=>[id,[a.min,a.max]]))))`,context),otherBefore);
}
assert.equal(JSON.stringify([...storage]),savedBefore);
vm.runInContext('resetViews();',context);
assert.equal(vm.runInContext('charts.filter(c=>["vpd","vapor"].includes(c.$kind)).every(c=>c.scales.y.min===0)',context),true);
console.log('Grouped zoom passed: all 4 kinds, No.2 source, both temp/humidity axes, unchecked wind peer, other y axes unchanged, all x synced, saved settings retained/reset.');
