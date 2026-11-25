const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('temp-hum-axis-settings.js','utf8'),saved=new Map();
function session(path){const inputs={},listeners={};for(const prefix of ['temp','hum','reviewTemp','reviewHum'])for(const suffix of ['Min','Max'])inputs[prefix+suffix+'P01']={value:String(prefix.toLowerCase().includes('temp')?(suffix==='Min'?10:30):(suffix==='Min'?30:90))};const window={addEventListener:(k,f)=>listeners[k]=f};vm.runInNewContext(source,{window,location:{pathname:path},document:{getElementById:id=>inputs[id]??null,querySelectorAll:()=>Object.entries(inputs).map(([id,input])=>({...input,id}))},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)}});return {api:window.TempHumAxes,inputs,restore:()=>listeners.DOMContentLoaded()};}
let s=session('/');s.inputs.tempMinP01.value='12';s.inputs.tempMaxP01.value='32';s.inputs.humMinP01.value='35';s.inputs.humMaxP01.value='85';s.api.save('P01');
s=session('/index.html');s.restore();assert.equal(s.inputs.tempMinP01.value,12);assert.equal(s.inputs.humMaxP01.value,85);
s.inputs.tempMinP01.value='50';s.inputs.tempMaxP01.value='20';s.api.save('P01');s=session('/');s.restore();assert.equal(s.inputs.tempMinP01.value,12);
s=session('/u-tech-plus/');s.restore();assert.equal(s.inputs.tempMinP01.value,'10');s.inputs.reviewTempMinP01.value='14';s.inputs.reviewTempMaxP01.value='34';s.api.save('P01',true);s=session('/u-tech-plus/');s.restore();assert.equal(s.inputs.reviewTempMinP01.value,14);assert.equal(s.inputs.tempMinP01.value,'10');
const chart={canvas:{id:'reviewTempChartP01'},options:{scales:{yTemp:{min:20,max:40},yHum:{min:40,max:100}}}};s.api.restoreChart(chart);assert.equal(chart.options.scales.yTemp.min,14);assert.equal(chart.options.scales.yHum.min,30);
saved.set('utechTempHumAxes_v1_/_tempMinP01','invalid');s=session('/');s.restore();assert.equal(s.inputs.tempMinP01.value,'10');
console.log('Temp/hum storage passed: valid applied ranges, new defaults, reload, review isolation, page isolation, canonical URL, reset, corrupt storage.');

