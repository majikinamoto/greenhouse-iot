'use strict';

// Drawing only. Axis limits, zoom and plugin registration remain page-owned.
window.UTechChartBands = Object.freeze({
    draw(chart, {axis = 'y', min, max, color}) {
        const area = chart.chartArea;
        const scale = chart.scales[axis];
        if (!area || !scale) return;
        const visibleMin = Math.max(min, scale.min);
        const visibleMax = Math.min(max, scale.max);
        if (visibleMax <= visibleMin) return;
        const top = Math.max(area.top, scale.getPixelForValue(visibleMax));
        const bottom = Math.min(area.bottom, scale.getPixelForValue(visibleMin));
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = color;
        ctx.fillRect(area.left, top, area.right - area.left, bottom - top);
        ctx.restore();
    }
});
