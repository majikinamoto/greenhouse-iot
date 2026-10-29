// U-Tech本体専用：メイン・環境スコア・CSV・表示設定・初期化。
// utech-shared.js → utech-header.js → このファイルの順に読み込む。
// アラート・分析・WBGT・過去データ・メンテの処理はPlus側で管理する。
let mainVaporChart;

let mainDewPointChart;

let outsideDiffChart;

let solarChart;

let rainChart = null;

let windChartP61 = null;

let rainfallRequestSequence = 0;

let co2DiffChart;

let environmentScoreP01 = [];

let environmentScoreP21 = [];

let environmentScoreP31 = [];

const outsideSourceStorageKeys = {
    enabled:"usui_outside_source_enabled",
    userId:"usui_outside_source_user_id",
    pointId:"usui_outside_source_point_id"
};

const rainfallSourceStorageKeys = {
    enabled:"usui_rainfall_source_enabled",
    userId:"usui_rainfall_source_user_id"
};

const mainChartConfigs = [
    {
        key:"insideTemperature",
        canvasId:"tempChartP01",
        title:"ハウス内温度",
        fields:["temperature"],
        requests:context=>[{ userId:context.userId, pointId:"P01" }]
    },
    { key:"insideHumidity", canvasId:"humChartP01", title:"ハウス内湿度", fields:["humidity"], requests:context=>[{ userId:context.userId, pointId:"P01" }] },
    {
        key:"outsideTemperature",
        canvasId:"tempChartP11",
        title:"外気温度",
        fields:["temperature"],
        requests:context=>[{ userId:context.outsideSource.userId, pointId:context.outsideSource.pointId }]
    },
    { key:"outsideHumidity", canvasId:"humChartP11", title:"外気湿度", fields:["humidity"], requests:context=>[{ userId:context.outsideSource.userId, pointId:context.outsideSource.pointId }] },
    {
        key:"outsideDiff",
        canvasId:"outsideDiffChart",
        title:"温度差_内外",
        fields:["temperature"],
        requests:context=>[
            { userId:context.userId, pointId:"P01" },
            { userId:context.outsideSource.userId, pointId:context.outsideSource.pointId }
        ]
    },
    {
        key:"mainVapor",
        canvasId:"mainVaporChart",
        title:"飽和水蒸気量/水蒸気量/飽差",
        fields:["temperature", "humidity"],
        requests:context=>[{ userId:context.userId, pointId:"P01" }]
    },
    {
        key:"mainDewPoint",
        canvasId:"mainDewPointChart",
        title:"ハウス内結露温度",
        fields:["temperature", "humidity"],
        requests:context=>[{ userId:context.userId, pointId:"P01" }]
    },
    {
        key:"solarRadiation",
        canvasId:"solarChart",
        title:"日射量",
        fields:["solar_radiation"],
        requests:context=>[{ userId:context.userId, pointId:"P31" }]
    },
    {
        key:"insideCo2",
        canvasId:"co2Chart",
        title:"CO2_内",
        fields:["co2"],
        requests:context=>[{ userId:context.userId, pointId:"P21" }]
    },
    {
        key:"outsideCo2",
        canvasId:"co2OutsideChart",
        title:"CO2_外気",
        fields:["co2"],
        requests:context=>[{ userId:context.userId, pointId:"P26" }]
    },
    {
        key:"co2Diff",
        canvasId:"co2DiffChart",
        title:"CO2差",
        fields:["co2"],
        requests:context=>[
            { userId:context.userId, pointId:"P21" },
            { userId:context.userId, pointId:"P26" }
        ]
    },
    {
        key:"insideWind",
        canvasId:"windChartP61",
        title:"ハウス内風速",
        fields:["wind_speed_avg", "wind_speed_max"],
        requests:context=>[{ userId:context.userId, pointId:"P61" }]
    }
];

const RAINFALL_MODE_STORAGE_KEY = "utechRainfallCalculationMode";

const RAINFALL_COLLECTOR_AREA_STORAGE_KEY = "utechRainfallCollectorArea";

const RAINFALL_TIP_VOLUME_STORAGE_KEY = "utechRainfallTipVolume";

function restoreMobileShareQrImage(){
    const qrImage = document.getElementById("mobileQrImage");
    const qrImageHome = document.getElementById("mobileQrImageHome");
    const shareButton = document.getElementById("mobileShareQrButton");
    if(qrImage && qrImageHome && !qrImageHome.contains(qrImage)){
        qrImageHome.appendChild(qrImage);
    }
    if(shareButton){
        shareButton.setAttribute("aria-expanded", "false");
    }
}

function openMobileShareQr(){
    const dialog = document.getElementById("mobileShareQrDialog");
    const qrImage = document.getElementById("mobileQrImage");
    const imageSlot = document.getElementById("mobileShareQrImageSlot");
    const shareButton = document.getElementById("mobileShareQrButton");
    if(!dialog || !qrImage || !imageSlot) return;

    imageSlot.appendChild(qrImage);
    if(shareButton){
        shareButton.setAttribute("aria-expanded", "true");
    }
    if(typeof dialog.showModal === "function"){
        if(!dialog.open) dialog.showModal();
    }else{
        dialog.setAttribute("open", "");
    }
}

function closeMobileShareQr(){
    const dialog = document.getElementById("mobileShareQrDialog");
    if(dialog && dialog.open && typeof dialog.close === "function"){
        dialog.close();
    }else{
        if(dialog) dialog.removeAttribute("open");
        restoreMobileShareQrImage();
    }
}

function toggleMobileShareQr(){
    const dialog = document.getElementById("mobileShareQrDialog");
    if(dialog && dialog.hasAttribute("open")){
        closeMobileShareQr();
    }else{
        openMobileShareQr();
    }
}

// 表示設定は入力途中のIDではなく、表示へ適用したIDに紐づける。
const mainGraphVisibilityIds = ["tempChartP01", "tempChartP11", "outsideDiffChart", "mainVaporChart", "humChartP01", "humChartP11", "mainDewPointChart", "solarChart", "co2Chart", "co2OutsideChart", "co2DiffChart", "windChartP61", "rainChart"];

const mainInfoVisibilityIds = ["mobileQrCard", "houseTenDaySummary", "outsideTenDaySummary", "currentP01", "yesterdayVpdEvaluation"];

const mainDisplayVisibilityIds = [...mainInfoVisibilityIds, ...mainGraphVisibilityIds];

let mainGraphVisibilityUserId = "";

let mainGraphVisibility = {};

function getMainGraphVisibilityStorageKey(userId){
    return "utechMainGraphVisibility_v1_" + userId;
}

// 見出しを残して本文だけを折り畳む。カード全体の表示設定とは別で、再読込時は展開する。
// 非表示でもデータ取得・計算は継続する。
function initializeMainInfoCollapse(){
    mainInfoVisibilityIds.forEach(id=>{
        const card = document.querySelector('[data-main-info="' + id + '"]');
        const title = card.querySelector(".status-group-title");
        const titleText = title.textContent;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "status-card-toggle";
        button.textContent = "▲";
        button.setAttribute("aria-expanded", "true");
        button.setAttribute("aria-label", titleText + "を折り畳む");
        button.addEventListener("click", ()=>{
            const collapsed = card.classList.toggle("is-collapsed");
            button.textContent = collapsed ? "▼" : "▲";
            button.setAttribute("aria-expanded", String(!collapsed));
            button.setAttribute("aria-label", titleText + (collapsed ? "を開く" : "を折り畳む"));
        });
        title.prepend(button);
    });
}

function initializeMainGraphSettings(){
    mainDisplayVisibilityIds.forEach(id=>{
        const isInfo = mainInfoVisibilityIds.includes(id);
        const choices = document.getElementById(isInfo ? "mainInfoSettingsChoices" : "mainGraphSettingsChoices");
        const card = document.querySelector('[data-main-' + (isInfo ? "info" : "graph") + '="' + id + '"]');
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.mainGraphChoice = id;
        checkbox.addEventListener("change", ()=>{
            if(!mainGraphVisibilityUserId) return;
            mainGraphVisibility[id] = checkbox.checked;
            clearSyncedTooltipGroup("main");
            hideRainfallTooltip();
            applyMainGraphVisibility();
            saveMainGraphVisibility();
        });
        label.append(checkbox, document.createTextNode(card.querySelector(isInfo ? ".status-group-title" : "h4 > span").textContent));
        choices.appendChild(label);
    });
    restoreMainGraphVisibility(getMainUserIdInputValue());
}

// 利用者別の表示設定を復元し、このuserIdを以後の保存対象として保持する。
// 初期値は全表示。保存値がbooleanの項目だけ上書きし、読取・JSON解析失敗時も全表示を使う。
function restoreMainGraphVisibility(userId){
    mainGraphVisibilityUserId = userId;
    mainGraphVisibility = Object.fromEntries(mainDisplayVisibilityIds.map(id=>[id, true]));
    const message = document.getElementById("mainGraphSettingsMessage");
    message.textContent = "";
    if(userId){
        try{
            const stored = JSON.parse(localStorage.getItem(getMainGraphVisibilityStorageKey(userId)));
            if(stored && typeof stored === "object" && !Array.isArray(stored)){
                mainDisplayVisibilityIds.forEach(id=>{
                    if(typeof stored[id] === "boolean") mainGraphVisibility[id] = stored[id];
                });
            }
        }catch(error){
            message.textContent = "表示設定を読み込めなかったため、すべて表示しています。";
        }
    }
    document.getElementById("mainGraphSettingsUser").textContent = userId
        ? "設定対象のuser_id：" + userId
        : "user_idを入力して「表示」を押すと、表示・非表示を設定できます。";
    document.getElementById("mainGraphShowAll").disabled = !userId;
    document.getElementById("mainGraphHideAll").disabled = !userId;
    applyMainGraphVisibility();
}

function applyMainGraphVisibility(){
    mainDisplayVisibilityIds.forEach(id=>{
        document.querySelector('[data-main-graph="' + id + '"], [data-main-info="' + id + '"]').hidden = mainGraphVisibility[id] === false;
        const checkbox = document.querySelector('[data-main-graph-choice="' + id + '"]');
        if(checkbox){
            checkbox.checked = mainGraphVisibility[id] !== false;
            checkbox.disabled = !mainGraphVisibilityUserId;
        }
    });
    requestAnimationFrame(()=>{
        if(typeof Chart === "undefined") return;
        mainGraphVisibilityIds.forEach(id=>{
            const canvas = document.getElementById(id);
            if(!canvas.getClientRects().length) return;
            const chart = Chart.getChart(canvas);
            if(chart){
                chart.resize();
                chart.update("none");
            }
        });
    });
}

