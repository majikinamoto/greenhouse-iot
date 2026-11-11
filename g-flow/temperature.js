'use strict';
// U-Tech P01 drawing settings and value labels, scoped to G-Flow.
function getChartCanvas(id){return document.getElementById(id);}
function hasChartSourceData(rows){return rows.length>0;}
function destroyExistingChart(id){Chart.getChart(id)?.destroy();}
function getChartDisplayMinTime(id,min){return min;}
function formatTime(ms){const d=new Date(ms+9*3600000);const pad=v=>String(v).padStart(2,'0');return `${pad(d.getUTCMonth()+1)}月${pad(d.getUTCDate())}日 ${pad(d.getUTCHours())}時${pad(d.getUTCMinutes())}分`;}
function getTempHumAxis(point){return {humMin:40,humMax:100,tempMin:20,tempMax:40,...readAxes()[point]};}
const chartBackgroundPlugin = {
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

const pointLabelPlugin = {
    id:"pointLabelPlugin",
    afterDatasetsDraw(chart){
        const active = chart.tooltip && chart.tooltip.getActiveElements
            ? chart.tooltip.getActiveElements()
            : [];

        if(!active.length) return;

        const ctx = chart.ctx;
        const isLatestValue = cursorLatest;
        ctx.save();

        active.forEach(activePoint=>{
            const datasetIndex = activePoint.datasetIndex;
            const index = activePoint.index;
            const dataset = chart.data.datasets[datasetIndex];
            const meta = chart.getDatasetMeta(datasetIndex);
            const point = meta.data[index];

            if(!dataset || !dataset.data[index]) return;

            const rawData = dataset.data[index];
            const value = rawData.y !== null && rawData.y !== undefined
                ? rawData.y
                : point && point.$context && point.$context.parsed
                    ? point.$context.parsed.y
                    : null;

            if(value === null || value === undefined || isNaN(value)) return;

            const labelMatch = dataset.label.match(/^(.+?)\s*\((.+)\)$/);
            const labelName = labelMatch ? labelMatch[1] : dataset.label;
            const axis = chart.scales[dataset.yAxisID || "y"];
            const axisUnit = axis && axis.options && axis.options.title ? axis.options.title.text : "";
            const axisUnitMatch = chart.canvas && chart.canvas.id === "rainChart" && typeof axisUnit === "string"
                ? axisUnit.match(/(\s*\(.+\))$/)
                : null;
            const isWindChart = chart.canvas && chart.canvas.id === "windChartP61";
            const unit = isWindChart ? " (m/s)" : labelMatch ? labelMatch[2] : axisUnitMatch ? axisUnitMatch[1] : axisUnit;
            const isIntegerValue = unit === "ppm";
            const displayValue = isWindChart
                ? Number(value).toFixed(2)
                : isIntegerValue ? Number(value).toFixed(0) : Number(value).toFixed(1);
            const labelText = labelName + "_";
            const valueText = displayValue + unit;

ctx.font = "12px sans-serif";

const labelWidth = ctx.measureText(labelText).width;
ctx.font = "bold 12px sans-serif";
const valueWidth = ctx.measureText(valueText).width;
const width = labelWidth + valueWidth + 10;
const height = 20;

const xScale = chart.scales.x;
const yScale = chart.scales[dataset.yAxisID || "y"];
            const pointX = xScale ? xScale.getPixelForValue(rawData.x) : point.x;
            const pointY = yScale ? yScale.getPixelForValue(value) : point.y;

            if(isLatestValue && Number.isFinite(pointX) && Number.isFinite(pointY)){
                ctx.beginPath();
                ctx.arc(pointX, pointY, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = typeof dataset.pointBackgroundColor === "string"
                    ? dataset.pointBackgroundColor
                    : typeof dataset.borderColor === "string"
                        ? dataset.borderColor
                        : "#000";
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = "rgba(255,255,255,0.9)";
                ctx.stroke();
            }

let x = pointX + 8;
let y = pointY - 8;

const chartArea = chart.chartArea;

/* 右にはみ出す場合は、左側に表示 */
if(x + width > chartArea.right){
    x = pointX - width - 8;
}

/* 左にはみ出す場合は、左端に寄せる */
if(x < chartArea.left){
    x = chartArea.left + 2;
}

/* 上にはみ出す場合は、少し下に表示 */
if(y - height < chartArea.top){
    y = Math.max(pointY + height, chartArea.top + height + 2);
}

/* 下にはみ出す場合は、少し上に表示 */
if(y > chartArea.bottom){
    y = chartArea.bottom - 2;
}

ctx.fillStyle = "rgba(255,255,255,0.85)";
ctx.fillRect(x, y - height, width, height);

ctx.fillStyle = "#000";
ctx.font = "12px sans-serif";
ctx.fillText(labelText, x + 5, y - 5);
ctx.font = "bold 12px sans-serif";
ctx.fillText(valueText, x + 5 + labelWidth, y - 5);
        });

        ctx.restore();
    }
};

function baseOptions(minTime,maxTime){
    const zoomEnabled = !window.matchMedia("(max-width: 600px)").matches;

    return {
        parsing:false,
        responsive:true,
        maintainAspectRatio:false,
interaction:{
    mode:"index",
    intersect:false
},
        plugins:{
            zoom:{
                zoom:{
                    wheel:{enabled:false},
                    pinch:{enabled:zoomEnabled},
                    drag:{
    enabled:zoomEnabled,
    backgroundColor:"rgba(30,120,255,0.35)",
    borderColor:"rgba(30,120,255,0.8)",
    borderWidth:1
},

                    mode:"xy",
                    onZoomComplete({chart}){ syncZoom({chart}); }
                },
pan:{
    enabled:false
}
            },
            crosshair:{
                line:{color:"#000",width:1},
                sync:{
                    enabled:true,
                    group:1,
                    suppressTooltips:false
                },
                zoom:{enabled:false},
                snap:{enabled:false}
            },
            tooltip:{
    position:"crosshairBottom",
    backgroundColor:"rgba(0,0,0,0)",
    titleColor:"#000",
    bodyColor:"#000",
    footerColor:"#000",
    caretSize:0,
    padding:0,
    titleMarginBottom:0,
    mode:"index",
    intersect:false,
    callbacks:{
        title(items){
            if(!items.length) return "";
            const chart = items[0].chart;
            if(cursorLatest && cursorTime !== null){
                return "最新　" + formatTime(cursorTime);
            }
            return formatTime(items[0].parsed.x);
        },
        label(){
            return null;
        }
    }
}
        },
        scales:{
    x:{
        type:"linear",
        min:minTime.getTime(),
        max:maxTime.getTime(),

        grid:{
            drawOnChartArea:false
        },

        afterBuildTicks:function(scale){
            const min = scale.min;
            const max = scale.max;
            const range = max - min;

            const interval =
                range > 36 * 60 * 60 * 1000
                ? 60 * 60 * 1000
                : 30 * 60 * 1000;

            const startDate = new Date(min);
            startDate.setSeconds(0,0);

            if(interval === 60 * 60 * 1000){
                startDate.setMinutes(0,0,0);
                if(startDate.getTime() < min){
                    startDate.setHours(startDate.getHours() + 1);
                }
            }else{
                const m = startDate.getMinutes();

                if(m < 30){
                    startDate.setMinutes(30,0,0);
                }else{
                    startDate.setHours(startDate.getHours() + 1);
                    startDate.setMinutes(0,0,0);
                }
            }

            const ticks = [];

            for(let t = startDate.getTime(); t <= max; t += interval){
                ticks.push({ value:t });
            }

            scale.ticks = ticks;
        },

        ticks:{
            color:"#000",

            callback:function(value, index, ticks){
                const tickValue = ticks[index].value;

                const d = new Date(tickValue);
                const h = String(d.getHours()).padStart(2,"0");
                const m = String(d.getMinutes()).padStart(2,"0");

                return [h + "時", m + "分"];
            },

            maxRotation:0,
            autoSkip:true,
            maxTicksLimit:8

                }
            }
        }
    };
}

function createTempHumChart(canvasId, parsed, minTime, maxTime, pointId){

    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(parsed)) return null;

    destroyExistingChart(canvasId);

    const axis = getTempHumAxis(pointId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);
    const humColor = "rgb(0, 100, 255)";
    const tempColor = "rgb(255, 0, 0)";
    const humData = parsed
        .filter(d=>d.hum !== null && !isNaN(d.hum))
        .map(d=>({x:d.xValue,y:d.hum}));
    const tempData = parsed
        .filter(d=>d.temp !== null && !isNaN(d.temp))
        .map(d=>({x:d.xValue,y:d.temp}));

    if(!humData.length && !tempData.length) return null;

    return new Chart(canvas,{plugins:[flowGuides,chartBackgroundPlugin,pointLabelPlugin],
        type:"line",
        data:{
            datasets:[
                {
                    label:"湿度 (%)",
                    data:humData,
                    yAxisID:"yHum",
                    borderColor:humColor,
                    backgroundColor:function(context){
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        if(!chartArea){
                            return "rgba(0, 100, 255, 0.45)";
                        }
                        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, "rgba(0, 100, 255, 0.90)");
                        gradient.addColorStop(0.08, "rgba(0, 100, 255, 0.45)");
                        gradient.addColorStop(0.20, "rgba(0, 100, 255, 0.15)");
                        gradient.addColorStop(0.35, "rgba(0, 100, 255, 0.00)");
                        return gradient;
                    },
                    pointBackgroundColor:humColor,
                    pointRadius:0,
                    borderWidth:2,
                    tension:0.2,
                    fill:true
                },
                {
                    label:"温度 (℃)",
                    data:tempData,
                    yAxisID:"yTemp",
                    borderColor:tempColor,
                    backgroundColor:function(context){
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        if(!chartArea){
                            return "rgba(255, 0, 0, 0.25)";
                        }
                        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, "rgba(255, 0, 0, 0.85)");
                        gradient.addColorStop(0.15, "rgba(255, 0, 0, 0.45)");
                        gradient.addColorStop(0.50, "rgba(255, 0, 0, 0.12)");
                        gradient.addColorStop(1.00, "rgba(255, 0, 0, 0.00)");
                        return gradient;
                    },
                    pointBackgroundColor:tempColor,
                    pointRadius:0,
                    borderWidth:2,
                    tension:0.2,
                    fill:true
                }
            ]
        },
        options:{
            ...baseOptions(displayMinTime,maxTime),
            scales:{
                ...baseOptions(displayMinTime,maxTime).scales,
yHum:{
    position:"left",
    min:axis.humMin,
    max:axis.humMax,
    ticks:{
        stepSize:10,
        color:"#000"
    },
    title:{
        display:true,
        text:"%",
        color:"#000"
    },
    grid:{
        borderColor:humColor
    }
},
yTemp:{
    position:"right",
    min:axis.tempMin,
    max:axis.tempMax,
    ticks:{
        stepSize:5,
        color:"#000"
    },
    title:{
        display:true,
        text:"℃",
        color:"#000"
    },
    grid:{
        borderColor:tempColor
    }
}            }
        }
    });
}


