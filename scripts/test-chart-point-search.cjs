const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const current = fs.readFileSync(path.join(root, 'assets/utech-shared.js'), 'utf8');
const before = cp.execFileSync('git', ['show', 'HEAD:assets/utech-shared.js'], {cwd: root, encoding: 'utf8'});
const names = ['isAuxiliaryChartDataset', 'isValidChartPoint', 'getLatestChartXValue', 'getNearestChartXValue', 'getNearestPointIndexAtXValue', 'getSyncedTooltipDatasetKey', 'syncChartTooltip'];
function compile(source) {
    const context = {window: {}};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'chart-point-search.js'), 'utf8'), context);
    context.UTechChartPoints = context.window.UTechChartPoints;
    for(const name of names){
        const start = source.indexOf(`function ${name}(`);
        assert.ok(start >= 0, name);
        const end = source.indexOf('\nfunction ', start + 1);
        vm.runInContext(source.slice(start, end < 0 ? undefined : end), context);
    }
    return context;
}
const old = compile(before), next = compile(current);
const points = [null, undefined, {}, {x: null, y: 2}, {x: 1, y: null}, {x: 0, y: 0}, {x: '', y: ''}, {x: '3', y: '7'}, {x: NaN, y: 2}, {x: 2, y: Infinity}, {x: 2, y: -5}, {x: 4, y: 8}, {x: 4, y: 9}];
for(const point of points) assert.equal(next.isValidChartPoint(point), old.isValidChartPoint(point));
assert.equal(next.isValidChartPoint({x: 0, y: 0}), true);
assert.equal(next.getNearestPointIndexAtXValue([{x: 2, y: 1}, {x: 4, y: 1}], 3), 0);
let comparisons = 0;
for(let offset = 0; offset < points.length; offset++){
    const data = points.slice(offset).concat(points.slice(0, offset));
    for(const target of [-1e12, 0, 1, 3, 4, 1e12, '3', null, undefined, NaN, Infinity]){
        assert.equal(next.getNearestPointIndexAtXValue(data, target), old.getNearestPointIndexAtXValue(data, target));
        const chart = {
            data: {datasets: [
                {label: '温度', data}, {label: '湿度', data: data.slice().reverse()},
                {label: 'ゼロライン', data: [{x: 3, y: 0}]},
                {label: '補助', excludeFromLatestValue: true, data: [{x: 3, y: 8}]},
                {label: '非表示', data: [{x: 3, y: 8}]}
            ]}, isDatasetVisible: i => i !== 4
        };
        assert.equal(next.getNearestChartXValue(chart, target), old.getNearestChartXValue(chart, target));
        assert.equal(next.getLatestChartXValue(chart), old.getLatestChartXValue(chart));
        // Check the actual selected dataset/index pairs, including same-name split series.
        chart.data.datasets.push({label: '温度', data: [{x: 4, y: 22}]});
        const capture = context => {
            let active;
            context.syncChartTooltip({...chart, scales: {x: {min: 0, max: 5, getPixelForValue: x => x}}, chartArea: {bottom: 100}, setActiveElements: value => {active = value;}, draw() {}}, target);
            return JSON.parse(JSON.stringify(active));
        };
        assert.deepEqual(capture(next), capture(old));
        comparisons++;
    }
}
for(const data of [null, undefined, []]) assert.equal(next.getNearestPointIndexAtXValue(data, 1), -1);
for(const chart of [null, {}, {data: {}}, {data: {datasets: []}}]) assert.equal(next.getNearestChartXValue(chart, 1), null);
for(const file of ['index.html', 'u-tech-plus/index.html']){
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(html.indexOf('src="chart-point-search.js"') < html.indexOf('src="assets/utech-shared.js"'));
}
console.log(`Point search passed: ${comparisons} before/after cases, selected tooltip points, zero/null/strings, ties, missing/hidden/auxiliary/split series, distance and load order.`);