// 入力途中のIDではなく、復元時に保持したmainGraphVisibilityUserIdのキーへ保存する。
// ID未適用時は保存しない。保存できなくても画面の表示変更は維持し、メッセージを出す。
function saveMainGraphVisibility(){
    if(!mainGraphVisibilityUserId) return;
    const message = document.getElementById("mainGraphSettingsMessage");
    try{
        localStorage.setItem(getMainGraphVisibilityStorageKey(mainGraphVisibilityUserId), JSON.stringify(mainGraphVisibility));
        message.textContent = "";
    }catch(error){
        message.textContent = "表示は変更しましたが、設定を保存できませんでした。";
    }
}

function toggleMainGraphSettings(){
    const panel = document.getElementById("mainGraphSettings");
    panel.hidden = !panel.hidden;
    document.getElementById("mainGraphSettingsButton").setAttribute("aria-expanded", String(!panel.hidden));
}

function showAllMainGraphs(){
    if(!mainGraphVisibilityUserId) return;
    mainDisplayVisibilityIds.forEach(id=>{ mainGraphVisibility[id] = true; });
    clearSyncedTooltipGroup("main");
    hideRainfallTooltip();
    applyMainGraphVisibility();
    saveMainGraphVisibility();
}

function hideAllMainGraphs(){
    if(!mainGraphVisibilityUserId) return;
    mainDisplayVisibilityIds.forEach(id=>{ mainGraphVisibility[id] = false; });
    clearSyncedTooltipGroup("main");
    hideRainfallTooltip();
    applyMainGraphVisibility();
    saveMainGraphVisibility();
}

// === 他サイトへの移動確認：Next・G-Flow・Yui-Tech ===
// Plusへの移動はパスワード不要で、末尾のopenUtechPlusが担当する。
let pendingSiteSwitchUrl = "";

function resetSiteSwitchDialog(){
    pendingSiteSwitchUrl = "";
    document.getElementById("siteSwitchPassword").value = "";
    document.getElementById("siteSwitchError").textContent = "";
}

function openSiteSwitchDialog(destination){
    const destinations = {
        flow:{ url:"g-flow/", title:"G-Flowへ移動" },
        next:{ url:"u-tech-next/", title:"U-Tech Nextへ移動" },
        yui:{ url:"yui-tech/", title:"Yui-Techへ移動" }
    };
    const target = destinations[destination];
    if(!target) return;
    resetSiteSwitchDialog();
    pendingSiteSwitchUrl = target.url;
    document.getElementById("siteSwitchTitle").textContent = target.title;
    document.getElementById("siteSwitchDialog").showModal();
    document.getElementById("siteSwitchPassword").focus();
}

function submitSiteSwitchPassword(event){
    event.preventDefault();
    const input = document.getElementById("siteSwitchPassword");
    if(input.value !== "8515"){
        document.getElementById("siteSwitchError").textContent = "パスワードが違います。";
        input.value = "";
        input.focus();
        return;
    }
    if(pendingSiteSwitchUrl === "g-flow/"){
        const form = document.createElement("form");
        form.method = "post";
        form.action = pendingSiteSwitchUrl;
        const password = document.createElement("input");
        password.type = "hidden";
        password.name = "password";
        password.value = input.value;
        form.appendChild(password);
        document.body.appendChild(form);
        form.submit();
        return;
    }
    if(pendingSiteSwitchUrl) window.location.assign(pendingSiteSwitchUrl);
}

// === 外気・雨量の取得元設定 ===
// 外気の取得元はブラウザ共通。未保存時は無効・利用者ID空欄・Point IDはP11。
// saveOutsideSourceSettingも同じ固定キーへ保存する。
function restoreOutsideSourceSetting(){
    const enabled = document.getElementById("outsideSourceEnabled");
    const userId = document.getElementById("outsideSourceUserId");
    const pointId = document.getElementById("outsideSourcePointId");

    if(enabled){
        enabled.checked = localStorage.getItem(outsideSourceStorageKeys.enabled) === "1";
    }

    if(userId){
        userId.value = localStorage.getItem(outsideSourceStorageKeys.userId) || "";
    }

    if(pointId){
        pointId.value = localStorage.getItem(outsideSourceStorageKeys.pointId) || "P11";
    }

    updateOutsideSourceControls();
}

function saveOutsideSourceSetting(){
    const enabled = document.getElementById("outsideSourceEnabled");
    const userId = document.getElementById("outsideSourceUserId");
    const pointId = document.getElementById("outsideSourcePointId");

    localStorage.setItem(outsideSourceStorageKeys.enabled, enabled && enabled.checked ? "1" : "0");
    localStorage.setItem(outsideSourceStorageKeys.userId, userId ? userId.value.trim() : "");
    localStorage.setItem(outsideSourceStorageKeys.pointId, pointId ? pointId.value.trim() : "");
}

function updateOutsideSourceControls(){
    const enabled = document.getElementById("outsideSourceEnabled");
    const userId = document.getElementById("outsideSourceUserId");
    const pointId = document.getElementById("outsideSourcePointId");
    const button = document.querySelector(".outside-source-setting button");
    const isEnabled = enabled && enabled.checked;

    if(userId) userId.disabled = !isEnabled;
    if(pointId) pointId.disabled = !isEnabled;
    if(button) button.disabled = !isEnabled;
}

function handleOutsideSourceEnabledChange(){
    updateOutsideSourceControls();
    saveOutsideSourceSetting();

    if(!document.getElementById("outsideSourceEnabled").checked){
        updateOutsideSourceNote(null);
        if(document.getElementById("userId").value.trim()){
            loadData();
        }
    }
}

function applyOutsideSourceSetting(){
    saveOutsideSourceSetting();
    loadData();
}

function getOutsideSourceRequest(currentUserId){
    const enabled = document.getElementById("outsideSourceEnabled");
    const sourceUserId = document.getElementById("outsideSourceUserId");
    const sourcePointId = document.getElementById("outsideSourcePointId");
    const userId = sourceUserId ? sourceUserId.value.trim() : "";
    const pointId = sourcePointId ? sourcePointId.value.trim() : "";

    if(enabled && enabled.checked && userId && pointId){
        return {
            useAlternate:true,
            userId:userId,
            pointId:pointId
        };
    }

    return {
        useAlternate:false,
        userId:currentUserId,
        pointId:"P11"
    };
}

function updateOutsideSourceNote(source){
    const note = document.getElementById("outsideSourceNote");
    if(!note) return;

    note.innerText = source && source.useAlternate
        ? "※user_id " + source.userId + "、point_id " + source.pointId + " から入手"
        : "";
}

// 雨量の取得元もブラウザ共通。未保存時は無効・利用者ID空欄。
// saveRainfallSourceSettingで保存し、メインの利用者IDごとには分けない。
function restoreRainfallSourceSetting(){
    const enabled = document.getElementById("rainfallSourceEnabled");
    const userId = document.getElementById("rainfallSourceUserId");

    if(enabled){
        enabled.checked = localStorage.getItem(rainfallSourceStorageKeys.enabled) === "1";
    }

    if(userId){
        userId.value = localStorage.getItem(rainfallSourceStorageKeys.userId) || "";
    }

    updateRainfallSourceControls();
}

function saveRainfallSourceSetting(){
    const enabled = document.getElementById("rainfallSourceEnabled");
    const userId = document.getElementById("rainfallSourceUserId");

    localStorage.setItem(rainfallSourceStorageKeys.enabled, enabled && enabled.checked ? "1" : "0");
    localStorage.setItem(rainfallSourceStorageKeys.userId, userId ? userId.value.trim() : "");
}

function updateRainfallSourceControls(){
    const enabled = document.getElementById("rainfallSourceEnabled");
    const userId = document.getElementById("rainfallSourceUserId");
    const button = document.querySelector(".rainfall-source-setting button");
    const isEnabled = enabled && enabled.checked;

    if(userId) userId.disabled = !isEnabled;
    if(button) button.disabled = !isEnabled;
}

function handleRainfallSourceEnabledChange(){
    updateRainfallSourceControls();
    saveRainfallSourceSetting();

    if(!document.getElementById("rainfallSourceEnabled").checked){
        updateRainfallSourceNote(null);
        if(getMainUserIdInputValue()){
            loadData();
        }
    }
}

function applyRainfallSourceSetting(){
    saveRainfallSourceSetting();
    loadData();
}

function getRainfallSourceRequest(currentUserId){
    const enabled = document.getElementById("rainfallSourceEnabled");
    const sourceUserId = document.getElementById("rainfallSourceUserId");
    const userId = sourceUserId ? sourceUserId.value.trim() : "";

    if(enabled && enabled.checked && userId){
        return {
            useAlternate:true,
            userId:userId
        };
    }

    return {
        useAlternate:false,
        userId:currentUserId
    };
}

function updateRainfallSourceNote(source){
    const note = document.getElementById("rainfallSourceNote");
    if(!note) return;

    note.innerText = source && source.useAlternate
        ? "※user_id " + source.userId + " から入手"
        : "";
}

// === 本体のuser_id入力値 ===
// 入力途中の値を返す。表示へ適用済みのIDを保持するmainGraphVisibilityUserIdとは区別する。
function getMainUserIdInputValue(){
    const input = document.getElementById("userId");
    return input ? input.value.trim() : "";
}

// === 本体のタブ表示切替 ===
// CSV欄が空ならuser_idを補完する。メインの測定値取得はloadDataが担当する。
function switchTab(tabName){
 const targetId="tab-"+tabName;
 if(!document.getElementById(targetId)) return;
 clearAllSyncedTooltips();
 document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===targetId));
 document.querySelectorAll('.tab-button').forEach(b=>{const active=b.getAttribute('aria-controls')===targetId;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
 document.body.classList.toggle('data-export-active',tabName==='export');
 if(tabName==='export'){const input=document.getElementById('csvUserId');if(!input.value.trim())input.value=getMainUserIdInputValue();}
 refreshVisibleCharts();
}

function resetDailyTempStats(){
    initializeTenDaySummaryTables();
    ["house", "outside"].forEach(prefix=>{
        for(let i = 0; i < 10; i++){
            ["Max", "Min", "Avg", "Rain"].forEach(key=>{
                const value = document.getElementById(prefix + "Day" + i + key);
                if(value) value.textContent = "-";
            });
        }
    });
}

function buildTenDaySummaryCells(prefix, includeRain){
    const grid = document.getElementById(prefix + "TempSummaryGrid");
    if(!grid || grid.querySelector(".status-temp-data-grid")) return;

    let labelHtml = '<div class="status-temp-label-spacer"></div>';
    let dataHtml = "";
    for(let i = 0; i < 10; i++){
        dataHtml += '<div class="status-temp-date" id="' + prefix + "Day" + i + 'Label">-</div>';
    }

    const rows = [
        ["Max", "最高(℃)", " temp-high"],
        ["Min", "最低(℃)", " temp-low"],
        ["Avg", "平均(℃)", " average-box"]
    ];
    if(includeRain) rows.push(["Rain", "雨量(mm)", ""]);

    rows.forEach(row=>{
        const key = row[0];
        labelHtml += '<div class="status-temp-label">' + row[1] + "</div>";
        for(let i = 0; i < 10; i++){
            dataHtml += '<div class="status-box status-temp-value' + row[2] + '" id="' +
                prefix + "Day" + i + key + '">-</div>';
        }
    });

    grid.innerHTML =
        '<div class="status-temp-label-grid">' + labelHtml + "</div>" +
        '<div class="status-temp-data-scroll" tabindex="0" aria-label="日別集計値を横スクロール">' +
            '<div class="status-temp-data-grid">' + dataHtml + "</div>" +
        "</div>";

    const scrollArea = grid.querySelector(".status-temp-data-scroll");
    if(scrollArea) requestAnimationFrame(()=>{ scrollArea.scrollLeft = scrollArea.scrollWidth; });
}

function initializeTenDaySummaryTables(){
    buildTenDaySummaryCells("house", false);
    buildTenDaySummaryCells("outside", true);
    renderTenDaySummaryDateLabels();
}

function getTenDayJstDateKey(offsetDays){
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9*60*60*1000);
    const date = new Date(jstNow);
    date.setUTCDate(jstNow.getUTCDate() - offsetDays);
    return date.getUTCFullYear() + "-" +
        String(date.getUTCMonth() + 1).padStart(2, "0") + "-" +
        String(date.getUTCDate()).padStart(2, "0");
}

