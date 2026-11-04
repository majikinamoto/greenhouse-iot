'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),box={window:{},Date,Number,Math,Map};vm.createContext(box);
for(const name of ['irrigation','net-radiation','water','export']){vm.runInContext(fs.readFileSync(path.join(root,'assets',name+'.js'),'utf8'),box);Object.assign(box,box.window);}
const f=JSON.parse(execFileSync('C:/php/php.exe',[path.join(__dirname,'net-radiation.php'),'--json'],{encoding:'utf8'}));
const actual=JSON.parse(JSON.stringify(box.NextWater.calculate('2026-09-22',f.rows,f.settings)));
function equivalent(a,b,trail=''){if(typeof a==='number'){assert.ok(Math.abs(a-b)<1e-10,trail+': '+a+' / '+b);return;}if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a),Object.keys(b),trail);for(const key of Object.keys(a))equivalent(a[key],b[key],trail+'.'+key);return;}assert.equal(a,b,trail);}
equivalent(actual,f.day);equivalent(JSON.parse(JSON.stringify(box.NextWater.calculate('2026-09-22',f.rows,f.legacy.settings))),f.legacy);
const partialRows=structuredClone(f.rows);partialRows[10].temperature_2m=null;equivalent(JSON.parse(JSON.stringify(box.NextWater.calculate('2026-09-22',partialRows,f.settings))),f.partial);
const parse=csv=>csv.slice(1).trim().split('\r\n').map(line=>line.match(/"(?:[^"]|"")*"/g).map(v=>v.slice(1,-1).replaceAll('""','"')));
const day=structuredClone(f.day);day.rows=f.rows;day.output_type='試算';day.comparison={hours:Array.from({length:24},(_,h)=>({hour:h,temperature_2m:{difference:h<3?null:2,days:4,count:24},relative_humidity_2m:{difference:h<2?null:0,days:5,count:30}}))};
const keys=['dt','dh','used_t','count_t','missing_t','total_t','missing_rate_t','missing_h','total_h','missing_rate_h','ra','rns','rnl','rn','delta','formula','latitude','longitude','albedo','kc_basis'];
const daily=parse(box.NextExport.build([day],[],{source:'preview',mode:'daily',selected:keys}));const get=label=>daily[1][daily[0].indexOf(label)];
assert.equal(get('温度補正の欠測時間数（時間）'),'3');assert.equal(get('温度補正の集計時間数（時間）'),'24');assert.equal(get('温度補正の欠測率（％）'),'12.5');assert.equal(get('湿度補正の欠測時間数（時間）'),'2');assert.equal(get('気温補正差（℃）'),'2');assert.equal(get('湿度補正差（％ポイント）'),'0');assert.equal(JSON.parse(get('温度補正の有効日数（日）'))['00:00'],4);
assert.ok(Math.abs(Number(get('大気圏外日射量（MJ/m²）'))-33.78997996459783)<1e-10);assert.equal(get('計算式の版'),box.NextNetPenman.version);
const water=parse(box.NextExport.build([day],[],{source:'water',mode:'daily',selected:keys}));assert.ok(!water[0].includes('気温補正差（℃）'));assert.ok(!water[0].includes('温度補正の欠測時間数（時間）'));assert.ok(box.NextExport.available('cs','water','daily'));assert.ok(!box.NextExport.available('ct','water','hourly'));assert.ok(!box.NextExport.available('missing_t','preview','hourly'));
day.comparison.hours.forEach(h=>h.temperature_2m.difference=null);assert.equal(parse(box.NextExport.build([day],[],{source:'preview',mode:'daily',selected:['dt']}))[1][1],'');
const old=parse(box.NextExport.build([f.legacy],[],{source:'water',mode:'daily',selected:['ra','rn']}));assert.deepEqual(old[1],['2026-09-22','','']);
const missing=parse(box.NextExport.build([f.partial],[],{source:'water',mode:'daily',selected:['et0']}));assert.equal(missing[1][1],'');
console.log('Net radiation PHP/JS parity, legacy parity, CSV source isolation, daily missingness and optional radiation checks passed.');
