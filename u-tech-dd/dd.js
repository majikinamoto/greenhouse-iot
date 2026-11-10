(() => {
    const byId = (id) => document.getElementById(id);
    const form = byId("dd-form");
    const userId = byId("user-id");
    const userHistory = byId("user-history");
    const pointId = byId("point-id");
    const showForecast = byId("show-forecast");
    const forecastFields = byId("forecast-fields");
    const latitude = byId("latitude");
    const longitude = byId("longitude");
    const comparisonDays = byId("comparison-days");
    const forecastStatus = byId("forecast-status");
    const startDate = byId("start");
    const endDate = byId("end");
    const historyKey = "utech_dd_user_history_v1";
    const historyLimit = 15;
    const mode = byId("mode");
    const base = byId("base");
    const fillMissing = byId("fill-missing");
    const fillLimit = byId("fill-limit");
    function updateFillControls() {
        byId("fill-limit-field").hidden = !fillMissing.checked;
        fillLimit.disabled = !fillMissing.checked;
    }
    fillMissing.addEventListener("change", updateFillControls);
    updateFillControls();
    const status = byId("status");
    const result = byId("result");
    const display = byId("display");
    const info = byId("dd-info");
    const popup = byId("dd-info-popup");
    let days = null;
    let estimates = [];
    let displayedDates = [];
    let chart = null;

    function readUserHistory() {
        try {
            const saved = JSON.parse(localStorage.getItem(historyKey));
            if (Array.isArray(saved)) {
                return [...new Set(saved.filter((id) => typeof id === "string" && id.trim() && id.length <= userId.maxLength))]
                    .slice(0, historyLimit);
            }
        } catch {
            // Browsers can block access to local storage.
        }
        return [];
    }

    function renderUserHistory(ids) {
        userHistory.replaceChildren(new Option("履歴", ""), ...ids.map((id) => new Option(id, id)));
        userHistory.disabled = ids.length === 0;
    }

    let recentUsers = readUserHistory();
    renderUserHistory(recentUsers);
    userHistory.addEventListener("change", () => {
        if (userHistory.value) {
            userId.value = userHistory.value;
            restoreCoordinates();
        }
        userHistory.value = "";
    });

    const tokyoDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" });
    function shiftDate(date, offset) {
        const day = new Date(date + "T00:00:00Z");
        day.setUTCDate(day.getUTCDate() + offset);
        return day.toISOString().slice(0, 10);
    }

    function updateDateLimits() {
        const today = tokyoDate.format(new Date());
        const latest = showForecast.checked ? shiftDate(today, 365) : today;
        startDate.max = latest;
        endDate.max = latest;
        return today;
    }

    function coordinateKey() {
        return "utech_dd_coordinates_v1:" + JSON.stringify([userId.value.trim(), pointId.value.trim()]);
    }

    function restoreCoordinates() {
        const key = coordinateKey();
        if (key === currentSite) return;
        currentSite = key;
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(key));
        } catch {
            // Storage can be unavailable.
        }
        latitude.value = saved?.latitude ?? "";
        longitude.value = saved?.longitude ?? "";
    }

    let currentSite = coordinateKey();
    userId.addEventListener("change", restoreCoordinates);
    pointId.addEventListener("change", restoreCoordinates);
    for (let count = 1; count <= 10; count++) {
        comparisonDays.add(new Option(count + "日間", String(count), false, count === 5));
    }

    function updateForecastControls() {
        const enabled = showForecast.checked;
        forecastFields.hidden = !enabled;
        byId("forecast-note").hidden = !enabled;
        latitude.disabled = longitude.disabled = comparisonDays.disabled = !enabled;
        return updateDateLimits();
    }

    showForecast.addEventListener("change", () => {
        const today = updateForecastControls();
        if (showForecast.checked) {
            const proposed = shiftDate(today, 30);
            if (startDate.value <= proposed) endDate.value = proposed;
        } else if (endDate.value > today) {
            endDate.value = shiftDate(today, -1);
            if (startDate.value > endDate.value) startDate.value = shiftDate(today, -30);
        }
    });

    const crosshair = {
        id: "ddCrosshair",
        afterDatasetsDraw(chart) {
            const candidates = chart.getActiveElements();
            const active = candidates.find((item) => chart.data.datasets[item.datasetIndex].yAxisID !== "marker") ?? candidates[0];
            if (!active || chart.isZoomingOrPanning?.()) return;

            const { x, y } = active.element;
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            if (x < left || x > right || y < top || y > bottom) return;

            const dataset = chart.data.datasets[active.datasetIndex];
            const hasTotal = dataset.yAxisID !== "marker";
            ctx.save();
            ctx.strokeStyle = "#66788b";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            if (hasTotal) {
                ctx.moveTo(left, y);
                ctx.lineTo(right, y);
            }
            ctx.stroke();

            ctx.fillStyle = "#000";
            ctx.font = "bold 13px sans-serif";
            ctx.textBaseline = "top";
            const filled = active.datasetIndex === 0 && chart.data.datasets[0].pointStyle[active.index] === "rectRot";
            const date = chart.data.labels[active.index] + (filled ? "（補完）" : "");
            const dateWidth = ctx.measureText(date).width;
            const dateX = Math.max(4, Math.min(x - dateWidth / 2, chart.width - dateWidth - 4));
            ctx.fillText(date, dateX, bottom + 9);

            if (hasTotal) {
                const value = dataset.data[active.index];
                const label = `${numberFormat.format(value)} ℃·日`;
                ctx.textBaseline = "bottom";
                ctx.fillText(label, left + 8, Math.max(top + 16, y - 4));
            }
            ctx.restore();
        }
    };

    byId("reset-zoom").addEventListener("click", () => chart?.resetZoom?.("none"));

    const today = updateForecastControls();
    startDate.value = shiftDate(today, -30);
    endDate.value = shiftDate(today, -1);
    form.addEventListener("focusin", updateDateLimits);

    function showInfo(open) {
        popup.hidden = !open;
        info.setAttribute("aria-expanded", String(open));
    }

    info.addEventListener("click", () => showInfo(popup.hidden));
    document.addEventListener("click", (event) => {
        if (!info.contains(event.target) && !popup.contains(event.target)) showInfo(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !popup.hidden) {
            showInfo(false);
            info.focus();
        }
    });

    const numberFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });

    function render() {
        const gdd = mode.value === "gdd";
        byId("base-field").hidden = !gdd;
        if (!days) return;
        result.hidden = true;

        if (gdd && !Number.isFinite(base.valueAsNumber)) {
            status.textContent = "基準温度を入力してください。";
            return;
        }

        const missing = days.filter((day) => day.status === "missing");
        const filled = days.filter((day) => day.status === "filled");
        const measuring = days.some((day) => day.status === "measuring");
        const coverage = byId("coverage");
        coverage.textContent = [
            missing.length ? `欠測日あり（${missing.length}日）` : (filled.length ? "未補完の欠測なし" : "欠測日なし"),
            filled.length ? `補完 ${filled.length}日（◆）` : "",
            measuring ? "当日：計測中" : ""
        ].filter(Boolean).join(" ／ ");
        coverage.classList.toggle("has-missing", missing.length > 0);
        byId("missing-detail").hidden = missing.length === 0 && filled.length === 0;
        byId("filled-dates").hidden = filled.length === 0;
        byId("filled-dates").textContent = "補完日 " + filled.map((day) => day.date).join("、");
        byId("missing-dates").hidden = missing.length === 0;
        byId("missing-dates").textContent = "未補完の欠測日 " + missing.map((day) => day.date).join("、");

        const title = gdd ? "有効積算温度" : "単純積算温度";
        let total = 0;
        const accumulate = (average) => {
            total += gdd ? Math.max(0, average - base.valueAsNumber) : average;
            return total;
        };
        const cumulative = days.map((day) => day.average === null ? null : accumulate(day.average));
        const predicted = estimates.map((day) => ({ ...day, total: accumulate(day.average) }));
        const observed = new Map(days.map((day, index) => [day.date, cumulative[index]]));
        const sources = [
            ["forecast", "予報ベース", "#167756"],
            ["normal", "平年相当値ベース", "#7754a1"]
        ];
        const estimateDatasets = sources.flatMap(([source, label, color]) => {
            const section = predicted.filter((day) => day.source === source);
            if (!section.length) return [];
            const values = new Map(section.map((day) => [day.date, day.total]));
            const previousDate = shiftDate(section[0].date, -1);
            const anchor = predicted.find((day) => day.date === previousDate)?.total ?? observed.get(previousDate);
            if (anchor != null) values.set(previousDate, anchor);
            return [{
                label,
                data: displayedDates.map((date) => values.get(date) ?? null),
                borderColor: color,
                backgroundColor: color,
                borderDash: [6, 4],
                borderWidth: 2,
                pointRadius: 2,
                spanGaps: false
            }];
        });
        byId("forecast-source").hidden = !predicted.length;
        status.textContent = (predicted.length || cumulative.some((value) => value !== null)) ? "" : "積算に使える日がありません。";
        byId("chart-title").textContent = title + "の推移";

        if (chart) chart.destroy();
        result.hidden = false;
        chart = new Chart(byId("chart"), {
            type: "line",
            plugins: [crosshair],
            data: {
                labels: displayedDates,
                datasets: [
                    {
                        label: title,
                        data: displayedDates.map((date) => observed.get(date) ?? null),
                        borderColor: "#3f6388",
                        backgroundColor: "#3f6388",
                        borderWidth: 2,
                        pointStyle: days.map((day) => day.status === "filled" ? "rectRot" : "circle"),
                        pointBackgroundColor: days.map((day) => day.status === "filled" ? "#98610e" : "#3f6388"),
                        pointBorderColor: days.map((day) => day.status === "filled" ? "#98610e" : "#3f6388"),
                        pointRadius: days.map((day) => day.status === "filled" ? 5 : (days.length > 90 ? 1.5 : 3)),
                        spanGaps: false
                    },
                    ...estimateDatasets,
                    {
                        label: "欠測",
                        data: days.map((day) => day.status === "missing" ? 0.06 : null),
                        yAxisID: "marker",
                        showLine: false,
                        pointStyle: "crossRot",
                        pointRadius: 5,
                        backgroundColor: "#963e30",
                        borderColor: "#963e30"
                    },
                    {
                        label: "計測中",
                        data: days.map((day) => day.status === "measuring" ? 0.06 : null),
                        yAxisID: "marker",
                        showLine: false,
                        pointStyle: "triangle",
                        pointRadius: 5,
                        backgroundColor: "#98610e",
                        borderColor: "#98610e"
                    }
                ]
            },
            options: {
                animation: false,
                maintainAspectRatio: false,
                interaction: { mode: "nearest", intersect: false, axis: "x" },
                scales: {
                    x: { offset: true, ticks: { maxTicksLimit: 10, padding: 20 } },
                    y: { beginAtZero: true, title: { display: true, text: "℃·日" } },
                    marker: { axis: "y", min: 0, max: 1, display: false }
                },
                plugins: {
                    legend: { onClick() {}, labels: { usePointStyle: true } },
                    zoom: {
                        limits: { x: { min: "original", max: "original" }, y: { min: "original", max: "original" } },
                        zoom: {
                            mode: "xy",
                            drag: {
                                enabled: true,
                                threshold: 8,
                                backgroundColor: "#3f638833",
                                borderColor: "#3f6388",
                                borderWidth: 1
                            }
                        }
                    },
                    tooltip: { enabled: false }
                }
            }
        });
    }

    mode.addEventListener("change", render);
    base.addEventListener("input", render);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (display.disabled) return;
        display.disabled = true;
        days = null;
        estimates = [];
        forecastStatus.hidden = true;
        result.hidden = true;
        status.classList.remove("error");
        status.textContent = "実測気温を読み込み中です。";

        try {
            if (typeof Chart !== "function") throw new Error("グラフの表示機能を読み込めませんでした。");
            const query = new URLSearchParams(new FormData(form));
            const coords = { latitude: latitude.valueAsNumber, longitude: longitude.valueAsNumber };
            const site = coordinateKey();
            const start = query.get("start");
            const end = query.get("end");
            const count = Number(query.get("comparison_days"));
            if (count) {
                try {
                    localStorage.setItem(site, JSON.stringify(coords));
                } catch {
                    // Forecast can run without saving coordinates.
                }
            }
            const response = await fetch("measurements.php?" + query);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            days = data.days;
            displayedDates = [];
            for (let date = start; date <= end; date = shiftDate(date, 1)) displayedDates.push(date);
            render();
            if (data.comparison) {
                forecastStatus.hidden = false;
                forecastStatus.textContent = "将来の気温を推定しています。";
                try {
                    const first = start > data.comparison.today ? start : data.comparison.today;
                    const prediction = await ddForecast.estimate(coords, data.comparison, count, first, end, shiftDate);
                    estimates = prediction.days;
                    const missingNote = estimates.length && days.some((day) => day.status === "missing")
                        ? "未補完の欠測日は予測の累計にも含みません。" : "";
                    forecastStatus.textContent = [prediction.message, missingNote].filter(Boolean).join(" ");
                    forecastStatus.hidden = !forecastStatus.textContent;
                    render();
                } catch (error) {
                    forecastStatus.textContent = error instanceof TypeError || error.name === "TimeoutError"
                        ? "Open-Meteoに接続できませんでした。" : error.message;
                }
            }

            const selectedUser = query.get("user_id").trim();
            recentUsers = [...new Set([selectedUser, ...readUserHistory(), ...recentUsers])].slice(0, historyLimit);
            try {
                localStorage.setItem(historyKey, JSON.stringify(recentUsers));
            } catch {
                // Keep the history available until the page is closed.
            }
            renderUserHistory(recentUsers);
        } catch (error) {
            days = null;
            result.hidden = true;
            status.classList.add("error");
            status.textContent = error instanceof TypeError || error instanceof SyntaxError
                ? "実測気温を取得できませんでした。" : error.message;
        } finally {
            display.disabled = false;
        }
    });
})();