function getTenDayJstNowSqlDateTime(){
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9*60*60*1000);
    return jstNow.getUTCFullYear() + "-" +
        String(jstNow.getUTCMonth() + 1).padStart(2, "0") + "-" +
        String(jstNow.getUTCDate()).padStart(2, "0") + " " +
        String(jstNow.getUTCHours()).padStart(2, "0") + ":" +
        String(jstNow.getUTCMinutes()).padStart(2, "0") + ":" +
        String(jstNow.getUTCSeconds()).padStart(2, "0");
}

function formatTenDaySummaryDateLabel(dateKey){
    const parts = String(dateKey || "").split("-").map(Number);
    if(parts.length !== 3 || parts.some(part=>!Number.isFinite(part))) return "-";
    const monthDay = parts[1] + "/" + parts[2];
    if(dateKey === getTenDayJstDateKey(0)) return "本日(" + monthDay + ")";
    if(dateKey === getTenDayJstDateKey(1)) return "前日(" + monthDay + ")";
    return monthDay;
}

function renderTenDaySummaryDateLabels(){
    ["house", "outside"].forEach(prefix=>{
        for(let i = 0; i < 10; i++){
            const dateKey = getTenDayJstDateKey(9 - i);
            const label = document.getElementById(prefix + "Day" + i + "Label");
            if(label) label.textContent = formatTenDaySummaryDateLabel(dateKey);
        }
    });
}

function getSummaryRowDateKey(row){
    const dateKey = String(row && row.recorded_at || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : "";
}

function createDailyTemperatureMap(rows){
    const dayMap = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row=>{
        const dateKey = getSummaryRowDateKey(row);
        if(!dateKey || row.temperature === null || row.temperature === undefined || row.temperature === "") return;
        const temperature = Number(row.temperature);
        if(!Number.isFinite(temperature)) return;
        const day = dayMap.get(dateKey) || { max:temperature, min:temperature, total:0, count:0 };
        day.max = Math.max(day.max, temperature);
        day.min = Math.min(day.min, temperature);
        day.total += temperature;
        day.count++;
        dayMap.set(dateKey, day);
    });
    return dayMap;
}

function renderTenDayTemperatureSummary(prefix, dayMap){
    for(let i = 0; i < 10; i++){
        const day = dayMap instanceof Map ? dayMap.get(getTenDayJstDateKey(9 - i)) : null;
        const values = {
            Max:day && day.count ? day.max.toFixed(1) : "-",
            Min:day && day.count ? day.min.toFixed(1) : "-",
            Avg:day && day.count ? (day.total / day.count).toFixed(1) : "-"
        };
        Object.keys(values).forEach(key=>{
            const cell = document.getElementById(prefix + "Day" + i + key);
            if(cell) cell.textContent = values[key];
        });
    }
}

// 10日表示用の日別集計。区間雨量（tipなら区間カウント×係数）を各行で0.01 mmに丸めて合算する。
// 日付はgetSummaryRowDateKeyで取得し、有効な区間値がない日はMapに作らない。欠損を0で補間しない。
function createDailyRainfallMap(rows, mode, coefficient){
    const dayMap = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row=>{
        const dateKey = getSummaryRowDateKey(row);
        const rawValue = mode === "tip" ? row.rainfall_tip_interval : row.rainfall_interval;
        if(!dateKey || !isFiniteRainfallValue(rawValue)) return;
        const rainfall = Number(rawValue) * (mode === "tip" ? coefficient : 1);
        const hundredths = Math.round(rainfall * 100);
        const day = dayMap.get(dateKey) || { hundredths:0, count:0 };
        day.hundredths += hundredths;
        day.count++;
        dayMap.set(dateKey, day);
    });
    return dayMap;
}

function renderTenDayRainfallSummary(dayMap){
    for(let i = 0; i < 10; i++){
        const day = dayMap instanceof Map ? dayMap.get(getTenDayJstDateKey(9 - i)) : null;
        const cell = document.getElementById("outsideDay" + i + "Rain");
        if(cell) cell.textContent = day && day.count
            ? formatDailySummaryRainfallValue(day.hundredths / 100)
            : "-";
    }
}

function resetTenDayRainfallSummary(){
    renderTenDayRainfallSummary(new Map());
}

let tenDayTemperatureRequestSequence = 0;

let tenDayRainfallRequestSequence = 0;

function invalidateTenDayRainfallSummary(){
    tenDayRainfallRequestSequence++;
    resetTenDayRainfallSummary();
}

async function loadTenDayTemperatureSummaries(userId, outsideSource){
    const requestId = ++tenDayTemperatureRequestSequence;
    const range = {
        start:getTenDayJstDateKey(9) + " 00:00:00",
        end:getTenDayJstNowSqlDateTime()
    };
    const results = await Promise.all([
        fetchDataSafe(userId, "P01", range),
        fetchDataSafe(outsideSource.userId, outsideSource.pointId, range)
    ]);
    const currentOutsideSource = getOutsideSourceRequest(getMainUserIdInputValue());
    if(
        requestId !== tenDayTemperatureRequestSequence ||
        getMainUserIdInputValue() !== userId ||
        currentOutsideSource.userId !== outsideSource.userId ||
        currentOutsideSource.pointId !== outsideSource.pointId
    ) return;

    renderTenDayTemperatureSummary("house", createDailyTemperatureMap(results[0].data));
    renderTenDayTemperatureSummary("outside", createDailyTemperatureMap(results[1].data));
    results.filter(result=>result.error).forEach(result=>console.error(result.error));
}

// 日本時間で9日前の0時〜現在のP41をget_data.phpから取得し、画面側で日別集計する。
// 雨量グラフ用APIとは別経路。応答時に連番・取得元・方式・係数を再確認して古い結果を除く。
async function loadTenDayRainfallSummary(userId){
    const requestId = ++tenDayRainfallRequestSequence;
    resetTenDayRainfallSummary();
    const mode = getRainfallCalculationMode();
    const coefficient = getRainfallTipCoefficient();
    if(mode === "tip" && coefficient === null) return;
    const range = {
        start:getTenDayJstDateKey(9) + " 00:00:00",
        end:getTenDayJstNowSqlDateTime()
    };
    const result = await fetchDataSafe(userId, "P41", range);
    const currentUserId = getMainUserIdInputValue();
    const currentRainfallSource = getRainfallSourceRequest(currentUserId);
    if(
        requestId !== tenDayRainfallRequestSequence ||
        currentRainfallSource.userId !== userId ||
        getRainfallCalculationMode() !== mode ||
        (mode === "tip" && getRainfallTipCoefficient() !== coefficient)
    ) return;

    renderTenDayRainfallSummary(createDailyRainfallMap(result.data, mode, coefficient));
    if(result.error) console.error(result.error);
}

function loadTenDayDailySummaries(userId, outsideSource, rainfallSource){
    initializeTenDaySummaryTables();
    void loadTenDayTemperatureSummaries(userId, outsideSource);
    void loadTenDayRainfallSummary(rainfallSource.userId);
}

// === 飽差の時間帯平均と環境スコア ===
/**
 * baseDateの日付に対する[startHour, endHour)内の飽差（g/㎥）を件数で単純平均する。
 * 時間はDateのsetHoursによるブラウザのローカル時刻。開始を含み、終了を含まない。
 * 温湿度がnull・NaNの行を除き、対象行がなければnull。時間間隔による重み付けはしない。
 * メイン表示では前日の6〜12時と12〜18時を渡す。湿度の範囲検証はここでは行わない。
 */
function calcVpdAverage(data, startHour, endHour, baseDate){
    const start = new Date(baseDate);
    start.setHours(startHour,0,0,0);

    const end = new Date(baseDate);
    end.setHours(endHour,0,0,0);

    const values = data
        .filter(d=>d.x>=start && d.x<end && d.temp !== null && d.hum !== null && !isNaN(d.temp) && !isNaN(d.hum))
        .map(d=>calcVapor(d.temp,100) - calcVapor(d.temp,d.hum));

    if(!values.length) return null;

    return values.reduce((sum, value)=>sum + value, 0) / values.length;
}

// 環境スコアの初期範囲。vpdはg/㎥、tempは℃、humは%、co2はppm。
// 値は利用者が変更できる画面の既定値。採用理由・出典は別途確認が必要。
const environmentScoreRangeDefaults = {
    vpd:{ min:5, max:10 },
    temp:{ min:22, max:28 },
    hum:{ min:60, max:85 },
    co2:{ min:400, max:800 },
    solar:{ min:300, max:1200 }
};

const environmentScoreItems = [
    { key:"vpd", label:"飽差" },
    { key:"temp", label:"温度" },
    { key:"hum", label:"湿度" },
    { key:"co2", label:"CO2" },
    { key:"solar", label:"日射" }
];

// スコアの判定範囲は項目別の固定キー。利用者IDごとではなくブラウザ共通。
function getEnvironmentScoreStorageKey(key){
    return "utechEnvironmentScoreRange_" + key;
}

function getEnvironmentScoreInputId(key, side){
    const idMap = {
        vpd:"Vpd",
        temp:"Temp",
        hum:"Hum",
        co2:"Co2",
        solar:"Solar"
    };

    return "scoreRange" + idMap[key] + side;
}

