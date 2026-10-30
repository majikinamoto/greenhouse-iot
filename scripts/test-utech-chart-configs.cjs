// Compare existing chart contracts with HEAD while refactoring their construction.
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const paths={shared:'assets/utech-shared.js',main:'assets/utech-main.js',plus:'u-tech-plus/assets/plus.js'};
const before={},after={};
for(const [key,path]of Object.entries(paths)){
 before[key]=cp.execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'});
 after[key]=fs.readFileSync(path,'utf8');
}
function extract(source,name){
 const start=source.indexOf('function '+name+'(');
 if(start<0)throw Error('Missing function '+name);
 let end=source.indexOf('\n}',start);
 while(end>=0){const candidate=source.slice(start,end+2);try{new Function('return ('+candidate+');');return candidate;}catch{}end=source.indexOf('\n}',end+2);}
 throw Error('Missing function end '+name);
}
function compile(sources,file,name,{mobile=false,missingCanvas=false}={}){
 const events=[];
 const dependencies={
  getChartCanvas:id=>missingCanvas?null:{id},
  hasChartSourceData:rows=>Array.isArray(rows)&&rows.length>0,
  destroyExistingChart:id=>events.push(['destroy',id]),
  getTempHumAxis:()=>({tempMin:20,tempMax:40,humMin:40,humMax:100}),
  getSingleAxis:()=>({min:10,max:80}),
  getChartDisplayMinTime:(id,min,max)=>mobile?new Date(max-24*3600000):min,
  baseOptions:(min,max)=>({scales:{x:{min:+min,max:+max}},plugins:{crosshair:{sync:{group:1}},zoom:{zoom:{onZoomComplete:function syncZoom(){}}}}}),
  createRightYAxis:axis=>({...axis,position:'right'}),
  formatIntegerAxisTick:value=>String(Math.round(value)),
  saveInitialScaleLimits:chart=>events.push(['save',chart.canvas.id]),
  wbgtAlertBandsPlugin:{id:'wbgtAlertBandsPlugin'},
  Chart:function(canvas,config){this.canvas=canvas;this.config=config;events.push(['chart',canvas.id]);}
 };
 const helper=sources.shared.includes('function createSingleLineChart(')?extract(sources.shared,'createSingleLineChart'):'';
 const fn=new Function(...Object.keys(dependencies),helper+'\n'+extract(sources[file],name)+'\nreturn '+name+';')(...Object.values(dependencies));
 return {run:args=>{events.length=0;const chart=fn(...args);return {chart,events:[...events]};}};
}
function normalize(value){
 if(typeof value==='function')return value.toString();
 if(Array.isArray(value))return value.map(normalize);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));
 return value;
}
const min=new Date('2026-10-26T00:00:00Z'),max=new Date('2026-10-29T00:00:00Z');
const rows=[{xValue:+min-1,temp:29,hum:65,co2:420,solar:100,volt:12.1,dew:21},
 {xValue:+min,temp:30,hum:70,co2:450,solar:200,volt:12.5,dew:22},
 {xValue:+max,temp:31,hum:75,co2:480,solar:300,volt:13,dew:23},
 {xValue:+max+1,temp:32,hum:80,co2:500,solar:400,volt:13.5,dew:24},
 {xValue:+min+1,temp:null,hum:NaN,co2:null,solar:null,volt:null,dew:null}];
const cases=[];
for(const mobile of [false,true])cases.push({file:'shared',beforeFile:'plus',name:'createTempHumChart',args:['test',rows,min,max,'P01'],settings:{mobile}});
for(const key of ['solar','co2','co2Outside','volt','dew'])for(const mobile of [false,true])cases.push({file:'shared',name:'createSingleChart',args:['test',rows,key,key,key==='volt'?'V':'unit',min,max,{min:0,max:100}],settings:{mobile}});
cases.push({file:'plus',name:'createWbgtGlobeChart',args:[rows,min,max]},{file:'plus',name:'createWbgtChart',args:[[{x:+min,y:28},{x:+max,y:30}],min,max]});
let checked=0;
for(const item of cases){
 for(const missingCanvas of [false,true]){
  const old=compile(before,item.beforeFile||item.file,item.name,{...item.settings,missingCanvas}).run(item.args);
  const current=compile(after,item.file,item.name,{...item.settings,missingCanvas}).run(item.args);
  assert.deepEqual(normalize(current),normalize(old),item.name+' '+item.args[2]);
  if(current.chart){
   const oldFill=old.chart.config.data.datasets[0].backgroundColor,newFill=current.chart.config.data.datasets[0].backgroundColor;
   if(typeof newFill==='function')for(const area of [null,{top:10,bottom:110}]){
    const context=()=>({chart:{chartArea:area,ctx:{createLinearGradient:(...args)=>({args,stops:[],addColorStop(p,c){this.stops.push([p,c]);}})}}});
    assert.deepEqual(normalize(newFill(context())),normalize(oldFill(context())));
   }
  }
  checked++;
 }
}
for(const [file,name,args]of [['shared','createSingleChart',['test',[],'volt','電圧','V',min,max]],['plus','createWbgtGlobeChart',[[],min,max]],['plus','createWbgtChart',[[],min,max]]]){
 assert.deepEqual(compile(after,file,name).run(args),compile(before,file,name).run(args));checked++;
}
assert.deepEqual(compile(after,'shared','createTempHumChart').run(['test',[],min,max,'P01']),compile(before,'plus','createTempHumChart').run(['test',[],min,max,'P01']));
console.log('Chart config equivalence passed: '+checked+' cases, including axes, datasets, plugins, callbacks, gradients, mobile ranges and empty/missing-canvas behavior.');
