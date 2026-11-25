const fs=require('node:fs'),assert=require('node:assert/strict');
const shared=fs.readFileSync('assets/utech-shared.js','utf8');
const from=shared.indexOf('const vaporTargetBandPlugin ='),to=shared.indexOf('function createOutsideDiffChart(',from);
const factory=new Function('Chart','getChartCanvas','hasChartSourceData','destroyExistingChart','getChartDisplayMinTime','baseOptions','window','calcVapor',shared.slice(from,to)+';return {createVaporChart,vaporTargetBandPlugin};');
class Chart{constructor(canvas,config){this.canvas=canvas;Object.assign(this,config);}}
const {createVaporChart,vaporTargetBandPlugin}=factory(Chart,id=>({id}),r=>r.length>0,()=>{},(id,min)=>min,()=>({scales:{x:{}},plugins:{}}),{matchMedia:()=>({matches:false})},(t,h)=>216.7*(6.1078*10**(7.5*t/(237.3+t))*h/100)/(t+273.15));
for(const id of ['mainVaporChart','reviewVaporChart','vaporChartP11']){
 const chart=createVaporChart(id,[{xValue:1,temp:25,hum:60}],new Date(0),new Date(2));
 assert.deepEqual(Object.keys(chart.options.scales),['x','y']);assert.equal(chart.data.datasets.length,3);assert.equal(chart.data.datasets[2].fill,true);
 vaporTargetBandPlugin.beforeUpdate(chart); // Must not access a removed right axis.
 assert.equal(chart.options.scales.yRight,undefined);
}
const yui=fs.readFileSync('yui-tech/index.html','utf8');
assert.doesNotMatch(yui,/createVaporChart/);assert.match(yui,/function calcVapor\(/);
for(const match of yui.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=/.test(match[1])&&match[2].trim())new Function(match[2]);
console.log('Vapor left-axis passed: main/review/maintenance, 3 datasets/fill retained, plugin safe; Yui unused chart removed and inline JS valid.');
