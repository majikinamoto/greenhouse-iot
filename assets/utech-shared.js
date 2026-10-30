// U-Tech本体/Plus共通：API取得・計算・グラフ・日時・地域。
// 各サイトの専用JSより先に読み込む。サイト側のグラフ状態や関数を参照する処理も含む。
// このファイルの変更時は本体とPlusの両方を確認する。
// === JavaScript：エラー表示と外部ライブラリの確認 ===
function formatScriptErrorDetails(details){
    const lines = [
        "JavaScriptエラー：" + (details.message || "不明なエラー")
    ];

    if(details.source) lines.push("source:" + details.source);
    if(details.lineNo !== undefined && details.lineNo !== null && details.lineNo !== "") lines.push("line:" + details.lineNo);
    if(details.columnNo !== undefined && details.columnNo !== null && details.columnNo !== "") lines.push("col:" + details.columnNo);
    if(details.stack) lines.push("stack:" + details.stack);

    if(details.message === "Script error." && Number(details.lineNo) === 0){
        lines.push("補足：外部スクリプト、古いブラウザ、キャッシュ、CDN読み込み失敗の可能性があります");
    }

    return lines;
}

function showScriptError(details){
    var message = document.getElementById("message");
    var lines = formatScriptErrorDetails(details);

    if(message){
        message.style.color = "red";
        message.innerText = lines.join("\n");
    }

    console.error("JavaScriptエラー", details);
}

window.onerror = function(msg, url, lineNo, columnNo, error) {
    showScriptError({
        message:String(msg || ""),
        source:url || "",
        lineNo:lineNo,
        columnNo:columnNo,
        stack:error && error.stack ? error.stack : ""
    });
};

window.addEventListener("unhandledrejection", function(event){
    var reason = event.reason || {};

    showScriptError({
        message:String(reason.message || reason || "Unhandled promise rejection"),
        source:"",
        lineNo:"",
        columnNo:"",
        stack:reason.stack || ""
    });
});

function validateExternalLibraries(){
    if(typeof Chart === "undefined"){
        throw new Error("Chart.jsを読み込めません。CDN読み込み失敗、ネットワーク、キャッシュ、または古いブラウザの可能性があります。");
    }
    if(typeof Hammer === "undefined"){
        throw new Error("Hammer.jsを読み込めません。グラフのズーム操作用ライブラリのCDN読み込み失敗、ネットワーク、キャッシュ、または古いブラウザの可能性があります。");
    }
}

;

// === 共有する状態・定数・グラフ設定 ===
let tempChartP01;

let tempChartP11;

let humChartP01;

let humChartP11;

let co2Chart;

let co2OutsideChart;

let analysisCompareCharts = {};

let analysisDiffCharts = {};

let wbgtChart = null;

let wbgtGlobeChart = null;

let allCharts = [];

let maintenanceCharts = [];

let reviewCharts = [];

let syncingZoom = false;

let syncedCrosshairValues = { main:null, analysis:null, wbgt:null, maintenance:null, review:null };

let syncedCrosshairLatest = { main:false, analysis:false, wbgt:false, maintenance:false, review:false };

let lastTouchChart = null;

let lastTouchChartEventAt = 0;

let maintenanceMode = "latest";

let tempMin = 20;

let tempMax = 40;

let humMin = 40;

let humMax = 100;

let co2Min = 300;

let co2Max = 700;

let co2OutsideMin = 300;

let co2OutsideMax = 700;

let co2DiffMin = -250;

let co2DiffMax = 250;

let outsideDiffAxisMin = -1;

let outsideDiffAxisMax = 10;

let dewAxisMin = undefined;

let dewAxisMax = undefined;

let solarAxisMin = undefined;

let solarAxisMax = undefined;

let voltAxisMin = 11;

let voltAxisMax = 14;

const maintenanceCanvasIds = [
    "maintenanceTempChartP01",
    "maintenanceTempChartP11",
    "tempChartP12",
    "diffChartP11P12",
    "tempChartP02",
    "diffChart",
    "vaporChartP11",
    "dewChartP11",
    "dewChart",
    "co2ChartP27",
    "co2DiffChartP26P27",
    "co2ChartP22",
    "co2DiffChartP21P22",
    "solarChartP32",
    "solarDiffChartP31P32",
    "voltChart"
];

const maintenanceCanvasIdSet = new Set(maintenanceCanvasIds);

const analysisCompareGraphs = ["A", "B", "C"];

const analysisDiffGraphs = ["B", "C"];

const UTECH_AREAS = {
    naha:{
        label:"那覇",
        lat:26.2124,
        lon:127.6792,
        tideStation:"NH",
        jmaOfficeCode:"471000",
        jmaAreaName:"本島中南部",
        jmaTempAreaName:"那覇"
    },
    nago:{
        label:"名護",
        lat:26.5915,
        lon:127.9773,
        tideStation:"NH",
        jmaOfficeCode:"471000",
        jmaAreaName:"本島北部",
        jmaTempAreaName:"名護"
    },
    miyako:{
        label:"宮古",
        lat:24.8056,
        lon:125.2811,
        tideStation:"HIRARA",
        jmaOfficeCode:"473000",
        jmaAreaName:"宮古島地方",
        jmaTempAreaName:"宮古島"
    },
    ishigaki:{
        label:"石垣",
        lat:24.3407,
        lon:124.1556,
        tideStation:"ISHIGAKI",
        jmaOfficeCode:"474000",
        jmaAreaName:"石垣島地方",
        jmaTempAreaName:"石垣島"
    }
};

const UTECH_AREA_STORAGE_KEY = "utechSelectedArea";

let selectedUtechAreaKey = "naha";

function toggleLogoInfo(){
    const popup = document.getElementById("logoInfoPopup");
    if(popup) popup.classList.toggle("active");
}

function closeLogoInfoOnOutsideClick(event){
    const popup = document.getElementById("logoInfoPopup");
    const button = document.querySelector(".logo-info-button");
    if(!popup || !popup.classList.contains("active")) return;
    if(popup.contains(event.target) || (button && button.contains(event.target))) return;
    popup.classList.remove("active");
}

function getAnalysisCharts(){
    return [
        ...analysisCompareGraphs.map(graphId=>analysisCompareCharts[graphId]),
        ...analysisDiffGraphs.map(graphId=>analysisDiffCharts[graphId])
    ].filter(Boolean);
}

