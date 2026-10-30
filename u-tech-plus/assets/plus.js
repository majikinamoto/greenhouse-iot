// U-Tech Plus専用：排液量・アラート・分析・WBGT・過去データ・メンテ。
// utech-shared.jsの後に読み込む。6タブの初期化・ID復元は末尾のDOMContentLoadedを参照する。
let maintenanceTempChartP01;
let maintenanceTempChartP11;
let tempChartP02;

let tempChartP12;

let diffChart;

let diffChartP11P12;

let solarChartP32;

let solarDiffChartP31P32;

let voltChart;

let vaporChartP11;

let dewChart;

let dewChartP11;

let co2ChartP22;

let co2DiffChartP21P22;

let co2ChartP27;

let co2DiffChartP26P27;

let analysisCompareData = {};

let analysisCompareMeta = {};

let syncingAnalysisZoom = false;

let wbgtDataRequestSequence = 0;

let wbgtLoadedKey = "";

let wbgtLastLoadedAt = 0;

let reviewDifP01 = [];

let reviewDifDateValue = "";

let reviewDifDisplayState = "idle";

let reviewDataRequestSequence = 0;

let reviewDataLoadingKey = "";

let reviewDifPeriodP01 = [];

let reviewDifRows = [];

let reviewDifPeriodDisplayState = "idle";

let reviewDifPeriodRequestSequence = 0;

let reviewDifPeriodLoadingKey = "";

let reviewDifPeriodEndDateValue = "";

let syncingMaintenanceZoom = false;

let syncingReviewZoom = false;

let maintenanceStartTime = null;

let maintenanceEndTime = null;

let maintenanceDataRequestSequence = 0;

let maintenanceDataLoadingKey = "";

let maintenanceLoadedUserId = "";

let maintenanceLoadedRangeKey = "";

let maintenanceLastLoadedAt = 0;

let maintenanceLastLoadSucceeded = false;

let maintenanceKnownUserId = "";

const reviewAxisDefaults = {
    tempHum:{ humMin:40, humMax:100, tempMin:20, tempMax:40 },
    outsideDiff:{ min:-1, max:5 },
    vapor:{ min:0, max:undefined },
    solar:{ min:undefined, max:undefined },
    co2:{ min:300, max:700 },
    co2Outside:{ min:300, max:700 },
    co2Diff:{ min:-250, max:250 }
};

let diffAxisMin = -5;

let diffAxisMax = 5;

let alertFormUserId = "";

let alertSettingsBusy = false;

let activeAlertSettingExists = false;

// WBGT計算では観測気圧の代わりに1013.25 hPaを固定使用する。
// 時刻の対応は8分以内。現在値では各センサーの時刻が現在の前後30分以内であることも要求する。
// 要確認：固定気圧・時刻差・鮮度の条件を採用した理由。
const WBGT_PRESSURE_HPA = 1013.25;

const WBGT_PAIR_TOLERANCE_MS = 8*60*1000;

const WBGT_CURRENT_FRESHNESS_MS = 30*60*1000;

// === ブラウザへの設定保存：保存範囲の案内 ===
// localStorageは同じブラウザの同じオリジン（スキーム・ホスト・ポート）内の保存領域。
// 以下のWBGT固定キーは従来の取得元設定。utechPlus_v1_{tab}によるタブ別保存とは別。
// 本体の表示・非表示/縦軸リンクのuser_id別設定は、ここでは変更しない。
// 通知設定はPHP経由でサーバーへ保存し、ブラウザの入力条件保存とは分けて扱う。
const wbgtStorageKeys = {
    userId:"utech_wbgt_user_id",
    tempHumPointId:"utech_wbgt_temp_hum_point_id",
    globePointId:"utech_wbgt_globe_point_id"
};

const alertPointLabels = {
    P01:"P01 ハウス内",
    P02:"P02 メンテ用ハウス内",
    P11:"P11 外気"
};

// === 分析用の比較設定・グラフ・差分 ===
function getMainUserIdInputValue(){return getPlusUserId(activePlusTab);}

// 分析の比較元はグラフIDと項目名で区別する。メインの利用者IDはキーに含まない。
// restore/saveAnalysisCompareSetting系が使用し、未保存の入力値は空欄として復元する。
function getAnalysisCompareStorageKey(graphId, field){
    return "usui_analysis_" + graphId + "_" + field;
}

function restoreAnalysisCompareSettings(){
    analysisCompareGraphs.forEach(graphId=>{
        const userId = document.getElementById("analysisUserId" + graphId);
        const pointId = document.getElementById("analysisPointId" + graphId);

        if(userId){
            userId.value = localStorage.getItem(getAnalysisCompareStorageKey(graphId, "user_id")) || "";
        }

        if(pointId){
            pointId.value = localStorage.getItem(getAnalysisCompareStorageKey(graphId, "point_id")) || "";
        }
    });
}

function saveAnalysisCompareSetting(graphId){
    const userId = document.getElementById("analysisUserId" + graphId);
    const pointId = document.getElementById("analysisPointId" + graphId);

    localStorage.setItem(
        getAnalysisCompareStorageKey(graphId, "user_id"),
        userId ? userId.value.trim() : ""
    );

    localStorage.setItem(
        getAnalysisCompareStorageKey(graphId, "point_id"),
        pointId ? pointId.value.trim() : ""
    );
}

function setAnalysisCompareTitle(graphId, userId, pointId){
    const title = document.getElementById("analysisTitle" + graphId);
    if(!title) return;
    const displayNameMap = {
        A:"マスターグラフ（M）",
        B:"グラフA",
        C:"グラフB"
    };
    const displayName = displayNameMap[graphId] || "グラフ" + graphId;

    title.innerText = userId && pointId
        ? displayName + "（" + userId + " / " + pointId + "）"
        : displayName;
}

function getAnalysisTempAxis(graphId){
    return {
        min:getAxisValue("analysisTempMin" + graphId, 20),
        max:getAxisValue("analysisTempMax" + graphId, 40)
    };
}

function getAnalysisDiffAxis(graphId){
    return {
        min:getAxisValue("analysisDiffMin" + graphId, -8),
        max:getAxisValue("analysisDiffMax" + graphId, 8)
    };
}

function setAnalysisTempAxisInputs(axis){
    analysisCompareGraphs.forEach(graphId=>{
        const minInput = document.getElementById("analysisTempMin" + graphId);
        const maxInput = document.getElementById("analysisTempMax" + graphId);

        if(minInput) minInput.value = axis.min;
        if(maxInput) maxInput.value = axis.max;
    });
}

function registerAnalysisChart(chart){
    if(!chart) return;

    allCharts = allCharts.filter(c=>c && c.canvas && c.canvas.id !== chart.canvas.id);
}

function getAnalysisChartGroup(chart){
    if(!chart || !chart.canvas) return "";

    if(/^analysisChart[A-C]$/.test(chart.canvas.id)){
        return "temp";
    }

    if(/^analysisDiffChart[B-C]$/.test(chart.canvas.id)){
        return "diff";
    }

    return "";
}

function createAnalysisTempChart(graphId, parsed, minTime, maxTime){
    const canvasId = "analysisChart" + graphId;
    const canvas = getChartCanvas(canvasId);
    if(!canvas) return null;

    destroyExistingChart(canvasId);
    allCharts = allCharts.filter(c=>!c || !c.canvas || c.canvas.id !== canvasId);
    analysisCompareCharts[graphId] = null;
    if(!hasChartSourceData(parsed)) return null;
    const axis = getAnalysisTempAxis(graphId);
    const lineColor = graphId === "A" ? "rgb(0, 160, 80)" : "rgb(70, 130, 220)";
    const fillStops = graphId === "A"
        ? [
            "rgba(0, 160, 80, 0.55)",
            "rgba(0, 160, 80, 0.25)",
            "rgba(0, 160, 80, 0.00)"
        ]
        : [
            "rgba(70, 130, 220, 0.50)",
            "rgba(70, 130, 220, 0.22)",
            "rgba(70, 130, 220, 0.00)"
        ];
    const options = baseOptions(minTime,maxTime);

    options.plugins = {
        ...options.plugins,
        crosshair:{
            ...options.plugins.crosshair,
            sync:{
                ...options.plugins.crosshair.sync,
                group:4
            }
        },
        legend:{
            display:false
        },
        zoom:{
            ...options.plugins.zoom,
            zoom:{
                ...options.plugins.zoom.zoom,
                onZoomComplete({chart}){ syncAnalysisZoom(chart); }
            }
        }
    };

    const chartData = parsed
        .filter(d=>d.temp !== null && !isNaN(d.temp))
        .map(d=>({x:d.xValue,y:d.temp}));

    if(!chartData.length) return null;

    const chart = new Chart(canvas,{
        type:"line",
        data:{
            datasets:[{
                label:"温度 (℃)",
                data:chartData,
                borderColor:lineColor,
                backgroundColor:function(context){
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if(!chartArea){
                        return graphId === "A" ? "rgba(0, 160, 80, 0.30)" : "rgba(70, 130, 220, 0.28)";
                    }
                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    if(graphId === "A"){
                        gradient.addColorStop(0, "rgba(0, 160, 80, 0.70)");
                        gradient.addColorStop(0.15, "rgba(0, 160, 80, 0.38)");
                        gradient.addColorStop(0.50, "rgba(0, 160, 80, 0.10)");
                        gradient.addColorStop(1.00, "rgba(0, 160, 80, 0.00)");
                    }else{
                        gradient.addColorStop(0, "rgba(70, 130, 220, 0.70)");
                        gradient.addColorStop(0.15, "rgba(70, 130, 220, 0.36)");
                        gradient.addColorStop(0.50, "rgba(70, 130, 220, 0.10)");
                        gradient.addColorStop(1.00, "rgba(70, 130, 220, 0.00)");
                    }
                    return gradient;
                },
                pointBackgroundColor:lineColor,
                pointRadius:0,
                borderWidth:2,
                tension:0.2,
                fill:true
            }]
        },
        options:{
            ...options,
            scales:{
                ...options.scales,
                y:{
                    min:axis.min,
                    max:axis.max,
                    ticks:{
                        stepSize:5,
                        color:"#000"
                    },
                    title:{
                        display:true,
                        text:"℃",
                        color:"#000"
                    }
                }
            }
        }
    });

    saveInitialScaleLimits(chart);
    analysisCompareCharts[graphId] = chart;
    registerAnalysisChart(chart);
    return chart;
}

function syncAnalysisZoom(sourceChart){
    if(syncingAnalysisZoom) return;
    if(!sourceChart || !sourceChart.scales || !sourceChart.scales.x || !sourceChart.scales.y) return;

    syncingAnalysisZoom = true;

    const xMin = sourceChart.scales.x.min;
    const xMax = sourceChart.scales.x.max;
    const yMin = sourceChart.scales.y.min;
    const yMax = sourceChart.scales.y.max;
    const sourceGroup = getAnalysisChartGroup(sourceChart);

    getAnalysisCharts().forEach(chart=>{
        if(!chart || chart === sourceChart || !chart.options || !chart.options.scales) return;

        chart.options.scales.x.min = xMin;
        chart.options.scales.x.max = xMax;

        if(getAnalysisChartGroup(chart) === sourceGroup){
            chart.options.scales.y.min = yMin;
            chart.options.scales.y.max = yMax;
        }

        chart.update("none");
    });

    syncingAnalysisZoom = false;
}

function applyAnalysisTempYAxis(graphId){
    const axis = getAnalysisTempAxis(graphId);
    setAnalysisTempAxisInputs(axis);

    analysisCompareGraphs.forEach(graphId=>{
        const chart = analysisCompareCharts[graphId];
        if(!chart || !chart.options || !chart.options.scales || !chart.options.scales.y) return;

        chart.options.scales.y.min = axis.min;
        chart.options.scales.y.max = axis.max;

        chart.update();
    });
}

function applyAnalysisDiffYAxis(graphId){
    const axis = getAnalysisDiffAxis(graphId);
    const chart = analysisDiffCharts[graphId];
    if(!chart || !chart.options || !chart.options.scales || !chart.options.scales.y) return;

    chart.options.scales.y.min = axis.min;
    chart.options.scales.y.max = axis.max;

    chart.update();
}

function resetAnalysisZoom(){
    clearSyncedTooltipGroup("analysis");
    syncingAnalysisZoom = true;

    const referenceChart = getAnalysisCharts()
        .find(chart=>chart && chart.initialScaleLimits);
    const tempReferenceChart = analysisCompareGraphs
        .map(graphId=>analysisCompareCharts[graphId])
        .find(chart=>chart && chart.initialScaleLimits && chart.initialScaleLimits.y);
    const diffReferenceChart = analysisDiffGraphs
        .map(graphId=>analysisDiffCharts[graphId])
        .find(chart=>chart && chart.initialScaleLimits && chart.initialScaleLimits.y);

    const referenceLimits = referenceChart ? referenceChart.initialScaleLimits : null;
    const tempYLimits = tempReferenceChart ? tempReferenceChart.initialScaleLimits.y : null;
    const diffYLimits = diffReferenceChart ? diffReferenceChart.initialScaleLimits.y : null;

    getAnalysisCharts().forEach(chart=>{
        if(!chart) return;

        if(chart.resetZoom) chart.resetZoom("none");

        if(referenceLimits && chart.options && chart.options.scales){
            if(chart.options.scales.x && referenceLimits.x){
                chart.options.scales.x.min = referenceLimits.x.min;
                chart.options.scales.x.max = referenceLimits.x.max;
            }

            const yLimits = getAnalysisChartGroup(chart) === "diff" ? diffYLimits : tempYLimits;

            if(chart.options.scales.y && yLimits){
                chart.options.scales.y.min = yLimits.min;
                chart.options.scales.y.max = yLimits.max;
            }

            chart.update("none");
            chart.resize();
            chart.draw();
        }else{
            redrawChart(chart);
        }
    });

    requestAnimationFrame(()=>{
        getAnalysisCharts().forEach(chart=>{
            if(!chart) return;

            if(referenceLimits && chart.options && chart.options.scales){
                if(chart.options.scales.x && referenceLimits.x){
                    chart.options.scales.x.min = referenceLimits.x.min;
                    chart.options.scales.x.max = referenceLimits.x.max;
                }

                const yLimits = getAnalysisChartGroup(chart) === "diff" ? diffYLimits : tempYLimits;

                if(chart.options.scales.y && yLimits){
                    chart.options.scales.y.min = yLimits.min;
                    chart.options.scales.y.max = yLimits.max;
                }

                chart.update("none");
                chart.resize();
                chart.draw();
            }else{
                redrawChart(chart);
            }
        });
        syncingAnalysisZoom = false;
    });
}

function calcAnalysisDiffData(baseData, targetData){
    const diffData = [];
    const toleranceMs = 360 * 1000;

    if(!baseData || !targetData) return diffData;

    baseData.forEach(d=>{
        let nearest = null;
        let nearestDiff = Infinity;

        targetData.forEach(p=>{
            const diff = Math.abs(d.xValue - p.xValue);

            if(diff < nearestDiff){
                nearestDiff = diff;
                nearest = p;
            }
        });

        if(!nearest || nearestDiff > toleranceMs) return;

        if(d.temp !== null && nearest.temp !== null && !isNaN(d.temp) && !isNaN(nearest.temp)){
            diffData.push({
                x:d.xValue,
                y:d.temp - nearest.temp
            });
        }
    });

    return diffData;
}

function setAnalysisDiffTitle(targetGraphId){
    const title = document.getElementById("analysisDiffTitle" + targetGraphId);
    if(!title) return;

    const diffNameMap = {
        B:"グラフ差（M-A）",
        C:"グラフ差（M-B）"
    };
    const diffName = diffNameMap[targetGraphId] || "グラフ差（M-" + targetGraphId + "）";

    title.innerText = diffName;
}

