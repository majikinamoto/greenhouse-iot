'use strict';
// Per-page, per-graph settings. Only explicitly applied, valid ranges are saved.
window.TempHumAxes = (() => {
    function ids(point, review, metric) {
        const field = review ? 'review' + (metric === 'temp' ? 'Temp' : 'Hum') : metric;
        return [field+'Min'+point, field+'Max'+point];
    }
    function key(pair) { return 'utechTempHumAxes_v1_' + location.pathname.replace(/index\.html$/, '') + '_' + pair[0]; }
    function restore(point, review = false, metric) {
        for (const field of metric ? [metric] : ['temp','hum']) {
            const pair = ids(point,review,field), inputs = pair.map(id=>document.getElementById(id));
            if (inputs.some(input=>!input)) continue;
            try {
                const value = JSON.parse(localStorage.getItem(key(pair)));
                if (value && Number.isFinite(value.min) && Number.isFinite(value.max) && value.min < value.max) {
                    inputs[0].value = value.min;inputs[1].value = value.max;
                }
            } catch {}
        }
    }
    function save(point, review = false, metric) {
        for (const field of metric ? [metric] : ['temp','hum']) {
            const pair = ids(point,review,field), inputs = pair.map(id=>document.getElementById(id));
            if (inputs.some(input=>!input || String(input.value).trim() === '')) continue;
            const [min,max] = inputs.map(input=>Number(input.value));
            if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) continue;
            try { localStorage.setItem(key(pair),JSON.stringify({min,max})); }
            catch { const message=document.getElementById('message');if(message)message.textContent='縦軸設定を端末に保存できませんでした。'; }
        }
    }
    function restoreChart(chart) {
        const id = chart?.canvas?.id || '';
        const combined = id.match(/^(?:tempChart|maintenanceTempChart|reviewTempChart)(P\d+)$/);
        const split = id.match(/^(?:reviewOutside|outside)(Temp|Hum)Chart(P11)$/);
        if (!combined && !split) return;
        const point = combined ? combined[1] : split[2], review = id.startsWith('review');
        const metric = split ? split[1].toLowerCase() : null;
        restore(point,review,metric);
        for (const field of metric ? [metric] : ['temp','hum']) {
            const inputs = ids(point,review,field).map(key=>document.getElementById(key));
            if (inputs.some(input=>!input || String(input.value).trim() === '')) continue;
            const [min,max] = inputs.map(input=>Number(input.value));
            if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) continue;
            for (const axis of split ? ['y','yRight'] : [field === 'temp' ? 'yTemp' : 'yHum']) {
                if (chart.options.scales[axis]) Object.assign(chart.options.scales[axis],{min,max});
            }
        }
    }
    window.addEventListener('DOMContentLoaded',()=>{
        for (const input of document.querySelectorAll('input[id]')) {
            const match = input.id.match(/^(review)?(?:temp|hum)Min(P\d+)$/i);
            if (match) restore(match[2],Boolean(match[1]));
        }
    });
    return {restore,save,restoreChart};
})();
