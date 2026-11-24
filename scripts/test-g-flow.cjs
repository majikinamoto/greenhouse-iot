const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{set value(v){this._value=String(v)}get value(){return this._value}constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.listeners={};this.checked=false;this.chartArea={};}append(...children){this.children.push(...children)}replaceChildren(){this.children=[]}setAttribute(){}addEventListener(k,f){this.listeners[k]=f}insertBefore(c,b){this.children.splice(this.children.indexOf(b),0,c)}reportValidity(){return true}click(){} }
const elements={}, storage=new Map();let blob;
class Chart{static Tooltip={positioners:{}};static getChart(){} constructor(canvas,config){Object.assign(this,config);this.canvas=canvas;this.scales={};this.update();this.tooltip={setActiveElements(){}};this.chartArea={top:0,bottom:280,left:0,right:400};}update(){for(const [key,value]of Object.entries(this.options.scales))this.scales[key]={...value,min:value.min??0,max:value.max??1};}destroy(){}resetZoom(){}setActiveElements(){} }
const context=vm.createContext({console,Chart,Date,Intl,Number,Map,JSON,Array,Object,String,Math,Infinity,NaN,Blob:class{constructor(parts){blob=parts.join('')}},URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},URLSearchParams,setTimeout(){},requestAnimationFrame:f=>f(),window:{matchMedia:()=>({matches:false})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:id=>elements[id]??(elements[id]=new Element()),createElement:tag=>new Element(tag),createTextNode:s=>s}});
for(const file of ['temperature.js','latest.js','flow.js'])vm.runInContext(fs.readFileSync('g-flow/'+file,'utf8'),context);
vm.runInContext(`loaded={user:'TEST',start:'2026-11-10T00:00',end:'2026-11-11T00:00',startMs:1794236400000,endMs:1794322800000,rows:[...points,...temperaturePoints].flatMap(point=>[0,1].map(i=>({point_id:point,recorded_at:'2026-11-10 00:'+String(i*10).padStart(2,'0')+':00',temperature:i?null:25,humidity:60,wind_speed_avg:.1,wind_speed_max:.2})))};render();`,context);
assert.equal(vm.runInContext('charts.length',context),8);
assert.equal(elements['temperature-charts'].children.length,4);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(charts[4].data.datasets.map(d=>[d.yAxisID,d.borderColor]))',context)),[['yHum','rgb(0, 100, 255)'],['yTemp','rgb(255, 0, 0)']]);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(getTempHumAxis("P01"))',context)),{humMin:20,humMax:90,tempMin:10,tempMax:45});
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
console.log('G-Flow passed: 8 charts, dual axes/colors, saved axes/reset, sync, selected mixed CSV, nulls, empty data.');


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