// 保存JSONのmin/maxを数値化し、NaNの側は既定値を使う。例外時は項目全体を既定値に戻す。
// 復元処理は有限数・大小関係の検証とは別。実際に使う範囲はgetEnvironmentScoreRangesで得る。
function restoreEnvironmentScoreRanges(){
    environmentScoreItems.forEach(item=>{
        const defaults = environmentScoreRangeDefaults[item.key];

        try{
            const stored = JSON.parse(localStorage.getItem(getEnvironmentScoreStorageKey(item.key)));
            const minValue = stored ? Number(stored.min) : NaN;
            const maxValue = stored ? Number(stored.max) : NaN;

            setGuideRangeInputs(
                getEnvironmentScoreInputId(item.key, "Min"),
                getEnvironmentScoreInputId(item.key, "Max"),
                {
                    min:isNaN(minValue) ? defaults.min : minValue,
                    max:isNaN(maxValue) ? defaults.max : maxValue
                }
            );
        }catch(e){
            setGuideRangeInputs(
                getEnvironmentScoreInputId(item.key, "Min"),
                getEnvironmentScoreInputId(item.key, "Max"),
                defaults
            );
        }
    });
}

function getEnvironmentScoreRanges(){
    const ranges = {};

    environmentScoreItems.forEach(item=>{
        const defaults = environmentScoreRangeDefaults[item.key];
        ranges[item.key] = getGuideRange(
            getEnvironmentScoreInputId(item.key, "Min"),
            getEnvironmentScoreInputId(item.key, "Max"),
            defaults.min,
            defaults.max
        );
    });

    return ranges;
}

// 画面の範囲をgetGuideRange経由で上下順にそろえ、全項目をJSON保存する。
// handleEnvironmentScoreRangeChangeは保存後、保持中の測定データで表示を再計算する。
function saveEnvironmentScoreRanges(){
    const ranges = getEnvironmentScoreRanges();

    environmentScoreItems.forEach(item=>{
        localStorage.setItem(
            getEnvironmentScoreStorageKey(item.key),
            JSON.stringify(ranges[item.key])
        );
    });
}

function handleEnvironmentScoreRangeChange(){
    saveEnvironmentScoreRanges();
    renderEnvironmentScores(environmentScoreP01, environmentScoreP21, environmentScoreP31);
}

function formatScoreDate(date){
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return m + "/" + d;
}

// 当日を除く過去30日が対象。総合点のある日を点数降順、同点は新しい日順に並べる。
// 上位3日を表示する。日付の境界はブラウザのローカル時刻を使う。
function renderBest30DayScore(todayStart){
    const bestEl = document.getElementById("scoreBest30Days");
    if(!bestEl) return null;

    const ranking = [];

    for(let i = 1; i <= 30; i++){
        const start = new Date(todayStart);
        start.setDate(todayStart.getDate() - i);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);
        const scores = calcEnvironmentScoreRow(start, end, environmentScoreP01, environmentScoreP21, environmentScoreP31);

        if(scores.total === null || scores.total === undefined || isNaN(scores.total)) continue;
        ranking.push({
            score:scores.total,
            date:start
        });
    }

    if(!ranking.length){
        bestEl.innerText = "過去30日スコアランキング：-";
        return null;
    }

    ranking.sort((a, b)=>
        b.score - a.score || b.date.getTime() - a.date.getTime()
    );

    const medals = ["🥇", "🥈", "🥉"];
    bestEl.innerHTML =
        '<div>過去30日スコアランキング</div>' +
        ranking.slice(0, 3).map((item, index)=>
            '<div>' + medals[index] + ' ' + (index + 1) + '位：' +
            item.score + '点（' + formatScoreDate(item.date) + '）</div>'
        ).join("");

    return ranking[0].score;
}

function renderBestGap(todayScore, bestScore){
    const gapEl = document.getElementById("scoreBestGap");
    if(!gapEl) return;

    if(
        todayScore === null || todayScore === undefined || isNaN(todayScore) ||
        bestScore === null || bestScore === undefined || isNaN(bestScore)
    ){
        gapEl.innerText = "自己ベストまであと：-";
        return;
    }

    const diff = todayScore - bestScore;
    if(diff > 0){
        gapEl.innerText = "自己ベスト更新中！ +" + diff + "点";
    }else if(diff === 0){
        gapEl.innerText = "自己ベストタイ！";
    }else{
        gapEl.innerText = "自己ベストまであと" + Math.abs(diff) + "点";
    }
}

// スコア用の昼間はブラウザのローカル時刻で6時以上18時未満。日の出・日没では区切らない。
function isDaytimeScoreData(d){
    const hour = d.x.getHours();
    return hour >= 6 && hour < 18;
}

// 共通の対象期間は[start, end)。飽差とCO2だけ昼間（6〜18時）に絞る。
// 温度・湿度・日射は指定期間全体を使い、項目ごとにnull・NaNの値を除く。
// 温湿度・飽差はP01、CO2はP21、日射はP31の配列から作る。
function getScoreRowsForPeriod(start, end, p01, p21, p31){
    const sourceP01 = (p01 || []).filter(d=>d.x >= start && d.x < end);
    const sourceP21 = (p21 || []).filter(d=>d.x >= start && d.x < end);
    const sourceP31 = (p31 || []).filter(d=>d.x >= start && d.x < end);
    const daytimeP01 = sourceP01.filter(isDaytimeScoreData);
    const daytimeP21 = sourceP21.filter(isDaytimeScoreData);

    return {
        vpd:daytimeP01
            .filter(d=>d.temp !== null && d.hum !== null && !isNaN(d.temp) && !isNaN(d.hum))
            .map(d=>calcVapor(d.temp,100) - calcVapor(d.temp,d.hum)),
        temp:sourceP01
            .filter(d=>d.temp !== null && !isNaN(d.temp))
            .map(d=>d.temp),
        hum:sourceP01
            .filter(d=>d.hum !== null && !isNaN(d.hum))
            .map(d=>d.hum),
        co2:daytimeP21
            .filter(d=>d.co2 !== null && !isNaN(d.co2))
            .map(d=>d.co2),
        solar:sourceP31
            .filter(d=>d.solar !== null && !isNaN(d.solar))
            .map(d=>d.solar)
    };
}

// 範囲内（下限・上限を含む）の件数 ÷ 有効件数 × 100を四捨五入した点数。
// null・undefined・NaNを除き、有効件数が0ならnull。時間の長さではなく測定件数で評価する。
function calcEnvironmentScore(values, range){
    const validValues = values.filter(value=>value !== null && value !== undefined && !isNaN(value));
    if(!validValues.length) return null;

    const inRangeCount = validValues.filter(value=>value >= range.min && value <= range.max).length;
    return Math.round((inRangeCount / validValues.length) * 100);
}

// 総合点は、値のある項目の点数を同じ重みで平均して四捨五入する。
// 欠損項目を0点としては扱わず、全項目欠損なら総合点もnullになる。
function calcEnvironmentScoreRow(start, end, p01, p21, p31){
    const ranges = getEnvironmentScoreRanges();
    const values = getScoreRowsForPeriod(start, end, p01, p21, p31);
    const scores = {};

    environmentScoreItems.forEach(item=>{
        scores[item.key] = calcEnvironmentScore(values[item.key], ranges[item.key]);
    });

    const validScores = environmentScoreItems
        .map(item=>scores[item.key])
        .filter(score=>score !== null && score !== undefined && !isNaN(score));

    scores.total = validScores.length
        ? Math.round(validScores.reduce((sum, score)=>sum + score, 0) / validScores.length)
        : null;

    return scores;
}

function formatEnvironmentScore(value){
    return value === null || value === undefined || isNaN(value) ? "-" : value + "点";
}

function getEnvironmentScoreTotalClass(value){
    if(value === null || value === undefined || isNaN(value)) return "";
    if(value >= 90) return " environment-score-total-darkgreen";
    if(value >= 80) return " environment-score-total-green";
    if(value >= 70) return " environment-score-total-lightgreen";
    if(value >= 60) return " environment-score-total-orange";
    return " environment-score-total-red";
}

function formatEnvironmentScoreDiff(todayScore, yesterdayScore){
    if(
        todayScore === null || todayScore === undefined || isNaN(todayScore) ||
        yesterdayScore === null || yesterdayScore === undefined || isNaN(yesterdayScore)
    ){
        return "";
    }

    const diff = todayScore - yesterdayScore;
    if(diff === 0) return "昨日と同じ";
    return "昨日より " + (diff > 0 ? "+" : "") + diff + "点";
}

function formatEnvironmentScoreDayDiff(score, previousScore){
    if(
        score === null || score === undefined || isNaN(score) ||
        previousScore === null || previousScore === undefined || isNaN(previousScore)
    ){
        return "-";
    }

    const diff = score - previousScore;
    if(diff === 0) return "±0点";
    return (diff > 0 ? "+" : "") + diff + "点";
}

function renderEnvironmentScoreTableRow(label, scores, diffText, dayDiffText){
    const totalClass = "environment-score-total" + getEnvironmentScoreTotalClass(scores.total);
    const totalHtml = formatEnvironmentScore(scores.total) +
        (diffText ? '<span class="environment-score-diff">' + escapeHtml(diffText) + '</span>' : "");
    const dayDiffHtml = dayDiffText !== undefined
        ? "<td>" + escapeHtml(dayDiffText) + "</td>"
        : "";

    return "<tr>" +
        "<td>" + escapeHtml(label) + "</td>" +
        "<td>" + formatEnvironmentScore(scores.vpd) + "</td>" +
        "<td>" + formatEnvironmentScore(scores.temp) + "</td>" +
        "<td>" + formatEnvironmentScore(scores.hum) + "</td>" +
        "<td>" + formatEnvironmentScore(scores.co2) + "</td>" +
        "<td>" + formatEnvironmentScore(scores.solar) + "</td>" +
        '<td class="' + totalClass + '">' + totalHtml + "</td>" +
        dayDiffHtml +
    "</tr>";
}

// 今日の途中経過は当日0時から現在まで、履歴は直前5日分の日単位で集計する。
// 今日と前日は同じ経過時刻で切りそろえず、前日は1日全体と比較する。
// 入力配列は範囲変更時の再計算にも使うため共有変数に保持する。
function renderEnvironmentScores(p01, p21, p31){
    environmentScoreP01 = p01 || [];
    environmentScoreP21 = p21 || [];
    environmentScoreP31 = p31 || [];

    const todayBody = document.getElementById("scoreTodayBody");
    const historyBody = document.getElementById("scoreHistoryBody");
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0,0,0,0);
    const bestScore = renderBest30DayScore(todayStart);
    let todayScores = null;

    if(todayBody){
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(todayStart.getDate() - 1);
        todayScores = calcEnvironmentScoreRow(todayStart, now, environmentScoreP01, environmentScoreP21, environmentScoreP31);
        const yesterdayScores = calcEnvironmentScoreRow(yesterdayStart, todayStart, environmentScoreP01, environmentScoreP21, environmentScoreP31);

        todayBody.innerHTML = renderEnvironmentScoreTableRow(
            "今日の途中経過",
            todayScores,
            formatEnvironmentScoreDiff(todayScores.total, yesterdayScores.total)
        );
    }

    renderBestGap(todayScores ? todayScores.total : null, bestScore);

    if(historyBody){
        const rows = [];

        for(let i = 1; i <= 5; i++){
            const start = new Date(todayStart);
            start.setDate(todayStart.getDate() - i);
            const end = new Date(start);
            end.setDate(start.getDate() + 1);

            const previousStart = new Date(start);
            previousStart.setDate(start.getDate() - 1);
            const scores = calcEnvironmentScoreRow(start, end, environmentScoreP01, environmentScoreP21, environmentScoreP31);
            const previousScores = calcEnvironmentScoreRow(previousStart, start, environmentScoreP01, environmentScoreP21, environmentScoreP31);

            rows.push(renderEnvironmentScoreTableRow(
                formatScoreDate(start),
                scores,
                "",
                formatEnvironmentScoreDayDiff(scores.total, previousScores.total)
            ));
        }

        historyBody.innerHTML = rows.join("");
    }
}