function escapeHtml(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// 利用者ID履歴はブラウザ共通。読取・JSON解析失敗時は空配列へ戻す。
// saveUserIdHistoryは同じIDを除いて先頭へ追加し、最新10件を保存する。
function getUserIdHistory(){
    try{
        return JSON.parse(localStorage.getItem("usui_user_id_history")) || [];
    }catch(e){
        return [];
    }
}

function saveUserIdHistory(userId){
    const history = getUserIdHistory()
        .filter(id=>id && id !== userId);

    history.unshift(userId);
    localStorage.setItem("usui_user_id_history", JSON.stringify(history.slice(0,10)));
    updateUserIdHistoryList();
}

function updateUserIdHistoryList(){
    const select = document.getElementById("userIdHistorySelect");

    if(select){
        select.innerHTML = '<option value="">履歴</option>';
    }

    getUserIdHistory().forEach(userId=>{
        if(select){
            const option = document.createElement("option");
            option.value = userId;
            option.textContent = userId;
            select.appendChild(option);
        }
    });
    document.querySelectorAll('[data-plus-history]').forEach(select=>{
        const selected = select.value;
        select.replaceChildren(new Option('履歴', ''));
        getUserIdHistory().forEach(id=>select.add(new Option(id,id)));
        select.value = selected;
    });
}

function refreshVisibleCharts(){
    requestAnimationFrame(()=>{
        document.querySelectorAll(".tab-panel.active canvas").forEach(canvas=>{
            const chart = Chart.getChart(canvas);

            if(chart){
                chart.resize();
                chart.update("none");
            }
        });
    });
}

// === グラフの描画プラグイン・ツールチップ同期 ===
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

const midnightLinePlugin = {
    id:"midnightLinePlugin",
    afterDraw(chart){
        const xScale = chart.scales.x;
        const chartArea = chart.chartArea;

        if(!xScale || !chartArea) return;

        const min = xScale.min;
        const max = xScale.max;

        let d = new Date(min);
        d.setHours(0,0,0,0);

        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1;

        while(d.getTime() <= max){
            const x = xScale.getPixelForValue(d.getTime());

            if(x >= chartArea.left && x <= chartArea.right){
                ctx.beginPath();
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.stroke();
            }

            d = new Date(d.getTime() + 24*60*60*1000);
        }

        ctx.restore();
    }
};

const rainfallTooltipPlugin = {
    id:"rainfallTooltipPlugin",
    afterEvent(chart, args){
        if(!chart || !chart.canvas || chart.canvas.id !== "rainChart") return;

        const event = args.event;
        const xScale = chart.scales.x;
        const chartArea = chart.chartArea;

        if(!event || !xScale || !chartArea) return;

        if(event.type === "mouseout"){
            hideRainfallTooltip();
            return;
        }

        if(
            event.type !== "mousemove" &&
            event.type !== "touchstart" &&
            event.type !== "touchmove"
        ){
            return;
        }

        const inChartArea =
            event.x >= chartArea.left &&
            event.x <= chartArea.right &&
            event.y >= chartArea.top &&
            event.y <= chartArea.bottom;

        if(!inChartArea){
            hideRainfallTooltip();
            return;
        }

        const xValue = xScale.getValueForPixel(event.x);
        const buckets = Array.isArray(chart.$rainfallBuckets) ? chart.$rainfallBuckets : [];
        const bucket = buckets.find(item=>
            xValue >= Number(item.x) &&
            xValue < Number(item.x) + 60*60*1000
        );

        if(!bucket){
            hideRainfallTooltip();
            return;
        }

        showRainfallTooltip(chart, bucket, event);
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
        const isLatestValue = syncedCrosshairLatest[getChartSyncGroup(chart)] === true;
        ctx.save();

        active.forEach(activePoint=>{
            const datasetIndex = activePoint.datasetIndex;
            const index = activePoint.index;
            const dataset = chart.data.datasets[datasetIndex];
            const meta = chart.getDatasetMeta(datasetIndex);
            const point = meta.data[index];

            if(!dataset || !dataset.data[index] || isAuxiliaryChartDataset(dataset)) return;

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

const voltTargetZonePlugin = {
    id:"voltTargetZonePlugin",
    beforeDatasetsDraw(chart){
        if(chart.canvas.id !== "voltChart") return;

        const yScale = chart.scales.y;
        const chartArea = chart.chartArea;

        if(!yScale || !chartArea) return;

        const ctx = chart.ctx;
        const redTop = yScale.getPixelForValue(12);
        const orangeTop = yScale.getPixelForValue(12.75);

        ctx.save();

        ctx.fillStyle = "rgba(255, 159, 64, 0.18)";
        ctx.fillRect(
            chartArea.left,
            orangeTop,
            chartArea.right - chartArea.left,
            redTop - orangeTop
        );

        ctx.restore();
    }
};

const syncedCrosshairPlugin = {
    id:"syncedCrosshairPlugin",
    afterEvent(chart, args){
        const event = args.event;
        const xScale = chart.scales.x;
        const chartArea = chart.chartArea;
        const syncGroup = getChartSyncGroup(chart);

        if(!event || !xScale || !chartArea) return;

        if(event.type === "mouseout"){
            if(lastTouchChart === chart && Date.now() - lastTouchChartEventAt < 1500){
                const heldXValue = syncedCrosshairValues[syncGroup];
                if(heldXValue !== null) syncAllChartTooltips(heldXValue, chart);
                args.changed = true;
                return;
            }
            clearSyncedTooltips(chart);
            return;
        }

        const isTouchEvent = event.type === "touchstart" || event.type === "touchmove";
        if(event.type !== "mousemove" && !isTouchEvent) return;

        if(isTouchEvent){
            lastTouchChart = chart;
            lastTouchChartEventAt = Date.now();
        }

        clearOtherSyncedTooltipGroups(syncGroup);

        const inLatestZone =
            event.x > chartArea.right &&
            event.x <= chart.width &&
            event.y >= 0 &&
            event.y <= chart.height;
        const inChartArea =
            event.x >= chartArea.left &&
            event.x <= chartArea.right &&
            event.y >= chartArea.top &&
            event.y <= chartArea.bottom;

        if(!inChartArea && !inLatestZone){
            clearSyncedTooltips(chart);
            return;
        }

        let xValue = inLatestZone
            ? getLatestChartXValue(chart)
            : getNearestChartXValue(chart, xScale.getValueForPixel(event.x));
        if(xValue === null){
            clearSyncedTooltips(chart);
            return;
        }

        if(!inLatestZone && chart.canvas.id === "reviewTempChartP11"){
            const reviewP01Chart = reviewCharts.find(reviewChart=>
                reviewChart && reviewChart.canvas.id === "reviewTempChartP01"
            );
            const reviewP01XValue = getNearestChartXValue(reviewP01Chart, xValue);
            if(reviewP01XValue !== null) xValue = reviewP01XValue;
        }

        syncedCrosshairValues[syncGroup] = xValue;
        syncedCrosshairLatest[syncGroup] = inLatestZone;
        syncAllChartTooltips(xValue, chart);
        args.changed = true;
    },
    afterDraw(chart){
        const syncGroup = getChartSyncGroup(chart);
        const syncedCrosshairValue = syncedCrosshairValues[syncGroup];
        if(syncedCrosshairValue === null || syncedCrosshairValue === undefined) return;

        const xScale = chart.scales.x;
        const chartArea = chart.chartArea;

        if(!xScale || !chartArea) return;
        if(syncedCrosshairValue < xScale.min || syncedCrosshairValue > xScale.max) return;

        const x = xScale.getPixelForValue(syncedCrosshairValue);
        const ctx = chart.ctx;

        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = syncedCrosshairLatest[syncGroup] ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
    }
};

function getChartSyncGroup(chart){
    if(chart && chart.canvas && chart.canvas.id.indexOf("review") === 0) return "review";
    if(chart && chart.canvas && maintenanceCanvasIdSet.has(chart.canvas.id)) return "maintenance";
    if(chart && chart.canvas && chart.canvas.id.indexOf("analysis") === 0) return "analysis";
    if(chart && chart.canvas && ["wbgtChart", "wbgtGlobeChart"].includes(chart.canvas.id)) return "wbgt";
    return "main";
}

function getMainSyncedTooltipCharts(){
    return allCharts.filter(chart=>
        chart && chart.canvas && chart.canvas.id.indexOf("analysis") !== 0
    );
}

function getSyncedTooltipCharts(sourceChart){
    const syncGroup = getChartSyncGroup(sourceChart);
    if(syncGroup === "review"){
        return reviewCharts;
    }

    if(syncGroup === "maintenance"){
        return maintenanceCharts;
    }

    if(syncGroup === "analysis") return getAnalysisCharts();
    if(syncGroup === "wbgt") return [wbgtChart, wbgtGlobeChart].filter(Boolean);
    return getMainSyncedTooltipCharts();
}

function getSyncedTooltipChartsByGroup(syncGroup){
    if(syncGroup === "review") return reviewCharts;
    if(syncGroup === "maintenance") return maintenanceCharts;
    if(syncGroup === "analysis") return getAnalysisCharts();
    if(syncGroup === "wbgt") return [wbgtChart, wbgtGlobeChart].filter(Boolean);
    return getMainSyncedTooltipCharts();
}

function isAuxiliaryChartDataset(dataset){
    return !dataset || dataset.label === "ゼロライン" || dataset.excludeFromLatestValue === true;
}

function isValidChartPoint(point){
    if(!point || point.x === null || point.x === undefined) return false;
    if(point.y === null || point.y === undefined) return false;
    return Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
}

function getLatestChartXValue(chart){
    if(!chart || !chart.data || !Array.isArray(chart.data.datasets)) return null;

    let latestValue = null;

    chart.data.datasets.forEach((dataset, datasetIndex)=>{
        if(chart.isDatasetVisible && !chart.isDatasetVisible(datasetIndex)) return;
        if(isAuxiliaryChartDataset(dataset) || !Array.isArray(dataset.data)) return;

        dataset.data.forEach(point=>{
            if(!isValidChartPoint(point)) return;
            const xValue = Number(point.x);
            if(latestValue === null || xValue > latestValue) latestValue = xValue;
        });
    });

    return latestValue;
}

function getNearestChartXValue(chart, xValue){
    if(!chart || !chart.data || !Array.isArray(chart.data.datasets)) return null;

    let nearestValue = null;
    let nearestDiff = Infinity;

    chart.data.datasets.forEach((dataset, datasetIndex)=>{
        if(chart.isDatasetVisible && !chart.isDatasetVisible(datasetIndex)) return;
        if(isAuxiliaryChartDataset(dataset) || !Array.isArray(dataset.data)) return;

        dataset.data.forEach(point=>{
            if(!isValidChartPoint(point)) return;

            const diff = Math.abs(Number(point.x) - Number(xValue));
            if(diff < nearestDiff){
                nearestDiff = diff;
                nearestValue = Number(point.x);
            }
        });
    });

    return nearestValue;
}

function getNearestPointIndexAtXValue(data, xValue){
    if(!data || !data.length) return -1;

    let nearestIndex = -1;
    let nearestDiff = Infinity;

    data.forEach((point, index)=>{
        if(!isValidChartPoint(point)) return;

        const diff = Math.abs(Number(point.x) - Number(xValue));
        if(diff < nearestDiff){
            nearestDiff = diff;
            nearestIndex = index;
        }
    });

    return nearestIndex;
}

function getSyncedTooltipDatasetKey(dataset, datasetIndex){
    if(!dataset) return String(datasetIndex);
    return dataset.tooltipGroup || dataset.label || String(datasetIndex);
}

function syncChartTooltip(chart, xValue){
    if(!chart || !chart.scales || !chart.scales.x || !chart.chartArea) return;

    const xScale = chart.scales.x;

    if(xValue < xScale.min || xValue > xScale.max){
        chart.setActiveElements([]);

        if(chart.tooltip && chart.tooltip.setActiveElements){
            chart.tooltip.setActiveElements([], { x:0, y:0 });
        }

        chart.draw();
        return;
    }

    const activeByDatasetKey = new Map();

    chart.data.datasets.forEach((dataset, datasetIndex)=>{
        if(chart.isDatasetVisible && !chart.isDatasetVisible(datasetIndex)) return;
        if(isAuxiliaryChartDataset(dataset) || !Array.isArray(dataset.data)) return;

        const index = getNearestPointIndexAtXValue(dataset.data, xValue);
        if(index < 0) return;
        const point = dataset.data[index];
        const diff = Math.abs(Number(point.x) - Number(xValue));
        const datasetKey = getSyncedTooltipDatasetKey(dataset, datasetIndex);
        const current = activeByDatasetKey.get(datasetKey);
        if(current && current.diff <= diff) return;

        activeByDatasetKey.set(datasetKey, {
            datasetIndex:datasetIndex,
            index:index,
            diff:diff
        });
    });
    const active = Array.from(activeByDatasetKey.values()).map(item=>({
        datasetIndex:item.datasetIndex,
        index:item.index
    }));

    const x = xScale.getPixelForValue(xValue);
    const y = chart.chartArea.bottom;

    chart.setActiveElements(active);

    if(chart.tooltip && chart.tooltip.setActiveElements){
        chart.tooltip.setActiveElements(active, { x:x, y:y });
    }

    chart.draw();
}

function syncAllChartTooltips(xValue, sourceChart){
    getSyncedTooltipCharts(sourceChart).forEach(chart=>{
        syncChartTooltip(chart, xValue);
    });
}

function clearSyncedTooltips(sourceChart){
    clearSyncedTooltipGroup(getChartSyncGroup(sourceChart));
}

function clearSyncedTooltipGroup(syncGroup){
    syncedCrosshairValues[syncGroup] = null;
    syncedCrosshairLatest[syncGroup] = false;
    getSyncedTooltipChartsByGroup(syncGroup).forEach(chart=>{
        if(chart){
            chart.setActiveElements([]);

            if(chart.tooltip && chart.tooltip.setActiveElements){
                chart.tooltip.setActiveElements([], { x:0, y:0 });
            }

            chart.update("none");
        }
    });
}

function clearOtherSyncedTooltipGroups(activeGroup){
    Object.keys(syncedCrosshairValues).forEach(syncGroup=>{
        if(syncGroup !== activeGroup && syncedCrosshairValues[syncGroup] !== null){
            clearSyncedTooltipGroup(syncGroup);
        }
    });
}

function clearAllSyncedTooltips(){
    Object.keys(syncedCrosshairValues).forEach(clearSyncedTooltipGroup);
    lastTouchChart = null;
    lastTouchChartEventAt = 0;
    hideRainfallTooltip();
}

function handleOutsideChartTouch(event){
    if(event.target && event.target.closest && event.target.closest("canvas")) return;
    clearAllSyncedTooltips();
}

validateExternalLibraries();

Chart.register(
    chartBackgroundPlugin,
    midnightLinePlugin,
    rainfallTooltipPlugin,
    voltTargetZonePlugin,
    syncedCrosshairPlugin,
    pointLabelPlugin
);

Chart.Tooltip.positioners.crosshairBottom = function(elements, eventPosition){
    const chartArea = this.chart.chartArea;

    return {
        x:eventPosition.x,
        y:chartArea.bottom,
        xAlign:"center",
        yAlign:"bottom"
    };
};

function formatTime(value){
    const d = new Date(value);
    const mo = String(d.getMonth() + 1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    const h = String(d.getHours()).padStart(2,"0");
    const m = String(d.getMinutes()).padStart(2,"0");
    return mo + "月" + da + "日 " + h + "時" + m + "分";
}

// === 水蒸気量・露点の計算 ===
/**
 * 気温temp（℃）と相対湿度hum（%）から、水蒸気量（g/㎥）を返す。
 * hum=100で飽和水蒸気量となり、実際の水蒸気量との差をこの画面の「飽差」として使う。
 * ここでの飽差の単位はg/㎥。変数名vpdだけから圧力の単位と解釈しないこと。
 * この関数自身は欠損・入力範囲を検証しない。呼び出し側の条件も確認する。
 * 同じ式がdownload_csv.phpにもあるため、将来式を変更する際は両方を確認する。
 * 要確認：この式と係数を採用した出典・適用範囲。
 */
function calcVapor(temp, hum){
    const es = 6.1078 * Math.pow(10, (7.5 * temp) / (237.3 + temp));
    const ea = es * hum / 100;
    return 216.7 * (ea / (temp + 273.15));
}

/**
 * 気温temp（℃）と相対湿度hum（%）から、露点温度（℃）を返す。
 * log(hum/100)を含み、この関数内では湿度0以下や欠損を除外しない。
 * parseData側では温湿度のnull・NaNと湿度が正であることを確認し、不成立ならdewをnullにする。
 * 要確認：係数17.27・237.7を採用した出典・適用範囲。
 */
function calcDewPoint(temp, hum){
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temp) / (b + temp)) + Math.log(hum / 100);
    return (b * alpha) / (a - alpha);
}

// === グラフの共通設定・ズーム・初期範囲 ===
function createRightYAxis(leftAxisOptions){
    return {
        ...leftAxisOptions,
        position:"right",
        grid:{
            drawOnChartArea:false
        },
        afterDataLimits(scale){
            const leftScale = scale.chart.scales.y;
            if(leftScale){
                scale.min = leftScale.min;
                scale.max = leftScale.max;
            }
        }
    };
}

function formatIntegerAxisTick(value){
    return Number(value).toFixed(0);
}

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
                    onZoomComplete({chart}){ syncZoom(chart); }
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
            const syncGroup = getChartSyncGroup(chart);
            if(syncedCrosshairLatest[syncGroup] && syncedCrosshairValues[syncGroup] !== null){
                return "最新　" + formatTime(syncedCrosshairValues[syncGroup]);
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

function syncZoom(sourceChart){

    if(syncingZoom) return;
    syncingZoom = true;

    const xScale = sourceChart.scales.x;
    const tempHumChartGroups = [["tempChartP01", "tempChartP11"], ["humChartP01", "humChartP11"]];
    const tempHumChartGroup = tempHumChartGroups.find(group=>group.includes(sourceChart.canvas.id));
    const co2ChartIds = ["co2Chart", "co2OutsideChart"];
    const isCo2Source = co2ChartIds.includes(sourceChart.canvas.id);
    const co2DiffChartIds = ["co2DiffChart"];
    const isCo2DiffSource = co2DiffChartIds.includes(sourceChart.canvas.id);
    const solarChartIds = ["solarChart"];
    const isSolarSource = solarChartIds.includes(sourceChart.canvas.id);

    allCharts.forEach(chart=>{
        if(chart && chart !== sourceChart){
            const preserveCo2Y = isCo2DiffSource && co2ChartIds.includes(chart.canvas.id) && chart.scales.y
                ? {
                    y:{ min:chart.scales.y.min, max:chart.scales.y.max },
                    yRight:chart.scales.yRight ? { min:chart.scales.yRight.min, max:chart.scales.yRight.max } : null
                }
                : null;

            if(chart.zoomScale){
                chart.zoomScale("x", { min:xScale.min, max:xScale.max }, "none");
            }else{
                chart.options.scales.x.min = xScale.min;
                chart.options.scales.x.max = xScale.max;
                chart.update("none");
            }

            if(preserveCo2Y){
                chart.options.scales.y.min = preserveCo2Y.y.min;
                chart.options.scales.y.max = preserveCo2Y.y.max;
                if(preserveCo2Y.yRight && chart.options.scales.yRight){
                    chart.options.scales.yRight.min = preserveCo2Y.yRight.min;
                    chart.options.scales.yRight.max = preserveCo2Y.yRight.max;
                }
                chart.update("none");
            }

            if(tempHumChartGroup && sourceChart.canvas.id === tempHumChartGroup[0] && isMainAxisLinked(sourceChart.canvas.id === 'tempChartP01' ? 'temperature' : 'humidity') && tempHumChartGroup.includes(chart.canvas.id) && sourceChart.scales.y){
                const yRange = { min:sourceChart.scales.y.min, max:sourceChart.scales.y.max };
                if(chart.zoomScale){
                    chart.zoomScale("y", yRange, "none");
                    if(chart.scales.yRight) chart.zoomScale("yRight", yRange, "none");
                }else{
                    setLinearYAxis(chart, yRange);
                    chart.update("none");
                }
            }

            if(isCo2Source && sourceChart.canvas.id === 'co2Chart' && isMainAxisLinked('co2') && co2ChartIds.includes(chart.canvas.id) && sourceChart.scales.y){
                const co2YRange = {
                    min:sourceChart.scales.y.min,
                    max:sourceChart.scales.y.max
                };
                if(chart.zoomScale){
                    chart.zoomScale("y", co2YRange, "none");
                    if(chart.scales.yRight){
                        chart.zoomScale("yRight", co2YRange, "none");
                    }
                }else{
                    chart.options.scales.y.min = co2YRange.min;
                    chart.options.scales.y.max = co2YRange.max;
                    if(chart.options.scales.yRight){
                        chart.options.scales.yRight.min = co2YRange.min;
                        chart.options.scales.yRight.max = co2YRange.max;
                    }
                    chart.update("none");
                }
            }

            if(isSolarSource && solarChartIds.includes(chart.canvas.id) && sourceChart.scales.y){
                const solarYRange = {
                    min:sourceChart.scales.y.min,
                    max:sourceChart.scales.y.max
                };
                if(chart.zoomScale){
                    chart.zoomScale("y", solarYRange, "none");
                    if(chart.scales.yRight){
                        chart.zoomScale("yRight", solarYRange, "none");
                    }
                }else{
                    chart.options.scales.y.min = solarYRange.min;
                    chart.options.scales.y.max = solarYRange.max;
                    if(chart.options.scales.yRight){
                        chart.options.scales.yRight.min = solarYRange.min;
                        chart.options.scales.yRight.max = solarYRange.max;
                    }
                    chart.update("none");
                }
            }
        }
    });

    matchMainAxisLinks();
    syncingZoom = false;
}

function saveInitialScaleLimits(chart){
    if(!chart || chart.initialScaleLimits) return;

    chart.initialScaleLimits = {};

    Object.keys(chart.options.scales).forEach(scaleId=>{
        const scale = chart.options.scales[scaleId];
        chart.initialScaleLimits[scaleId] = {
            min:scale.min,
            max:scale.max
        };
    });
}

function restoreInitialScaleLimits(chart){
    if(!chart || !chart.initialScaleLimits) return;

    Object.keys(chart.initialScaleLimits).forEach(scaleId=>{
        if(!chart.options.scales[scaleId]) return;

        chart.options.scales[scaleId].min = chart.initialScaleLimits[scaleId].min;
        chart.options.scales[scaleId].max = chart.initialScaleLimits[scaleId].max;
    });
}

function redrawChart(chart){
    if(!chart) return;

    if(chart.stop) chart.stop();
    restoreInitialScaleLimits(chart);
    chart.update("none");
    chart.resize();
    chart.draw();
}

function getJapanDateParts(date){
    const parts = new Intl.DateTimeFormat("ja-JP", {
        timeZone:"Asia/Tokyo",
        year:"numeric",
        month:"numeric",
        day:"numeric",
        hour:"numeric",
        minute:"numeric",
        hour12:false,
        hourCycle:"h23"
    }).formatToParts(date);
    const values = {};

    parts.forEach(part=>{
        if(part.type !== "literal"){
            values[part.type] = Number(part.value);
        }
    });

    return values;
}

function getDayOfYear(year, month, day){
    const start = Date.UTC(year, 0, 1);
    const current = Date.UTC(year, month - 1, day);
    return Math.floor((current - start) / (24*60*60*1000)) + 1;
}

function normalizeDegrees(value){
    return ((value % 360) + 360) % 360;
}

function normalizeHours(value){
    return ((value % 24) + 24) % 24;
}

function getSelectedUtechArea(){
    return UTECH_AREAS[selectedUtechAreaKey] || UTECH_AREAS.naha;
}

// 地域はブラウザ共通の固定キー。未保存・未登録のキーならnahaを使う。
// 地域の変更・保存は本体のhandleUtechAreaChangeが担当する。
// Plusでは選択欄なしで保存値を復元し、DIFの日の出・日没計算にも使う。
function restoreUtechAreaSelection(){
    const select = document.getElementById("utechAreaSelect");
    const savedKey = localStorage.getItem(UTECH_AREA_STORAGE_KEY);
    selectedUtechAreaKey = UTECH_AREAS[savedKey] ? savedKey : "naha";

    if(!select) return;

    select.innerHTML = Object.keys(UTECH_AREAS).map(key=>{
        const area = UTECH_AREAS[key];
        return '<option value="' + key + '">' + escapeHtml(area.label) + '</option>';
    }).join("");
    select.value = selectedUtechAreaKey;
}

function calculateSunTime(year, month, day, isSunrise, area){
    const latitude = area && Number.isFinite(area.lat) ? area.lat : 26.2124;
    const longitude = area && Number.isFinite(area.lon) ? area.lon : 127.6792;
    const zenith = 90.833;
    const dayOfYear = getDayOfYear(year, month, day);
    const lngHour = longitude / 15;
    const t = dayOfYear + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const meanAnomaly = (0.9856 * t) - 3.289;
    const trueLongitude = normalizeDegrees(
        meanAnomaly +
        (1.916 * Math.sin(meanAnomaly * Math.PI / 180)) +
        (0.020 * Math.sin(2 * meanAnomaly * Math.PI / 180)) +
        282.634
    );
    let rightAscension = Math.atan(0.91764 * Math.tan(trueLongitude * Math.PI / 180)) * 180 / Math.PI;
    rightAscension = normalizeDegrees(rightAscension);
    rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
    rightAscension /= 15;

    const sinDeclination = 0.39782 * Math.sin(trueLongitude * Math.PI / 180);
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const cosHourAngle = (
        Math.cos(zenith * Math.PI / 180) -
        (sinDeclination * Math.sin(latitude * Math.PI / 180))
    ) / (cosDeclination * Math.cos(latitude * Math.PI / 180));

    if(cosHourAngle > 1 || cosHourAngle < -1) return null;

    let hourAngle = isSunrise
        ? 360 - (Math.acos(cosHourAngle) * 180 / Math.PI)
        : Math.acos(cosHourAngle) * 180 / Math.PI;
    hourAngle /= 15;

    const localTime = normalizeHours(
        hourAngle + rightAscension - (0.06571 * t) - 6.622 - lngHour + 9
    );
    const hour = Math.floor(localTime);
    const minute = Math.round((localTime - hour) * 60);
    const adjustedHour = minute === 60 ? hour + 1 : hour;
    const adjustedMinute = minute === 60 ? 0 : minute;

    return String(adjustedHour).padStart(2, "0") + ":" + String(adjustedMinute).padStart(2, "0");
}

function timeTextToMinutes(timeText){
    const parts = String(timeText || "").split(":");
    if(parts.length !== 2) return null;

    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if(isNaN(hour) || isNaN(minute)) return null;

    return hour * 60 + minute;
}

function formatSqlDateTime(date){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");

    return y + "-" + m + "-" + d + " " + h + ":" + min + ":" + s;
}

function isMobileView(){
    return window.matchMedia("(max-width: 600px)").matches ||
        window.innerWidth <= 600 ||
        document.documentElement.clientWidth <= 600;
}

function applyChartXRange(chart, minTime, maxTime){
    if(!chart || !chart.options.scales || !chart.options.scales.x) return;

    chart.options.scales.x.min = minTime.getTime();
    chart.options.scales.x.max = maxTime.getTime();

    if(chart.initialScaleLimits && chart.initialScaleLimits.x){
        chart.initialScaleLimits.x.min = minTime.getTime();
        chart.initialScaleLimits.x.max = maxTime.getTime();
    }

    chart.update("none");
}

// === 測定値APIとの通信 ===
/**
 * 指定した利用者・Point IDの測定値をget_data.phpから取得する。
 * rangeは任意の{start, end}。両方ある場合だけ期間を送り、省略時はAPI既定の直近72時間。
 * 戻り値は{pointId, data, error}。成功時はdataが配列、errorはnull。
 * HTTP・応答形式・通信の失敗はdata:[]と説明文にまとめ、呼び出し元で表示できる形にする。
 * タイマーは10秒後に通信を中断するが、fetchの応答取得時点で解除する（本文読取完了までの制限ではない）。
 * 配列内の各測定値の変換は、呼び出し元からparseDataへ渡して行う。
 */
async function fetchDataSafe(userId, pointId, range){

    const controller = new AbortController();
    const timeoutId = setTimeout(()=>controller.abort(), 10000);

    try{
        let url = `get_data.php?user_id=${encodeURIComponent(userId)}&point_id=${encodeURIComponent(pointId)}`;
        if(range && range.start && range.end){
            url += `&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
        }

        console.log("[get_data.php fetch]", {
            input_user_id:getMainUserIdInputValue(),
            user_id:userId,
            point_id:pointId,
            start:range && range.start ? range.start : "",
            end:range && range.end ? range.end : "",
            url:url
        });

        if(pointId === "P26"){
            console.log("[CO2_外気_P26] request:", url);
        }

        const res = await fetch(url, {
            signal:controller.signal,
            cache:"no-store"
        });

        clearTimeout(timeoutId);

        if(!res.ok){
            return { pointId, data:[], error:`${pointId}：HTTPエラー ${res.status}` };
        }

        const text = await res.text();

        if(!text.trim()){
            return { pointId, data:[], error:`${pointId}：空のレスポンス` };
        }

        let data;

        try{
            data = JSON.parse(text);
        }catch(e){
            return { pointId, data:[], error:`${pointId}：JSON形式ではありません` };
        }

        if(!Array.isArray(data)){
            return { pointId, data:[], error:`${pointId}：配列データではありません` };
        }

        if(pointId === "P26"){
            console.log("[CO2_外気_P26] JSON取得件数:", data.length);
        }

        return { pointId, data, error:null };

    }catch(e){

        clearTimeout(timeoutId);

        if(e.name === "AbortError"){
            return { pointId, data:[], error:`${pointId}：通信タイムアウト` };
        }

        return { pointId, data:[], error:`${pointId}：通信エラー` };
    }
}

// === グラフ別の取得条件とデータなし表示の補助 ===
function formatNoDataFetchConditions(requests, startTime, endTime){
    const requestText = requests
        .map(request=>
            "user_id=" + request.userId +
            " / point_id=" + request.pointId +
            (request.fields && request.fields.length ? " / 項目=" + request.fields.join(",") : "")
        )
        .join("、");

    return requestText + " / 期間=" + formatSqlDateTime(startTime) + " ～ " + formatSqlDateTime(endTime);
}

function setChartNoDataState(canvasId, chart, requests, startTime, endTime){
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;

    const container = canvas.parentElement;
    if(!container) return;

    let notice = container.querySelector(".chart-no-data");

    if(chart){
        canvas.style.display = "";
        if(notice) notice.remove();
        return;
    }

    canvas.style.display = "none";

    if(!notice){
        notice = document.createElement("div");
        notice.className = "chart-no-data";
        container.appendChild(notice);
    }

    notice.innerText = "No data：" + formatNoDataFetchConditions(requests, startTime, endTime);
}

function clearChartNoDataState(canvasId){
    const canvas = document.getElementById(canvasId);
    if(!canvas || !canvas.parentElement) return;

    canvas.style.display = "";

    const notice = canvas.parentElement.querySelector(".chart-no-data");
    if(notice) notice.remove();
}

// === APIの測定値をグラフ・計算用の内部形式へ変換 ===
/**
 * dataはAPIから取得した配列、minTimeは採用する日時の下限（この日時を含む）。
 * recorded_atをDateのxとミリ秒のxValueへ変換し、無効な日時・下限より前の行は除外する。
 * 日時の解釈にはnew Dateを使い、この関数では日本時間への明示的な補正を行わない。
 * temperature/humidity/voltageをtemp/hum/voltへ、風速なども内部項目へ対応付ける。
 * CO2・日射はAPI項目名の別表記にも対応する（優先順は下の分岐を参照）。
 * null・undefinedはnullを維持し、それ以外はNumberで変換する。数値変換後のNaNはここでは除外しない。
 * 温湿度が数値で湿度が正の場合はdew（露点）も計算する。並び順は入力のまま維持する。
 */
function parseData(data, minTime){

    return data.map(d=>{
        const date = new Date(d.recorded_at);
        const co2Value = d.co2 !== null && d.co2 !== undefined ? d.co2 : d.CO2;
        const solarValue = d.solar_radiation !== null && d.solar_radiation !== undefined
            ? d.solar_radiation
            : d.solar !== null && d.solar !== undefined
                ? d.solar
                : d.SOLAR_RADIATION;

        const temp = d.temperature !== null && d.temperature !== undefined ? Number(d.temperature) : null;
        const hum = d.humidity !== null && d.humidity !== undefined ? Number(d.humidity) : null;

        return {
            x:date,
            xValue:date.getTime(),
            temp:temp,
            hum:hum,
            dew:temp !== null && hum !== null && !isNaN(temp) && !isNaN(hum) && hum > 0
                ? calcDewPoint(temp, hum)
                : null,
            co2:co2Value !== null && co2Value !== undefined ? Number(co2Value) : null,
            solar:solarValue !== null && solarValue !== undefined ? Number(solarValue) : null,
            volt:d.voltage !== null && d.voltage !== undefined ? Number(d.voltage) : null,
            windSpeedAvg:d.wind_speed_avg !== null && d.wind_speed_avg !== undefined ? Number(d.wind_speed_avg) : null,
            windSpeedMax:d.wind_speed_max !== null && d.wind_speed_max !== undefined ? Number(d.wind_speed_max) : null
        };
    }).filter(d=>
        !isNaN(d.xValue) &&
        d.x >= minTime
    );
}

function hideRainfallTooltip(){
    const tooltip = document.getElementById("rainfallTooltip");
    if(tooltip) tooltip.hidden = true;
}

function getRainfallJapanParts(timestamp){
    const parts = new Intl.DateTimeFormat("ja-JP", {
        timeZone:"Asia/Tokyo",
        month:"numeric",
        day:"numeric",
        hour:"2-digit",
        minute:"2-digit",
        hour12:false,
        hourCycle:"h23"
    }).formatToParts(new Date(Number(timestamp)));
    const values = {};

    parts.forEach(part=>{
        if(part.type !== "literal") values[part.type] = part.value;
    });

    return values;
}

function showRainfallTooltip(chart, bucket, event){
    const tooltip = document.getElementById("rainfallTooltip");
    if(!tooltip) return;

    const start = getRainfallJapanParts(bucket.x);
    const endTimestamp = bucket.is_current_hour
        ? chart.$rainfallEnd
        : Number(bucket.x) + 59*60*1000;
    const end = getRainfallJapanParts(endTimestamp);
    const title = document.createElement("div");
    title.className = "rainfall-tooltip-title";
    title.textContent =
        Number(start.month) + "月" + Number(start.day) + "日 " +
        start.hour + ":" + start.minute + "～" + end.hour + ":" + end.minute;

    tooltip.replaceChildren(title);

    if(bucket.missing){
        const missing = document.createElement("div");
        missing.textContent = (chart.$rainfallQuantity || "雨量") + "データ欠測";
        tooltip.appendChild(missing);
    }else{
        const hourly = document.createElement("div");
        hourly.textContent = "1時間" + (chart.$rainfallQuantity || "雨量") + " " + Number(bucket.hourly_rainfall).toFixed(2) + " " + (chart.$rainfallUnit || "mm");
        tooltip.appendChild(hourly);

        const daily = document.createElement("div");
        daily.textContent = "日積算" + (chart.$rainfallQuantity || "雨量") + " " + Number(bucket.daily_cumulative).toFixed(2) + " " + (chart.$rainfallUnit || "mm");
        tooltip.appendChild(daily);
    }

    tooltip.hidden = false;
    tooltip.style.left = Math.max(10, Math.min(Number(event.x), chart.width - 10)) + "px";
    tooltip.style.top = Math.max(chart.chartArea.top + 45, chart.chartArea.bottom - 4) + "px";
}

// === 縦軸の入力値・設定とグラフの作成 ===
function getAxisValue(id, fallback){
    const el = document.getElementById(id);
    if(!el || el.value === "") return fallback;
    const value = el ? Number(el.value) : NaN;
    return isNaN(value) ? fallback : value;
}

function getFiniteInputValue(id){
    const el = document.getElementById(id);
    if(!el || String(el.value).trim() === "") return null;
    const value = Number(el.value);
    return Number.isFinite(value) ? value : null;
}

function getTempHumAxis(pointId){
    return {
        humMin:getAxisValue("humMin" + pointId, humMin),
        humMax:getAxisValue("humMax" + pointId, humMax),
        tempMin:getAxisValue("tempMin" + pointId, tempMin),
        tempMax:getAxisValue("tempMax" + pointId, tempMax)
    };
}

function getCo2Axis(){
    return {
        min:getAxisValue("co2Min", co2Min),
        max:getAxisValue("co2Max", co2Max)
    };
}

function getCo2OutsideAxis(){
    return {
        min:getAxisValue("co2OutsideMin", co2OutsideMin),
        max:getAxisValue("co2OutsideMax", co2OutsideMax)
    };
}

function getCo2DiffAxis(){
    return {
        min:getAxisValue("co2DiffMin", co2DiffMin),
        max:getAxisValue("co2DiffMax", co2DiffMax)
    };
}

function getOutsideDiffAxis(){
    return {
        min:getAxisValue("outsideDiffMin", outsideDiffAxisMin),
        max:getAxisValue("outsideDiffMax", outsideDiffAxisMax)
    };
}

function getSingleAxis(key){
    if(key === "co2"){
        return getCo2Axis();
    }

    if(key === "co2Outside"){
        return getCo2OutsideAxis();
    }

    if(key === "solar"){
        return {
            min:getAxisValue("solarMin", solarAxisMin),
            max:getAxisValue("solarMax", solarAxisMax)
        };
    }

    if(key === "dew"){
        return {
            min:getAxisValue("dewMin", dewAxisMin),
            max:getAxisValue("dewMax", dewAxisMax)
        };
    }

    if(key === "volt"){
        return {
            min:getAxisValue("voltMin", voltAxisMin),
            max:getAxisValue("voltMax", voltAxisMax)
        };
    }

    return {
        min:undefined,
        max:undefined
    };
}

function setLinearYAxis(chart, axis){
    if(!chart || !chart.options || !chart.options.scales || !axis) return;

    if(chart.options.scales.y){
        chart.options.scales.y.min = axis.min;
        chart.options.scales.y.max = axis.max;
    }

    if(chart.options.scales.yRight){
        chart.options.scales.yRight.min = axis.min;
        chart.options.scales.yRight.max = axis.max;
    }
}

function getChartDisplayMinTime(canvasId, minTime, maxTime){
    const mobile24HourCharts = [
        "maintenanceTempChartP01",
        "maintenanceTempChartP11",
        "tempChartP01",
        "humChartP01",
        "tempChartP02",
        "tempChartP11",
        "humChartP11",
        "tempChartP12",
        "outsideDiffChart",
        "mainVaporChart",
        "mainDewPointChart",
        "solarChart",
        "solarChartP32",
        "solarDiffChartP31P32",
        "co2Chart",
        "co2OutsideChart",
        "co2DiffChart",
        "co2ChartP22",
        "co2DiffChartP21P22",
        "co2ChartP27",
        "co2DiffChartP26P27",
        "diffChart",
        "diffChartP11P12"
    ];

    if(maintenanceMode === "custom" && maintenanceCanvasIdSet.has(canvasId)){
        return minTime;
    }

    if(
        window.matchMedia("(max-width: 600px)").matches &&
        mobile24HourCharts.includes(canvasId)
    ){
        return new Date(maxTime.getTime() - 24*60*60*1000);
    }

    return minTime;
}

function destroyExistingChart(canvasId){
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;

    const chart = Chart.getChart(canvasId);
    if(chart){
        clearSyncedTooltipGroup(getChartSyncGroup(chart));
        chart.destroy();
    }
}

function getChartCanvas(canvasId){
    const canvas = document.getElementById(canvasId);
    if(!canvas){
        console.warn("[Chart skip] canvas not found:", canvasId);
        return null;
    }
    return canvas;
}

function hasChartSourceData(data){
    return Array.isArray(data) && data.length > 0;
}

const vaporTargetBandPlugin = {
    id:"vaporTargetBand",
    beforeUpdate(chart){
        if(!["mainVaporChart", "reviewVaporChart"].includes(chart.canvas.id)) return;
        chart.options.scales.y.min = 0;
        chart.options.scales.yRight.min = 0;
    },
    beforeDatasetsDraw(chart){
        if(!["mainVaporChart", "reviewVaporChart"].includes(chart.canvas.id)) return;
        const area = chart.chartArea;
        const scale = chart.scales.y;
        if(!area || !scale) return;
        const min = Math.max(5, scale.min);
        const max = Math.min(10, scale.max);
        if(max <= min) return;
        const top = Math.max(area.top, scale.getPixelForValue(max));
        const bottom = Math.min(area.bottom, scale.getPixelForValue(min));
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = "rgba(31, 143, 95, 0.12)";
        ctx.fillRect(area.left, top, area.right - area.left, bottom - top);
        ctx.restore();
    }
};

function createVaporChart(canvasId, parsed, minTime, maxTime){

    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(parsed)) return null;

    destroyExistingChart(canvasId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);
    const vaporOptions = baseOptions(displayMinTime,maxTime);

    if(!window.matchMedia("(max-width: 600px)").matches){
        vaporOptions.plugins = {
            ...vaporOptions.plugins,
            legend:{
                labels:{
                    font:{ size:11 },
                    boxWidth:18,
                    boxHeight:10,
                    padding:6
                }
            }
        };
    }

    const yAxisOptions = {
        ticks:{
            color:"#000"
        },
        title:{
            display:true,
            text:"g/㎥",
            color:"#000"
        }
    };
    const vaporSaturatedData = parsed
        .filter(d=>d.temp !== null && !isNaN(d.temp))
        .map(d=>({
            x:d.xValue,
            y:calcVapor(d.temp,100)
    }));
    const vaporData = parsed
        .filter(d=>d.temp !== null && d.hum !== null && !isNaN(d.temp) && !isNaN(d.hum))
        .map(d=>({x:d.xValue,y:calcVapor(d.temp,d.hum)}));
    const vaporDeficitData = parsed
        .filter(d=>d.temp !== null && d.hum !== null && !isNaN(d.temp) && !isNaN(d.hum))
        .map(d=>({x:d.xValue,y:calcVapor(d.temp,100)-calcVapor(d.temp,d.hum)}));

    if(!vaporSaturatedData.length && !vaporData.length && !vaporDeficitData.length) return null;

    return new Chart(canvas,{
        type:"line",
        plugins:[vaporTargetBandPlugin],
        data:{
            datasets:[
{
    label:"飽和水蒸気量 (g/㎥)",
    data:vaporSaturatedData,
    borderColor:"rgb(255, 0, 0)",
    backgroundColor:"rgba(255, 0, 0, 0.14)",
    pointBackgroundColor:"rgb(255, 0, 0)",
    pointRadius:0,
    borderWidth:2,
    tension:0.2,
    fill:false
},

                {
                    label:"水蒸気量 (g/㎥)",
                    data:vaporData,
                    borderColor:"rgb(75, 192, 192)",
                    backgroundColor:"rgba(75, 192, 192, 0.14)",
                    pointBackgroundColor:"rgb(75, 192, 192)",
                    pointRadius:0,
                    borderWidth:2,
                    tension:0.2,
                    fill:false
                },
                {
                    label:"飽差 (g/㎥)",
                    data:vaporDeficitData,
                    borderColor:"rgb(255, 159, 64)",
                    backgroundColor:"rgba(255, 159, 64, 0.20)",
                    pointBackgroundColor:"rgb(255, 159, 64)",
                    pointRadius:0,
                    borderWidth:2,
                    tension:0.2,
                    fill:true
                }
            ]
        },
        options:{
            ...vaporOptions,
            scales:{
                ...vaporOptions.scales,
y:yAxisOptions,
yRight:createRightYAxis(yAxisOptions)
            }
        }
    });
}

function createOutsideDiffChart(canvasId, p01, p11, minTime, maxTime){

    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(p01) || !hasChartSourceData(p11)) return null;

    destroyExistingChart(canvasId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);

    const tempDiffData = [];
    const toleranceMs = 360 * 1000;
    const axis = getOutsideDiffAxis();
    const yAxisOptions = {
        min:axis.min,
        max:axis.max,
        ticks:{
            stepSize:1,
            color:"#000"
        },
        title:{
            display:true,
            text:"℃",
            color:"#000"
        }
    };
    const zeroOriginFill = {
        target:"origin",
        above:"rgba(120, 120, 120, 0.18)",
        below:"rgba(120, 120, 120, 0.18)"
    };

    p01.forEach(d=>{

        let nearestP11 = null;
        let nearestDiff = Infinity;

        p11.forEach(p=>{
            const diff = Math.abs(d.xValue - p.xValue);

            if(diff < nearestDiff){
                nearestDiff = diff;
                nearestP11 = p;
            }
        });

        if(!nearestP11) return;
        if(nearestDiff > toleranceMs) return;

        if(d.temp !== null && nearestP11.temp !== null && !isNaN(d.temp) && !isNaN(nearestP11.temp)){
            tempDiffData.push({ x:d.xValue, y:d.temp - nearestP11.temp });
        }

    });

    if(!tempDiffData.length) return null;

    return new Chart(canvas,{
        type:"line",
        data:{
            datasets:[{
                label:"温度差 (℃)",
                data:tempDiffData,
                borderColor:"rgba(0, 0, 0, 0.55)",
                backgroundColor:"rgba(0, 0, 0, 0.08)",
                pointBackgroundColor:"rgb(255, 0, 0)",
                pointRadius:0,
                borderWidth:2,
                tension:0.2,
                fill:zeroOriginFill
            },
            {
                label:"ゼロライン",
                data:[
                    {x:minTime, y:0},
                    {x:maxTime, y:0}
                ],
                borderColor:"rgba(0, 120, 255, 0.8)",
                borderWidth:1.5,
                pointRadius:0,
                tension:0,
                fill:false
            }]
        },
        options:{
            ...baseOptions(displayMinTime,maxTime),
            plugins:{
                ...baseOptions(displayMinTime,maxTime).plugins,
                legend:{
                    labels:{
                        filter(item){
                            return item.text !== "ゼロライン";
                        }
                    }
                }
            },
            scales:{
                ...baseOptions(displayMinTime,maxTime).scales,
y:yAxisOptions,
yRight:createRightYAxis(yAxisOptions)
            }
        }
    });
}

function createCo2DiffChart(canvasId, p21, p26, minTime, maxTime){

    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(p21) || !hasChartSourceData(p26)) return null;

    destroyExistingChart(canvasId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);

    const co2DiffData = [];
    const toleranceMs = 360 * 1000;
    const axis = getCo2DiffAxis();
    const yAxisOptions = {
        min:axis.min,
        max:axis.max,
        ticks:{
            color:"#000",
            callback:formatIntegerAxisTick
        },
        title:{
            display:true,
            text:"ppm",
            color:"#000"
        }
    };
    const zeroOriginFill = {
        target:"origin",
        above:"rgba(120, 120, 120, 0.18)",
        below:"rgba(120, 120, 120, 0.18)"
    };

    p21.forEach(d=>{
        let nearestP26 = null;
        let nearestDiff = Infinity;

        p26.forEach(p=>{
            const diff = Math.abs(d.xValue - p.xValue);

            if(diff < nearestDiff){
                nearestDiff = diff;
                nearestP26 = p;
            }
        });

        if(!nearestP26 || nearestDiff > toleranceMs) return;

        if(d.co2 !== null && nearestP26.co2 !== null && !isNaN(d.co2) && !isNaN(nearestP26.co2)){
            co2DiffData.push({ x:d.xValue, y:d.co2 - nearestP26.co2 });
        }
    });

    if(!co2DiffData.length) return null;

    return new Chart(canvas,{
        type:"line",
        data:{
            datasets:[{
                label:"CO2差 (ppm)",
                data:co2DiffData,
                borderColor:"rgba(0, 0, 0, 0.55)",
                backgroundColor:"rgba(0, 0, 0, 0.08)",
                pointBackgroundColor:"rgb(255, 0, 0)",
                pointRadius:0,
                borderWidth:2,
                tension:0.2,
                fill:zeroOriginFill
            },
            {
                label:"ゼロライン",
                data:[
                    {x:minTime, y:0},
                    {x:maxTime, y:0}
                ],
                borderColor:"rgba(0, 120, 255, 0.8)",
                borderWidth:1.5,
                pointRadius:0,
                tension:0,
                fill:false
            }]
        },
        options:{
            ...baseOptions(displayMinTime,maxTime),
            plugins:{
                ...baseOptions(displayMinTime,maxTime).plugins,
                legend:{
                    labels:{
                        filter(item){
                            return item.text !== "ゼロライン";
                        }
                    }
                }
            },
            scales:{
                ...baseOptions(displayMinTime,maxTime).scales,
                y:yAxisOptions,
                yRight:createRightYAxis(yAxisOptions)
            }
        }
    });
}

// 単一系列の線・点の基本設定を共通化する。styleのlabel/color/backgroundColor/fillは呼出側で指定する。
// データ抽出・軸・期間・ズーム・既存グラフの破棄・初期範囲保存は呼出側の責任。
// pluginsは任意。WBGTの警戒帯など、そのグラフ固有のプラグインを渡す。
function createSingleLineChart(canvas, data, style, options, plugins){
    const config = {
        type:"line",
        data:{datasets:[{
            label:style.label,
            data:data,
            borderColor:style.color,
            backgroundColor:style.backgroundColor,
            pointBackgroundColor:style.color,
            pointRadius:0,
            borderWidth:2,
            tension:0.2,
            fill:style.fill
        }]},
        options:options
    };
    if(plugins) config.plugins = plugins;
    return new Chart(canvas, config);
}

function createSingleChart(canvasId, parsed, key, label, unit, minTime, maxTime, axisOverride){

    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(parsed)) return null;

    destroyExistingChart(canvasId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);
    const dataKey = key === "co2Outside" ? "co2" : key;

    let color = "rgb(153, 102, 255)";
    let bg = "rgba(153, 102, 255, 0.15)";
    let fill = false;
    let fillStops = null;

    if(key === "solar"){
        color = "rgb(255, 205, 86)";
        bg = "rgba(255, 205, 86, 0.2)";
        fill = true;
        fillStops = [
            "rgba(255, 159, 64, 0.30)",
            "rgba(255, 159, 64, 0.12)",
            "rgba(255, 159, 64, 0.00)"
        ];
    }

    if(key === "co2" || key === "co2Outside"){
        color = "rgb(70, 70, 70)";
        bg = "rgba(70, 70, 70, 0.12)";
        fill = true;
        fillStops = [
            "rgba(90, 90, 90, 0.22)",
            "rgba(90, 90, 90, 0.08)",
            "rgba(90, 90, 90, 0.00)"
        ];
    }

    if(key === "volt"){
        color = "rgb(0, 160, 80)";
        bg = "rgba(0, 160, 80, 0.2)";
    }

    const axis = axisOverride || getSingleAxis(key);
    const chartData = parsed
        .filter(d=>d[dataKey] !== null && !isNaN(d[dataKey]))
        .map(d=>({x:d.xValue,y:d[dataKey]}));

    if(!chartData.length) return null;

    const backgroundColor = fillStops
        ? function(context){
            const {chart} = context;
            const {ctx, chartArea} = chart;

            if(!chartArea){
                return fillStops[1];
            }

            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, fillStops[0]);
            gradient.addColorStop(0.18, fillStops[1]);
            gradient.addColorStop(0.50, fillStops[2]);

            return gradient;
        }
        : bg;

    const yAxisOptions = {
        min:axis.min,
        max:axis.max,

        ticks:{
            stepSize: key === "volt" ? 1 : dataKey === "co2" ? 50 : undefined,
            color:"#000",

            callback:function(value){
                if(key === "dew" || dataKey === "co2"){
                    return formatIntegerAxisTick(value);
                }
                if(key === "volt"){
                    return Math.round(value);
                }
                return value;
            }
        },

        title:{
            display:true,
            text:unit,
            color:"#000"
        }
    };

    return createSingleLineChart(canvas, chartData, {
        label:label, color:color, backgroundColor:backgroundColor, fill:fill
    }, {
        ...baseOptions(displayMinTime,maxTime),
        scales:{
            ...baseOptions(displayMinTime,maxTime).scales,
            y:yAxisOptions,
            yRight:createRightYAxis(yAxisOptions)
        }
    });
}

function getMainAxisLinkPairs(){
    return [
        {key:'temperature', checkbox:'mainTempAxisLink', inside:tempChartP01, outside:tempChartP11, inputs:['tempMinP11','tempMaxP11']},
        {key:'humidity', checkbox:'mainHumAxisLink', inside:humChartP01, outside:humChartP11, inputs:['humMinP11','humMaxP11']},
        {key:'co2', checkbox:'mainCo2AxisLink', inside:co2Chart, outside:co2OutsideChart, inputs:['co2OutsideMin','co2OutsideMax']}
    ];
}

function isMainAxisLinked(key){
    const pair=getMainAxisLinkPairs().find(pair=>pair.key===key);
    return !!document.getElementById(pair.checkbox)?.checked;
}

function matchMainAxisLinks(){
    getMainAxisLinkPairs().forEach(pair=>{
        if(!isMainAxisLinked(pair.key) || !pair.inside?.scales.y || !pair.outside) return;
        setLinearYAxis(pair.outside,{min:pair.inside.scales.y.min,max:pair.inside.scales.y.max});
        pair.outside.update('none');
    });
}

function applySingleYAxis(chart, key, axisOverride){
    if(!chart) return;

    const axis = axisOverride || getSingleAxis(key);
    setLinearYAxis(chart, axis);

    chart.update();
}
