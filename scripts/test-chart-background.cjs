const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('chart-background.js','utf8'),{window});const plugin=window.UTechChartBackground;
assert.equal(plugin.id,'chartBackgroundPlugin');
for(const area of [undefined,null,{left:10,top:20,right:310,bottom:220},{left:0,top:0,right:0,bottom:0}]){
 const events=[],ctx={save(){events.push(['save'])},set fillStyle(v){events.push(['color',v])},fillRect(...args){events.push(['fillRect',...args])},restore(){events.push(['restore'])}};
 plugin.beforeDraw({chartArea:area,ctx});
 assert.deepEqual(events,area?[['save'],['color','#ffffff'],['fillRect',area.left,area.top,area.right-area.left,area.bottom-area.top],['restore']]:[]);
}
for(const file of ['assets/utech-shared.js','yui-tech/index.html','g-flow/temperature.js'])assert.match(fs.readFileSync(file,'utf8'),/const chartBackgroundPlugin = window\.UTechChartBackground;/);
console.log('Background passed: same plugin ID, white/chart-area-only fill, save/restore order, no-area handling, all 3 aliases.');