// nullは「データなし」。午前(am)とそれ以外で異なる閾値を使い、平均値と評価文を返す。
// 要確認：各評価閾値を採用した理由・出典。現在の境界条件は下の分岐を参照する。
function evaluateVpdAverage(value, period){
    if(value === null) return "データなし";

    if(period === "am"){
        if(value >= 0 && value < 2) return "平均 " + value.toFixed(1) + " g/㎥　加湿傾向";
        if(value < 3) return "平均 " + value.toFixed(1) + " g/㎥　やや加湿";
        if(value <= 7) return "平均 " + value.toFixed(1) + " g/㎥　良好";
        if(value < 15) return "平均 " + value.toFixed(1) + " g/㎥　やや乾燥";
        return "平均 " + value.toFixed(1) + " g/㎥　乾燥ストレス";
    }

    if(value >= 0 && value < 3) return "平均 " + value.toFixed(1) + " g/㎥　加湿傾向";
    if(value < 5) return "平均 " + value.toFixed(1) + " g/㎥　やや加湿";
    if(value <= 10) return "平均 " + value.toFixed(1) + " g/㎥　良好";
    if(value < 15) return "平均 " + value.toFixed(1) + " g/㎥　やや乾燥";
    return "平均 " + value.toFixed(1) + " g/㎥　乾燥ストレス";
}

function handleUtechAreaChange(){
    const select = document.getElementById("utechAreaSelect");
    const key = select && UTECH_AREAS[select.value] ? select.value : "naha";
    selectedUtechAreaKey = key;
    localStorage.setItem(UTECH_AREA_STORAGE_KEY, key);
    tideCalendarText = "満潮・干潮：読み込み中...";
    updateHeaderTimeInfo();
    loadTideCalendarInfo();
    loadTomorrowForecast();
    // Historical review now belongs to U-Tech Plus.
}

function applyMobileChartRanges(minTime, maxTime){
    if(!isMobileView()) return;

    [
        tempChartP01,
        tempChartP11,
        humChartP01,
        humChartP11,
        outsideDiffChart,
        mainVaporChart,
        mainDewPointChart,
        solarChart,
        co2Chart,
        co2OutsideChart,
        co2DiffChart,
        windChartP61,
    ].forEach(chart=>{
        applyChartXRange(chart, minTime, maxTime);
    });
}

function getMainChartContext(userId, outsideSource, minTime, now){
    return {
        userId:userId,
        outsideSource:outsideSource,
        ranges:{
            default:{ startTime:minTime, endTime:now }
        }
    };
}

function getMainChartRange(config, context){
    return context.ranges[config.rangeKey || "default"];
}

function getMainChartRequests(config, context){
    const fields = config.fields || [];
    const rangeKey = config.rangeKey || "default";

    return config.requests(context).map(request=>({
        ...request,
        fields:fields,
        rangeKey:rangeKey
    }));
}

function getFetchRequestKey(request){
    return [
        request.userId,
        request.pointId,
        request.rangeKey || "default"
    ].join("|");
}

function buildMainChartFetchRequests(context){
    const seen = {};
    const requests = [];

    mainChartConfigs.forEach(config=>{
        getMainChartRequests(config, context).forEach(request=>{
            const key = getFetchRequestKey(request);
            if(seen[key]) return;

            seen[key] = true;
            requests.push(request);
        });
    });

    return requests;
}

function getFetchRange(request, context){
    const range = context.ranges[request.rangeKey || "default"];
    if(!range || request.rangeKey === "default") return null;

    return {
        start:formatSqlDateTime(range.startTime),
        end:formatSqlDateTime(range.endTime)
    };
}

function getFetchedResult(resultMap, userId, pointId, rangeKey){
    return resultMap[[userId, pointId, rangeKey || "default"].join("|")] || { data:[], error:null };
}

function applyMainChartNoDataStates(chartMap, context){
    mainChartConfigs.forEach(config=>{
        const range = getMainChartRange(config, context);
        setChartNoDataState(
            config.canvasId,
            chartMap[config.key],
            getMainChartRequests(config, context),
            range.startTime,
            range.endTime
        );
    });
}

// === 雨量：計算設定・グラフ・データ取得 ===
// 雨量の2方式：rainfallは保存済みrainfall_interval（mm）、tipはrainfall_tip_intervalを係数で換算する。
// 累積値から区間差分を作る処理はinsert.php、時間別集計はget_rainfall_data.phpが担当する。
function getRainfallCalculationMode(){
    const selected = document.querySelector('input[name="rainfallCalculationMode"]:checked');
    return selected && selected.value === "tip" ? "tip" : "rainfall";
}

// 1転倒の雨量（mm）= 1転倒水量（mL）×10 ÷ 受水面積（cm²）。1 mL=1 cm³のため深さをmmへ換算する。
// 空欄・非有限値・0以下はnull。係数はtip方式のAPIへ送り、保存済み雨量そのものは書き換えない。
function getRainfallTipCoefficient(){
    const areaInput = document.getElementById("rainfallCollectorArea");
    const volumeInput = document.getElementById("rainfallTipVolume");
    const areaText = areaInput ? String(areaInput.value).trim() : "";
    const volumeText = volumeInput ? String(volumeInput.value).trim() : "";
    if(!areaText || !volumeText) return null;

    const area = Number(areaText);
    const volume = Number(volumeText);
    if(!Number.isFinite(area) || area <= 0 || !Number.isFinite(volume) || volume <= 0) return null;

    const coefficient = volume * 10 / area;
    return Number.isFinite(coefficient) && coefficient > 0 ? coefficient : null;
}

function updateRainfallCalculationDisplay(){
    const isTipMode = getRainfallCalculationMode() === "tip";
    const inputs = [
        document.getElementById("rainfallCollectorArea"),
        document.getElementById("rainfallTipVolume")
    ];
    inputs.forEach(input=>{
        if(input) input.disabled = !isTipMode;
    });

    const result = document.getElementById("rainfallTipResult");
    if(!result) return;
    const coefficient = getRainfallTipCoefficient();
    result.classList.toggle("is-invalid", isTipMode && coefficient === null);
    result.textContent = coefficient === null
        ? (isTipMode
            ? "1転倒あたり：未計算（正の数値を入力してください）"
            : "1転倒あたり：未計算")
        : "1転倒あたり：" + coefficient.toFixed(4) + " mm";
}

// 雨量計算設定はブラウザ共通。保存モードがtip以外ならrainfall、面積・容量は未保存なら空欄。
// saveRainfallCalculationSettingは面積・容量が正の有限数のときだけ保存し、それ以外はキーを削除する。
function restoreRainfallCalculationSetting(){
    const savedMode = localStorage.getItem(RAINFALL_MODE_STORAGE_KEY);
    const mode = savedMode === "tip" ? "tip" : "rainfall";
    const selected = document.querySelector(
        'input[name="rainfallCalculationMode"][value="' + mode + '"]'
    );
    if(selected) selected.checked = true;

    const area = localStorage.getItem(RAINFALL_COLLECTOR_AREA_STORAGE_KEY);
    const volume = localStorage.getItem(RAINFALL_TIP_VOLUME_STORAGE_KEY);
    const areaInput = document.getElementById("rainfallCollectorArea");
    const volumeInput = document.getElementById("rainfallTipVolume");
    if(areaInput) areaInput.value = area || "";
    if(volumeInput) volumeInput.value = volume || "";
    updateRainfallCalculationDisplay();
}

function saveRainfallCalculationSetting(){
    localStorage.setItem(RAINFALL_MODE_STORAGE_KEY, getRainfallCalculationMode());
    [
        ["rainfallCollectorArea", RAINFALL_COLLECTOR_AREA_STORAGE_KEY],
        ["rainfallTipVolume", RAINFALL_TIP_VOLUME_STORAGE_KEY]
    ].forEach(([id, key])=>{
        const input = document.getElementById(id);
        const value = input ? String(input.value).trim() : "";
        const number = Number(value);
        if(value && Number.isFinite(number) && number > 0) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    });
}

// 方式・換算条件の変更時に旧グラフと日別表示を破棄し、別々に読み直す。
// 連番を進めることで、変更前の通信が後から完了しても古い条件で表示しない。
function reloadRainfallData(){
    const requestId = ++rainfallRequestSequence;
    destroyRainChart();
    invalidateTenDayRainfallSummary();

    const userId = getMainUserIdInputValue();
    if(!userId) return;

    const rainfallSource = getRainfallSourceRequest(userId);
    updateRainfallSourceNote(rainfallSource);
    void loadRainfallData(rainfallSource.userId, isMobileView() ? 48 : 72, requestId);
    void loadTenDayRainfallSummary(rainfallSource.userId);
}

function handleRainfallCalculationModeChange(){
    updateRainfallCalculationDisplay();
    saveRainfallCalculationSetting();
    reloadRainfallData();
}

function handleRainfallCalculationInput(){
    updateRainfallCalculationDisplay();
    if(getRainfallCalculationMode() === "tip" && getRainfallTipCoefficient() === null){
        rainfallRequestSequence++;
        destroyRainChart();
        invalidateTenDayRainfallSummary();
        showRainfallCardMessage("受水面積と1転倒水量に0より大きい数値を入力してください");
    }
}

function handleRainfallCalculationInputChange(){
    handleRainfallCalculationInput();
    saveRainfallCalculationSetting();
    if(getRainfallCalculationMode() === "tip" && getRainfallTipCoefficient() !== null){
        reloadRainfallData();
    }
}

// 日別表示は合計値を整数mmに四捨五入する。欠損は「-」。グラフの詳細表示は小数2桁。
function formatDailySummaryRainfallValue(value){
    if(value === null || value === undefined || value === "") return "-";
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number)) : "-";
}

function isFiniteRainfallValue(value){
    return value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(Number(value));
}

function clearRainfallNoDataState(){
    const canvas = document.getElementById("rainChart");
    if(!canvas || !canvas.parentElement) return;

    canvas.style.display = "";
    const notice = canvas.parentElement.querySelector(".chart-no-data");
    if(notice) notice.remove();
}

