const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let plugin;
const sandbox = {window: {}, Chart: {instances: {}, register(p) {plugin = p;}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../chart-latest-value.js'), 'utf8'), sandbox);
const select = chart => JSON.parse(JSON.stringify(sandbox.window.UTechLatestValue.latestPoints(chart)));
function chart(data, group = 'main') {
  return {
    data: {datasets: data}, options: {layout: {padding: 0}},
    canvas: {closest: () => group}, width: 440, height: 300,
    chartArea: {left: 30, right: 400, top: 20, bottom: 270},
    scales: {x: {min: 2, max: 5}},
    isDatasetVisible: i => !data[i].hidden,
    getDatasetMeta: i => ({controller: {getParsed: j => data[i].data[j]}}),
    draw() {}, setActiveElements() {}, tooltip: {setActiveElements() {}},
    notifyPlugins(hook, args) {assert.equal(hook, 'afterEvent'); assert.equal(args.event.type, 'mouseout');}
  };
}
const source = chart([
  {label: '平均', data: [{x: 1, y: 9}, {x: 3, y: 0}, {x: 5, y: null}, {x: 6, y: 8}]},
  {label: '最大', data: [{x: 4, y: 12}]},
  {label: '非表示', hidden: true, data: [{x: 5, y: 10}]},
  {label: 'ゼロライン', data: [{x: 5, y: 0}]},
  {label: '欠測', data: [{x: 5, y: NaN}]},
  {label: 'マーカー', yAxisID: 'marker', data: [{x: 5, y: 1}]},
  {label: '最大', data: [{x: 2, y: 11}]}
]);
assert.deepEqual(select(source), [{datasetIndex: 0, index: 1, x: 3, y: 0}, {datasetIndex: 1, index: 0, x: 4, y: 12}]);
source.scales.x.max = 2;
assert.deepEqual(select(source), [{datasetIndex: 6, index: 0, x: 2, y: 11}]);
const peer = chart([]), separate = chart([], 'other');
sandbox.Chart.instances = {source, peer, separate};
plugin.beforeInit(source);
assert.equal(source.options.layout.padding.right, 28);
const event = type => ({event: {type, x: 420, y: 10}});
assert.equal(plugin.beforeEvent(source, event('mousemove')), false);
assert.equal(source.$latestValue, true);
assert.equal(peer.$latestValue, true);
assert.equal(separate.$latestValue, undefined);
plugin.beforeEvent(source, {replay: true, ...event('mousemove')});
plugin.beforeEvent(source, event('mouseout'));
assert.equal(source.$latestValue, false);
assert.equal(peer.$latestValue, false);
plugin.beforeEvent(source, event('touchstart'));
plugin.beforeEvent(source, {event: {type: 'mousemove', x: 100, y: 100}});
assert.equal(source.$latestValue, false);
console.log('Latest-value tests passed: zoom bounds, independent series, zero, missing/hidden/auxiliary data, split series, peer groups, right margin and clearing.');
