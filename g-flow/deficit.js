'use strict';

// Same formula and valid input range as U-Tech Next measured.js.
// This function is shared by the graphs, latest readings, and CSV export.
function flowDeficit(row) {
    const t = numeric(row.temperature), h = numeric(row.humidity);
    if (t === null || h === null || t <= -237.3 || h < 0 || h > 100) return {deficit:null, vpd:null};
    const difference = 6.1078 * 10 ** (7.5 * t / (237.3 + t)) * (1 - h / 100);
    const deficit = 216.7 * difference / (t + 273.15), vpd = difference / 10;
    return Number.isFinite(deficit) && Number.isFinite(vpd) ? {deficit, vpd} : {deficit:null, vpd:null};
}

function deficitAxes(point) {
    return {deficitMin:0, deficitMax:null, vpdMin:0, vpdMax:null, ...readAxes()['deficit_'+point]};
}

function applyDeficitAxes(chart) {
    const axis = deficitAxes(chart.$point);
    for (const [key, id] of [['deficit','yDeficit'], ['vpd','yVpd']]) {
        chart.options.scales[id].min = axis[key+'Min'];
        if (axis[key+'Max'] === null) delete chart.options.scales[id].max;
        else chart.options.scales[id].max = axis[key+'Max'];
    }
}

function renderDeficits(message = '') {
    $('deficit-charts').replaceChildren();
    for (const [index, point] of temperaturePoints.entries()) {
        const card = document.createElement('section');
        card.className = 'chart-card temperature-card deficit-card';
        const title = document.createElement('h3');
        title.textContent = `飽差No.${index+1}（${point}）`;
        const reset = document.createElement('button');
        reset.type = 'button';reset.className = 'chart-reset-button';reset.textContent = 'ズームリセット';reset.onclick = resetViews;
        title.append(reset);
        const controls = document.createElement('div');controls.className = 'temperature-axes';
        const inputs = {}, axis = loaded ? deficitAxes(point) : {deficitMin:0,deficitMax:null,vpdMin:0,vpdMax:null};
        for (const [key, unit] of [['deficit','g/m³'],['vpd','kPa']]) {
            const range = document.createElement('label');range.textContent = unit+'：';
            for (const suffix of ['Min','Max']) {
                if (suffix === 'Max') range.append('～');
                const input = document.createElement('input');input.type = 'number';input.step = 'any';input.value = axis[key+suffix] ?? '';input.placeholder = '自動';
                input.setAttribute('aria-label', `飽差 ${point} ${unit} ${suffix === 'Min' ? '最小' : '最大'}`);
                inputs[key+suffix] = input;range.append(input);
            }
            controls.append(range);
        }
        const apply = document.createElement('button');apply.type = 'button';apply.textContent = '縦軸反映';controls.append(apply);
        const error = document.createElement('p');error.className = 'error';error.setAttribute('role','alert');
        const wrap = document.createElement('div');wrap.className = 'chart-container';
        const canvas = document.createElement('canvas');canvas.id = 'flowDeficit'+point;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`飽差No.${index+1}のグラフ`);wrap.append(canvas);
        const readout = document.createElement('p');readout.className = 'chart-readout';
        const rows = message ? [] : loaded.rows.filter(r=>r.point_id === point).map(r=>({...r,...flowDeficit(r)}));
        const last = rows.filter(r=>r.deficit !== null && Number.isFinite(stamp(r.recorded_at))).at(-1);
        readout.textContent = message || (last ? `最新測定 ${last.recorded_at} JST ｜ ` : 'この期間の飽差データはありません。');
        if (last) {const values = document.createElement('strong');values.textContent = `飽差 ${last.deficit.toFixed(1)} g/m³／VPD ${last.vpd.toFixed(2)} kPa`;readout.append(values);}
        card.append(title,controls,error,wrap,readout);$('deficit-charts').append(card);
        let chart = null;
        if (last) {
            const options = baseOptions(new Date(loaded.startMs), new Date(loaded.endMs));
            options.animation = false;
            options.scales.yDeficit = {position:'left',min:0,title:{display:true,text:'g/m³'},ticks:{callback:v=>Number(v).toFixed(1)}};
            options.scales.yVpd = {position:'right',min:0,title:{display:true,text:'kPa'},grid:{drawOnChartArea:false},ticks:{callback:v=>Number(v).toFixed(2)}};
            options.plugins.tooltip.callbacks.label = item => `${item.dataset.label}: ${item.parsed.y.toFixed(item.dataset.yAxisID === 'yVpd' ? 2 : 1)}`;
            chart = new Chart(canvas,{type:'line',plugins:[flowGuides,chartBackgroundPlugin],data:{datasets:[
                ['deficit','飽差 (g/m³)','yDeficit','#8054b5'],['vpd','VPD (kPa)','yVpd','#d25a28']
            ].map(([key,label,yAxisID,color])=>({label,yAxisID,borderColor:color,backgroundColor:color,borderWidth:2,pointRadius:0,tension:.2,spanGaps:false,data:rows.map(r=>({x:stamp(r.recorded_at),y:r[key]})).filter(p=>Number.isFinite(p.x))}))},options});
            chart.$point = point;chart.$kind = 'deficit';applyDeficitAxes(chart);chart.update('none');charts.push(chart);
        } else if (!message) {
            const note = document.createElement('p');note.className = 'chart-no-data';note.textContent = 'この期間の飽差データはありません。';wrap.append(note);
        }
        apply.disabled = Boolean(message);
        apply.onclick = () => {
            const values = Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value.trim() === '' ? (key.endsWith('Min') ? 0 : null) : Number(input.value)]));
            if (Object.values(values).some(v=>v !== null && (!Number.isFinite(v) || v < 0)) || ['deficit','vpd'].some(key=>values[key+'Max'] !== null && values[key+'Min'] >= values[key+'Max'])) {error.textContent = '0以上の値を入力し、最大を最小より大きくしてください。';return;}
            error.textContent = '';const saved = readAxes();saved['deficit_'+point] = values;saveAxes(saved);
            if (chart) {applyDeficitAxes(chart);chart.update('none');}
        };
        controls.addEventListener('keydown',event=>{if(event.key === 'Enter'){event.preventDefault();apply.click();}});
    }
}