function showRainfallCardMessage(message){
    const canvas = document.getElementById("rainChart");
    if(!canvas || !canvas.parentElement) return;

    hideRainfallTooltip();
    canvas.style.display = "none";

    let notice = canvas.parentElement.querySelector(".chart-no-data");
    if(!notice){
        notice = document.createElement("div");
        notice.className = "chart-no-data";
        canvas.parentElement.appendChild(notice);
    }
    notice.innerText = message;
}

function destroyRainChart(){
    hideRainfallTooltip();
    allCharts = allCharts.filter(chart=>!chart || !chart.canvas || chart.canvas.id !== "rainChart");

    if(rainChart){
        rainChart.destroy();
        rainChart = null;
    }

    const existing = typeof Chart !== "undefined" ? Chart.getChart("rainChart") : null;
    if(existing) existing.destroy();

    clearRainfallNoDataState();
}

// API集計済みの1時間雨量を棒、日積算を日付別の線で表示する（両方mm）。
// 欠測はnull、日付ごとに線を分けて日跨ぎの積算値をつながない。欠測区間の線も補間しない。
// 表示開始位置の日積算を補助点として追加し、X軸はdisplay_start〜endに設定する。
function createRainfallChart(response){
    const canvas = getChartCanvas("rainChart");
    const hourly = Array.isArray(response.hourly) ? response.hourly : [];

    if(!canvas || !hourly.length) return null;

    destroyRainChart();
    clearRainfallNoDataState();

    const displayStart = Number(response.display_start);
    const endTime = Number(response.end);
    const dailyGroups = {};

    hourly.forEach(bucket=>{
        if(!dailyGroups[bucket.date_key]) dailyGroups[bucket.date_key] = [];
        dailyGroups[bucket.date_key].push({
            x:Number(bucket.x),
            y:bucket.missing ? null : Number(bucket.daily_cumulative)
        });
    });

    if(
        response.display_start_date_key &&
        isFiniteRainfallValue(response.display_start_daily_cumulative)
    ){
        const dateKey = response.display_start_date_key;
        if(!dailyGroups[dateKey]) dailyGroups[dateKey] = [];
        dailyGroups[dateKey].push({
            x:displayStart,
            y:Number(response.display_start_daily_cumulative)
        });
    }

    const dailyDatasets = Object.keys(dailyGroups).sort().map((dateKey, index)=>({
        type:"line",
        label:"日積算雨量",
        data:dailyGroups[dateKey].sort((a,b)=>a.x-b.x),
        yAxisID:"yDaily",
        borderColor:"rgb(0, 75, 145)",
        backgroundColor:"rgb(0, 75, 145)",
        pointBackgroundColor:"rgb(0, 75, 145)",
        borderWidth:2,
        pointRadius:0,
        pointHoverRadius:4,
        tension:0,
        spanGaps:false,
        fill:false,
        order:1,
        showInLegend:index === 0
    }));
    const barDataset = {
        type:"bar",
        label:"1時間雨量",
        data:hourly.map(bucket=>({
            x:Number(bucket.x),
            y:bucket.missing ? null : Number(bucket.hourly_rainfall)
        })),
        yAxisID:"yHourly",
        backgroundColor:"rgba(54, 162, 235, 0.65)",
        borderColor:"rgb(54, 162, 235)",
        borderWidth:1,
        barPercentage:0.88,
        categoryPercentage:1,
        order:2,
        showInLegend:true
    };
    const options = baseOptions(new Date(displayStart), new Date(endTime));
    const zoomEnabled = !isMobileView();

    options.interaction = {
        mode:"index",
        axis:"x",
        intersect:false
    };
    options.plugins.tooltip.callbacks = {
        ...options.plugins.tooltip.callbacks,
        label(){
            return null;
        }
    };
    options.plugins.rainfallTooltipPlugin = false;
    options.plugins.legend = {
        labels:{
            filter(item, data){
                const dataset = data.datasets[item.datasetIndex];
                return dataset && dataset.showInLegend !== false;
            },
            sort(itemA, itemB){
                const order = { "1時間雨量":0, "日積算雨量":1 };
                const orderA = Object.prototype.hasOwnProperty.call(order, itemA.text) ? order[itemA.text] : 99;
                const orderB = Object.prototype.hasOwnProperty.call(order, itemB.text) ? order[itemB.text] : 99;
                return orderA - orderB;
            }
        }
    };
    options.plugins.zoom.zoom.wheel.enabled = false;
    options.plugins.zoom.zoom.pinch.enabled = zoomEnabled;
    options.plugins.zoom.zoom.drag.enabled = zoomEnabled;
    options.plugins.zoom.zoom.mode = "xy";
    options.plugins.zoom.zoom.onZoomComplete = ()=>hideRainfallTooltip();
    options.scales = {
        ...options.scales,
        yHourly:{
            position:"left",
            beginAtZero:true,
            ticks:{ color:"#000" },
            title:{ display:true, text:"1時間雨量 (mm)", color:"#000" }
        },
        yDaily:{
            position:"right",
            beginAtZero:true,
            grid:{ drawOnChartArea:false },
            ticks:{ color:"#000" },
            title:{ display:true, text:"日積算雨量 (mm)", color:"#000" }
        }
    };

    const chart = new Chart(canvas,{
        type:"bar",
        data:{ datasets:[barDataset, ...dailyDatasets] },
        options:options
    });

    chart.$rainfallBuckets = hourly;
    chart.$rainfallEnd = endTime;
    saveInitialScaleLimits(chart);
    return chart;
}

function resetRainZoom(){
    hideRainfallTooltip();
    if(!rainChart) return;

    if(rainChart.resetZoom) rainChart.resetZoom("none");
    restoreInitialScaleLimits(rainChart);
    rainChart.update("none");
    rainChart.resize();
}

// P41専用APIから48/72時間表示用の集計を取得する。tip方式で係数未確定なら取得しない。
// 応答・エラー反映時に呼び出し元の連番と比較し、条件変更前の結果を捨てる。
// has_dataは取得行の存在であり、有効な雨量値の存在とは別。欠測の扱いはAPIのmissingを参照する。
// 10秒の中断タイマーは本文読取を含むtry全体の終了時にfinallyで解除する。
async function loadRainfallData(userId, displayHours, requestId){
    const controller = new AbortController();
    const timeoutId = setTimeout(()=>controller.abort(), 10000);

    try{
        const mode = getRainfallCalculationMode();
        const coefficient = getRainfallTipCoefficient();
        if(mode === "tip" && coefficient === null){
            showRainfallCardMessage("受水面積と1転倒水量に0より大きい数値を入力してください");
            return;
        }
        const url =
            "get_rainfall_data.php?user_id=" + encodeURIComponent(userId) +
            "&point_id=P41&display_hours=" + encodeURIComponent(displayHours) +
            "&mode=" + encodeURIComponent(mode) +
            (mode === "tip" && coefficient !== null
                ? "&coefficient=" + encodeURIComponent(coefficient)
                : "");
        const response = await fetch(url, {
            signal:controller.signal,
            cache:"no-store"
        });
        const text = await response.text();

        if(requestId !== rainfallRequestSequence) return;

        if(!text.trim()) throw new Error("空のレスポンス");

        const result = JSON.parse(text);

        if(!response.ok || !result.success){
            throw new Error(result.error || "雨量データ取得エラー");
        }

        if(!result.has_data){
            showRainfallCardMessage("雨量データなし");
            return;
        }

        rainChart = createRainfallChart(result);
        if(rainChart && !allCharts.includes(rainChart)) allCharts.push(rainChart);

        if(!rainChart){
            showRainfallCardMessage("雨量データなし");
        }
    }catch(error){
        if(requestId !== rainfallRequestSequence) return;
        showRainfallCardMessage(
            error && error.name === "AbortError"
                ? "雨量データ取得タイムアウト"
                : "雨量データ取得エラー"
        );
        console.warn("[Rainfall]", error);
    }finally{
        clearTimeout(timeoutId);
    }
}

function getGuideRange(minId, maxId, defaultMin, defaultMax){
    const minValue = getAxisValue(minId, defaultMin);
    const maxValue = getAxisValue(maxId, defaultMax);

    return {
        min:Math.min(minValue, maxValue),
        max:Math.max(minValue, maxValue)
    };
}

function setGuideRangeInputs(minId, maxId, range){
    const minInput = document.getElementById(minId);
    const maxInput = document.getElementById(maxId);

    if(minInput) minInput.value = range.min;
    if(maxInput) maxInput.value = range.max;
}

function getMainDewPointAxis(){
    return {
        min:getAxisValue("mainDewPointMin", undefined),
        max:getAxisValue("mainDewPointMax", undefined)
    };
}

// 温度/湿度の抽出・軸・スマホ用期間はここで決め、線の基本設定だけ共通描画へ渡す。
function createTempHumSingleChart(canvasId, parsed, minTime, maxTime, pointId, measurement){
    const canvas=getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(parsed)) return null;
    destroyExistingChart(canvasId);
    const axis=getTempHumAxis(pointId);
    const isTemp=measurement==="temperature";
    const key=isTemp ? "temp" : "hum";
    const data=parsed.filter(d=>d[key]!==null && !isNaN(d[key])).map(d=>({x:d.xValue,y:d[key]}));
    if(!data.length) return null;
    const range=isTemp ? {min:axis.tempMin,max:axis.tempMax} : {min:axis.humMin,max:axis.humMax};
    const unit=isTemp ? "℃" : "%";
    const yAxis={...range,ticks:{stepSize:isTemp ? 5 : 10,color:"#000"},title:{display:true,text:unit,color:"#000"}};
    const options=baseOptions(getChartDisplayMinTime(canvasId,minTime,maxTime),maxTime);
    options.scales={...options.scales,y:yAxis,yRight:createRightYAxis(yAxis)};
    const color=isTemp ? "rgb(255, 0, 0)" : "rgb(0, 100, 255)";
    return createSingleLineChart(canvas, data, {
        label:(isTemp ? "温度" : "湿度")+" ("+unit+")",
        color:color,
        backgroundColor:isTemp ? "rgba(255, 0, 0, 0.18)" : "rgba(0, 100, 255, 0.18)",
        fill:true
    }, options);
}

