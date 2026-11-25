'use strict';

// Registration stays with each page: global in U-Tech/Plus/Yui, per-chart in G-Flow.
window.UTechChartBackground = {
    id: 'chartBackgroundPlugin',
    beforeDraw(chart) {

        const ctx = chart.ctx;
        const chartArea = chart.chartArea;

        if (!chartArea) return;

        ctx.save();

        ctx.fillStyle = "#ffffff";

        ctx.fillRect(
            chartArea.left,
            chartArea.top,
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top
        );

        ctx.restore();
    }
};