function createAnalysisDiffChart(targetGraphId, minTime, maxTime){
    const canvasId = "analysisDiffChart" + targetGraphId;
    const canvas = getChartCanvas(canvasId);
    if(!canvas) return null;

    destroyExistingChart(canvasId);
    allCharts = allCharts.filter(c=>!c || !c.canvas || c.canvas.id !== canvasId);
    analysisDiffCharts[targetGraphId] = null;
    setAnalysisDiffTitle(targetGraphId);

    const axis = getAnalysisDiffAxis(targetGraphId);
    const options = baseOptions(minTime,maxTime);

    options.plugins = {
        ...options.plugins,
        crosshair:{
            ...options.plugins.crosshair,
            sync:{
                ...options.plugins.crosshair.sync,
                group:4
            }
        },
        legend:{
            display:false
        },
        zoom:{
            ...options.plugins.zoom,
            zoom:{
                ...options.plugins.zoom.zoom,
                onZoomComplete({chart}){ syncAnalysisZoom(chart); }
            }
        }
    };

    const zeroOriginFill = {
        target:"origin",
        above:"rgba(120, 120, 120, 0.18)",
        below:"rgba(120, 120, 120, 0.18)"
    };

    const diffData = calcAnalysisDiffData(analysisCompareData.A, analysisCompareData[targetGraphId]);
    if(!diffData.length) return null;

    const chart = new Chart(canvas,{
        type:"line",
        data:{
            datasets:[{
                label:"温度差 (℃)",
                data:diffData,
                borderColor:"rgba(0, 0, 0, 0.6)",
                backgroundColor:"rgba(0, 0, 0, 0.08)",
                pointBackgroundColor:"rgba(0, 0, 0, 0.6)",
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
            ...options,
            scales:{
                ...options.scales,
                y:{
                    min:axis.min,
                    max:axis.max,
                    ticks:{
                        stepSize:2,
                        color:"#000"
                    },
                    title:{
                        display:true,
                        text:"差",
                        color:"#000"
                    }
                }
            }
        }
    });

    saveInitialScaleLimits(chart);
    analysisDiffCharts[targetGraphId] = chart;
    registerAnalysisChart(chart);
}

function refreshAnalysisDiffCharts(minTime, maxTime){
    if(!analysisCompareData.A) return;

    analysisDiffGraphs.forEach(graphId=>{
        if(analysisCompareData[graphId]){
            createAnalysisDiffChart(graphId, minTime, maxTime);
        }else{
            setAnalysisDiffTitle(graphId);
        }
    });
}

async function loadAnalysisCompareChart(graphId){
    clearSyncedTooltipGroup("analysis");
    const userIdInput = document.getElementById("analysisUserId" + graphId);
    const pointIdInput = document.getElementById("analysisPointId" + graphId);
    const userId = userIdInput ? userIdInput.value.trim() : "";
    const pointId = pointIdInput ? pointIdInput.value.trim() : "";

    saveAnalysisCompareSetting(graphId);

    if(!userId || !pointId){
        setAnalysisCompareTitle(graphId, "", "");
        alert("グラフ" + graphId + "のuser_idとpoint_idを入力してください");
        return;
    }

    setAnalysisCompareTitle(graphId, userId, pointId);

    const now = new Date();
    const minTime = new Date(now.getTime() - 72*60*60*1000);
    const result = await fetchDataSafe(userId, pointId);
    const parsed = parseData(result.data, minTime);
    analysisCompareData[graphId] = parsed;
    analysisCompareMeta[graphId] = {
        userId:userId,
        pointId:pointId
    };

    createAnalysisTempChart(graphId, parsed, minTime, now);
    refreshAnalysisDiffCharts(minTime, now);

    if(result.error){
        alert(result.error);
    }
}

// === WBGT：設定・計算・表示・データ取得 ===
// 従来のWBGT取得元キーを復元する。未保存IDはusui_user_id、なければ空欄。
// 初期化ではこの後restorePlusTabが、タブ別保存値や引継ぎURLのIDを適用する。
// Point IDの既定値は温湿度P11・黒球P51。applyWbgtSettingsで同じ固定キーへ保存する。
function restoreWbgtSettings(){
    const userId = document.getElementById("wbgtUserId");
    const tempHumPointId = document.getElementById("wbgtTempHumPointId");
    const globePointId = document.getElementById("wbgtGlobePointId");
    if(userId){
        userId.value = localStorage.getItem(wbgtStorageKeys.userId) ||
            localStorage.getItem("usui_user_id") || "";
    }
    if(tempHumPointId){
        tempHumPointId.value = localStorage.getItem(wbgtStorageKeys.tempHumPointId) || "P11";
    }
    if(globePointId){
        globePointId.value = localStorage.getItem(wbgtStorageKeys.globePointId) || "P51";
    }
}

function getWbgtSettings(){
    const userId = document.getElementById("wbgtUserId");
    const tempHumPointId = document.getElementById("wbgtTempHumPointId");
    const globePointId = document.getElementById("wbgtGlobePointId");
    return {
        userId:userId ? userId.value.trim() : "",
        tempHumPointId:tempHumPointId ? tempHumPointId.value.trim() : "",
        globePointId:globePointId ? globePointId.value.trim() : ""
    };
}

// 取得元を保存し、前回取得条件を無効化して即時に読み直す。
// タブ切替時の再取得条件（条件変更または前回から5分経過）はswitchTabも参照する。
function applyWbgtSettings(){
    const settings = getWbgtSettings();
    localStorage.setItem(wbgtStorageKeys.userId, settings.userId);
    localStorage.setItem(wbgtStorageKeys.tempHumPointId, settings.tempHumPointId);
    localStorage.setItem(wbgtStorageKeys.globePointId, settings.globePointId);
    wbgtLoadedKey = "";
    loadWbgtData();
}

// null・undefined・空文字を欠損として除き、数値化した値が有限かを確認する。
// 湿度の範囲判定（0より大きく100以下）は計算側で別途行う。
function isFiniteWbgtValue(value){
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

/**
 * WBGT計算用の露点（℃）。入力は気温（℃）と相対湿度（%）。
 * 気温0℃以上と未満で係数を切り替える。一般表示用のcalcDewPointとは式・係数が異なる。
 * 数値化後の非有限値、湿度が0以下・100超、非有限の計算結果はnull。
 * 要確認：係数と0℃を境にした切替の出典・適用範囲。
 */
function calculateWbgtDewPoint(temperature, relativeHumidity){
    const ta = Number(temperature);
    const rh = Number(relativeHumidity);
    if(!Number.isFinite(ta) || !Number.isFinite(rh) || rh <= 0 || rh > 100) return null;

    const isWater = ta >= 0;
    const a = isWater ? 7.5 : 9.5;
    const b = isWater ? 237.3 : 265.5;
    const gamma = Math.log10(rh / 100) + (a * ta) / (b + ta);
    const dewPoint = (b * gamma) / (a - gamma);
    return Number.isFinite(dewPoint) ? dewPoint : null;
}

// 湿球温度の反復計算で使う飽和水蒸気圧。引数は絶対温度（K）。
// 気圧hPaと組み合わせる式の内部関数。入力の検証は呼び出し側に依存する。
// 要確認：式の出典、係数・返り値の圧力単位の定義。
function calculateWbgtSaturationPressure(kelvin){
    const c0 = 26.66082;
    const c1 = 0.0091379024;
    const c2 = 6106.396;
    return Math.exp(c0 - c1 * kelvin - c2 / kelvin);
}

/**
 * 気温（℃）・相対湿度（%）・気圧（hPa）から湿球温度（℃）を推定する。
 * 気圧省略時は固定値を使う。数値化後の非有限値、湿度範囲外、気圧0以下はnull。
 * 湿度100%は気温をそのまま返す。それ以外は露点を求め、Kに変換して反復計算する。
 * 最大50回、更新差が0.1 K未満なら終了。50回到達だけでは失敗扱いにせず最終値を使う。
 * 導関数が非有限・0、更新値が非有限ならnull。結果は露点と気温の間へ収める。
 * 要確認：計算方式の出典、近似精度と適用範囲。
 */
function calculateWetBulbTemperature(temperature, relativeHumidity, pressureHpa){
    const ta = Number(temperature);
    const rh = Number(relativeHumidity);
    const pressure = pressureHpa === undefined ? WBGT_PRESSURE_HPA : Number(pressureHpa);
    if(!Number.isFinite(ta) || !Number.isFinite(rh) || !Number.isFinite(pressure)) return null;
    if(rh <= 0 || rh > 100 || pressure <= 0) return null;
    if(rh === 100) return ta;

    const dewPoint = calculateWbgtDewPoint(ta, rh);
    if(dewPoint === null) return null;

    const taKelvin = ta + 273.15;
    const tdKelvin = dewPoint + 273.15;
    const es = calculateWbgtSaturationPressure(taKelvin);
    const ed = calculateWbgtSaturationPressure(tdKelvin);
    const slope = (es - ed) / (taKelvin - tdKelvin);
    const psychrometric = 0.0006355;
    let twKelvin = (taKelvin * psychrometric * pressure + tdKelvin * slope) /
        (psychrometric * pressure + slope);

    for(let iteration = 0; iteration < 50; iteration++){
        const ew = calculateWbgtSaturationPressure(twKelvin);
        const de = psychrometric * pressure * (taKelvin - twKelvin) - (ew - ed);
        const derivative = ew * (0.0091379024 - 6106.396 / (twKelvin * twKelvin)) -
            psychrometric * pressure;
        if(!Number.isFinite(derivative) || derivative === 0) return null;
        const nextTwKelvin = twKelvin - de / derivative;
        if(!Number.isFinite(nextTwKelvin)) return null;
        if(Math.abs(nextTwKelvin - twKelvin) < 0.1){
            twKelvin = nextTwKelvin;
            break;
        }
        twKelvin = nextTwKelvin;
    }

    const wetBulb = twKelvin - 273.15;
    const lower = Math.min(dewPoint, ta);
    const upper = Math.max(dewPoint, ta);
    return Number.isFinite(wetBulb) ? Math.min(upper, Math.max(lower, wetBulb)) : null;
}

/**
 * 気温ta（℃）・相対湿度rh（%）・黒球温度tg（℃）からWBGTを求める。
 * 黒球温度は専用Point IDのtemperatureを使う。湿球温度twは固定気圧で推定する。
 * 実装式は0.7*tw + 0.2*tg + 0.1*ta。結果と使用値を{wbgt, tw, ta, rh, tg}で返す。
 * 欠損・非有限値、湿度範囲外、湿球温度や結果を算出できない場合はnull。
 * 時刻の鮮度・対応付けはこの関数では確認せず、現在値・系列の処理側が担当する。
 * 要確認：この式を採用した根拠と設置環境への適用条件。
 */
function calculateWbgt(temperature, relativeHumidity, globeTemperature){
    if(
        !isFiniteWbgtValue(temperature) ||
        !isFiniteWbgtValue(relativeHumidity) ||
        !isFiniteWbgtValue(globeTemperature)
    ){
        return null;
    }

    const ta = Number(temperature);
    const rh = Number(relativeHumidity);
    const tg = Number(globeTemperature);
    if(rh <= 0 || rh > 100) return null;
    const tw = calculateWetBulbTemperature(ta, rh, WBGT_PRESSURE_HPA);
    if(tw === null) return null;
    const wbgt = 0.7 * tw + 0.2 * tg + 0.1 * ta;
    if(!Number.isFinite(wbgt)) return null;
    return { wbgt:wbgt, tw:tw, ta:ta, rh:rh, tg:tg };
}

// 現在の表示区分：31以上=危険、28以上31未満=厳重警戒、25以上28未満=警戒、25未満=注意。
// 有効なWBGTの計算後に使う。閾値の出典・適用条件は別途確認が必要。
function getWbgtLevel(value){
    const wbgt = Number(value);
    if(!Number.isFinite(wbgt)) return null;
    if(wbgt >= 31) return { key:"danger", label:"危険" };
    if(wbgt >= 28) return { key:"severe", label:"厳重警戒" };
    if(wbgt >= 25) return { key:"warning", label:"警戒" };
    return { key:"caution", label:"注意" };
}

function setWbgtText(id, text){
    const element = document.getElementById(id);
    if(element) element.innerText = text;
}

function setWbgtCurrentHeadingTime(value){
    const element = document.getElementById("wbgtCurrentHeadingTime");
    if(!element) return;

    const timestamp = value === null || value === "" ? NaN : Number(value);
    let text = "";

    if(Number.isFinite(timestamp)){
        const date = new Date(timestamp);
        if(Number.isFinite(date.getTime())){
            try{
                const parts = getJapanDateParts(date);
                if(Number.isFinite(parts.hour) && Number.isFinite(parts.minute)){
                    text = String(parts.hour).padStart(2, "0") + ":" +
                        String(parts.minute).padStart(2, "0") + "時点";
                }
            }catch(e){}
        }
    }

    element.textContent = text;
    element.hidden = !text;
}

const wbgtLevelClassNames = [
    "wbgt-level-danger", "wbgt-level-severe", "wbgt-level-warning", "wbgt-level-caution"
];

function setWbgtLevelDisplay(level){
    const element = document.getElementById("wbgtLevelNow");
    if(!element) return;
    element.classList.remove(...wbgtLevelClassNames);
    element.textContent = level ? level.label : "－";
    if(level) element.classList.add("wbgt-level-" + level.key);
}

function formatWbgtCurrentTime(value, nowTime){
    const date = new Date(value);
    if(!Number.isFinite(date.getTime())) return "－";
    const current = new Date(Number.isFinite(nowTime) ? nowTime : Date.now());
    const time = String(date.getHours()).padStart(2, "0") + ":" +
        String(date.getMinutes()).padStart(2, "0");
    const isToday = date.getFullYear() === current.getFullYear() &&
        date.getMonth() === current.getMonth() && date.getDate() === current.getDate();
    if(isToday) return time;
    const dateText = (date.getMonth() + 1) + "/" + date.getDate();
    return (date.getFullYear() === current.getFullYear() ? dateText : date.getFullYear() + "/" + dateText) + " " + time;
}

function resetWbgtCurrentDisplay(){
    [
        "wbgtNow", "wbgtTaNow", "wbgtRhNow",
        "wbgtTgNow", "wbgtTwNow", "wbgtTempHumTime", "wbgtGlobeTime"
    ].forEach(id=>setWbgtText(id, "－"));
    setWbgtLevelDisplay(null);
    setWbgtText("wbgtCurrentMessage", "");
    setWbgtCurrentHeadingTime(null);
    renderWbgtGauge(null);
}

// ゲージのマーカー位置だけ20〜36に収め、数値ラベルには元のWBGTを表示する。
// 算出不可の場合はマーカーを隠し、代わりの表示に切り替える。
function renderWbgtGauge(value){
    const gauge = document.getElementById("wbgtGauge");
    const marker = document.getElementById("wbgtGaugeMarker");
    const valueLabel = document.getElementById("wbgtGaugeValue");
    const unavailable = document.getElementById("wbgtGaugeUnavailable");
    const wbgt = Number(value);
    const isAvailable = value !== null && value !== "" && Number.isFinite(wbgt);

    if(!marker || !valueLabel || !unavailable) return;
    marker.hidden = !isAvailable;
    unavailable.hidden = isAvailable;

    if(!isAvailable){
        marker.style.removeProperty("--wbgt-gauge-position");
        valueLabel.textContent = "—";
        if(gauge) gauge.setAttribute("aria-label", "現在WBGTは算出できません");
        return;
    }

    const clippedValue = Math.min(36, Math.max(20, wbgt));
    const position = (clippedValue - 20) / (36 - 20) * 100;
    marker.style.setProperty("--wbgt-gauge-position", position + "%");
    valueLabel.textContent = wbgt.toFixed(1);
    if(gauge) gauge.setAttribute("aria-label", "現在WBGT " + wbgt.toFixed(1));
}

/**
 * 現在値は各配列の末尾を最新として採用する（入力が時刻昇順である前提）。
 * 過去の有効値や最近傍ペアへ戻らず、最新の温湿度と最新の黒球温度だけを検証する。
 * 両時刻が現在の前後30分以内、相互の差が8分以内の場合にWBGTを表示する。
 * 条件不成立時は理由を表示する。先に表示した気温・湿度・黒球温度・湿球温度は残る場合がある。
 * この現在値の鮮度条件と、buildWbgtSeriesの履歴の対応付け条件は異なる。
 */
function renderWbgtCurrent(tempHumData, globeData, nowTime, settings){
    resetWbgtCurrentDisplay();
    const latestTempHum = tempHumData.length ? tempHumData[tempHumData.length - 1] : null;
    const latestGlobe = globeData.length ? globeData[globeData.length - 1] : null;

    if(latestTempHum && Number.isFinite(latestTempHum.xValue)){
        setWbgtCurrentHeadingTime(latestTempHum.xValue);
        setWbgtText("wbgtTempHumTime", formatWbgtCurrentTime(latestTempHum.xValue, nowTime));
    }
    if(latestGlobe && Number.isFinite(latestGlobe.xValue)){
        setWbgtText("wbgtGlobeTime", formatWbgtCurrentTime(latestGlobe.xValue, nowTime));
    }
    if(!latestTempHum){
        setWbgtText("wbgtCurrentMessage", "温湿度データ（" + settings.tempHumPointId + "）を取得できません");
        return;
    }
    if(!latestGlobe){
        setWbgtText("wbgtCurrentMessage", "黒球温度データ（" + settings.globePointId + "）を取得できません");
        return;
    }
    if(isFiniteWbgtValue(latestTempHum.temp)){
        setWbgtText("wbgtTaNow", Number(latestTempHum.temp).toFixed(1) + " ℃");
    }
    if(isFiniteWbgtValue(latestTempHum.hum)){
        setWbgtText("wbgtRhNow", Number(latestTempHum.hum).toFixed(1) + " %");
    }
    if(isFiniteWbgtValue(latestGlobe.temp)){
        setWbgtText("wbgtTgNow", Number(latestGlobe.temp).toFixed(1) + " ℃");
    }
    if(!isFiniteWbgtValue(latestTempHum.temp) || !isFiniteWbgtValue(latestTempHum.hum)){
        setWbgtText("wbgtCurrentMessage", "最新の温湿度データに必要な項目がないため算出できません");
        return;
    }
    if(Number(latestTempHum.hum) <= 0 || Number(latestTempHum.hum) > 100){
        setWbgtText("wbgtCurrentMessage", "最新の相対湿度が不正なため算出できません");
        return;
    }
    if(!isFiniteWbgtValue(latestGlobe.temp)){
        setWbgtText("wbgtCurrentMessage", "最新の黒球温度データにtemperatureがないため算出できません");
        return;
    }
    const latestWetBulb = calculateWetBulbTemperature(
        latestTempHum.temp,
        latestTempHum.hum,
        WBGT_PRESSURE_HPA
    );
    if(latestWetBulb !== null){
        setWbgtText("wbgtTwNow", latestWetBulb.toFixed(1) + " ℃");
    }
    if(!Number.isFinite(latestTempHum.xValue) || !Number.isFinite(latestGlobe.xValue)){
        setWbgtText("wbgtCurrentMessage", "最新データの測定時刻が不正なため算出できません");
        return;
    }

    const currentTime = Number.isFinite(nowTime) ? nowTime : Date.now();
    const tempHumAge = currentTime - latestTempHum.xValue;
    const globeAge = currentTime - latestGlobe.xValue;
    if(Math.abs(tempHumAge) > WBGT_CURRENT_FRESHNESS_MS){
        const reason = tempHumAge > 0 ? "古い" : "現在より先の時刻になっている";
        setWbgtText("wbgtCurrentMessage", "温湿度データが" + reason + "ため算出できません");
        return;
    }
    if(Math.abs(globeAge) > WBGT_CURRENT_FRESHNESS_MS){
        const reason = globeAge > 0 ? "古い" : "現在より先の時刻になっている";
        setWbgtText("wbgtCurrentMessage", "黒球温度データが" + reason + "ため算出できません");
        return;
    }
    if(Math.abs(latestTempHum.xValue - latestGlobe.xValue) > WBGT_PAIR_TOLERANCE_MS){
        setWbgtText("wbgtCurrentMessage", "最新データの時刻差が大きいため算出できません");
        return;
    }

    const result = calculateWbgt(latestTempHum.temp, latestTempHum.hum, latestGlobe.temp);
    if(!result){
        setWbgtText("wbgtCurrentMessage", "最新データからWBGTを算出できません");
        return;
    }
    const level = getWbgtLevel(result.wbgt);
    setWbgtText("wbgtNow", result.wbgt.toFixed(1));
    setWbgtLevelDisplay(level);
    renderWbgtGauge(result.wbgt);
    setWbgtText("wbgtTaNow", result.ta.toFixed(1) + " ℃");
    setWbgtText("wbgtRhNow", result.rh.toFixed(1) + " %");
    setWbgtText("wbgtTgNow", result.tg.toFixed(1) + " ℃");
    setWbgtText("wbgtTwNow", result.tw.toFixed(1) + " ℃");
}

/**
 * 温湿度の各時刻を基準に、時刻差が最小の黒球データを選ぶ。差が8分超ならその点を除外する。
 * 同じ時刻差なら配列で先に見つかった黒球を使う。同じ黒球を複数の基準点に使うこともある。
 * 最近傍の黒球が欠損でも別候補を探し直さず、計算できない組は系列へ追加しない。
 * 出力xは温湿度の時刻、globeXは対応する黒球の時刻。現在値用の30分鮮度条件は適用しない。
 */
function buildWbgtSeries(tempHumData, globeData){
    const wbgtData = [];
    tempHumData.forEach(tempHum=>{
        let nearestGlobe = null;
        let nearestDiff = Infinity;
        globeData.forEach(globe=>{
            const diff = Math.abs(tempHum.xValue - globe.xValue);
            if(diff < nearestDiff){
                nearestDiff = diff;
                nearestGlobe = globe;
            }
        });
        if(!nearestGlobe || nearestDiff > WBGT_PAIR_TOLERANCE_MS) return;
        const result = calculateWbgt(tempHum.temp, tempHum.hum, nearestGlobe.temp);
        if(!result) return;
        wbgtData.push({
            x:tempHum.xValue,
            y:result.wbgt,
            tw:result.tw,
            ta:result.ta,
            rh:result.rh,
            tg:result.tg,
            globeX:nearestGlobe.xValue
        });
    });
    return wbgtData;
}

// 関数名のFiveDayは既存名。現在の取得範囲は「6日前の0時から現在まで」で、当日を含む7日分。
// 日付境界はブラウザのローカル時刻。表示グラフ用の直近72時間とは別の範囲を取得する。
function getWbgtFiveDayRange(nowTime){
    const endTime = nowTime instanceof Date ? new Date(nowTime) : new Date(nowTime || Date.now());
    const startTime = new Date(endTime);
    startTime.setHours(0, 0, 0, 0);
    startTime.setDate(startTime.getDate() - 6);
    return { startTime:startTime, endTime:endTime };
}

// [startTime, endTime)のWBGTを件数で単純平均する。時間間隔の重み付けや欠測の補間はしない。
// 有効な系列点（buildWbgtSeriesが作る数値のy）を渡す前提で、対象点がなければnull。
function calculateWbgtPeriodAverage(data, startTime, endTime){
    const values = data
        .filter(point=>point.x >= startTime && point.x < endTime && Number.isFinite(Number(point.y)))
        .map(point=>Number(point.y));
    if(!values.length) return null;
    return values.reduce((total, value)=>total + value, 0) / values.length;
}

// 現在は当日を含む7日分を古い順に集計する。最高値は取得できた日内データの最大値。
// 時間帯平均は9〜12時、12〜15時、15〜17時。当日は各時間帯の終了後にだけ平均を出す。
// 過去日でもデータの充足率は判定しない。欠測・未終了はnullとなり、表示側で「—」にする。
function calculateWbgtFiveDayRows(wbgtData, nowTime){
    const currentTime = Number.isFinite(nowTime) ? nowTime : Date.now();
    const today = new Date(currentTime);
    today.setHours(0, 0, 0, 0);
    const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
    const periods = [
        { key:"average9To12", startHour:9, endHour:12 },
        { key:"average12To15", startHour:12, endHour:15 },
        { key:"average15To17", startHour:15, endHour:17 }
    ];
    const rows = [];

    for(let offset = 6; offset >= 0; offset--){
        const date = new Date(today);
        date.setDate(today.getDate() - offset);
        const dayStart = date.getTime();
        const nextDay = new Date(date);
        nextDay.setDate(date.getDate() + 1);
        const dayEnd = nextDay.getTime();
        const isToday = offset === 0;
        const dailyData = wbgtData.filter(point=>
            point.x >= dayStart && point.x < dayEnd && Number.isFinite(Number(point.y))
        );
        const maximum = dailyData.length
            ? Math.max(...dailyData.map(point=>Number(point.y)))
            : null;
        const row = {
            dateValue:formatDateInputValue(date),
            dateLabel:(date.getMonth() + 1) + "/" + date.getDate() + "（" + weekdayLabels[date.getDay()] + "）" +
                (isToday ? " 本日" : ""),
            maximum:maximum,
            isToday:isToday
        };

        periods.forEach(period=>{
            const periodStart = new Date(date);
            periodStart.setHours(period.startHour, 0, 0, 0);
            const periodEnd = new Date(date);
            periodEnd.setHours(period.endHour, 0, 0, 0);
            const isCompleted = !isToday || currentTime >= periodEnd.getTime();
            row[period.key] = isCompleted
                ? calculateWbgtPeriodAverage(dailyData, periodStart.getTime(), periodEnd.getTime())
                : null;
        });
        rows.push(row);
    }
    return rows;
}

function formatWbgtSummaryValue(value){
    return Number.isFinite(Number(value)) && value !== null ? Number(value).toFixed(1) : "—";
}

function resetWbgtFiveDaySummary(message){
    const head = document.getElementById("wbgtFiveDayHead");
    const body = document.getElementById("wbgtFiveDayBody");
    if(!body) return;
    if(head){
        head.innerHTML = "<tr><th>項目</th><th colspan=\"7\">直近7日</th></tr>";
    }
    body.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = message || "—";
    row.appendChild(cell);
    body.appendChild(row);
}

function renderWbgtFiveDaySummary(wbgtData, nowTime){
    const head = document.getElementById("wbgtFiveDayHead");
    const body = document.getElementById("wbgtFiveDayBody");
    if(!head || !body) return;
    const rows = calculateWbgtFiveDayRows(wbgtData, nowTime);
    const headRow = document.createElement("tr");
    const itemHeading = document.createElement("th");
    itemHeading.textContent = "項目";
    headRow.appendChild(itemHeading);
    rows.forEach(item=>{
        const heading = document.createElement("th");
        heading.textContent = item.dateLabel;
        if(item.isToday) heading.classList.add("wbgt-summary-today");
        headRow.appendChild(heading);
    });
    head.replaceChildren(headRow);
    body.replaceChildren();
    [
        { label:"最高WBGT", key:"maximum" },
        { label:"9:00～12:00平均", key:"average9To12" },
        { label:"12:00～15:00平均", key:"average12To15" },
        { label:"15:00～17:00平均", key:"average15To17" }
    ].forEach(metric=>{
        const row = document.createElement("tr");
        const label = document.createElement("td");
        label.textContent = metric.label;
        row.appendChild(label);
        rows.forEach(item=>{
            const cell = document.createElement("td");
            cell.textContent = formatWbgtSummaryValue(item[metric.key]);
            if(item.isToday) cell.classList.add("wbgt-summary-today");
            row.appendChild(cell);
        });
        body.appendChild(row);
    });
}

// WBGT専用グラフ。縦軸の初期範囲は20〜36、他グループへのズーム同期は行わない。
// 警戒帯はwbgtAlertBandsPluginで描画する。縦軸反映・ズーム解除は下の専用関数群を参照。
function createWbgtChart(wbgtData, minTime, maxTime){
    const canvas = getChartCanvas("wbgtChart");
    if(!canvas || !wbgtData.length) return null;
    destroyExistingChart("wbgtChart");
    const options = baseOptions(minTime, maxTime);
    options.plugins.crosshair.sync.group = 5;
    options.plugins.zoom.zoom.onZoomComplete = function(){};
    const yAxisOptions = {
        min:20,
        max:36,
        ticks:{ color:"#000" },
        title:{ display:true, text:"WBGT", color:"#000" }
    };
    options.scales = {
        ...options.scales,
        y:yAxisOptions,
        yRight:createRightYAxis(yAxisOptions)
    };
    const chart = createSingleLineChart(canvas, wbgtData, {
        label:"暑さ指数（WBGT）",
        color:"rgb(215, 106, 43)",
        backgroundColor:"rgba(215, 106, 43, 0.16)",
        fill:true
    }, options, [wbgtAlertBandsPlugin]);
    saveInitialScaleLimits(chart);
    return chart;
}

// WBGT用に取得済みの黒球センサー（既定P51）のtemperatureを、直近72時間の単独系列として表示する。
// 温湿度との8分以内の対応付けは行わない。WBGTを算出できない時刻でも黒球温度は表示できる。
function createWbgtGlobeChart(parsed, minTime, maxTime){
    const data = parsed.filter(d=>Number.isFinite(d.temp) && d.xValue >= minTime.getTime() && d.xValue <= maxTime.getTime())
        .map(d=>({x:d.xValue, y:d.temp}));
    const canvas = getChartCanvas("wbgtGlobeChart");
    if(!canvas || !data.length) return null;
    destroyExistingChart("wbgtGlobeChart");
    const options = baseOptions(minTime, maxTime);
    options.plugins.crosshair.sync.group = 5;
    options.plugins.zoom.zoom.onZoomComplete = function(){};
    const yAxis = {min:20, max:50, ticks:{stepSize:5, color:"#000"}, title:{display:true, text:"℃", color:"#000"}};
    options.scales = {...options.scales, y:yAxis, yRight:createRightYAxis(yAxis)};
    const chart = createSingleLineChart(canvas, data, {
        label:"黒球温度 (℃)", color:"rgb(255, 0, 0)",
        backgroundColor:"rgba(255, 0, 0, 0.18)", fill:true
    }, options);
    saveInitialScaleLimits(chart);
    return chart;
}

function applyWbgtGlobeYAxis(){
    if(!wbgtGlobeChart) return;
    const min = getFiniteInputValue("wbgtGlobeMin");
    const max = getFiniteInputValue("wbgtGlobeMax");
    if(min === null || max === null || max <= min){
        alert("温度軸には有効な最小値と最大値を入力してください。");
        return;
    }
    setLinearYAxis(wbgtGlobeChart, {min:min, max:max});
    wbgtGlobeChart.update();
}

function resetWbgtGlobeZoom(){
    clearSyncedTooltipGroup("wbgt");
    if(!wbgtGlobeChart) return;
    if(wbgtGlobeChart.resetZoom) wbgtGlobeChart.resetZoom("none");
    redrawChart(wbgtGlobeChart);
}

function getWbgtYAxis(){
    const min = getFiniteInputValue("wbgtMin");
    const max = getFiniteInputValue("wbgtMax");
    if(min === null || max === null || max <= min){
        return { error:"WBGT軸には有効な最小値と最大値を入力してください。" };
    }
    return { min:min, max:max };
}

function applyWbgtYAxis(chart){
    if(!chart) return;
    const axis = getWbgtYAxis();
    if(axis.error){
        alert(axis.error);
        return;
    }
    setLinearYAxis(chart, axis);
    chart.update();
}

function resetWbgtZoom(){
    clearSyncedTooltipGroup("wbgt");
    if(!wbgtChart) return;
    if(wbgtChart.resetZoom) wbgtChart.resetZoom("none");
    redrawChart(wbgtChart);
}

/**
 * 温湿度・黒球の2つの取得を並行実行し、現在値・7日集計・直近72時間のグラフを更新する。
 * 取得には7日集計用の範囲を使い、グラフに渡す系列だけ直近72時間へ絞る。
 * 取得開始時に連番を進め、後から開始した取得があれば古い応答の画面反映を中止する。
 * 設定不足時は現在値・集計・グラフをリセットする。通信エラーは集計・グラフの欄にも表示する。
 * 取得完了時に条件キー・時刻を記録する（データなし・APIエラーを含む）。再取得条件はswitchTabを参照。
 */
async function loadWbgtData(){
    const settings = getWbgtSettings();
    setWbgtText("wbgtCurrentPointLabel", settings.tempHumPointId || "－");
    setWbgtText("wbgtGlobePointLabel", settings.globePointId || "P51");
    const globeMessage = document.getElementById("wbgtGlobeChartMessage");
    if(wbgtGlobeChart) wbgtGlobeChart.destroy();
    wbgtGlobeChart = null;
    const currentMessage = document.getElementById("wbgtCurrentMessage");
    const chartMessage = document.getElementById("wbgtChartMessage");
    const fiveDayMessage = document.getElementById("wbgtFiveDayMessage");
    if(!settings.userId || !settings.tempHumPointId || !settings.globePointId){
        resetWbgtCurrentDisplay();
        resetWbgtFiveDaySummary("センサー設定を入力してください");
        if(currentMessage) currentMessage.innerText = "user_idと2つのpoint_idを入力してください";
        if(chartMessage) chartMessage.innerText = "センサー設定を入力してください";
        if(globeMessage) globeMessage.innerText = "センサー設定を入力してください";
        if(fiveDayMessage) fiveDayMessage.innerText = "";
        if(wbgtChart) wbgtChart.destroy();
        wbgtChart = null;
        return;
    }

    const requestId = ++wbgtDataRequestSequence;
    resetWbgtCurrentDisplay();
    resetWbgtFiveDaySummary("読み込み中...");
    if(currentMessage) currentMessage.innerText = "読み込み中...";
    if(chartMessage) chartMessage.innerText = "読み込み中...";
    if(globeMessage) globeMessage.innerText = "読み込み中...";
    if(fiveDayMessage) fiveDayMessage.innerText = "";
    if(wbgtChart) wbgtChart.destroy();
    wbgtChart = null;

    const now = new Date();
    const minTime = new Date(now.getTime() - 72*60*60*1000);
    const fiveDayRange = getWbgtFiveDayRange(now);
    const apiRange = {
        start:formatSqlDateTime(fiveDayRange.startTime),
        end:formatSqlDateTime(fiveDayRange.endTime)
    };
    const results = await Promise.all([
        fetchDataSafe(settings.userId, settings.tempHumPointId, apiRange),
        fetchDataSafe(settings.userId, settings.globePointId, apiRange)
    ]);
    if(requestId !== wbgtDataRequestSequence) return;

    const tempHumData = parseData(results[0].data, fiveDayRange.startTime);
    const globeData = parseData(results[1].data, fiveDayRange.startTime);
    renderWbgtCurrent(tempHumData, globeData, now.getTime(), settings);

    const fiveDayWbgtData = buildWbgtSeries(tempHumData, globeData);
    renderWbgtFiveDaySummary(fiveDayWbgtData, now.getTime());
    const wbgtData = fiveDayWbgtData.filter(point=>
        point.x >= minTime.getTime() && point.x <= now.getTime()
    );
    wbgtChart = createWbgtChart(wbgtData, minTime, now);
    wbgtGlobeChart = createWbgtGlobeChart(globeData, minTime, now);
    if(globeMessage) globeMessage.innerText = results[1].error || (wbgtGlobeChart ? "" : "有効な黒球温度データがありません");
    const errors = results.filter(result=>result.error).map(result=>result.error);
    if(fiveDayMessage){
        fiveDayMessage.innerText = errors.length
            ? errors.join(" / ")
            : fiveDayWbgtData.length
                ? ""
                : "8分以内で対応できる有効なデータがありません";
    }
    if(chartMessage){
        chartMessage.innerText = errors.length
            ? errors.join(" / ")
            : wbgtData.length
                ? ""
                : "8分以内で対応できる有効なデータがないため、WBGTグラフを表示できません";
    }
    wbgtLoadedKey = settings.userId + "|" + settings.tempHumPointId + "|" + settings.globePointId;
    wbgtLastLoadedAt = Date.now();
    refreshVisibleCharts();
}

// === 通知：設定フォーム・状態表示・履歴取得 ===
function handleAlertNotifyTargetChange(){
    const notifyTarget = document.getElementById("alertNotifyTarget");
    const destinationLabel = document.getElementById("alertDestinationLabel");

    if(destinationLabel){
        destinationLabel.innerText = notifyTarget && notifyTarget.value === "email"
            ? "メールアドレス"
            : "Webhook URL";
    }
}

function clearAlertForm(){
    const temperature = document.getElementById("alertTemperatureThreshold");
    const condition = document.getElementById("alertConditionType");
    const notifyTarget = document.getElementById("alertNotifyTarget");
    const webhookUrl = document.getElementById("alertWebhookUrl");
    const cooldownMinutes = document.getElementById("alertCooldownMinutes");
    const enabled = document.getElementById("alertEnabled");
    const message = document.getElementById("alertMessage");

    if(temperature) temperature.value = "";
    if(condition) condition.value = "above";
    if(notifyTarget) notifyTarget.value = "discord";
    if(webhookUrl) webhookUrl.value = "";
    if(cooldownMinutes) cooldownMinutes.value = "180";
    if(enabled) enabled.checked = true;
    if(message) message.innerText = "";
    activeAlertSettingExists = false;
    handleAlertNotifyTargetChange();
}

function clearAlertFormIfUserChanged(){
    const userIdInput = document.getElementById("alertUserId");
    const currentUserId = userIdInput ? userIdInput.value.trim() : "";
    const alertUserIdInput = document.getElementById("alertUserId");
    if(alertUserIdInput && alertUserIdInput.value.trim() !== currentUserId){
        alertUserIdInput.value = currentUserId;
    }

    if(currentUserId !== alertFormUserId){
        clearAlertForm();
        alertFormUserId = currentUserId;
        loadActiveAlertSetting(currentUserId);
    }
}

function handleAlertUserIdInput(){clearAlertFormIfUserChanged();savePlusTab('alert');}

function getSelectedAlertPointId(){
    const pointId = document.getElementById("alertPointId");
    return pointId && pointId.value ? pointId.value : "P01";
}

function getAlertPointLabel(pointId){
    return alertPointLabels[pointId] || pointId || "P01";
}

function handleAlertPointChange(){
    const userId = document.getElementById("alertUserId").value.trim();

    if(!userId){
        clearAlertForm();
        renderActiveAlertSettingEmpty();
        renderAlertStatusCard(null, null, null);
        return;
    }

    loadActiveAlertSetting(userId);
}

function renderActiveAlertSettingEmpty(message){
    const container = document.getElementById("activeAlertSetting");
    if(!container) return;

    container.innerHTML =
        '<div class="active-alert-setting-title">現在有効なアラート設定</div>' +
        '<div>user_id：' + escapeHtml(document.getElementById("alertUserId").value.trim() || "-") + '</div>' +
        '<div class="active-alert-setting-empty">' + (message || "有効なアラート設定はありません。") + '</div>';
}

function applyAlertSettingToForm(setting){
    if(!setting){
        clearAlertForm();
        return;
    }

    activeAlertSettingExists = true;
    const temperature = document.getElementById("alertTemperatureThreshold");
    const condition = document.getElementById("alertConditionType");
    const notifyTarget = document.getElementById("alertNotifyTarget");
    const webhookUrl = document.getElementById("alertWebhookUrl");
    const cooldownMinutes = document.getElementById("alertCooldownMinutes");
    const enabled = document.getElementById("alertEnabled");
    const pointId = document.getElementById("alertPointId");

    if(temperature){
        const threshold = Number(setting.temperature_threshold);
        temperature.value = isNaN(threshold) ? "" : threshold.toFixed(1);
    }
    if(condition) condition.value = setting.condition_type || "above";
    if(notifyTarget) notifyTarget.value = setting.notify_target || "discord";
    if(webhookUrl) webhookUrl.value = "";
    if(cooldownMinutes){
        const cooldownValue = String(setting.cooldown_minutes || 180);
        cooldownMinutes.value = [...cooldownMinutes.options].some(option=>option.value === cooldownValue)
            ? cooldownValue
            : "180";
    }
    if(enabled) enabled.checked = Number(setting.enabled) === 1;
    if(pointId && setting.point_id && alertPointLabels[setting.point_id]){
        pointId.value = setting.point_id;
    }
    handleAlertNotifyTargetChange();
}

function getAlertTypeLabel(alertType){
    if(alertType === "temperature_high") return "高温アラート";
    if(alertType === "temperature_low") return "低温アラート";
    if(alertType === "temperature_high_recovery") return "高温復帰";
    if(alertType === "temperature_low_recovery") return "低温復帰";
    return alertType || "-";
}

function formatAlertValue(value){
    const number = Number(value);
    return isNaN(number) ? "-" : number.toFixed(1);
}

function getLatestTemperature(data){
    const parsed = parseData(data || [], new Date(0))
        .filter(d=>d.temp !== null && !isNaN(d.temp));

    if(!parsed.length) return null;
    return parsed[parsed.length - 1].temp;
}

function formatAlertTemperature(value){
    return value === null || value === undefined || isNaN(value)
        ? "データなし"
        : Number(value).toFixed(1) + "℃";
}

function getAlertConditionText(setting){
    if(!setting || Number(setting.enabled) !== 1) return "-";

    const threshold = Number(setting.temperature_threshold);
    const condition = setting.condition_type === "above"
        ? "以上"
        : setting.condition_type === "below"
            ? "以下"
            : "-";

    return getAlertPointLabel(setting.point_id || getSelectedAlertPointId()) +
        " 温度 " +
        (isNaN(threshold) ? "-" : threshold.toFixed(1)) +
        "℃" +
        condition;
}

function getAlertStatusText(setting, p01Temp, p11Temp){
    if(!setting || Number(setting.enabled) !== 1){
        return "設定なし";
    }

    const threshold = Number(setting.temperature_threshold);
    if(isNaN(threshold)) return "データなし";

    const pointId = setting.point_id || getSelectedAlertPointId();
    const currentTemp = pointId === "P11" ? p11Temp : p01Temp;
    if(currentTemp === null || currentTemp === undefined || isNaN(currentTemp)){
        return "データなし";
    }

    if(setting.condition_type === "below"){
        return currentTemp <= threshold ? "🔴 低温になりました" : "🟢 正常値に戻りました";
    }

    return currentTemp >= threshold ? "🔴 高温になりました" : "🟢 正常値に戻りました";
}

// 設定専用の日本時間DATETIMEを表示する。通知でも変わるupdated_atにはフォールバックしない。
function formatAlertSettingUpdatedAt(value){
    if(typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return "記録なし";
    const parsed = new Date(value.replace(" ", "T") + "+09:00");
    if(!Number.isFinite(parsed.getTime())) return "記録なし";
    return value.slice(0, 16).replace(/-/g, "/") + "（日本時間）";
}

function renderAlertStatusCard(setting, p01Temp, p11Temp, statusOverride){
    const card = document.getElementById("alertStatusCard");
    if(!card) return;

    const cooldownMinutes = setting ? Number(setting.cooldown_minutes) : NaN;
    const statusText = statusOverride || getAlertStatusText(setting, p01Temp, p11Temp);

    card.innerHTML =
        '<div class="alert-status-title">現在のアラート状態</div>' +
        '<div>user_id：' + escapeHtml(setting?.user_id || document.getElementById("alertUserId").value.trim() || "-") + '</div>' +
        '<div class="alert-status-current">現在の状態：' + escapeHtml(statusText) + '</div>' +
        '<div>ハウス内温度（P01）：' + escapeHtml(formatAlertTemperature(p01Temp)) + '</div>' +
        '<div>外気温度（P11）：' + escapeHtml(formatAlertTemperature(p11Temp)) + '</div>' +
        '<div>設定条件：' + escapeHtml(getAlertConditionText(setting)) + '</div>' +
        '<div>再通知間隔：' + escapeHtml(isNaN(cooldownMinutes) ? "-" : cooldownMinutes + "分") + '</div>';
}

async function loadAlertStatusCard(userId, setting, requestedPointId){
    if(!userId){
        renderAlertStatusCard(null, null, null);
        return;
    }

    renderAlertStatusCard(setting, null, null, "読み込み中...");

    const results = await Promise.all([
        fetchDataSafe(userId, "P01"),
        fetchDataSafe(userId, "P11")
    ]);

    const currentUserId = document.getElementById("alertUserId").value.trim();
    if(currentUserId !== userId) return;
    if(requestedPointId && getSelectedAlertPointId() !== requestedPointId) return;

    renderAlertStatusCard(
        setting,
        getLatestTemperature(results[0].data),
        getLatestTemperature(results[1].data)
    );
}

function renderAlertHistory(history){
    const container = document.getElementById("alertHistory");
    if(!container) return;

    if(!Array.isArray(history) || !history.length){
        container.innerHTML =
            '<div class="alert-history-title">直近3日間のアラート履歴</div>' +
            '<div class="alert-history-empty">直近3日間のアラート履歴はありません。</div>';
        return;
    }

    container.innerHTML =
        '<div class="alert-history-title">直近3日間のアラート履歴</div>' +
        history.map(item=>{
            const userId = escapeHtml(item.user_id || "-");
            const pointId = escapeHtml(item.point_id || "-");
            const alertType = escapeHtml(getAlertTypeLabel(item.alert_type));
            const value = formatAlertValue(item.value);
            const threshold = formatAlertValue(item.threshold_value);
            const notifiedAt = escapeHtml(item.notified_at || "-");

            return '<div class="alert-history-item">' +
                '<div class="alert-history-time">' + notifiedAt + '</div>' +
                '<div>user_id：' + userId + '</div>' +
                '<div class="alert-history-type">' + pointId + ' ' + alertType + '</div>' +
                '<div>' + value + '℃（しきい値 ' + threshold + '℃）</div>' +
            '</div>';
        }).join("");
}

function renderActiveAlertSetting(setting){
    const container = document.getElementById("activeAlertSetting");
    if(!container) return;

    if(!setting || Number(setting.enabled) !== 1){
        renderActiveAlertSettingEmpty();
        return;
    }

    const threshold = Number(setting.temperature_threshold);
    const cooldownMinutes = Number(setting.cooldown_minutes);
    const webhook = setting.webhook_masked || (setting.webhook_configured ? "設定済み" : "");
    const pointLabel = getAlertPointLabel(setting.point_id || getSelectedAlertPointId());
    const condition = setting.condition_type === "above"
        ? "以上"
        : setting.condition_type === "below"
            ? "以下"
            : "-";
    const notifyTarget = setting.notify_target === "discord"
        ? "Discord"
        : setting.notify_target === "email"
            ? "メール"
        : setting.notify_target === "line"
            ? "LINE"
            : "-";
    const destinationLabel = setting.notify_target === "email" ? "メールアドレス" : "Webhook";

    container.innerHTML =
        '<div class="active-alert-setting-title">現在有効なアラート設定</div>' +
        '<div>user_id：' + escapeHtml(setting.user_id || document.getElementById("alertUserId").value.trim() || "-") + '</div>' +
        '<div>対象：' + pointLabel + ' 温度</div>' +
        '<div>条件：' + (isNaN(threshold) ? "-" : threshold.toFixed(1)) + '℃ ' + condition + '</div>' +
        '<div>通知先：' + notifyTarget + '</div>' +
        '<div>' + destinationLabel + '：' + escapeHtml(webhook) + '</div>' +
        '<div>再通知間隔：' + (isNaN(cooldownMinutes) ? "-" : cooldownMinutes) + '分</div>' +
        '<div>状態：有効</div>' +
        '<div>最終更新：' + escapeHtml(formatAlertSettingUpdatedAt(setting.setting_updated_at)) + '</div>';
}

async function loadActiveAlertSetting(userId, pointId){
    const alertUserIdInput = document.getElementById("alertUserId");
    if(alertUserIdInput && document.getElementById("alertUserId").value.trim() === (userId || "")){
        alertUserIdInput.value = userId || "";
    }
    if(!userId){
        clearAlertForm();
        renderActiveAlertSettingEmpty();
        renderAlertStatusCard(null, null, null);
        renderAlertHistory([]);
        return;
    }

    const requestedUserId = userId;
    const requestedPointId = pointId || getSelectedAlertPointId();
    renderActiveAlertSettingEmpty("読み込み中...");
    renderAlertStatusCard(null, null, null, "読み込み中...");

    try{
        const res = await fetch(
            "get_alert_setting.php?user_id=" + encodeURIComponent(requestedUserId) + "&point_id=" + encodeURIComponent(requestedPointId),
            { cache:"no-store" }
        );

        const text = await res.text();
        let result;

        try{
            result = JSON.parse(text);
        }catch(e){
            throw new Error("JSONではないレスポンスです：" + text);
        }

        const currentUserId = document.getElementById("alertUserId").value.trim();
        if(currentUserId !== requestedUserId) return;
        if(getSelectedAlertPointId() !== requestedPointId) return;

        if(!res.ok || !result.success){
            clearAlertForm();
            renderActiveAlertSettingEmpty("有効なアラート設定はありません。");
            loadAlertStatusCard(requestedUserId, null, requestedPointId);
            loadAlertHistory(requestedUserId);
            return;
        }

        const setting = result.setting || null;
        applyAlertSettingToForm(setting);
        renderActiveAlertSetting(setting);
        loadAlertStatusCard(requestedUserId, setting, requestedPointId);
        loadAlertHistory(requestedUserId);

    }catch(e){
        const currentUserId = document.getElementById("alertUserId").value.trim();
        if(currentUserId === requestedUserId && getSelectedAlertPointId() === requestedPointId){
            clearAlertForm();
            renderActiveAlertSettingEmpty("有効なアラート設定はありません。");
            loadAlertStatusCard(requestedUserId, null, requestedPointId);
            loadAlertHistory(requestedUserId);
        }
    }
}

async function loadAlertHistory(userId){
    if(!userId){
        renderAlertHistory([]);
        return;
    }

    try{
        const res = await fetch(
            "get_alert_history.php?user_id=" + encodeURIComponent(userId),
            { cache:"no-store" }
        );
        const text = await res.text();

        if(!text.trim()){
            throw new Error("get_alert_history.php から空のレスポンスが返りました");
        }

        const result = JSON.parse(text);
        if(document.getElementById("alertUserId").value.trim() !== userId) return;

        if(!res.ok || !result.success){
            renderAlertHistory([]);
            return;
        }

        renderAlertHistory(result.history || []);

    }catch(e){
        if(document.getElementById("alertUserId").value.trim() === userId){
            renderAlertHistory([]);
        }
    }
}

// === 画面のタブ切替と必要なデータの読み込み ===
function switchTab(tabName){switchPlusTab(tabName);}

const wbgtAlertBandsPlugin = {
    id:"wbgtAlertBandsPlugin",
    beforeDraw(chart){
        if(chart.canvas.id !== "wbgtChart") return;

        const yScale = chart.scales.y;
        const chartArea = chart.chartArea;
        if(!yScale || !chartArea) return;

        const bands = [
            { min:31, max:Infinity, className:"wbgt-level-danger" },
            { min:28, max:31, className:"wbgt-level-severe" },
            { min:25, max:28, className:"wbgt-level-warning" },
            { min:-Infinity, max:25, className:"wbgt-level-caution" }
        ];
        const ctx = chart.ctx;

        ctx.save();
        ctx.beginPath();
        ctx.rect(
            chartArea.left,
            chartArea.top,
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top
        );
        ctx.clip();
        ctx.globalAlpha = 0.4;

        bands.forEach(band=>{
            const min = Math.max(yScale.min, band.min);
            const max = Math.min(yScale.max, band.max);
            if(max <= min) return;

            const colorSource = document.querySelector("." + band.className);
            if(!colorSource) return;

            const top = yScale.getPixelForValue(max);
            const bottom = yScale.getPixelForValue(min);
            ctx.fillStyle = getComputedStyle(colorSource).backgroundColor;
            ctx.fillRect(
                chartArea.left,
                top,
                chartArea.right - chartArea.left,
                bottom - top
            );
        });

        ctx.restore();
    },
    beforeDatasetsDraw(chart){
        if(chart.canvas.id !== "wbgtChart") return;

        const yScale = chart.scales.y;
        const chartArea = chart.chartArea;
        if(!yScale || !chartArea) return;

        const colorSource = document.querySelector(".wbgt-level-danger");
        if(!colorSource) return;

        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(
            chartArea.left,
            chartArea.top,
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top
        );
        ctx.clip();
        ctx.strokeStyle = getComputedStyle(colorSource).borderTopColor;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 1;

        [25, 28, 31].forEach(value=>{
            if(value < yScale.min || value > yScale.max) return;

            const y = yScale.getPixelForValue(value);
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
        });

        ctx.restore();
    }
};

// === 日付入力用の整形 ===
function formatDateInputValue(date){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return y + "-" + m + "-" + d;
}

function applyReviewChartNoDataStates(charts, userId, startTime, endTime){
    const configs = [
        ["reviewTempChartP01", ["P01"]],
        ["reviewTempChartP11", ["P11"]],
        ["reviewOutsideDiffChart", ["P01", "P11"]],
        ["reviewVaporChart", ["P01"]],
        ["reviewSolarChart", ["P31"]],
        ["reviewCo2Chart", ["P21"]],
        ["reviewCo2OutsideChart", ["P26"]],
        ["reviewCo2DiffChart", ["P21", "P26"]]
    ];

    configs.forEach((config, index)=>{
        setChartNoDataState(
            config[0],
            charts[index],
            config[1].map(pointId=>({ userId:userId, pointId:pointId })),
            startTime,
            endTime
        );
    });
}

function formatMaintenanceDateInput(wallClockMs){
    const date = new Date(wallClockMs);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
}

function parseMaintenanceStartDate(value){
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match) return null;

    const parts = match.slice(1).map(Number);
    const [year, month, day] = parts;
    const wallClockMs = Date.UTC(year, month - 1, day);
    const check = new Date(wallClockMs);
    if(
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ){
        return null;
    }

    return {
        value:value,
        wallClockMs:wallClockMs
    };
}

function getJapanWallClockMs(timestamp){
    const jstDate = new Date(timestamp + 9*60*60*1000);
    return Date.UTC(
        jstDate.getUTCFullYear(),
        jstDate.getUTCMonth(),
        jstDate.getUTCDate(),
        jstDate.getUTCHours(),
        jstDate.getUTCMinutes(),
        jstDate.getUTCSeconds(),
        jstDate.getUTCMilliseconds()
    );
}

function createMaintenanceLocalDate(wallClockMs){
    const date = new Date(wallClockMs);
    return new Date(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds()
    );
}

function formatMaintenanceSqlDateTime(wallClockMs){
    const date = new Date(wallClockMs);
    return formatMaintenanceDateInput(wallClockMs) + " " +
        String(date.getUTCHours()).padStart(2, "0") + ":" +
        String(date.getUTCMinutes()).padStart(2, "0") + ":" +
        String(date.getUTCSeconds()).padStart(2, "0");
}

function formatMaintenancePeriodDate(wallClockMs){
    const date = new Date(wallClockMs);
    return date.getUTCFullYear() + "年" + (date.getUTCMonth() + 1) + "月" + date.getUTCDate() + "日";
}

function setMaintenanceMode(mode){
    const nextMode = mode === "custom" ? "custom" : "latest";
    if(maintenanceMode !== nextMode){
        maintenanceDataRequestSequence++;
        maintenanceDataLoadingKey = "";
    }
    maintenanceMode = nextMode;
    const latest = document.getElementById("maintenanceRangeLatest");
    const custom = document.getElementById("maintenanceRangeCustom");
    const start = document.getElementById("maintenanceStartDate");
    const previous = document.getElementById("maintenancePreviousPeriod");
    const preview = document.getElementById("maintenancePeriodPreview");
    const message = document.getElementById("maintenanceMessage");

    if(latest) latest.checked = maintenanceMode === "latest";
    if(custom) custom.checked = maintenanceMode === "custom";
    if(start) start.disabled = maintenanceMode !== "custom";
    if(previous) previous.disabled = maintenanceMode !== "custom";
    if(preview) preview.hidden = maintenanceMode !== "custom";
    updateMaintenancePeriodPreview();
    if(message) message.innerText = "";
}

function initializeMaintenanceRangeInputs(){
    const todayWallClockMs = getJapanWallClockMs(Date.now());
    const todayStartWallClockMs = Math.floor(todayWallClockMs / (24*60*60*1000)) * (24*60*60*1000);
    const start = document.getElementById("maintenanceStartDate");
    if(start){
        start.value = formatMaintenanceDateInput(todayStartWallClockMs - 4*24*60*60*1000);
        start.max = formatMaintenanceDateInput(todayStartWallClockMs);
    }
    setMaintenanceMode("latest");
}

function getMaintenanceFiveDayRange(startValue, nowTimestamp){
    if(!startValue) return { error:"開始日を入力してください。" };

    const start = parseMaintenanceStartDate(startValue);
    if(!start) return { error:"有効な開始日を入力してください。" };

    const currentTimestamp = nowTimestamp === undefined ? Date.now() : nowTimestamp;
    const japanNowWallClockMs = Math.floor(getJapanWallClockMs(currentTimestamp) / 1000) * 1000;
    const japanTodayWallClockMs = Math.floor(japanNowWallClockMs / (24*60*60*1000)) * (24*60*60*1000);
    if(start.wallClockMs > japanTodayWallClockMs){
        return { error:"開始日は今日以前の日付を選択してください。" };
    }

    const fullEndWallClockMs = start.wallClockMs + 5*24*60*60*1000 - 1000;
    const effectiveEndWallClockMs = Math.min(fullEndWallClockMs, japanNowWallClockMs);

    return {
        error:"",
        range:{
            mode:"custom",
            startTime:createMaintenanceLocalDate(start.wallClockMs),
            endTime:createMaintenanceLocalDate(effectiveEndWallClockMs),
            apiRange:{
                start:formatMaintenanceSqlDateTime(start.wallClockMs),
                end:formatMaintenanceSqlDateTime(effectiveEndWallClockMs)
            },
            rangeKey:start.value
        }
    };
}

function updateMaintenancePeriodPreview(){
    const input = document.getElementById("maintenanceStartDate");
    const preview = document.getElementById("maintenancePeriodPreview");
    const previous = document.getElementById("maintenancePreviousPeriod");
    const next = document.getElementById("maintenanceNextPeriod");
    const start = parseMaintenanceStartDate(input ? input.value : "");
    const isCustom = maintenanceMode === "custom";

    if(preview){
        preview.hidden = !isCustom;
        preview.innerText = start
            ? "表示期間：" + formatMaintenancePeriodDate(start.wallClockMs) + " ～ " +
                formatMaintenancePeriodDate(start.wallClockMs + 4*24*60*60*1000)
            : "表示期間：開始日を選択してください。";
    }

    if(previous) previous.disabled = !isCustom || !start;
    if(next){
        const todayWallClockMs = Math.floor(getJapanWallClockMs(Date.now()) / (24*60*60*1000)) * (24*60*60*1000);
        next.disabled = !isCustom || !start || start.wallClockMs + 5*24*60*60*1000 > todayWallClockMs;
    }
}

function getMaintenanceRange(){
    if(maintenanceMode === "custom"){
        const start = document.getElementById("maintenanceStartDate");
        return getMaintenanceFiveDayRange(start ? start.value : "");
    }

    const jstNow = new Date(Date.now() + 9*60*60*1000);
    const endTime = new Date(
        jstNow.getUTCFullYear(),
        jstNow.getUTCMonth(),
        jstNow.getUTCDate(),
        jstNow.getUTCHours(),
        jstNow.getUTCMinutes(),
        jstNow.getUTCSeconds(),
        jstNow.getUTCMilliseconds()
    );
    const startTime = new Date(endTime.getTime() - 72*60*60*1000);
    return {
        error:"",
        range:{
            mode:"latest",
            startTime:startTime,
            endTime:endTime,
            apiRange:null
        }
    };
}

function getMaintenanceRequestKey(userId, range){
    return userId + "\n" + range.mode + "\n" +
        (range.rangeKey || (range.apiRange ? range.apiRange.start + "\n" + range.apiRange.end : "latest"));
}

function shouldReloadMaintenanceData(userId, range){
    if(!userId || !range) return false;

    const requestKey = getMaintenanceRequestKey(userId, range);
    if(maintenanceDataLoadingKey === requestKey) return false;
    if(!maintenanceLastLoadSucceeded) return true;
    if(maintenanceLoadedUserId !== userId) return true;
    if(maintenanceLoadedRangeKey !== requestKey) return true;

    return range.mode === "latest" && Date.now() - maintenanceLastLoadedAt >= 5*60*1000;
}

function handleMaintenanceUserIdChange(){
    const userId = getPlusUserId("maintenance");
    if(userId === maintenanceKnownUserId) return;

    maintenanceKnownUserId = userId;
    maintenanceDataRequestSequence++;
    maintenanceDataLoadingKey = "";
    maintenanceLoadedUserId = "";
    maintenanceLoadedRangeKey = "";
    maintenanceLastLoadedAt = 0;
    maintenanceLastLoadSucceeded = false;
    destroyMaintenanceCharts();

    const message = document.getElementById("maintenanceMessage");
    if(message){
        message.innerText = "利用者が変更されました。メンテナンスタブを開くと新しいデータを読み込みます。";
    }

    const maintenancePanel = document.getElementById("tab-maintenance");
    if(userId && maintenancePanel && maintenancePanel.classList.contains("active")){
        loadMaintenanceData();
    }
}

function showMaintenanceCustomRange(){
    setMaintenanceMode("custom");
    const result = getMaintenanceRange();
    const message = document.getElementById("maintenanceMessage");
    if(result.error){
        if(message) message.innerText = result.error;
        return;
    }
    loadMaintenanceData(result.range);
}

function showMaintenanceLatest72Hours(){
    setMaintenanceMode("latest");
    loadMaintenanceData();
}

function shiftMaintenanceFiveDayRange(dayOffset){
    const input = document.getElementById("maintenanceStartDate");
    const message = document.getElementById("maintenanceMessage");
    const start = parseMaintenanceStartDate(input ? input.value : "");
    if(!start){
        if(message) message.innerText = "有効な開始日を入力してください。";
        return;
    }

    const nextStartWallClockMs = start.wallClockMs + dayOffset*24*60*60*1000;
    const todayWallClockMs = Math.floor(getJapanWallClockMs(Date.now()) / (24*60*60*1000)) * (24*60*60*1000);
    if(nextStartWallClockMs > todayWallClockMs){
        if(message) message.innerText = "開始日は今日以前の日付を選択してください。";
        updateMaintenancePeriodPreview();
        return;
    }

    input.value = formatMaintenanceDateInput(nextStartWallClockMs);
    updateMaintenancePeriodPreview();
    const result = getMaintenanceRange();
    if(result.error){
        if(message) message.innerText = result.error;
        return;
    }
    loadMaintenanceData(result.range);
}

function configureMaintenanceChart(chart){
    if(!chart) return chart;
    if(chart.options && chart.options.plugins && chart.options.plugins.zoom && chart.options.plugins.zoom.zoom){
        chart.options.plugins.zoom.zoom.onZoomComplete = ({chart})=>{ syncMaintenanceZoom(chart); };
    }
    if(chart.options && chart.options.plugins && chart.options.plugins.crosshair && chart.options.plugins.crosshair.sync){
        chart.options.plugins.crosshair.sync.group = 2;
    }
    saveInitialScaleLimits(chart);
    return chart;
}

function applyMaintenanceMobileChartRanges(startTime, endTime){
    if(!isMobileView() || maintenanceMode !== "latest") return;
    const mobileStart = new Date(endTime.getTime() - 48*60*60*1000);
    maintenanceCharts.filter(chart=>chart.canvas.id !== "voltChart")
        .forEach(chart=>applyChartXRange(chart, mobileStart, endTime));
}

function applyMaintenanceChartNoDataStates(chartMap, userId, startTime, endTime, voltageRange){
    const configs = [
        ["maintenanceTempChartP01", "tempP01", ["P01"]],
        ["maintenanceTempChartP11", "tempP11", ["P11"]],
        ["tempChartP12", "tempP12", ["P12"]],
        ["diffChartP11P12", "diffP11P12", ["P11", "P12"]],
        ["tempChartP02", "tempP02", ["P02"]],
        ["diffChart", "diffP01P02", ["P01", "P02"]],
        ["vaporChartP11", "vaporP11", ["P11"]],
        ["dewChartP11", "dewP11", ["P11"]],
        ["dewChart", "dewP01", ["P01"]],
        ["co2ChartP27", "co2P27", ["P27"]],
        ["co2DiffChartP26P27", "diffP26P27", ["P26", "P27"]],
        ["co2ChartP22", "co2P22", ["P22"]],
        ["co2DiffChartP21P22", "diffP21P22", ["P21", "P22"]],
        ["solarChartP32", "solarP32", ["P32"]],
        ["solarDiffChartP31P32", "diffP31P32", ["P31", "P32"]],
        ["voltChart", "voltP91", ["P91"]]
    ];

    configs.forEach(([canvasId, key, pointIds])=>{
        setChartNoDataState(
            canvasId,
            chartMap[key],
            pointIds.map(pointId=>({ userId:userId, pointId:pointId })),
            canvasId === "voltChart" && voltageRange ? voltageRange.startTime : startTime,
            canvasId === "voltChart" && voltageRange ? voltageRange.endTime : endTime
        );
    });
}

async function loadMaintenanceData(rangeOverride){
    clearSyncedTooltipGroup("maintenance");
    const userId = getPlusUserId("maintenance");
    const message = document.getElementById("maintenanceMessage");
    if(!userId){
        if(message) message.innerText = "user_id を入力してください。";
        return;
    }

    const rangeResult = rangeOverride
        ? { error:"", range:rangeOverride }
        : getMaintenanceRange();
    if(rangeResult.error){
        if(message) message.innerText = rangeResult.error;
        return;
    }

    const range = rangeResult.range;
    const requestKey = getMaintenanceRequestKey(userId, range);
    if(maintenanceDataLoadingKey === requestKey){
        if(message) message.innerText = "読み込み中...";
        return;
    }

    const requestId = ++maintenanceDataRequestSequence;
    maintenanceDataLoadingKey = requestKey;
    maintenanceMode = range.mode;
    maintenanceStartTime = range.startTime;
    maintenanceEndTime = range.endTime;
    maintenanceLastLoadSucceeded = false;
    if(message) message.innerText = "読み込み中...";

    const pointIds = ["P01", "P02", "P11", "P12", "P21", "P22", "P26", "P27", "P31", "P32", "P91"];
    const jstNow = new Date(getJapanWallClockMs(Date.now()));
    const voltageEnd = createMaintenanceLocalDate(jstNow.getTime());
    // 電圧だけはタブの選択期間と別に、現在から直近30日間を取得・表示する。
    // スマホの短縮表示や他グラフとのズーム同期からも除外する。
    const voltageRange = {
        startTime:new Date(voltageEnd.getTime() - 30*24*60*60*1000),
        endTime:voltageEnd,
        apiRange:{
            start:formatMaintenanceSqlDateTime(jstNow.getTime() - 30*24*60*60*1000),
            end:formatMaintenanceSqlDateTime(jstNow.getTime())
        }
    };

    try{
        const results = await Promise.all(pointIds.map(pointId=>
            fetchDataSafe(userId, pointId, pointId === "P91" ? voltageRange.apiRange : range.apiRange)
        ));

        if(requestId !== maintenanceDataRequestSequence || getPlusUserId("maintenance") !== userId){
            if(maintenanceDataLoadingKey === requestKey) maintenanceDataLoadingKey = "";
            return;
        }

        const resultMap = {};
        pointIds.forEach((pointId, index)=>{ resultMap[pointId] = results[index]; });
        const parsed = {};
        pointIds.forEach(pointId=>{
            parsed[pointId] = parseData(resultMap[pointId].data, pointId === "P91" ? voltageRange.startTime : range.startTime);
        });

        destroyMaintenanceCharts();

        maintenanceTempChartP01 = configureMaintenanceChart(
            createTempHumChart("maintenanceTempChartP01", parsed.P01, range.startTime, range.endTime, "P01")
        );
        maintenanceTempChartP11 = configureMaintenanceChart(
            createTempHumChart("maintenanceTempChartP11", parsed.P11, range.startTime, range.endTime, "P11")
        );
        tempChartP02 = configureMaintenanceChart(
            createTempHumChart("tempChartP02", parsed.P02, range.startTime, range.endTime, "P02")
        );
        diffChart = configureMaintenanceChart(
            createDiffChart("diffChart", parsed.P01, parsed.P02, range.startTime, range.endTime)
        );
        tempChartP12 = configureMaintenanceChart(
            createTempHumChart("tempChartP12", parsed.P12, range.startTime, range.endTime, "P12")
        );
        diffChartP11P12 = configureMaintenanceChart(
            createTempHumDiagnosticDiffChart(
                "diffChartP11P12", parsed.P11, parsed.P12, "P11", "P12",
                getP11P12DiffAxis(), range.startTime, range.endTime
            )
        );
        vaporChartP11 = configureMaintenanceChart(
            createVaporChart("vaporChartP11", parsed.P11, range.startTime, range.endTime)
        );
        dewChartP11 = configureMaintenanceChart(
            createSingleChart("dewChartP11", parsed.P11, "dew", "露点温度", "℃", range.startTime, range.endTime, getDewAxisP11())
        );
        dewChart = configureMaintenanceChart(
            createSingleChart("dewChart", parsed.P01, "dew", "露点温度", "℃", range.startTime, range.endTime)
        );
        co2ChartP22 = configureMaintenanceChart(
            createSingleChart(
                "co2ChartP22", parsed.P22, "co2", "co2", "ppm",
                range.startTime, range.endTime, getCo2ComparisonAxis("P22")
            )
        );
        co2DiffChartP21P22 = configureMaintenanceChart(
            createSingleSensorDiagnosticDiffChart(
                "co2DiffChartP21P22", parsed.P21, parsed.P22, "co2", "P21", "P22",
                "CO2差", "ppm", getCo2DiagnosticDiffAxis("P21", "P22"),
                range.startTime, range.endTime
            )
        );
        co2ChartP27 = configureMaintenanceChart(
            createSingleChart(
                "co2ChartP27", parsed.P27, "co2Outside", "co2", "ppm",
                range.startTime, range.endTime, getCo2ComparisonAxis("P27")
            )
        );
        co2DiffChartP26P27 = configureMaintenanceChart(
            createSingleSensorDiagnosticDiffChart(
                "co2DiffChartP26P27", parsed.P26, parsed.P27, "co2", "P26", "P27",
                "CO2差", "ppm", getCo2DiagnosticDiffAxis("P26", "P27"),
                range.startTime, range.endTime
            )
        );
        solarChartP32 = configureMaintenanceChart(
            createSingleChart(
                "solarChartP32", parsed.P32, "solar", "日射", "日射",
                range.startTime, range.endTime, getSolarComparisonAxis("P32")
            )
        );
        solarDiffChartP31P32 = configureMaintenanceChart(
            createSingleSensorDiagnosticDiffChart(
                "solarDiffChartP31P32", parsed.P31, parsed.P32, "solar", "P31", "P32",
                "日射量差", "日射", getSolarDiagnosticDiffAxis("P31", "P32"),
                range.startTime, range.endTime
            )
        );
        voltChart = configureMaintenanceChart(
            createSingleChart("voltChart", parsed.P91, "volt", "電圧", "V", voltageRange.startTime, voltageRange.endTime)
        );

        const chartMap = {
            tempP01:maintenanceTempChartP01,
            tempP11:maintenanceTempChartP11,
            tempP12:tempChartP12,
            diffP11P12:diffChartP11P12,
            tempP02:tempChartP02,
            diffP01P02:diffChart,
            vaporP11:vaporChartP11,
            dewP11:dewChartP11,
            dewP01:dewChart,
            co2P27:co2ChartP27,
            diffP26P27:co2DiffChartP26P27,
            co2P22:co2ChartP22,
            diffP21P22:co2DiffChartP21P22,
            solarP32:solarChartP32,
            diffP31P32:solarDiffChartP31P32,
            voltP91:voltChart
        };
        maintenanceCharts = Object.values(chartMap).filter(Boolean);
        applyMaintenanceMobileChartRanges(range.startTime, range.endTime);
        applyMaintenanceChartNoDataStates(chartMap, userId, range.startTime, range.endTime, voltageRange);
        const errors = results.filter(result=>result.error).map(result=>result.error);
        maintenanceLoadedUserId = userId;
        maintenanceLoadedRangeKey = requestKey;
        maintenanceLastLoadedAt = Date.now();
        maintenanceLastLoadSucceeded = errors.length === 0;
        maintenanceDataLoadingKey = "";

        if(message) message.innerText = errors.length ? errors.join(" / ") : "";
        refreshVisibleCharts();
    }catch(error){
        if(requestId !== maintenanceDataRequestSequence) return;
        maintenanceDataLoadingKey = "";
        maintenanceLastLoadSucceeded = false;
        if(message) message.innerText = "メンテナンスデータ表示エラー：" + error.message;
        console.error(error);
    }
}

function getCo2ComparisonAxis(pointId){
    const defaultMin = pointId === "P27" ? co2OutsideMin : co2Min;
    const defaultMax = pointId === "P27" ? co2OutsideMax : co2Max;

    return {
        min:getAxisValue("co2Min" + pointId, defaultMin),
        max:getAxisValue("co2Max" + pointId, defaultMax)
    };
}

function getCo2DiagnosticDiffAxis(firstPointId, secondPointId){
    const suffix = firstPointId + secondPointId;

    return {
        min:getAxisValue("co2DiffMin" + suffix, -200),
        max:getAxisValue("co2DiffMax" + suffix, 200)
    };
}

function getSolarComparisonAxis(pointId){
    return {
        min:getAxisValue("solarMin" + pointId, solarAxisMin),
        max:getAxisValue("solarMax" + pointId, solarAxisMax)
    };
}

function getSolarDiagnosticDiffAxis(firstPointId, secondPointId){
    const suffix = firstPointId + secondPointId;

    return {
        min:getAxisValue("solarDiffMin" + suffix, -200),
        max:getAxisValue("solarDiffMax" + suffix, 200)
    };
}

function getDiffAxis(){
    return {
        min:getAxisValue("diffMin", diffAxisMin),
        max:getAxisValue("diffMax", diffAxisMax)
    };
}

function getP11P12DiffAxis(){
    return {
        min:getAxisValue("diffMinP11P12", -5),
        max:getAxisValue("diffMaxP11P12", 5)
    };
}

function getDewAxisP11(){
    return {
        min:getAxisValue("dewMinP11", dewAxisMin),
        max:getAxisValue("dewMaxP11", dewAxisMax)
    };
}

function setTempHumYAxis(chart, axis){
    if(!chart || !chart.options || !chart.options.scales || !axis) return;

    if(chart.options.scales.yHum){
        chart.options.scales.yHum.min = axis.humMin;
        chart.options.scales.yHum.max = axis.humMax;
    }

    if(chart.options.scales.yTemp){
        chart.options.scales.yTemp.min = axis.tempMin;
        chart.options.scales.yTemp.max = axis.tempMax;
    }
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

    return new Chart(canvas,{
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

function createDiffChart(canvasId, p01, p02, minTime, maxTime){

    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(p01) || !hasChartSourceData(p02)) return null;

    destroyExistingChart(canvasId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);

    const tempDiffData = [];
    const humDiffData = [];
const diffAxis = getDiffAxis();
const yAxisOptions = {
    min:diffAxis.min,
    max:diffAxis.max,
    ticks:{
        stepSize:1,
        color:"#000"
    },
    title:{
        display:true,
        text:"差",
        color:"#000"
    }
};

// P01の時刻に一番近いP02データを探す
// ずれ許容：6分（360秒）以内
const toleranceMs = 360 * 1000;
const zeroOriginFill = {
    target:"origin",
    above:"rgba(120, 120, 120, 0.18)",
    below:"rgba(120, 120, 120, 0.18)"
};

p01.forEach(d=>{

    let nearestP02 = null;
    let nearestDiff = Infinity;

    p02.forEach(p=>{
        const diff = Math.abs(d.xValue - p.xValue);

        if(diff < nearestDiff){
            nearestDiff = diff;
            nearestP02 = p;
        }
    });

    if(!nearestP02) return;

    // 時刻差が大きすぎるものは使わない
    if(nearestDiff > toleranceMs) return;

    const p02Data = nearestP02;

        if(d.temp !== null && p02Data.temp !== null && !isNaN(d.temp) && !isNaN(p02Data.temp)){
            tempDiffData.push({ x:d.xValue, y:d.temp - p02Data.temp });
        }

        if(d.hum !== null && p02Data.hum !== null && !isNaN(d.hum) && !isNaN(p02Data.hum)){
            humDiffData.push({ x:d.xValue, y:d.hum - p02Data.hum });
        }
    });

    if(!tempDiffData.length && !humDiffData.length) return null;

    return new Chart(canvas,{
        type:"line",
        data:{
            datasets:[
                {
                    label:"温度差 P01−P02 (℃)",
                    data:tempDiffData,
                    borderColor:"rgb(255, 0, 0)",
                    backgroundColor:"rgba(255, 0, 0, 0.15)",
                    pointBackgroundColor:"rgb(255, 0, 0)",
                    pointRadius:0,
                    borderWidth:2,
                    tension:0.2,
                    fill:zeroOriginFill
                },
                {
                    label:"湿度差 P01−P02 (%)",
                    data:humDiffData,
                    borderColor:"rgb(120, 170, 255)",
                    backgroundColor:"rgba(120, 170, 255, 0.12)",
                    pointBackgroundColor:"rgb(120, 170, 255)",
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
                }
            ]
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

function createTempHumDiagnosticDiffChart(canvasId, firstData, secondData, firstPointId, secondPointId, axis, minTime, maxTime){

    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(firstData) || !hasChartSourceData(secondData)) return null;

    destroyExistingChart(canvasId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);
    const tempDiffData = [];
    const humDiffData = [];
    const toleranceMs = 360 * 1000;
    const yAxisOptions = {
        min:axis.min,
        max:axis.max,
        ticks:{
            stepSize:1,
            color:"#000"
        },
        title:{
            display:true,
            text:"差",
            color:"#000"
        }
    };
    const zeroOriginFill = {
        target:"origin",
        above:"rgba(120, 120, 120, 0.18)",
        below:"rgba(120, 120, 120, 0.18)"
    };

    firstData.forEach(first=>{
        let nearestSecond = null;
        let nearestDiff = Infinity;

        secondData.forEach(second=>{
            const diff = Math.abs(first.xValue - second.xValue);

            if(diff < nearestDiff){
                nearestDiff = diff;
                nearestSecond = second;
            }
        });

        if(!nearestSecond || nearestDiff > toleranceMs) return;

        if(first.temp !== null && nearestSecond.temp !== null && !isNaN(first.temp) && !isNaN(nearestSecond.temp)){
            tempDiffData.push({ x:first.xValue, y:first.temp - nearestSecond.temp });
        }

        if(first.hum !== null && nearestSecond.hum !== null && !isNaN(first.hum) && !isNaN(nearestSecond.hum)){
            humDiffData.push({ x:first.xValue, y:first.hum - nearestSecond.hum });
        }
    });

    if(!tempDiffData.length && !humDiffData.length) return null;

    return new Chart(canvas,{
        type:"line",
        data:{
            datasets:[
                {
                    label:"温度差 " + firstPointId + "−" + secondPointId + " (℃)",
                    data:tempDiffData,
                    borderColor:"rgb(255, 0, 0)",
                    backgroundColor:"rgba(255, 0, 0, 0.15)",
                    pointBackgroundColor:"rgb(255, 0, 0)",
                    pointRadius:0,
                    borderWidth:2,
                    tension:0.2,
                    fill:zeroOriginFill
                },
                {
                    label:"湿度差 " + firstPointId + "−" + secondPointId + " (%RH)",
                    data:humDiffData,
                    borderColor:"rgb(120, 170, 255)",
                    backgroundColor:"rgba(120, 170, 255, 0.12)",
                    pointBackgroundColor:"rgb(120, 170, 255)",
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
                }
            ]
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

function createSingleSensorDiagnosticDiffChart(canvasId, firstData, secondData, dataKey, firstPointId, secondPointId, label, unit, axis, minTime, maxTime){

    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(firstData) || !hasChartSourceData(secondData)) return null;

    destroyExistingChart(canvasId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);
    const diffData = [];
    const toleranceMs = 360 * 1000;
    const yAxisOptions = {
        min:axis.min,
        max:axis.max,
        ticks:{
            color:"#000",
            callback:unit === "ppm" ? formatIntegerAxisTick : undefined
        },
        title:{
            display:true,
            text:unit,
            color:"#000"
        }
    };
    const zeroOriginFill = {
        target:"origin",
        above:"rgba(120, 120, 120, 0.18)",
        below:"rgba(120, 120, 120, 0.18)"
    };

    firstData.forEach(first=>{
        let nearestSecond = null;
        let nearestDiff = Infinity;

        secondData.forEach(second=>{
            const diff = Math.abs(first.xValue - second.xValue);

            if(diff < nearestDiff){
                nearestDiff = diff;
                nearestSecond = second;
            }
        });

        if(!nearestSecond || nearestDiff > toleranceMs) return;

        const firstValue = first[dataKey];
        const secondValue = nearestSecond[dataKey];
        if(firstValue === null || secondValue === null || isNaN(firstValue) || isNaN(secondValue)) return;

        diffData.push({ x:first.xValue, y:firstValue - secondValue });
    });

    if(!diffData.length) return null;

    return new Chart(canvas,{
        type:"line",
        data:{
            datasets:[
                {
                    label:label + " " + firstPointId + "−" + secondPointId + " (" + unit + ")",
                    data:diffData,
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
                }
            ]
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

// === 振り返り・メンテナンスのグラフ操作とDIF集計 ===
function configureReviewChart(chart){
    if(!chart) return chart;

    if(chart.options && chart.options.plugins && chart.options.plugins.zoom && chart.options.plugins.zoom.zoom){
        chart.options.plugins.zoom.zoom.onZoomComplete = ({chart})=>{ syncReviewZoom(chart); };
    }
    if(chart.options && chart.options.plugins && chart.options.plugins.crosshair && chart.options.plugins.crosshair.sync){
        chart.options.plugins.crosshair.sync.group = 3;
    }

    applyReviewDefaultYAxis(chart);
    saveInitialScaleLimits(chart);
    return chart;
}

function getReviewTempHumAxis(pointId){
    const defaults = reviewAxisDefaults.tempHum;
    return {
        humMin:getAxisValue("reviewHumMin" + pointId, defaults.humMin),
        humMax:getAxisValue("reviewHumMax" + pointId, defaults.humMax),
        tempMin:getAxisValue("reviewTempMin" + pointId, defaults.tempMin),
        tempMax:getAxisValue("reviewTempMax" + pointId, defaults.tempMax)
    };
}

function getReviewSingleAxis(key){
    const defaults = reviewAxisDefaults[key] || {};

    const inputMap = {
        outsideDiff:["reviewOutsideDiffMin", "reviewOutsideDiffMax"],
        vapor:["reviewVaporMin", "reviewVaporMax"],
        solar:["reviewSolarMin", "reviewSolarMax"],
        co2:["reviewCo2Min", "reviewCo2Max"],
        co2Outside:["reviewCo2OutsideMin", "reviewCo2OutsideMax"],
        co2Diff:["reviewCo2DiffMin", "reviewCo2DiffMax"]
    };

    const ids = inputMap[key] || [];
    return {
        min:getAxisValue(ids[0], defaults.min),
        max:getAxisValue(ids[1], defaults.max)
    };
}

function applyReviewDefaultYAxis(chart){
    if(!chart || !chart.canvas) return;

    const id = chart.canvas.id;
    if(id === "reviewTempChartP01" || id === "reviewTempChartP11"){
        setTempHumYAxis(chart, reviewAxisDefaults.tempHum);
        return;
    }

    const axisMap = {
        reviewOutsideDiffChart:"outsideDiff",
        reviewVaporChart:"vapor",
        reviewSolarChart:"solar",
        reviewCo2Chart:"co2",
        reviewCo2OutsideChart:"co2Outside",
        reviewCo2DiffChart:"co2Diff"
    };

    setLinearYAxis(chart, reviewAxisDefaults[axisMap[id]]);
}

function resetReviewAxisInputs(){
    [
        ["reviewHumMinP01", reviewAxisDefaults.tempHum.humMin],
        ["reviewHumMaxP01", reviewAxisDefaults.tempHum.humMax],
        ["reviewTempMinP01", reviewAxisDefaults.tempHum.tempMin],
        ["reviewTempMaxP01", reviewAxisDefaults.tempHum.tempMax],
        ["reviewHumMinP11", reviewAxisDefaults.tempHum.humMin],
        ["reviewHumMaxP11", reviewAxisDefaults.tempHum.humMax],
        ["reviewTempMinP11", reviewAxisDefaults.tempHum.tempMin],
        ["reviewTempMaxP11", reviewAxisDefaults.tempHum.tempMax],
        ["reviewOutsideDiffMin", reviewAxisDefaults.outsideDiff.min],
        ["reviewOutsideDiffMax", reviewAxisDefaults.outsideDiff.max],
        ["reviewVaporMin", reviewAxisDefaults.vapor.min],
        ["reviewVaporMax", reviewAxisDefaults.vapor.max],
        ["reviewSolarMin", reviewAxisDefaults.solar.min],
        ["reviewSolarMax", reviewAxisDefaults.solar.max],
        ["reviewCo2Min", reviewAxisDefaults.co2.min],
        ["reviewCo2Max", reviewAxisDefaults.co2.max],
        ["reviewCo2OutsideMin", reviewAxisDefaults.co2Outside.min],
        ["reviewCo2OutsideMax", reviewAxisDefaults.co2Outside.max],
        ["reviewCo2DiffMin", reviewAxisDefaults.co2Diff.min],
        ["reviewCo2DiffMax", reviewAxisDefaults.co2Diff.max]
    ].forEach(([id, value])=>{
        const input = document.getElementById(id);
        if(input) input.value = value === undefined ? "" : value;
    });
}

function applyReviewTempHumYAxis(chart, pointId){
    if(!chart) return;
    setTempHumYAxis(chart, getReviewTempHumAxis(pointId));
    chart.update();
}

function applyReviewSingleYAxis(chart, key){
    if(!chart) return;
    setLinearYAxis(chart, getReviewSingleAxis(key));
    chart.update();
}

function getReviewChartGroup(chart){
    if(!chart || !chart.canvas) return "";
    if(["reviewTempChartP01", "reviewTempChartP11"].includes(chart.canvas.id)) return "tempHum";
    return "";
}

function syncReviewZoom(sourceChart){
    if(syncingReviewZoom) return;
    syncingReviewZoom = true;

    const xScale = sourceChart.scales.x;
    const isTempHumSource = getReviewChartGroup(sourceChart) === "tempHum";
    const reviewCo2ChartIds = ["reviewCo2Chart", "reviewCo2OutsideChart"];
    const isReviewCo2Source = reviewCo2ChartIds.includes(sourceChart.canvas.id);
    const isReviewCo2DiffSource = sourceChart.canvas.id === "reviewCo2DiffChart";

    reviewCharts.forEach(chart=>{
        if(!chart || chart === sourceChart) return;

        const preserveCo2Y = isReviewCo2DiffSource && reviewCo2ChartIds.includes(chart.canvas.id) && chart.scales.y
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

        if(isTempHumSource && getReviewChartGroup(chart) === "tempHum"){
            if(chart.zoomScale){
                chart.zoomScale("yHum", {
                    min:sourceChart.scales.yHum.min,
                    max:sourceChart.scales.yHum.max
                }, "none");
                chart.zoomScale("yTemp", {
                    min:sourceChart.scales.yTemp.min,
                    max:sourceChart.scales.yTemp.max
                }, "none");
            }else{
                chart.options.scales.yHum.min = sourceChart.scales.yHum.min;
                chart.options.scales.yHum.max = sourceChart.scales.yHum.max;
                chart.options.scales.yTemp.min = sourceChart.scales.yTemp.min;
                chart.options.scales.yTemp.max = sourceChart.scales.yTemp.max;
                chart.update("none");
            }
        }

        if(isReviewCo2Source && reviewCo2ChartIds.includes(chart.canvas.id) && sourceChart.scales.y){
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
    });

    syncingReviewZoom = false;
}

function syncMaintenanceZoom(sourceChart){
    if(syncingMaintenanceZoom || !sourceChart || !sourceChart.scales || !sourceChart.scales.x) return;
    if(sourceChart.canvas.id === "voltChart") return;
    syncingMaintenanceZoom = true;

    try{
        const xRange = { min:sourceChart.scales.x.min, max:sourceChart.scales.x.max };
        const tempHumChartIds = ["maintenanceTempChartP01", "tempChartP02", "maintenanceTempChartP11", "tempChartP12"];
        const co2ChartIds = ["co2ChartP22", "co2ChartP27"];
        const isTempHumSource = tempHumChartIds.includes(sourceChart.canvas.id);
        const isCo2Source = co2ChartIds.includes(sourceChart.canvas.id);

        maintenanceCharts.forEach(chart=>{
        if(!chart || chart === sourceChart || !chart.options || !chart.options.scales) return;
        if(chart.canvas.id === "voltChart") return;

        if(chart.zoomScale){
            chart.zoomScale("x", xRange, "none");
        }else{
            chart.options.scales.x.min = xRange.min;
            chart.options.scales.x.max = xRange.max;
            chart.update("none");
        }

        if(isTempHumSource && tempHumChartIds.includes(chart.canvas.id)){
            ["yHum", "yTemp"].forEach(scaleId=>{
                if(!sourceChart.scales[scaleId]) return;
                const yRange = {
                    min:sourceChart.scales[scaleId].min,
                    max:sourceChart.scales[scaleId].max
                };
                if(chart.zoomScale){
                    chart.zoomScale(scaleId, yRange, "none");
                }else if(chart.options.scales[scaleId]){
                    chart.options.scales[scaleId].min = yRange.min;
                    chart.options.scales[scaleId].max = yRange.max;
                }
            });
            if(!chart.zoomScale) chart.update("none");
        }

        if(isCo2Source && co2ChartIds.includes(chart.canvas.id) && sourceChart.scales.y){
            const yRange = { min:sourceChart.scales.y.min, max:sourceChart.scales.y.max };
            if(chart.zoomScale){
                chart.zoomScale("y", yRange, "none");
                if(chart.scales.yRight) chart.zoomScale("yRight", yRange, "none");
            }else{
                chart.options.scales.y.min = yRange.min;
                chart.options.scales.y.max = yRange.max;
                if(chart.options.scales.yRight){
                    chart.options.scales.yRight.min = yRange.min;
                    chart.options.scales.yRight.max = yRange.max;
                }
                chart.update("none");
            }
        }
        });
    }finally{
        syncingMaintenanceZoom = false;
    }
}

function destroyMaintenanceCharts(){
    clearSyncedTooltipGroup("maintenance");
    maintenanceCharts.forEach(chart=>{
        if(chart) chart.destroy();
    });
    maintenanceCharts = [];

    maintenanceCanvasIds.forEach(canvasId=>{
        clearChartNoDataState(canvasId);
        const chart = Chart.getChart(canvasId);
        if(chart) chart.destroy();
    });

    maintenanceTempChartP01 = null;
    maintenanceTempChartP11 = null;
    tempChartP02 = null;
    diffChart = null;
    tempChartP12 = null;
    diffChartP11P12 = null;
    vaporChartP11 = null;
    dewChartP11 = null;
    dewChart = null;
    co2ChartP22 = null;
    co2DiffChartP21P22 = null;
    co2ChartP27 = null;
    co2DiffChartP26P27 = null;
    solarChartP32 = null;
    solarDiffChartP31P32 = null;
    voltChart = null;
}

function resetMaintenanceZoom(){
    if(syncingMaintenanceZoom) return;
    clearSyncedTooltipGroup("maintenance");
    syncingMaintenanceZoom = true;
    try{
        maintenanceCharts.forEach(chart=>{
            if(!chart) return;
            if(chart.resetZoom) chart.resetZoom("none");
            redrawChart(chart);
        });

        requestAnimationFrame(()=>{
            maintenanceCharts.forEach(redrawChart);
        });
    }finally{
        syncingMaintenanceZoom = false;
    }
}

function destroyReviewCharts(){
    clearSyncedTooltipGroup("review");
    reviewCharts.forEach(chart=>{
        if(chart) chart.destroy();
    });
    reviewCharts = [];

    [
        "reviewTempChartP01",
        "reviewTempChartP11",
        "reviewOutsideDiffChart",
        "reviewVaporChart",
        "reviewSolarChart",
        "reviewCo2Chart",
        "reviewCo2OutsideChart",
        "reviewCo2DiffChart"
    ].forEach(canvasId=>{
        clearChartNoDataState(canvasId);
        const chart = Chart.getChart(canvasId);
        if(chart) chart.destroy();
    });
}

function resetReviewZoom(){
    clearSyncedTooltipGroup("review");
    syncingReviewZoom = true;
    resetReviewAxisInputs();

    reviewCharts.forEach(chart=>{
        if(chart){
            if(chart.resetZoom) chart.resetZoom("none");
            redrawChart(chart);
        }
    });

    requestAnimationFrame(()=>{
        reviewCharts.forEach(chart=>{
            redrawChart(chart);
        });
        syncingReviewZoom = false;
    });
}

// === DIF：地域の日の出・日没による昼夜の区切り ===
/**
 * 対象日と地域から、当日日の出・当日日没・翌日日の出の境界をミリ秒で返す。
 * 昼は[当日日の出, 当日日没)、夜は[当日日没, 翌日日の出)。夜は対象日の行に属する。
 * calculateSunTimeの時刻文字列をDate.setHoursで組み立てるため、日時はブラウザのローカル時刻に依存する。
 * 実在しない日付や日の出・日没の時刻を求められない場合はnull。
 */
function createReviewDifBoundaries(dateValue, area){
    const dateParts = String(dateValue || "").split("-").map(Number);
    if(dateParts.length !== 3 || dateParts.some(part=>!Number.isInteger(part))) return null;

    const year = dateParts[0];
    const month = dateParts[1];
    const day = dateParts[2];
    const selectedDate = new Date(year, month - 1, day);
    if(
        selectedDate.getFullYear() !== year ||
        selectedDate.getMonth() !== month - 1 ||
        selectedDate.getDate() !== day
    ){
        return null;
    }

    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const sunriseText = calculateSunTime(year, month, day, true, area);
    const sunsetText = calculateSunTime(year, month, day, false, area);
    const nextSunriseText = calculateSunTime(
        nextDate.getFullYear(),
        nextDate.getMonth() + 1,
        nextDate.getDate(),
        true,
        area
    );
    const sunriseMinutes = timeTextToMinutes(sunriseText);
    const sunsetMinutes = timeTextToMinutes(sunsetText);
    const nextSunriseMinutes = timeTextToMinutes(nextSunriseText);

    if(
        sunriseMinutes === null ||
        sunsetMinutes === null ||
        nextSunriseMinutes === null
    ){
        return null;
    }

    const sunrise = new Date(selectedDate);
    sunrise.setHours(Math.floor(sunriseMinutes / 60), sunriseMinutes % 60, 0, 0);
    const sunset = new Date(selectedDate);
    sunset.setHours(Math.floor(sunsetMinutes / 60), sunsetMinutes % 60, 0, 0);
    const nextSunrise = new Date(nextDate);
    nextSunrise.setHours(
        Math.floor(nextSunriseMinutes / 60),
        nextSunriseMinutes % 60,
        0,
        0
    );

    return {
        date:selectedDate,
        sunrise:sunrise.getTime(),
        sunset:sunset.getTime(),
        nextSunrise:nextSunrise.getTime(),
        sunriseText,
        sunsetText,
        nextSunriseText
    };
}

/**
 * P01の気温（℃）を昼・夜それぞれ件数で単純平均し、DIF=昼平均−夜平均（℃）とする。
 * null・undefined・空文字・非有限の気温、無効な時刻を除く。欠測の補間や時間による重み付けはしない。
 * 各区間に有効値がなければ平均はnull。最低件数や測定間隔・充足率の条件は設けていない。
 * nowTimeは状態判定に使い、データを現在時刻で切り落とす処理はない。取得範囲にも注意する。
 * 翌日日の出に達するまではdif=null。到達後、昼夜両方に平均があれば丸め前の平均同士を引く。
 * 単日の「確定」は時間帯が終了した意味で、データの充足を保証しない。7日表の状態判定とは区別する。
 */
function calculateReviewDif(p01, boundaries, nowTime){
    const result = {
        dayAverage:null,
        nightAverage:null,
        dif:null,
        dayCount:0,
        nightCount:0,
        status:"計算前"
    };
    if(!boundaries) return result;

    let dayTotal = 0;
    let nightTotal = 0;
    (Array.isArray(p01) ? p01 : []).forEach(item=>{
        if(!item) return;
        const temperature = item.temp;
        if(
            temperature === null ||
            temperature === undefined ||
            temperature === "" ||
            !Number.isFinite(Number(temperature))
        ){
            return;
        }

        const xValue = Number.isFinite(item.xValue)
            ? item.xValue
            : item.x instanceof Date
                ? item.x.getTime()
                : NaN;
        if(!Number.isFinite(xValue)) return;

        const value = Number(temperature);
        if(xValue >= boundaries.sunrise && xValue < boundaries.sunset){
            dayTotal += value;
            result.dayCount++;
        }else if(xValue >= boundaries.sunset && xValue < boundaries.nextSunrise){
            nightTotal += value;
            result.nightCount++;
        }
    });

    result.dayAverage = result.dayCount ? dayTotal / result.dayCount : null;
    result.nightAverage = result.nightCount ? nightTotal / result.nightCount : null;

    const currentTime = Number.isFinite(nowTime) ? nowTime : Date.now();
    if(currentTime < boundaries.sunrise){
        result.status = "計算前";
    }else if(currentTime < boundaries.sunset){
        result.status = "昼集計中";
    }else if(currentTime < boundaries.nextSunrise){
        result.status = "夜集計中";
    }else{
        result.status = "確定";
        if(result.dayAverage !== null && result.nightAverage !== null){
            result.dif = result.dayAverage - result.nightAverage;
        }
    }

    return result;
}

function formatReviewDifTemperature(value){
    return value === null ? "－（データなし）" : value.toFixed(1) + "℃";
}

// DIFは小数1桁で表示し、正の値には+を付ける。計算内部の値はここでは変更しない。
function formatReviewDifValue(value){
    if(value === null) return "－（算出不可）";
    const rounded = Number(value.toFixed(1));
    return (rounded > 0 ? "+" : "") + rounded.toFixed(1) + "℃";
}

function setReviewDifText(id, text){
    const element = document.getElementById(id);
    if(element) element.textContent = text;
}

// データ取得中・取得エラーでも、選択日と地域の昼夜の時間帯を示して数値欄を置き換える。
function renderReviewDifRequestState(dateValue, status){
    const panel = document.getElementById("reviewDifPanel");
    const area = getSelectedUtechArea();
    const boundaries = createReviewDifBoundaries(dateValue, area);
    if(!panel || !boundaries) return;

    const date = boundaries.date;
    const isLoading = status === "データ取得中";
    const valueText = isLoading ? "読み込み中" : "－";

    setReviewDifText(
        "reviewDifDate",
        date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日"
    );
    setReviewDifText("reviewDifArea", area.label);
    setReviewDifText(
        "reviewDifDayPeriod",
        boundaries.sunriseText + "～" + boundaries.sunsetText
    );
    setReviewDifText(
        "reviewDifNightPeriod",
        boundaries.sunsetText + "～翌" + boundaries.nextSunriseText
    );
    setReviewDifText("reviewDifDayAverage", valueText);
    setReviewDifText("reviewDifNightAverage", valueText);
    setReviewDifText("reviewDifValue", valueText);
    setReviewDifText("reviewDifDayCount", "－");
    setReviewDifText("reviewDifNightCount", "－");
    setReviewDifText("reviewDifStatus", status);
    panel.hidden = false;
}

// 単日パネル：集計中の平均には途中経過を付け、DIFは翌日日の出まで「未確定」と表示する。
// 日の出前は平均も「計算前」。時間帯終了後に昼夜のどちらかが欠損ならDIFは「算出不可」。
function renderReviewDif(){
    const panel = document.getElementById("reviewDifPanel");
    if(!panel || !reviewDifDateValue) return;

    if(reviewDifDisplayState === "loading"){
        renderReviewDifRequestState(reviewDifDateValue, "データ取得中");
        return;
    }
    if(reviewDifDisplayState === "error"){
        renderReviewDifRequestState(reviewDifDateValue, "取得エラー");
        return;
    }

    const area = getSelectedUtechArea();
    const boundaries = createReviewDifBoundaries(reviewDifDateValue, area);
    if(!boundaries){
        panel.hidden = true;
        return;
    }

    const result = calculateReviewDif(reviewDifP01, boundaries, Date.now());
    const beforeSunrise = result.status === "計算前";
    const duringDay = result.status === "昼集計中";
    const duringNight = result.status === "夜集計中";
    const date = boundaries.date;

    setReviewDifText(
        "reviewDifDate",
        date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日"
    );
    setReviewDifText("reviewDifArea", area.label);
    setReviewDifText(
        "reviewDifDayPeriod",
        boundaries.sunriseText + "～" + boundaries.sunsetText
    );
    setReviewDifText(
        "reviewDifNightPeriod",
        boundaries.sunsetText + "～翌" + boundaries.nextSunriseText
    );
    setReviewDifText(
        "reviewDifDayAverage",
        beforeSunrise
            ? "計算前"
            : formatReviewDifTemperature(result.dayAverage) + (duringDay && result.dayAverage !== null ? "（途中経過）" : "")
    );
    setReviewDifText(
        "reviewDifNightAverage",
        beforeSunrise || duringDay
            ? "計算前"
            : formatReviewDifTemperature(result.nightAverage) + (duringNight && result.nightAverage !== null ? "（途中経過）" : "")
    );
    setReviewDifText(
        "reviewDifValue",
        beforeSunrise || duringDay || duringNight ? "未確定" : formatReviewDifValue(result.dif)
    );
    setReviewDifText("reviewDifDayCount", result.dayCount + "件");
    setReviewDifText("reviewDifNightCount", result.nightCount + "件");
    setReviewDifText("reviewDifStatus", result.status);
    panel.hidden = false;
}

// 終了日を含む日付一覧を古い順に作る。件数が正の整数でなければ7日を使う。
// 日付の計算・整形はブラウザのローカル時刻に依存する。
function createReviewDifPeriodDateValues(endDateValue, dayCount){
    const parts = String(endDateValue || "").split("-").map(Number);
    if(parts.length !== 3 || parts.some(part=>!Number.isInteger(part))) return [];

    const endDate = new Date(parts[0], parts[1] - 1, parts[2]);
    if(
        endDate.getFullYear() !== parts[0] ||
        endDate.getMonth() !== parts[1] - 1 ||
        endDate.getDate() !== parts[2]
    ){
        return [];
    }

    const count = Number.isInteger(dayCount) && dayCount > 0 ? dayCount : 7;
    const dateValues = [];
    for(let offset = count - 1; offset >= 0; offset--){
        const date = new Date(endDate);
        date.setDate(endDate.getDate() - offset);
        dateValues.push(formatDateInputValue(date));
    }
    return dateValues;
}

// 参考の日平均は対象日の[0時, 翌日0時)で算出し、DIF用の昼夜合計期間とは異なる。
// 有効な気温の件数平均で、0件ならaverage=null。時刻・気温の除外条件はDIFと同様。
function calculateReviewDailyAverage(p01, targetDate){
    const result = { average:null, count:0 };
    if(!(targetDate instanceof Date) || isNaN(targetDate.getTime())) return result;

    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    let total = 0;

    (Array.isArray(p01) ? p01 : []).forEach(item=>{
        if(!item) return;
        const temperature = item.temp;
        if(
            temperature === null ||
            temperature === undefined ||
            temperature === "" ||
            !Number.isFinite(Number(temperature))
        ){
            return;
        }

        const xValue = Number.isFinite(item.xValue)
            ? item.xValue
            : item.x instanceof Date
                ? item.x.getTime()
                : NaN;
        if(!Number.isFinite(xValue) || xValue < start.getTime() || xValue >= end.getTime()) return;

        total += Number(temperature);
        result.count++;
    });

    if(result.count) result.average = total / result.count;
    return result;
}

// 7日表の状態は時間帯の進行を優先する。終了後に両区間0件なら「データなし」、片方0件なら「データ不足」。
// 両区間に1件以上あれば「確定」。単日のcalculateReviewDif.statusより欠損の区別が細かい。
function getReviewDifPeriodStatus(boundaries, difResult, nowTime){
    const currentTime = Number.isFinite(nowTime) ? nowTime : Date.now();
    if(!boundaries || !difResult) return "データなし";
    if(boundaries.date.getTime() > currentTime) return "未到来";

    if(difResult.status === "計算前") return "日の出前";
    if(difResult.status === "昼集計中") return "昼間集計中";
    if(difResult.status === "夜集計中") return "夜間集計中";
    if(difResult.dayCount === 0 && difResult.nightCount === 0) return "データなし";
    if(difResult.dayCount === 0 || difResult.nightCount === 0) return "データ不足";
    return "確定";
}

// 終了日を含む7日について昼夜平均・DIF・暦日平均を作り、表示用に新しい日順へ反転する。
// 各日の夜は翌朝まで含むため、取得データには終了日の翌日分も必要。
function calculateReviewDifPeriodRows(p01, endDateValue, area, nowTime){
    const currentTime = Number.isFinite(nowTime) ? nowTime : Date.now();
    return createReviewDifPeriodDateValues(endDateValue, 7).map(dateValue=>{
        const boundaries = createReviewDifBoundaries(dateValue, area);
        const difResult = calculateReviewDif(p01, boundaries, currentTime);
        const dailyResult = calculateReviewDailyAverage(p01, boundaries ? boundaries.date : null);
        const date = boundaries ? boundaries.date : null;

        return {
            dateValue,
            dateText:date ? (date.getMonth() + 1) + "/" + date.getDate() : dateValue,
            dayAverage:difResult.dayAverage,
            nightAverage:difResult.nightAverage,
            dif:difResult.dif,
            dailyAverage:dailyResult.average,
            status:getReviewDifPeriodStatus(boundaries, difResult, currentTime)
        };
    }).reverse();
}

function formatReviewDifPeriodTemperature(value, showSign){
    if(value === null || value === undefined || !Number.isFinite(value)) return "—";
    const rounded = Number(value.toFixed(1));
    return (showSign && rounded > 0 ? "+" : "") + rounded.toFixed(1) + "℃";
}

function updateReviewDifPeriodMeta(){
    const dateValues = createReviewDifPeriodDateValues(reviewDifPeriodEndDateValue, 7);
    const area = getSelectedUtechArea();
    const rangeElement = document.getElementById("reviewDifPeriodRange");
    const areaElement = document.getElementById("reviewDifPeriodArea");

    if(rangeElement){
        if(dateValues.length){
            const first = dateValues[0].split("-").map(Number);
            const last = dateValues[dateValues.length - 1].split("-").map(Number);
            rangeElement.textContent =
                first[0] + "年" + first[1] + "月" + first[2] + "日～" +
                last[0] + "年" + last[1] + "月" + last[2] + "日";
        }else{
            rangeElement.textContent = "－";
        }
    }
    if(areaElement) areaElement.textContent = area.label;
}

function renderReviewDifPeriodMessage(message){
    const body = document.getElementById("reviewDifPeriodBody");
    if(!body) return;

    body.textContent = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = message;
    row.appendChild(cell);
    body.appendChild(row);
}

function renderReviewDifPeriod(){
    const panel = document.getElementById("reviewDifPeriodPanel");
    const body = document.getElementById("reviewDifPeriodBody");
    if(!panel || !body || !reviewDifPeriodEndDateValue) return;

    updateReviewDifPeriodMeta();
    panel.hidden = false;

    if(reviewDifPeriodDisplayState === "loading"){
        renderReviewDifPeriodMessage("データ取得中");
        return;
    }
    if(reviewDifPeriodDisplayState === "error"){
        renderReviewDifPeriodMessage("取得エラー");
        return;
    }

    body.textContent = "";
    reviewDifRows.forEach(item=>{
        const row = document.createElement("tr");
        [
            { text:item.dateText, secondary:false },
            { text:formatReviewDifPeriodTemperature(item.dayAverage, false), secondary:false },
            { text:formatReviewDifPeriodTemperature(item.nightAverage, false), secondary:false },
            { text:formatReviewDifPeriodTemperature(item.dif, true), secondary:false },
            { text:formatReviewDifPeriodTemperature(item.dailyAverage, false), secondary:true },
            { text:item.status, secondary:true }
        ].forEach(column=>{
            const cell = document.createElement("td");
            cell.textContent = column.text;
            if(column.secondary) cell.className = "review-dif-period-secondary";
            row.appendChild(cell);
        });
        body.appendChild(row);
    });
}

// 取得済みのP01を使い、現在の地域と時刻で境界・状態を再計算する。ここでは再取得しない。
// 取得中・エラー時は計算せず状態表示を更新する。
function recalculateReviewDifPeriodRows(){
    if(!reviewDifPeriodEndDateValue) return;
    if(reviewDifPeriodDisplayState !== "ready"){
        renderReviewDifPeriod();
        return;
    }

    reviewDifRows = calculateReviewDifPeriodRows(
        reviewDifPeriodP01,
        reviewDifPeriodEndDateValue,
        getSelectedUtechArea(),
        Date.now()
    );
    renderReviewDifPeriod();
}

/**
 * 7日表用のP01を取得する。期間は最初の日の0時〜終了日の翌日23:59:59まで。
 * 翌朝までの夜間データを含むため、表の対象7日より取得範囲を広くしている。
 * 同じ条件の取得中は重複を省き、応答時には連番・現在の利用者ID・選択日を確認する。
 * 通信エラー時は保持データを空にしてエラー表示。正常な0件はreadyとなり集計側で欠損を示す。
 */
async function loadReviewDifPeriodData(userId, endDateValue){
    const requestKey = userId + "\n" + endDateValue + "\n7";
    if(reviewDifPeriodLoadingKey === requestKey) return;

    const dateValues = createReviewDifPeriodDateValues(endDateValue, 7);
    if(dateValues.length !== 7) return;

    const requestId = ++reviewDifPeriodRequestSequence;
    reviewDifPeriodLoadingKey = requestKey;
    reviewDifPeriodP01 = [];
    reviewDifRows = [];
    reviewDifPeriodEndDateValue = endDateValue;
    reviewDifPeriodDisplayState = "loading";
    renderReviewDifPeriod();

    const startParts = dateValues[0].split("-").map(Number);
    const startTime = new Date(startParts[0], startParts[1] - 1, startParts[2]);
    startTime.setHours(0, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setDate(endTime.getDate() + 7);
    endTime.setHours(23, 59, 59, 999);

    try{
        const result = await fetchDataSafe(userId, "P01", {
            start:formatSqlDateTime(startTime),
            end:formatSqlDateTime(endTime)
        });
        const currentUserId = document.getElementById("reviewUserId").value.trim();
        const reviewDate = document.getElementById("reviewDate");

        if(
            requestId !== reviewDifPeriodRequestSequence ||
            currentUserId !== userId ||
            !reviewDate ||
            reviewDate.value !== endDateValue
        ){
            if(reviewDifPeriodLoadingKey === requestKey) reviewDifPeriodLoadingKey = "";
            return;
        }

        reviewDifPeriodLoadingKey = "";
        if(result.error){
            reviewDifPeriodP01 = [];
            reviewDifRows = [];
            reviewDifPeriodDisplayState = "error";
            renderReviewDifPeriod();
            return;
        }

        reviewDifPeriodP01 = parseData(result.data, startTime);
        reviewDifPeriodDisplayState = "ready";
        recalculateReviewDifPeriodRows();

    }catch(e){
        const currentUserId = document.getElementById("reviewUserId").value.trim();
        const reviewDate = document.getElementById("reviewDate");
        if(
            requestId !== reviewDifPeriodRequestSequence ||
            currentUserId !== userId ||
            !reviewDate ||
            reviewDate.value !== endDateValue
        ){
            if(reviewDifPeriodLoadingKey === requestKey) reviewDifPeriodLoadingKey = "";
            return;
        }

        reviewDifPeriodLoadingKey = "";
        reviewDifPeriodP01 = [];
        reviewDifRows = [];
        reviewDifPeriodDisplayState = "error";
        renderReviewDifPeriod();
        console.error(e);
    }
}

// 単日DIFは過去グラフと共通のP01を使う（選択日の前日0時〜翌日23:59:59を取得）。
// 7日DIFはloadReviewDifPeriodDataで別に取得する。単日パネルの成否はP01の応答で判断する。
async function loadReviewData(){
    clearSyncedTooltipGroup("review");
    const userId = document.getElementById("reviewUserId").value.trim();
    const reviewDate = document.getElementById("reviewDate");
    const msg = document.getElementById("reviewMessage");
    const dateValue = reviewDate ? reviewDate.value : "";

    if(msg) msg.innerText = "";

    if(!userId){
        if(msg) msg.innerText = "user_id を入力してください";
        return;
    }

    if(!dateValue){
        if(msg) msg.innerText = "日付を選択してください";
        return;
    }

    loadReviewDifPeriodData(userId, dateValue);

    const requestKey = userId + "\n" + dateValue;
    if(reviewDataLoadingKey === requestKey){
        if(msg) msg.innerText = "読み込み中...";
        return;
    }

    const requestId = ++reviewDataRequestSequence;
    reviewDataLoadingKey = requestKey;
    reviewDifP01 = [];
    reviewDifDateValue = dateValue;
    reviewDifDisplayState = "loading";
    renderReviewDif();

    // U-Tech main user ID is independent.
    saveUserIdHistory(userId);

    const selectedDate = new Date(dateValue + "T00:00:00");
    const minTime = new Date(selectedDate);
    minTime.setDate(minTime.getDate() - 1);
    const maxTime = new Date(selectedDate);
    maxTime.setDate(maxTime.getDate() + 1);
    maxTime.setHours(23, 59, 59, 999);
    const start = formatSqlDateTime(minTime);
    const end = formatSqlDateTime(maxTime);

    if(msg) msg.innerText = "読み込み中...";

    try{
        const range = { start:start, end:end };
        const results = await Promise.all([
            fetchDataSafe(userId, "P01", range),
            fetchDataSafe(userId, "P11", range),
            fetchDataSafe(userId, "P31", range),
            fetchDataSafe(userId, "P21", range),
            fetchDataSafe(userId, "P26", range)
        ]);

        if(
            requestId !== reviewDataRequestSequence ||
            !reviewDate ||
            reviewDate.value !== dateValue
        ){
            if(reviewDataLoadingKey === requestKey) reviewDataLoadingKey = "";
            return;
        }

        const errors = results.filter(r=>r.error).map(r=>r.error);
        const p01 = parseData(results[0].data, minTime);
        const p11 = parseData(results[1].data, minTime);
        const p31 = parseData(results[2].data, minTime);
        const p21 = parseData(results[3].data, minTime);
        const p26 = parseData(results[4].data, minTime);

        reviewDifP01 = p01;
        reviewDifDateValue = dateValue;
        reviewDifDisplayState = results[0].error ? "error" : "ready";
        renderReviewDif();

        destroyReviewCharts();

        reviewCharts = [
            configureReviewChart(createTempHumChart("reviewTempChartP01", p01, minTime, maxTime, "P01")),
            configureReviewChart(createTempHumChart("reviewTempChartP11", p11, minTime, maxTime, "P11")),
            configureReviewChart(createOutsideDiffChart("reviewOutsideDiffChart", p01, p11, minTime, maxTime)),
            configureReviewChart(createVaporChart("reviewVaporChart", p01, minTime, maxTime)),
            configureReviewChart(createSingleChart("reviewSolarChart", p31, "solar", "日射", "日射", minTime, maxTime)),
            configureReviewChart(createSingleChart("reviewCo2Chart", p21, "co2", "co2", "ppm", minTime, maxTime)),
            configureReviewChart(createSingleChart("reviewCo2OutsideChart", p26, "co2Outside", "co2", "ppm", minTime, maxTime)),
            configureReviewChart(createCo2DiffChart("reviewCo2DiffChart", p21, p26, minTime, maxTime))
        ];

        applyReviewChartNoDataStates(reviewCharts, userId, minTime, maxTime);

        refreshVisibleCharts();
        if(msg) msg.innerText = errors.length ? errors.join(" / ") : "";
        reviewDataLoadingKey = "";

    }catch(e){
        if(
            requestId !== reviewDataRequestSequence ||
            !reviewDate ||
            reviewDate.value !== dateValue
        ){
            if(reviewDataLoadingKey === requestKey) reviewDataLoadingKey = "";
            return;
        }

        reviewDataLoadingKey = "";
        reviewDifP01 = [];
        reviewDifDateValue = dateValue;
        reviewDifDisplayState = "error";
        renderReviewDif();
        if(msg) msg.innerText = "過去データ表示エラー：" + e.message;
        console.error(e);
    }
}

function applyTempHumYAxis(chart, pointId){
    if(!chart) return;

    const axis = getTempHumAxis(pointId);
    setTempHumYAxis(chart, axis);

    chart.update();
}

function applyDiffYAxis(chart){
    if(!chart) return;

    const axis = getDiffAxis();
    setLinearYAxis(chart, axis);

    chart.update();
}

function applyP11P12DiffYAxis(chart){
    if(!chart) return;

    setLinearYAxis(chart, getP11P12DiffAxis());
    chart.update();
}

function applyCo2DiagnosticDiffYAxis(chart, firstPointId, secondPointId){
    if(!chart) return;

    setLinearYAxis(chart, getCo2DiagnosticDiffAxis(firstPointId, secondPointId));
    chart.update();
}

function applySolarDiagnosticDiffYAxis(chart, firstPointId, secondPointId){
    if(!chart) return;

    setLinearYAxis(chart, getSolarDiagnosticDiffAxis(firstPointId, secondPointId));
    chart.update();
}

// === 通知：保存・一括停止の実行と操作中の表示 ===
function setAlertSettingsBusy(busy){
    alertSettingsBusy = busy;
    for(const id of ["alertSaveButton", "alertDisableAllButton"]){
        const button = document.getElementById(id);
        if(button) button.disabled = busy;
    }
}

async function disableAllAlerts(){
    if(alertSettingsBusy) return;
    const userId = document.getElementById("alertUserId").value.trim();
    const message = document.getElementById("alertMessage");
    if(!userId){
        message.innerText = "解除するuser_idを入力してください";
        return;
    }
    if(!window.confirm("user_id：" + userId + " の全測定地点のアラートを解除します。\n他のuser_idの設定には影響しません。\n設定内容と通知履歴は残ります。解除しますか？")) return;

    setAlertSettingsBusy(true);
    message.innerText = userId + " のアラートを解除中...";
    try{
        const response = await fetch("disable_all_alerts.php", {
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body:JSON.stringify({ scope:"user", user_id:userId, confirmed:true })
        });
        const result = await response.json();
        if(!response.ok || !result.success){
            throw new Error(result.error || "アラートの一括解除に失敗しました");
        }
        if(document.getElementById("alertUserId").value.trim() !== userId) return;
        await loadActiveAlertSetting(userId);
        if(document.getElementById("alertUserId").value.trim() !== userId) return;
        if(!activeAlertSettingExists) document.getElementById("alertEnabled").checked = false;
        message.innerText = userId + " のアラートを解除しました（" + Number(result.disabled_count) + "件）。";
    }catch(error){
        if(document.getElementById("alertUserId").value.trim() !== userId) return;
        message.innerText = "一括解除失敗：" + error.message;
    }finally{
        setAlertSettingsBusy(false);
    }
}

async function saveAlertSetting(){
    if(alertSettingsBusy) return;

    const userId = document.getElementById("alertUserId").value.trim();
    const pointId = getSelectedAlertPointId();
    const alertMessage = document.getElementById("alertMessage");
    const temperatureThreshold = document.getElementById("alertTemperatureThreshold").value;
    const conditionType = document.getElementById("alertConditionType").value;
    const notifyTarget = document.getElementById("alertNotifyTarget").value;
    const webhookUrl = document.getElementById("alertWebhookUrl").value.trim();
    const cooldownMinutes = Number(document.getElementById("alertCooldownMinutes").value || 180);
    const enabled = document.getElementById("alertEnabled").checked ? 1 : 0;
    const roundedTemperatureThreshold = Number(Number(temperatureThreshold).toFixed(1));

    if(!userId){
        alert("user_idを入力してください");
        return;
    }

    if(temperatureThreshold === ""){
        alert("温度を入力してください");
        return;
    }

    document.getElementById("alertTemperatureThreshold").value = roundedTemperatureThreshold.toFixed(1);

    if(!webhookUrl && !activeAlertSettingExists){
        alertMessage.innerText = notifyTarget === "email"
            ? "メールアドレスを入力してください"
            : "Webhook URLを入力してください";
        return;
    }

    alertMessage.innerText = "保存中...";
    setAlertSettingsBusy(true);

    try{
        const res = await fetch("save_alert_setting.php", {
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                user_id:userId,
                point_id:pointId,
                temperature_threshold:roundedTemperatureThreshold,
                condition_type:conditionType,
                notify_target:notifyTarget,
                webhook_url:webhookUrl,
                cooldown_minutes:cooldownMinutes,
                enabled:enabled
            })
        });

        const text = await res.text();
        console.log("save_alert_setting.php response:", text);

        if(!text.trim()){
            throw new Error("save_alert_setting.php から空のレスポンスが返りました");
        }

        let result;

        try{
            result = JSON.parse(text);
        }catch(e){
            throw new Error("JSONではないレスポンスです：" + text);
        }

        if(document.getElementById("alertUserId").value.trim() !== userId || getSelectedAlertPointId() !== pointId) return;

        if(!res.ok || !result.success){
            alertMessage.innerText = "保存失敗：" + (result.error || result.message || "アラート設定の保存に失敗しました");
            return;
        }

        document.getElementById("alertWebhookUrl").value = "";
        alertMessage.innerText = "保存しました";
        alertFormUserId = userId;
        await loadActiveAlertSetting(userId);

    }catch(e){
        if(document.getElementById("alertUserId").value.trim() === userId && getSelectedAlertPointId() === pointId){
            alertMessage.innerText = "保存失敗：" + e.message;
        }
    }finally{
        setAlertSettingsBusy(false);
    }
}

// 排液はP41と同じ集計規則で取得する。APIのmLを表示時にLへ換算する。
// 日付の境界は端末のタイムゾーンによらず日本時間0時に描く。
const drainageMidnightPlugin = {
 id:'drainageMidnight',
 afterDraw(chart){
  const x=chart.scales.x,area=chart.chartArea;if(!x||!area)return;
  const day=86400000,offset=9*3600000;
  const ctx=chart.ctx;ctx.save();ctx.strokeStyle='rgba(0,0,0,0.28)';ctx.lineWidth=1;
  for(let t=Math.ceil((x.min+offset)/day)*day-offset;t<=x.max;t+=day){
   const pixel=x.getPixelForValue(t);
   if(pixel<area.left||pixel>area.right)continue;
   ctx.beginPath();ctx.moveTo(pixel,area.top);ctx.lineTo(pixel,area.bottom);ctx.stroke();
  }
  ctx.restore();
 }
};

function syncDrainageZoom(source){
 for(const i of [1,2,3]){
  const chart=Chart.getChart('drainageChart'+i);
  if(!chart||chart===source)continue;
  for(const axis of ['x','y','daily']){
   const scale=source.scales[axis];
   if(scale)chart.zoomScale(axis,{min:scale.min,max:scale.max},'none');
  }
 }
}

function resetDrainageZoom(){
 for(const i of [1,2,3]){
  const chart=Chart.getChart('drainageChart'+i);
  if(chart){chart.resetZoom('none');setDrainageAxisLimits(chart);}
 }
}

function setDrainageAxisLimits(chart){
 const settings=plusRead('drainageAxes',{});
 for(const [axis,prefix] of [['y','Hourly'],['daily','Daily']]){
  for(const bound of ['min','max']){
   const value=settings[prefix+bound];
   if(Number.isFinite(value))chart.options.scales[axis][bound]=value;
   else delete chart.options.scales[axis][bound];
  }
 }
 chart.update('none');
}

function applyDrainageAxes(auto=false){
 const settings={};
 const message=document.getElementById('drainageAxisMessage');
 for(const prefix of ['Hourly','Daily']){
  for(const bound of ['min','max']){
   const input=document.getElementById('drainage'+prefix+bound);
   const text=auto?'':input.value.trim();
   if(text){
    const value=Number(text);
    if(!Number.isFinite(value)||value<0){message.textContent='縦軸には0以上の数値を入力してください。';return;}
    settings[prefix+bound]=value;
   }
  }
  const min=settings[prefix+'min']??0,max=settings[prefix+'max'];
  if(max!==undefined&&max<=min){message.textContent='最大値は最小値より大きくしてください。';return;}
 }
 if(auto)for(const prefix of ['Hourly','Daily'])for(const bound of ['min','max'])document.getElementById('drainage'+prefix+bound).value='';
 plusWrite('drainageAxes',settings);savePlusTab('drainage');
 for(const i of [1,2,3]){const chart=Chart.getChart('drainageChart'+i);if(chart)setDrainageAxisLimits(chart);}
 message.textContent=auto?'縦軸を自動調節に戻しました。':'縦軸を3地点へ反映しました。';
}

function createDrainageChart(canvas,result){
 const groups={};
 const hourly=result.hourly;
 for(const row of hourly){
  (groups[row.date_key]??=[]).push({x:Number(row.x),y:row.missing?null:row.daily_cumulative/1000});
 }
 // 表示窓が日の途中から始まっても、その時点の既知の日積算を引き継ぐ。
 if(result.display_start_date_key&&result.display_start_daily_cumulative!=null){
  (groups[result.display_start_date_key]??=[]).push({x:Number(result.display_start),y:result.display_start_daily_cumulative/1000});
 }
 const lines=Object.keys(groups).sort().map((date,index)=>({
  type:'line',label:'日積算排液量 (L)',data:groups[date].sort((a,b)=>a.x-b.x),
  yAxisID:'daily',borderColor:'rgb(0, 75, 145)',backgroundColor:'rgb(0, 75, 145)',
  borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:0,spanGaps:false,fill:false,order:1,showInLegend:index===0
 }));
 const chart=new Chart(canvas,{
  type:'bar',plugins:[drainageMidnightPlugin],data:{datasets:[{
   label:'1時間排液量 (L)',data:hourly.map(row=>({x:Number(row.x),y:row.missing?null:row.hourly_rainfall/1000})),
   backgroundColor:'rgba(54, 162, 235, 0.65)',borderColor:'rgb(54, 162, 235)',borderWidth:1,
   barPercentage:0.88,categoryPercentage:1,yAxisID:'y',order:2,showInLegend:true
  },...lines]},options:{
   parsing:false,responsive:true,maintainAspectRatio:false,animation:false,
   interaction:{mode:'nearest',axis:'x',intersect:false},
   plugins:{zoom:{zoom:{wheel:{enabled:false},pinch:{enabled:!isMobileView()},drag:{enabled:!isMobileView(),backgroundColor:'rgba(30,120,255,0.35)',borderColor:'rgba(30,120,255,0.8)',borderWidth:1},mode:'xy',onZoomComplete:({chart})=>syncDrainageZoom(chart)}},midnightLinePlugin:false,rainfallTooltipPlugin:false,crosshair:{...baseOptions(new Date(result.display_start),new Date(result.end)).plugins.crosshair,sync:{enabled:false}},
    legend:{labels:{filter:(item,data)=>data.datasets[item.datasetIndex].showInLegend!==false,sort:(a,b)=>a.datasetIndex-b.datasetIndex}},
    tooltip:baseOptions(new Date(result.display_start),new Date(result.end)).plugins.tooltip
   },
   scales:{
    x:{...baseOptions(new Date(result.display_start),new Date(result.end)).scales.x,
     afterBuildTicks(scale){const ticks=[];for(let t=Math.ceil(scale.min/3600000)*3600000;t<=scale.max;t+=3600000)ticks.push({value:t});scale.ticks=ticks;},
     ticks:{color:'#000',maxRotation:0,autoSkip:true,maxTicksLimit:8,callback(value){const p=getJapanDateParts(new Date(value));return [String(p.hour).padStart(2,'0')+'時',String(p.minute).padStart(2,'0')+'分'];}}
    },
    y:{position:'left',beginAtZero:true,ticks:{color:'#000'},title:{display:true,text:'1時間排液量［L］'}},
    daily:{position:'right',beginAtZero:true,ticks:{color:'#000'},title:{display:true,text:'日積算排液量［L］'},grid:{drawOnChartArea:false}}
   }
  }
 });
 setDrainageAxisLimits(chart);
 return chart;
}

let drainageRequestSequence = 0;
async function loadDrainageData(){
 const sequence=++drainageRequestSequence;
 savePlusTab('drainage');
 const userId=getPlusUserId('drainage');
 const hours='72';
 await Promise.all([1,2,3].map(async i=>{
  const status=document.getElementById('drainageStatus'+i);
  const canvas=document.getElementById('drainageChart'+i);
  const previous=Chart.getChart(canvas);if(previous)previous.destroy();
  const point=document.getElementById('drainagePoint'+i).value.trim().toUpperCase();
  const volume=Number(document.getElementById('drainageVolume'+i).value);
  if(!userId||!/^P\d{2}$/.test(point)||!Number.isFinite(volume)||volume<=0){
   status.textContent='user_id、point_id（Pと2桁の数字）、0より大きい1転倒水量を入力してください。';return;
  }
  const key=JSON.stringify([userId,point,volume,hours]);
  const current=()=>sequence===drainageRequestSequence&&key===JSON.stringify([getPlusUserId('drainage'),document.getElementById('drainagePoint'+i).value.trim().toUpperCase(),Number(document.getElementById('drainageVolume'+i).value),'72']);
  status.textContent='取得中…';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const params=new URLSearchParams({user_id:userId,point_id:point,display_hours:hours,coefficient:String(volume)});
   const response=await fetch('get_drainage_data.php?'+params,{cache:'no-store',signal:controller.signal});
   const result=await response.json();if(!current())return;
   if(!response.ok||!result.success)throw new Error(result.error||'取得に失敗しました');
   const liters=value=>value==null?'—':(value/1000).toLocaleString('ja-JP',{maximumFractionDigits:5})+' L';
   status.textContent=point+' ｜ 今日：'+liters(result.daily_totals.today)+' ／ 昨日：'+liters(result.daily_totals.yesterday)+' ／ 一昨日：'+liters(result.daily_totals.day_before_yesterday)+'（欠測を除く既知の合計）';
   if(!result.hourly.some(row=>!row.missing)){status.textContent=point+'：有効な転倒数データがありません。';return;}
   createDrainageChart(canvas,result);
  }catch(error){if(current())status.textContent=point+'：'+(error.name==='AbortError'?'取得がタイムアウトしました':error.message);}
  finally{clearTimeout(timeout);}
 }));
}

// === Plusのタブ状態・入力条件保存・サイト間移動 ===
const plusTabNames = ['alert','analysis','wbgt','review','drainage','maintenance'];

let activePlusTab = 'maintenance';

const plusInputIds = {alert:'alertUserId',analysis:'analysisUserIdA',wbgt:'wbgtUserId',review:'reviewUserId',maintenance:'maintenanceUserId',drainage:'drainageUserId'};

function getPlusUserId(tab){return document.getElementById(plusInputIds[tab])?.value.trim() || '';}

function plusRead(key,fallback){try{return JSON.parse(localStorage.getItem('utechPlus_v1_'+key)) ?? fallback;}catch{return fallback;}}

function plusWrite(key,value){try{localStorage.setItem('utechPlus_v1_'+key,JSON.stringify(value));}catch{document.getElementById('message').textContent='設定を保存できませんでした。';}}

// タブの入力条件をブラウザへ保存する。パスワード・Webhook等は除き、本体のusui_user_idは更新しない。
// アラートのサーバー保存はこの関数では行わない。
function savePlusTab(tab){
 const values={};
 document.querySelectorAll('#tab-'+tab+' input[id], #tab-'+tab+' select[id]').forEach(input=>{
  if(input.type==='password'||/webhook|destination/i.test(input.id))return;
  values[input.id]=input.type==='checkbox'?input.checked:input.value;
 });
 plusWrite(tab,values);
 const userId=getPlusUserId(tab);if(userId)saveUserIdHistory(userId);
}

// 開いたタブはURLのIDを最優先。他タブはタブ保存値→従来設定→URL→本体保存IDの順で補完する。
// 分析はマスターのIDを復元し、空の比較元にだけ補完する。既存の比較元IDを一律上書きしない。
function restorePlusTab(tab,incoming,isEntry){
 const values=plusRead(tab,{});
 for(const [id,value]of Object.entries(values)){const input=document.getElementById(id);if(input){if(input.type==='checkbox')input.checked=!!value;else input.value=value;}}
 const input=document.getElementById(plusInputIds[tab]);
 if(input){
  const legacy=tab==='wbgt'?localStorage.getItem(wbgtStorageKeys.userId):tab==='analysis'?localStorage.getItem(getAnalysisCompareStorageKey('A','user_id')):null;
  input.value=(isEntry&&incoming) || values[input.id] || legacy || incoming || localStorage.getItem('usui_user_id') || '';
 }
 if(tab==='analysis')for(const graph of analysisCompareGraphs){const field=document.getElementById('analysisUserId'+graph);if(field&&!field.value)field.value=input.value;}
}

function applyPlusTab(tab){
 savePlusTab(tab);
 if(tab==='maintenance'){handleMaintenanceUserIdChange();loadMaintenanceData();}
 if(tab==='review')loadReviewData();
 if(tab==='alert'){clearAlertFormIfUserChanged();loadActiveAlertSetting(getPlusUserId(tab));}
 if(tab==='wbgt')applyWbgtSettings();
}

// 前回タブを保存し、そのタブで必要な条件に応じて取得する。ほかのタブの入力IDは変更しない。
function switchPlusTab(tab){
 if(!plusTabNames.includes(tab))return;
 activePlusTab=tab;plusWrite('lastTab',tab);
 clearAllSyncedTooltips();
 document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active',panel.id==='tab-'+tab));
 document.querySelectorAll('.tab-button').forEach(button=>{const active=button.getAttribute('aria-controls')==='tab-'+tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
 refreshVisibleCharts();
 if(tab==='maintenance'){const r=getMaintenanceRange();if(!r.error&&shouldReloadMaintenanceData(getPlusUserId(tab),r.range))loadMaintenanceData(r.range);}
 if(tab==='drainage')loadDrainageData();
 if(tab==='wbgt'){const s=getWbgtSettings();if([s.userId,s.tempHumPointId,s.globePointId].join('|')!==wbgtLoadedKey||Date.now()-wbgtLastLoadedAt>=300000)loadWbgtData();}
 if(tab==='alert'&&alertFormUserId!==getPlusUserId(tab))clearAlertFormIfUserChanged();
 if(tab==='review'&&getPlusUserId(tab)&&!reviewCharts.length)loadReviewData();
}

// 戻り先はbase hrefを基準に本体へ解決し、現在のタブの入力IDを渡す。
function returnToUtech(){const url=new URL('./',document.baseURI);const userId=getPlusUserId(activePlusTab);if(userId)url.searchParams.set('user_id',userId);location.assign(url.href);}

// 初回はメンテ、以降は前回タブ。各タブの入力を復元してから選択タブを開く。
window.addEventListener('DOMContentLoaded',()=>{
 const requested=plusRead('lastTab','maintenance');
 const entry=plusTabNames.includes(requested)?requested:'maintenance';
 const params=new URLSearchParams(location.search), raw=params.get('user_id') || '';
 const incoming=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw)?raw:'';
 restoreAnalysisCompareSettings();restoreWbgtSettings();restoreUtechAreaSelection();
 for(const tab of plusTabNames)restorePlusTab(tab,incoming,tab===entry);
 if(!document.getElementById('reviewDate').value)document.getElementById('reviewDate').value=formatDateInputValue(new Date());
 document.getElementById('reviewDate').addEventListener('change',()=>{savePlusTab('review');loadReviewData();});
 initializeMaintenanceRangeInputs();
 maintenanceKnownUserId=getPlusUserId('maintenance');
 handleAlertNotifyTargetChange();
 for(const tab of ['alert','wbgt','analysis']){
  const ids=tab==='analysis'?analysisCompareGraphs.map(graph=>'analysisUserId'+graph):[plusInputIds[tab]];
  for(const id of ids){
   const input=document.getElementById(id);if(!input)continue;
   const select=document.createElement('select');select.dataset.plusHistory=tab;select.setAttribute('aria-label','user_idの履歴');
   select.addEventListener('change',()=>{if(select.value){input.value=select.value;input.dispatchEvent(new Event('change',{bubbles:true}));}});
   input.insertAdjacentElement('afterend',select);
  }
 }
 updateUserIdHistoryList();
 document.addEventListener('click',event=>{
  closeLogoInfoOnOutsideClick(event);
  const panel=event.target.closest('.tab-panel');
  if(panel&&event.target.closest('button'))setTimeout(()=>savePlusTab(panel.id.slice(4)),0);
 });
 document.addEventListener('touchstart',handleOutsideChartTouch,{capture:true,passive:true});
 updatePlusHeaderTime();setInterval(updatePlusHeaderTime,60000);
 // 引継ぎIDは一度適用したらURLから除き、再読込時に後の変更を上書きしない。
 if(params.has('user_id')){params.delete('user_id');historyReplacePlusUrl(params);}
 switchPlusTab(entry);
});

function historyReplacePlusUrl(params){history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}

// Plusのヘッダーは時計だけを更新する。天気・潮汐・こよみの取得/表示は本体側。
function updatePlusHeaderTime(){
 const p=getJapanDateParts(new Date());
 document.getElementById("headerTimeInfo").textContent="現在日時："+p.year+"年"+p.month+"月"+p.day+"日 "+String(p.hour).padStart(2,"0")+":"+String(p.minute).padStart(2,"0");
}