function createWindChart(canvasId, parsed, minTime, maxTime){
    const canvas = getChartCanvas(canvasId);
    if(!canvas || !hasChartSourceData(parsed)) return null;

    destroyExistingChart(canvasId);
    const displayMinTime = getChartDisplayMinTime(canvasId, minTime, maxTime);
    const averageData = parsed
        .filter(d=>d.windSpeedAvg !== null && !isNaN(d.windSpeedAvg))
        .map(d=>({ x:d.xValue, y:d.windSpeedAvg }));
    const maximumData = parsed
        .filter(d=>d.windSpeedMax !== null && !isNaN(d.windSpeedMax))
        .map(d=>({ x:d.xValue, y:d.windSpeedMax }));

    if(!averageData.length && !maximumData.length) return null;

    const options = baseOptions(displayMinTime, maxTime);
    options.plugins = {
        ...options.plugins,
        tooltip:{
            ...options.plugins.tooltip,
            callbacks:{
                ...options.plugins.tooltip.callbacks,
                // 日時欄は月日と時刻のみ。風速値は点のラベルに表示する。
                title(items){
                    if(!items.length) return "";
                    const syncGroup = getChartSyncGroup(items[0].chart);
                    const time = syncedCrosshairLatest[syncGroup] && syncedCrosshairValues[syncGroup] !== null
                        ? syncedCrosshairValues[syncGroup]
                        : items[0].parsed.x;
                    return formatTime(time);
                }
            }
        }
    };
    options.scales = {
        ...options.scales,
        y:{
            min:0,
            ticks:{ color:"#000", callback:value=>Number(value).toFixed(1) },
            title:{ display:true, text:"風速（m/s）", color:"#000" }
        }
    };

    return new Chart(canvas,{
        type:"line",
        data:{
            datasets:[
                {
                    label:"10分平均風速",
                    data:averageData,
                    borderColor:"rgb(0, 135, 120)",
                    backgroundColor:"rgba(0, 135, 120, 0.10)",
                    pointBackgroundColor:"rgb(0, 135, 120)",
                    pointRadius:0,
                    borderWidth:2,
                    tension:0.2,
                    fill:false
                },
                {
                    label:"10分最大風速",
                    data:maximumData,
                    borderColor:"rgb(210, 90, 40)",
                    backgroundColor:"rgba(210, 90, 40, 0.10)",
                    pointBackgroundColor:"rgb(210, 90, 40)",
                    pointRadius:0,
                    borderWidth:2,
                    tension:0.2,
                    fill:false
                }
            ]
        },
        options:options
    });
}

// === メイン画面：取得・計算・現在値表示・グラフ描画 ===
async function loadData(){
    clearAllSyncedTooltips();
    const rainfallRequestId = ++rainfallRequestSequence;
    destroyRainChart();
    invalidateTenDayRainfallSummary();

    const userId = getMainUserIdInputValue();
    const msg = document.getElementById("message");

    restoreMainGraphVisibility(userId);
    restoreMainAxisLinks(userId);

    if(!userId){
        msg.innerText = "user_id を入力してください";
        return;
    }

    localStorage.setItem("usui_user_id", userId);
    saveUserIdHistory(userId);

    const outsideSource = getOutsideSourceRequest(userId);
    updateOutsideSourceNote(outsideSource);
    const rainfallSource = getRainfallSourceRequest(userId);
    updateRainfallSourceNote(rainfallSource);

    msg.innerText = "読み込み中...";

    document.getElementById("tempNow").innerText = "-";
    document.getElementById("vpdNow").innerText = "-";
    document.getElementById("dewNow").innerText = "-";
    document.getElementById("humNow").innerText = "-";
    document.getElementById("solarNow").innerText = "-";
    document.getElementById("co2Now").innerText = "-";
    document.getElementById("windAvgNow").innerText = "-";
    document.getElementById("windMaxNow").innerText = "-";
    resetDailyTempStats();
    loadTenDayDailySummaries(userId, outsideSource, rainfallSource);
    document.getElementById("vpdEvalAm").innerText = "データなし";
    document.getElementById("vpdEvalPm").innerText = "データなし";
    renderEnvironmentScores([], [], []);

    destroyCharts();

    try{

        const now = new Date();
        const minTime = new Date(now.getTime() - 72*60*60*1000);
        const chartMinTime = isMobileView()
            ? new Date(now.getTime() - 48*60*60*1000)
            : minTime;
        void loadRainfallData(
            rainfallSource.userId,
            isMobileView() ? 48 : 72,
            rainfallRequestId
        );
        const scoreMinTime = new Date(now);
        scoreMinTime.setHours(0,0,0,0);
        scoreMinTime.setDate(scoreMinTime.getDate() - 30);

        const chartContext = getMainChartContext(userId, outsideSource, minTime, now);
        const chartFetchRequests = buildMainChartFetchRequests(chartContext);
        const scoreFetchRequests = [
            { userId:userId, pointId:"P01", rangeKey:"score" },
            { userId:userId, pointId:"P21", rangeKey:"score" },
            { userId:userId, pointId:"P31", rangeKey:"score" }
        ];
        const fetchRequests = chartFetchRequests.concat(scoreFetchRequests);
        const results = await Promise.all(fetchRequests.map(request=>{
            const range = request.rangeKey === "score"
                ? {
                    start:formatSqlDateTime(scoreMinTime),
                    end:formatSqlDateTime(now)
                }
                : getFetchRange(request, chartContext);

            return fetchDataSafe(request.userId, request.pointId, range);
        }));
        const resultMap = {};
        fetchRequests.forEach((request, index)=>{
            resultMap[getFetchRequestKey(request)] = results[index];
        });

        const resultP01 = getFetchedResult(resultMap, userId, "P01");
        const resultP11 = getFetchedResult(resultMap, outsideSource.userId, outsideSource.pointId);
        const resultP31 = getFetchedResult(resultMap, userId, "P31");
        const resultP21 = getFetchedResult(resultMap, userId, "P21");
        const resultP26 = getFetchedResult(resultMap, userId, "P26");
        const resultP61 = getFetchedResult(resultMap, userId, "P61");
        const resultScoreP01 = getFetchedResult(resultMap, userId, "P01", "score");
        const resultScoreP21 = getFetchedResult(resultMap, userId, "P21", "score");
        const resultScoreP31 = getFetchedResult(resultMap, userId, "P31", "score");

        const p01 = parseData(resultP01.data, minTime);
        const p11 = parseData(resultP11.data, minTime);
        const p31 = parseData(resultP31.data, minTime);
        const p21 = parseData(resultP21.data, minTime);
        const p26 = parseData(resultP26.data, minTime);
        const p61 = parseData(resultP61.data, minTime);
        const scoreP01 = parseData(resultScoreP01.data, scoreMinTime);
        const scoreP21 = parseData(resultScoreP21.data, scoreMinTime);
        const scoreP31 = parseData(resultScoreP31.data, scoreMinTime);
        renderEnvironmentScores(scoreP01, scoreP21, scoreP31);

        const validP31 = p31.filter(d=>d.solar !== null && !isNaN(d.solar));
        const validP21 = p21.filter(d=>d.co2 !== null && !isNaN(d.co2));
        const validP26 = p26.filter(d=>d.co2 !== null && !isNaN(d.co2));
        const validP61 = p61.filter(d=>
            d.windSpeedAvg !== null && d.windSpeedMax !== null &&
            !isNaN(d.windSpeedAvg) && !isNaN(d.windSpeedMax)
        );

        console.log("[CO2_外気_P26] 描画可能CO2件数:", validP26.length);

        if(validP31.length){
            document.getElementById("solarNow").innerText = validP31[validP31.length - 1].solar.toFixed(1);
        }

        if(validP21.length){
            document.getElementById("co2Now").innerText = validP21[validP21.length - 1].co2.toFixed(0);
        }

        if(validP61.length){
            const latestWind = validP61[validP61.length - 1];
            document.getElementById("windAvgNow").innerText = latestWind.windSpeedAvg.toFixed(2);
            document.getElementById("windMaxNow").innerText = latestWind.windSpeedMax.toFixed(2);
        }

        const errors = results
            .filter(r=>r.error)
            .map(r=>r.error);

        if(p01.length){
            const validP01 = p01.filter(d=>
                d.temp !== null &&
                d.hum !== null &&
                !isNaN(d.temp) &&
                !isNaN(d.hum)
            );

            if(validP01.length){
                const last = validP01[validP01.length - 1];

                document.getElementById("tempNow").innerText = last.temp.toFixed(1);
                document.getElementById("vpdNow").innerText = (calcVapor(last.temp,100) - calcVapor(last.temp,last.hum)).toFixed(1);
                document.getElementById("dewNow").innerText = calcDewPoint(last.temp, last.hum).toFixed(1);
                document.getElementById("humNow").innerText = last.hum.toFixed(1);

                const yStart = new Date();
                yStart.setDate(yStart.getDate() - 1);
                yStart.setHours(0,0,0,0);

                const yEnd = new Date(yStart);
                yEnd.setHours(23,59,59,999);

                const amVpdAverage = calcVpdAverage(validP01, 6, 12, yStart);
                const pmVpdAverage = calcVpdAverage(validP01, 12, 18, yStart);

                document.getElementById("vpdEvalAm").innerText = evaluateVpdAverage(amVpdAverage, "am");
                document.getElementById("vpdEvalPm").innerText = evaluateVpdAverage(pmVpdAverage, "pm");
            }
        }

        tempChartP01 = createTempHumSingleChart("tempChartP01", p01, chartMinTime, now, "P01", "temperature");
        tempChartP11 = createTempHumSingleChart("tempChartP11", p11, chartMinTime, now, "P11", "temperature");
        humChartP01 = createTempHumSingleChart("humChartP01", p01, chartMinTime, now, "P01", "humidity");
        humChartP11 = createTempHumSingleChart("humChartP11", p11, chartMinTime, now, "P11", "humidity");
        outsideDiffChart = createOutsideDiffChart("outsideDiffChart", p01, p11, chartMinTime, now);
        mainVaporChart = createVaporChart("mainVaporChart", p01, chartMinTime, now);
        mainDewPointChart = createSingleChart(
            "mainDewPointChart", p01, "dew", "露点温度", "℃",
            chartMinTime, now, getMainDewPointAxis()
        );

        solarChart = createSingleChart("solarChart", p31, "solar", "日射", "日射", chartMinTime, now);
        co2Chart = createSingleChart("co2Chart", p21, "co2", "co2", "ppm", chartMinTime, now);
        co2OutsideChart = createSingleChart("co2OutsideChart", p26, "co2Outside", "co2", "ppm", chartMinTime, now);
        co2DiffChart = createCo2DiffChart("co2DiffChart", p21, p26, chartMinTime, now);
        windChartP61 = createWindChart("windChartP61", p61, chartMinTime, now);

        applyMainChartNoDataStates({
            insideTemperature:tempChartP01,
            insideHumidity:humChartP01,
            outsideTemperature:tempChartP11,
            outsideHumidity:humChartP11,
            outsideDiff:outsideDiffChart,
            mainVapor:mainVaporChart,
            mainDewPoint:mainDewPointChart,
            solarRadiation:solarChart,
            insideCo2:co2Chart,
            outsideCo2:co2OutsideChart,
            co2Diff:co2DiffChart,
            insideWind:windChartP61,
        }, chartContext);

        allCharts = [
            tempChartP01,
            tempChartP11,
            outsideDiffChart,
            mainVaporChart,
            humChartP01,
            humChartP11,
            mainDewPointChart,
            solarChart,
            co2Chart,
            co2OutsideChart,
            co2DiffChart,
            windChartP61,
            rainChart,
        ].filter(Boolean);

        allCharts.forEach(saveInitialScaleLimits);
        applyMobileChartRanges(chartMinTime, now);
        refreshVisibleCharts();

        matchMainAxisLinks();

        msg.innerText = errors.length ? errors.join(" / ") : "";

    }catch(e){
        msg.innerText = "画面側エラー：" + e.message;
        console.error(e);
    }
}

