const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('chart-range-band.js','utf8'),{window});
function capture({axis='y',lower=0,upper=20,area={left:10,top:20,right:110,bottom:220},present=true,min=5,max=10,color='rgba(31, 143, 95, 0.12)'}){
 const calls=[],scale={min:lower,max:upper,getPixelForValue:v=>220-(v-lower)/(upper-lower)*200};
 const chart={chartArea:area,scales:present?{[axis]:scale}:{},options:{scales:{[axis]:{min:lower,max:upper}}},ctx:{save(){calls.push(['save'])},set fillStyle(v){calls.push(['color',v])},fillRect(...v){calls.push(['fillRect',...v])},restore(){calls.push(['restore'])}}};
 const original=JSON.stringify(chart.options);window.UTechChartBands.draw(chart,{axis,min,max,color});assert.equal(JSON.stringify(chart.options),original);assert.equal(scale.min,lower);assert.equal(scale.max,upper);return calls;
}
assert.deepEqual(capture({}),[['save'],['color','rgba(31, 143, 95, 0.12)'],['fillRect',10,120,100,50],['restore']]);
assert.deepEqual(capture({lower:7,upper:9}),[['save'],['color','rgba(31, 143, 95, 0.12)'],['fillRect',10,20,100,200],['restore']]);
for(const bounds of [[0,5],[10,20],[11,20]])assert.deepEqual(capture({lower:bounds[0],upper:bounds[1]}),[]);
for(const area of [null,undefined])assert.deepEqual(capture({area:area??null}),[]);
assert.deepEqual(capture({present:false}),[]);
assert.deepEqual(capture({axis:'humidity',lower:0,upper:100,min:30,max:90,color:'blue'}),[['save'],['color','blue'],['fillRect',10,40,100,120],['restore']]);
console.log('Range-band passed: full/partial/outside ranges, configurable axis/color, no-area/axis handling, drawing order, no axis/zoom mutation.');
