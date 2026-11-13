'use strict';

// Shared by every U-Tech chart. Ordinary hover remains owned by each page.
(() => {
  function latestPoints(chart) {
    const result = new Map(), scale = chart.scales.x;
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (!chart.isDatasetVisible(datasetIndex) || dataset.excludeFromLatestValue ||
          dataset.yAxisID === 'marker' || dataset.label === 'ゼロライン') return;
      const meta = chart.getDatasetMeta(datasetIndex);
      dataset.data.forEach((raw, index) => {
        if (raw === null || raw === undefined || (typeof raw === 'object' && (raw.y == null || raw.excludeFromLatestValue))) return;
        const parsed = meta.controller.getParsed(index);
        if (!parsed || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y) ||
            parsed.x < scale.min || parsed.x > scale.max) return;
        const key = dataset.tooltipGroup || dataset.label || String(datasetIndex);
        const previous = result.get(key);
        if (!previous || parsed.x > previous.x) result.set(key, {datasetIndex, index, x: parsed.x, y: parsed.y});
      });
    });
    return [...result.values()];
  }

  function group(chart) {
    if (typeof getChartSyncGroup === 'function') return getChartSyncGroup(chart);
    return chart.canvas.closest('[role="tabpanel"]') || 'main';
  }
  function peers(chart) {
    const key = group(chart);
    return Object.values(Chart.instances).filter(other => group(other) === key);
  }
  function clear(chart) {
    for (const other of peers(chart)) {
      if (!other.$latestValue) continue;
      other.$latestValue = false;
      other.draw();
    }
  }
  function timeLabel(chart, point) {
    if (point.x > 100000000000) return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(point.x));
    if (chart.data.labels) return String(chart.data.labels[point.index]);
    if (chart.$hours) return chart.$hours[Math.min(chart.$hours.length - 1, Math.max(0, Math.ceil(point.x) - 1))]?.time || '';
    return `${String(Math.floor(point.x)).padStart(2, '0')}:00`;
  }
  Chart.register({
    id: 'utechLatestValue',
    beforeInit(chart) {
      // Reserve an easy-to-hit area even on charts without a right-hand axis.
      const padding = chart.options.layout.padding;
      chart.options.layout.padding = typeof padding === 'number'
        ? {top: padding, bottom: padding, left: padding, right: Math.max(28, padding)}
        : {...padding, right: Math.max(28, Number(padding?.right) || 0)};
    },
    beforeEvent(chart, args) {
      if (args.replay) return;
      const e = args.event, a = chart.chartArea;
      if (!a) return;
      const right = e.type !== 'mouseout' && e.x > a.right && e.x <= chart.width && e.y >= 0 && e.y <= chart.height;
      if (!right) { clear(chart); return; }
      if (!['mousemove', 'touchstart', 'touchmove'].includes(e.type)) return false;
      // Let the page clear its ordinary synchronized hover state first.
      chart.notifyPlugins('afterEvent', {event: {...e, type: 'mouseout'}, replay: false, inChartArea: false});
      for (const other of peers(chart)) {
        other.setActiveElements([]);
        other.tooltip?.setActiveElements([], {x: 0, y: 0});
        other.$latestValue = true;
        other.draw();
      }
      return false;
    },
    afterDraw(chart) {
      if (!chart.$latestValue) return;
      const {ctx, chartArea: a} = chart, occupied = [];
      ctx.save();
      ctx.font = 'bold 12px sans-serif';
      ctx.textBaseline = 'middle';
      for (const point of latestPoints(chart)) {
        const dataset = chart.data.datasets[point.datasetIndex];
        const axis = chart.scales[dataset.yAxisID || 'y'];
        const x = chart.scales.x.getPixelForValue(point.x), y = axis.getPixelForValue(point.y);
        const title = axis.options.title?.text || '';
        const unit = /[（(].+[）)]/.test(dataset.label || '') ? '' : title;
        const text = `${dataset.label || ''}: ${Number(point.y.toFixed(2))} ${unit}（${timeLabel(chart, point)}）`;
        const width = Math.min(ctx.measureText(text).width + 10, a.right - a.left);
        let ly = Math.max(a.top + 11, Math.min(a.bottom - 11, y - 12));
        const slots = [];
        for (let candidate = a.top + 11; candidate <= a.bottom - 11; candidate += 23) slots.push(candidate);
        const free = slots.filter(candidate => occupied.every(v => Math.abs(v - candidate) >= 22));
        if (occupied.some(v => Math.abs(v - ly) < 23) && free.length) ly = free.reduce((best, candidate) => Math.abs(candidate - ly) < Math.abs(best - ly) ? candidate : best);
        occupied.push(ly);
        const lx = Math.max(a.left, Math.min(a.right - width, x - width - 8));
        ctx.fillStyle = typeof dataset.borderColor === 'string' ? dataset.borderColor : '#333';
        if (y >= a.top && y <= a.bottom) {ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();}
        ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(lx, ly - 10, width, 20);
        ctx.fillStyle = '#111'; ctx.fillText(text, lx + 5, ly, width - 10);
      }
      ctx.restore();
    }
  });
  // Exposed for focused tests and future graph implementations.
  window.UTechLatestValue = {latestPoints};
})();
