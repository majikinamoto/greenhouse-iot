const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element{set value(v){this._value=String(v)}get value(){return this._value}constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.listeners={};this.checked=false;this.chartArea={};}append(...children){this.children.push(...children)}replaceChildren(){this.children=[]}setAttribute(){}addEventListener(k,f){this.listeners[k]=f}insertBefore(c,b){this.children.splice(this.children.indexOf(b),0,c)}reportValidity(){return true}click(){} }
const elements={}, storage=new Map();let blob;
class Chart{static Tooltip={positioners:{}};static getChart(){} constructor(canvas,config){Object.assign(this,config);this.canvas=canvas;this.scales={};this.update();this.tooltip={setActiveElements(){}};this.chartArea={top:0,bottom:280,left:0,right:400};}update(){for(const [key,value]of Object.entries(this.options.scales))this.scales[key]={...value,min:value.min??0,max:value.max??1};}destroy(){}resetZoom(){}setActiveElements(){} }
const context=vm.createContext({console,Chart,Date,Intl,Number,Map,JSON,Array,Object,String,Math,Infinity,NaN,Blob:class{constructor(parts){blob=parts.join('')}},URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},URLSearchParams,setTimeout(){},requestAnimationFrame:f=>f(),window:{matchMedia:()=>({matches:false})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:id=>elements[id]??(elements[id]=new Element()),createElement:tag=>new Element(tag),createTextNode:s=>s}});
for(const file of ['temperature.js','flow.js'])vm.runInContext(fs.readFileSync('g-flow/'+file,'utf8'),context);
vm.runInContext(`loaded={user:'TEST',start:'2026-11-10T00:00',end:'2026-11-11T00:00',startMs:1794236400000,endMs:1794322800000,rows:[...points,...temperaturePoints].flatMap(point=>[0,1].map(i=>({point_id:point,recorded_at:'2026-11-10 00:'+String(i*10).padStart(2,'0')+':00',temperature:i?null:25,humidity:60,wind_speed_avg:.1,wind_speed_max:.2})))};render();`,context);
assert.equal(vm.runInContext('charts.length',context),8);
assert.equal(elements['temperature-charts'].children.length,4);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(charts[4].data.datasets.map(d=>[d.yAxisID,d.borderColor]))',context)),[['yHum','rgb(0, 100, 255)'],['yTemp','rgb(255, 0, 0)']]);
const card=elements['temperature-charts'].children[0],controls=card.children[1];controls.children[0].children[0].value='30';controls.children[1].children[0].value='15';controls.children[2].onclick();
assert.equal(vm.runInContext('charts[4].scales.yHum.min',context),30);assert.equal(vm.runInContext('charts[4].scales.yTemp.min',context),15);
vm.runInContext('resetViews();syncZoom({chart:charts[4]});',context);assert.equal(vm.runInContext('charts[4].scales.yTemp.min',context),15);
vm.runInContext("download(loaded,['P62','P01']);",context);assert.ok(blob.startsWith('\uFEFF'));assert.match(blob,/P62/);assert.match(blob,/P01/);assert.doesNotMatch(blob,/P61|P02/);assert.match(blob,/温度（℃）/);assert.equal(blob.trim().split('\r\n').length,3);
vm.runInContext("download(loaded,['P04']);",context);assert.doesNotMatch(blob,/風速/);assert.match(blob,/湿度（%）/);
vm.runInContext("loaded.rows=[];render();",context);assert.equal(vm.runInContext('charts.length',context),4);assert.equal(elements['temperature-charts'].children.length,4);
vm.runInContext("flowGuides.afterEvent({}, {replay:true});",context);
console.log('G-Flow passed: 8 charts, dual axes/colors, saved axes/reset, sync, selected mixed CSV, nulls, empty data.');