function renderTemperatures(){
 Chart.Tooltip.positioners.crosshairBottom=function(elements,event){return {x:event.x,y:this.chart.chartArea.bottom,xAlign:'center',yAlign:'bottom'};};
 $('temperature-charts').replaceChildren();
 for(const [index,point] of temperaturePoints.entries()){
  const card=document.createElement('section');card.className='chart-card temperature-card';
  const title=document.createElement('h3');title.textContent=`温湿度No.${index+1}（${point}）`;
  const reset=document.createElement('button');reset.type='button';reset.className='chart-reset-button';reset.textContent='ズームリセット';reset.onclick=resetViews;title.append(reset);
  const controls=document.createElement('div');controls.className='temperature-axes';const axis=getTempHumAxis(point),inputs={};
  for(const [name,label] of [['hum','湿度軸：'],['temp','温度軸：']]){const range=document.createElement('label');range.textContent=label;for(const suffix of ['Min','Max']){if(suffix==='Max')range.append('～');const input=document.createElement('input');input.type='number';input.step='any';input.value=axis[name+suffix];input.setAttribute('aria-label',`${point} ${label}${suffix==='Min'?'最小':'最大'}`);inputs[name+suffix]=input;range.append(input);}controls.append(range);}
  const apply=document.createElement('button');apply.type='button';apply.textContent='縦軸反映';controls.append(apply);const error=document.createElement('p');error.className='error';error.setAttribute('role','alert');
  const wrap=document.createElement('div');wrap.className='chart-container';const canvas=document.createElement('canvas');canvas.id='flowTemp'+point;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`温湿度No.${index+1}のグラフ`);wrap.append(canvas);card.append(title,controls,error,wrap);$('temperature-charts').append(card);
  const parsed=loaded.rows.filter(r=>r.point_id===point).map(r=>({xValue:stamp(r.recorded_at),hum:numeric(r.humidity),temp:numeric(r.temperature)}));const chart=createTempHumChart(canvas.id,parsed,new Date(loaded.startMs),new Date(loaded.endMs),point);
  if(!chart){const note=document.createElement('p');note.className='chart-no-data';note.textContent='この期間の温湿度データはありません。';wrap.append(note);}else{chart.$point=point;charts.push(chart);}
  apply.onclick=()=>{const values=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value.trim()===''?NaN:Number(input.value)]));if(Object.values(values).some(v=>!Number.isFinite(v))||values.humMin>=values.humMax||values.tempMin>=values.tempMax){error.textContent='最小・最大を入力し、最大を最小より大きくしてください。';return;}error.textContent='';const saved=readAxes();saved[point]=values;saveAxes(saved);if(chart){ownAxis(chart);chart.update('none');}};
  controls.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply.click();}});
 }
}
