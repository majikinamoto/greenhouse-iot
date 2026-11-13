const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<div style="width:600px;height:300px"><canvas id="chart"></canvas></div>');
    await page.addScriptTag({url: 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js'});
    await page.addScriptTag({path: path.join(__dirname, '../chart-latest-value.js')});
    await page.evaluate(() => {
      window.chart = new Chart(document.getElementById('chart'), {
        type: 'line', data: {datasets: [
          {label: '温度 (℃)', data: [{x: 1, y: 20}, {x: 2, y: 21}, {x: 3, y: null}, {x: 4, y: 24}]},
          {label: '湿度 (%)', data: [{x: 1, y: 60}, {x: 3, y: 65}]}
        ]}, options: {animation: false, parsing: false, maintainAspectRatio: false, scales: {x: {type: 'linear', min: 1, max: 3}}}
      });
    });
    const margin = await page.evaluate(() => ({x: chart.canvas.getBoundingClientRect().left + chart.chartArea.right + 10, y: 100}));
    await page.mouse.move(margin.x, margin.y);
    await page.waitForFunction(() => chart.$latestValue === true);
    assert.deepEqual(await page.evaluate(() => UTechLatestValue.latestPoints(chart).map(p => [p.x, p.y])), [[2, 21], [3, 65]]);
    await page.evaluate(() => {chart.hide(1);});
    assert.equal(await page.evaluate(() => UTechLatestValue.latestPoints(chart).length), 1);
    await page.mouse.move(100, 100);
    await page.waitForFunction(() => chart.$latestValue === false);
    await page.mouse.move(margin.x, margin.y);
    await page.mouse.move(800, 400);
    await page.waitForFunction(() => chart.$latestValue === false);
    assert.deepEqual(errors, []);
    console.log('Browser latest-value test passed: real Chart.js 3.9.1, right margin, drawing, zoom bounds, hidden series, return and mouseout.');
  } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode = 1;});
