'use strict';

// U-Tech calcVapor formula. All graphs/readouts/CSV use these same derived values.
function flowDeficit(row) {
    const t = numeric(row.temperature), h = numeric(row.humidity);
    const result = {saturated:null, vapor:null, deficit:null, vpd:null};
    if (t === null || t <= -237.3) return result;
    const es = window.UTechMoisture.saturationPressure(t);
    const saturated = window.UTechMoisture.saturatedDensity(t,es);
    if (!Number.isFinite(saturated)) return result;
    result.saturated = saturated;
    if (h === null || h < 0 || h > 100) return result;
    result.vapor = saturated * h / 100;
    result.deficit = saturated - result.vapor;
    result.vpd = window.UTechMoisture.pressureDeficit(t,h,es);
    return result;
}

function moistureDefinition(kind) {
    return kind === 'vpd' ? {title:'VPD', unit:'kPa', fields:[['vpd','VPD','rgb(210, 90, 40)',false,2]]}
        : {title:'飽差',unit:'g/㎥',fields:[
            ['saturated','飽和水蒸気量','rgb(255, 0, 0)',false,1],
            ['vapor','水蒸気量','rgb(75, 192, 192)',false,1],
            ['deficit','飽差','rgb(255, 159, 64)',true,1]
        ]};
}

function moistureAxis(point, kind) {
    const saved = readAxes();
    const settings = saved[kind+'_'+point];
    // Preserve the former combined graph's kPa upper bound; g/㎥ now includes saturation.
    const max = settings ? settings.max : kind === 'vpd' ? saved['deficit_'+point]?.vpdMax : null;
    return {min:0, max:Number.isFinite(max) && max > 0 ? max : null};
}

function applyDeficitAxes(chart) {
    const axis = moistureAxis(chart.$point, chart.$kind);
    for (const id of Object.keys(chart.options.scales).filter(id=>id !== 'x')) {
        chart.options.scales[id].min = 0;
        if (axis.max === null) delete chart.options.scales[id].max;
        else chart.options.scales[id].max = axis.max;
    }
}

// Background shading only: unlike U-Tech's plugin, never force zero during zoom.
const flowVaporBand = {
    id:'flowVaporBand',
    beforeDatasetsDraw(chart) {
        const a = chart.chartArea, y = chart.scales.y;
        if (!a || !y) return;
        const min = Math.max(5,y.min), max = Math.min(10,y.max);
        if (max <= min) return;
        const top = Math.max(a.top,y.getPixelForValue(max));
        const bottom = Math.min(a.bottom,y.getPixelForValue(min));
        chart.ctx.save();chart.ctx.fillStyle = 'rgba(31, 143, 95, 0.12)';
        chart.ctx.fillRect(a.left,top,a.right-a.left,bottom-top);chart.ctx.restore();
    }
};

function renderDeficits(message = '') {
    for (const kind of ['vpd','vapor']) renderMoistureGroup(kind,message);
}

function renderMoistureGroup(kind, message) {
    const container = $(kind+'-charts'), def = moistureDefinition(kind);
    container.replaceChildren();
    for (const [index,point] of temperaturePoints.entries()) {
        const card = document.createElement('section');card.className = 'chart-card temperature-card '+kind+'-card';
        const title = document.createElement('h3');title.textContent = `${def.title}No.${index+1}（${point}）`;
        const reset = document.createElement('button');reset.type = 'button';reset.className = 'chart-reset-button';reset.textContent = 'ズームリセット';reset.onclick = resetViews;title.append(reset);
        const controls = document.createElement('div');controls.className = 'temperature-axes';
        const axis = loaded ? moistureAxis(point,kind) : {min:0,max:null};
        const range = document.createElement('label');range.textContent = def.unit+'：';
        const minInput = document.createElement('input');minInput.type = 'number';minInput.value = '0';minInput.readOnly = true;minInput.setAttribute('aria-label',`${def.title} ${point} 最小（0固定）`);
        const maxInput = document.createElement('input');maxInput.type = 'number';maxInput.step = 'any';maxInput.min = '0';maxInput.value = axis.max ?? '';maxInput.placeholder = '自動';maxInput.setAttribute('aria-label',`${def.title} ${point} 最大`);
        range.append(minInput,'～',maxInput);
        const apply = document.createElement('button');apply.type = 'button';apply.textContent = '縦軸反映';controls.append(range,apply);
        const error = document.createElement('p');error.className = 'error';error.setAttribute('role','alert');
        const wrap = document.createElement('div');wrap.className = 'chart-container';
        const canvas = document.createElement('canvas');canvas.id = 'flow'+kind+point;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${def.title}No.${index+1}のグラフ`);wrap.append(canvas);
        const readout = document.createElement('p');readout.className = 'chart-readout';
        const rows = message ? [] : loaded.rows.filter(r=>r.point_id === point && Number.isFinite(stamp(r.recorded_at))).map(r=>({...r,...flowDeficit(r)}));
        const last = rows.filter(r=>def.fields.some(([key])=>r[key] !== null)).at(-1);
        readout.textContent = message || (last ? `最新測定 ${last.recorded_at} JST ｜ ` : `この期間の${def.title}データはありません。`);
        if (last) {const values = document.createElement('strong');values.textContent = def.fields.map(([key,label,,,digits])=>`${label} ${last[key]?.toFixed(digits)??'—'} ${def.unit}`).join('／');readout.append(values);}
        card.append(title,controls,error,wrap,readout);container.append(card);
        let chart = null;
        if (last) {
            const options = baseOptions(new Date(loaded.startMs),new Date(loaded.endMs));options.animation = false;
            options.scales.y = {position:'left',min:0,title:{display:true,text:def.unit,color:'#000'},ticks:{color:'#000'}};
            options.plugins.legend = {labels:{font:{size:11},boxWidth:18,boxHeight:10,padding:6}};
            // Match U-Tech: numeric callouts at each series and a bottom time tooltip.
            chart = new Chart(canvas,{type:'line',plugins:[flowGuides,chartBackgroundPlugin,pointLabelPlugin,...(kind === 'vapor' ? [flowVaporBand] : [])],data:{datasets:def.fields.map(([key,label,color,fill,digits])=>({label:`${label} (${def.unit})`,valueDigits:digits,yAxisID:'y',borderColor:color,backgroundColor:fill?'rgba(255, 159, 64, 0.20)':color,pointBackgroundColor:color,borderWidth:2,pointRadius:0,tension:.2,fill,spanGaps:false,data:rows.map(r=>({x:stamp(r.recorded_at),y:r[key]}))}))},options});
            chart.$point = point;chart.$kind = kind;applyDeficitAxes(chart);chart.update('none');charts.push(chart);
        } else if (!message) {
            const note = document.createElement('p');note.className = 'chart-no-data';note.textContent = `この期間の${def.title}データはありません。`;wrap.append(note);
        }
        apply.disabled = Boolean(message);
        apply.onclick = () => {
            const max = maxInput.value.trim() === '' ? null : Number(maxInput.value);
            if (max !== null && (!Number.isFinite(max) || max <= 0)) {error.textContent = '最大は0より大きくしてください。';return;}
            error.textContent = '';const saved = readAxes();saved[kind+'_'+point] = {max};saveAxes(saved);
            if (chart) {applyDeficitAxes(chart);chart.update('none');}
        };
        controls.addEventListener('keydown',event=>{if(event.key === 'Enter'){event.preventDefault();apply.click();}});
    }
}
