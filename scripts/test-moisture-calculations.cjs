const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const apiWindow={};vm.runInNewContext(fs.readFileSync('moisture-calculations.js','utf8'),{window:apiWindow});const api=apiWindow.UTechMoisture;
// Independent pre-refactor formulas: compare unrounded results, not just displayed digits.
function previousVapor(t,h){const es=6.1078*Math.pow(10,(7.5*t)/(237.3+t));const ea=es*h/100;return 216.7*(ea/(t+273.15));}
function previousDew(t,h){const a=17.27,b=237.7,alpha=((a*t)/(b+t))+Math.log(h/100);return (b*alpha)/(a-alpha);}
const numeric=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
function previousFlow(row){const t=numeric(row.temperature),h=numeric(row.humidity),result={saturated:null,vapor:null,deficit:null,vpd:null};if(t===null||t<=-237.3)return result;const es=6.1078*10**(7.5*t/(237.3+t)),saturated=216.7*es/(t+273.15);if(!Number.isFinite(saturated))return result;result.saturated=saturated;if(h===null||h<0||h>100)return result;result.vapor=saturated*h/100;result.deficit=saturated-result.vapor;result.vpd=es*(1-h/100)/10;return result;}
const flowContext=vm.createContext({window:apiWindow,numeric});vm.runInContext(fs.readFileSync('g-flow/deficit.js','utf8'),flowContext);const flow=row=>vm.runInContext('flowDeficit('+JSON.stringify(row)+')',flowContext);
let count=0;
for(let i=0;i<12000;i++){const t=-80+(i*0.137)%160,h=(i*1.791)%101;assert.equal(api.vaporDensity(t,h),previousVapor(t,h));assert.equal(api.densityDeficit(t,h),previousVapor(t,100)-previousVapor(t,h));assert.equal(api.dewPoint(t,h),previousDew(t,h));const row={temperature:t,humidity:h};assert.deepEqual({...flow(row)},previousFlow(row));count++;}
for(const t of [-273.15,-237.7,-237.3,-237.299,0,25,100,Infinity,NaN,null,undefined,'25'])for(const h of [-1,0,100,101,NaN,null,undefined,'60']){assert.equal(api.vaporDensity(t,h),previousVapor(t,h));assert.equal(api.dewPoint(t,h),previousDew(t,h));}
for(const row of [{temperature:null,humidity:60},{temperature:25,humidity:null},{temperature:'',humidity:60},{temperature:'25',humidity:'60'},{temperature:25,humidity:101},{temperature:25,humidity:0},{temperature:-237.3,humidity:50}])assert.deepEqual({...flow(row)},previousFlow(row));
for(const file of ['assets/utech-shared.js','yui-tech/index.html']){const text=fs.readFileSync(file,'utf8');for(const [name,expected]of [['calcVapor',previousVapor],['calcDewPoint',previousDew]]){const start=text.indexOf('function '+name+'('),end=text.indexOf('\n}',start)+2;const fn=new Function('window','return ('+text.slice(start,end)+');')(apiWindow);assert.equal(fn(25,60),expected(25,60));}}
// The surrounding parse/validation policy must still match the previous dew formula.
for(const file of ['assets/utech-shared.js','yui-tech/index.html']){
 const text=fs.readFileSync(file,'utf8'),start=text.indexOf('function parseData('),end=text.indexOf('\n}',start)+2;
 const build=dew=>new Function('calcDewPoint','return ('+text.slice(start,end)+');')(dew);
 const rows=[{recorded_at:'2026-11-25T12:00:00+09:00',temperature:25,humidity:60},{recorded_at:'2026-11-25T12:10:00+09:00',temperature:null,humidity:60},{recorded_at:'2026-11-25T12:20:00+09:00',temperature:25,humidity:0},{recorded_at:'2026-11-25T12:30:00+09:00',temperature:'bad',humidity:60}];
 assert.deepEqual(build(api.dewPoint)(rows,new Date(0)),build(previousDew)(rows,new Date(0)));
}
assert.equal(api.densityDeficit(25,100),0);assert.equal(api.pressureDeficit(25,100),0);
console.log('Moisture equivalence passed: '+count+' input pairs, exact unrounded equality, boundary/non-numeric behavior, G-Flow missing values, U-Tech/Yui wrappers.');