// === メインのグラフ破棄・ズーム解除・縦軸反映 ===
function destroyCharts(){
    clearSyncedTooltipGroup("main");
    destroyRainChart();
    invalidateTenDayRainfallSummary();
    allCharts.forEach(c=>{
        if(c) c.destroy();
    });
    allCharts = [];
    tempChartP01 = null;
    tempChartP11 = null;
    humChartP01 = null;
    humChartP11 = null;
    outsideDiffChart = null;
    mainVaporChart = null;
    mainDewPointChart = null;
    solarChart = null;
    co2Chart = null;
    co2OutsideChart = null;
    co2DiffChart = null;
    windChartP61 = null;

    [
        "tempChartP01",
        "tempChartP11",
        "humChartP01",
        "humChartP11",
        "outsideDiffChart",
        "mainVaporChart",
        "mainDewPointChart",
        "solarChart",
        "co2Chart",
        "co2OutsideChart",
        "co2DiffChart",
        "windChartP61"
    ].forEach(canvasId=>{
        clearChartNoDataState(canvasId);
        const chart = Chart.getChart(canvasId);
        if(chart) chart.destroy();
    });
}

function resetZoom(){
    clearAllSyncedTooltips();
    syncingZoom = true;

    allCharts.forEach(c=>{
        if(c){
            if(c.resetZoom) c.resetZoom("none");
            redrawChart(c);
        }
    });

    requestAnimationFrame(()=>{
        allCharts.forEach(c=>{
            redrawChart(c);
        });

        requestAnimationFrame(()=>{
            allCharts.forEach(c=>{
                redrawChart(c);
            });

            matchMainAxisLinks();
            syncingZoom = false;
        });
    });
}

function updateMainAxisLinkControls(pair){
    const checkbox=document.getElementById(pair.checkbox);
    checkbox.disabled=!mainGraphVisibilityUserId;
    pair.inputs.forEach(id=>{document.getElementById(id).disabled=checkbox.checked;});
    checkbox.closest('.chart-axis-control').querySelector('button').disabled=checkbox.checked;
}

// 縦軸リンクは利用者別に復元し、保存値がtrueの項目だけ有効にする。
// changeMainAxisLinkは入力中IDではなくmainGraphVisibilityUserIdへ保存する。
// 読取・JSON解析の例外時は空設定を使い、リンクを解除した状態で復元する。
function restoreMainAxisLinks(userId){
    let saved={};
    try{saved=JSON.parse(localStorage.getItem('utechMainAxisLinks_v1_'+userId)) || {};}catch(e){}
    getMainAxisLinkPairs().forEach(pair=>{
        document.getElementById(pair.checkbox).checked=saved[pair.key]===true;
        updateMainAxisLinkControls(pair);
    });
}

function changeMainAxisLink(key){
    const pairs=getMainAxisLinkPairs();
    const pair=pairs.find(pair=>pair.key===key);
    updateMainAxisLinkControls(pair);
    if(mainGraphVisibilityUserId){
        const saved=Object.fromEntries(pairs.map(pair=>[pair.key,isMainAxisLinked(pair.key)]));
        try{localStorage.setItem('utechMainAxisLinks_v1_'+mainGraphVisibilityUserId,JSON.stringify(saved));}
        catch(e){document.getElementById('message').innerText='縦軸の連動設定を端末へ保存できません。';}
    }
    if(isMainAxisLinked(key)){
        matchMainAxisLinks();
    }else if(pair.outside){
        if(key==='co2') applyCo2OutsideYAxis(pair.outside);
        else applyTempHumSingleYAxis(pair.outside,'P11',key);
    }
}

function applyTempHumSingleYAxis(chart, pointId, measurement){
    if(!chart) return;
    const axis=getTempHumAxis(pointId);
    setLinearYAxis(chart,measurement==="temperature" ? {min:axis.tempMin,max:axis.tempMax} : {min:axis.humMin,max:axis.humMax});
    chart.update();
    matchMainAxisLinks();
}

function applyCo2YAxis(chart){
    applySingleYAxis(chart, "co2");
    matchMainAxisLinks();
}

function applyCo2OutsideYAxis(chart){
    applySingleYAxis(chart, "co2Outside");
}

function applyMainVaporYAxis(chart){
    if(!chart) return;

    const maxInput = document.getElementById("mainVaporMax");
    const maxText = maxInput ? String(maxInput.value).trim() : "";

    if(maxText === ""){
        setLinearYAxis(chart, { min:0, max:undefined });
        chart.update();
        return;
    }

    const min = 0;
    const max = getFiniteInputValue("mainVaporMax");
    if(max === null || min >= max){
        alert("飽差軸の最大値には0より大きい値を入力してください。");
        return;
    }

    setLinearYAxis(chart, { min:min, max:max });
    chart.update();
}

function applyCo2DiffYAxis(chart){
    if(!chart) return;

    const axis = getCo2DiffAxis();
    setLinearYAxis(chart, axis);

    chart.update();
}

function applyOutsideDiffYAxis(chart){
    if(!chart) return;

    const axis = getOutsideDiffAxis();
    setLinearYAxis(chart, axis);

    chart.update();
}

//
// === CSV：日時・Point IDの確認とダウンロード要求 ===
function parseCsvDateInput(value){
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match) return null;

    const [year, month, day] = match.slice(1).map(Number);
    const wallClockMs = Date.UTC(year, month - 1, day);
    const check = new Date(wallClockMs);
    if(
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ){
        return null;
    }

    return { value:value, wallClockMs:wallClockMs };
}

// 画面は日付で指定し、開始日00:00:00〜終了日23:59:59をCSV APIへ渡す。
function getCsvDownloadRange(startValue, endValue){
    if(!startValue) return { error:"CSVの開始日を入力してください。" };
    if(!endValue) return { error:"CSVの終了日を入力してください。" };

    const start = parseCsvDateInput(startValue);
    const end = parseCsvDateInput(endValue);
    if(!start || !end) return { error:"CSV期間には有効な開始日と終了日を入力してください。" };
    if(start.wallClockMs > end.wallClockMs){
        return { error:"CSVの開始日は終了日以前にしてください。" };
    }

    return {
        error:"",
        start:start.value + " 00:00:00",
        end:end.value + " 23:59:59"
    };
}

function setAllCsvPointIds(checked){
    document.querySelectorAll('#csvDownloadForm input[name="point_ids[]"]').forEach(input=>{
        input.checked = checked;
    });

    const message = document.getElementById("csvDownloadMessage");
    if(message) message.innerText = "";
}

function getSelectedCsvPointIds(){
    return Array.from(
        document.querySelectorAll('#csvDownloadForm input[name="point_ids[]"]:checked')
    ).map(input=>input.value);
}

function showCsvDownloadError(message, focusTarget){
    const messageElement = document.getElementById("csvDownloadMessage");
    if(messageElement) messageElement.innerText = message;
    alert(message);
    if(focusTarget && focusTarget.focus) focusTarget.focus();
}

// 入力確認後、選択Pointと期間を別タブのdownload_csv.phpへ送る。列構成・計算・出力はPHP側。
function downloadCSV(event){
    if(event) event.preventDefault();

    const userIdInput = document.getElementById("csvUserId");
    const startInput = document.getElementById("csvStart");
    const endInput = document.getElementById("csvEnd");
    const userId = userIdInput ? userIdInput.value.trim() : "";
    const startValue = startInput ? startInput.value : "";
    const endValue = endInput ? endInput.value : "";
    const pointIds = getSelectedCsvPointIds();
    const messageElement = document.getElementById("csvDownloadMessage");

    if(userIdInput) userIdInput.value = userId;
    if(messageElement) messageElement.innerText = "";

    if(!userId){
        showCsvDownloadError("user_id を入力してください。", userIdInput);
        return;
    }

    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(userId)){
        showCsvDownloadError("user_idは半角英数字、ハイフン、アンダースコアで入力してください。", userIdInput);
        return;
    }

    if(!pointIds.length){
        showCsvDownloadError("Point IDを1件以上選択してください。", document.querySelector(".csv-point-group summary"));
        return;
    }

    const range = getCsvDownloadRange(startValue, endValue);
    if(range.error){
        showCsvDownloadError(range.error, !startValue ? startInput : endInput);
        return;
    }

    const params = new URLSearchParams({
        user_id:userId,
        start:range.start,
        end:range.end
    });
    pointIds.forEach(pointId=>params.append("point_ids[]", pointId));

    window.open("download_csv.php?" + params.toString(), "_blank", "noopener");
}

// 適用済みIDを優先してPlusへ渡す。保持値がなければ現在の入力値を使う。
function openUtechPlus(){const url=new URL('u-tech-plus/',location.href);const userId=mainGraphVisibilityUserId || getMainUserIdInputValue();if(userId)url.searchParams.set('user_id',userId);location.assign(url.href);}
// === 本体の初期化：設定復元・イベント登録・ヘッダー情報取得 ===
// 有効なURLのuser_idを保存値より優先し、適用後はURLから除いて再読込時の上書きを防ぐ。
// 通知設定は取得しない。メイン測定値は「表示」操作からloadDataで取得する。
window.addEventListener('DOMContentLoaded',()=>{
 const params=new URLSearchParams(location.search);
 const raw=params.get('user_id') || '';
 const incoming=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw)?raw:'';
 const saved=incoming || localStorage.getItem('usui_user_id') || '';
 document.getElementById('userId').value=saved;
 if(params.has('user_id')){params.delete('user_id');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}
 initializeMainGraphSettings();initializeMainInfoCollapse();updateUserIdHistoryList();
 restoreOutsideSourceSetting();restoreRainfallSourceSetting();restoreEnvironmentScoreRanges();restoreUtechAreaSelection();restoreRainfallCalculationSetting();initializeTenDaySummaryTables();
 const image=document.getElementById('mobileQrImage');if(image)image.src='https://api.qrserver.com/v1/create-qr-code/?size=280x280&data='+encodeURIComponent(location.href);
 document.getElementById('mobileShareQrDialog').addEventListener('close',restoreMobileShareQrImage);
 window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width:600px), (max-width:900px) and (pointer:coarse)').matches)closeMobileShareQr();});
 document.addEventListener('click',closeLogoInfoOnOutsideClick);document.addEventListener('touchstart',handleOutsideChartTouch,{capture:true,passive:true});
 updateHeaderTimeInfo();loadTideCalendarInfo();loadTomorrowForecast();setInterval(updateHeaderTimeInfo,60000);
});
