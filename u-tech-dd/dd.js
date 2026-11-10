(() => {
    const byId = (id) => document.getElementById(id);
    const form = byId("dd-form");
    const mode = byId("mode");
    const base = byId("base");
    const status = byId("status");
    const result = byId("result");
    const display = byId("display");
    const info = byId("dd-info");
    const popup = byId("dd-info-popup");
    let days = null;
    let chart = null;

    const tokyoDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" });
    function shiftDate(date, offset) {
        const day = new Date(date + "T00:00:00Z");
        day.setUTCDate(day.getUTCDate() + offset);
        return day.toISOString().slice(0, 10);
    }

    function updateDateLimits() {
        const today = tokyoDate.format(new Date());
        byId("start").max = today;
        byId("end").max = today;
        return today;
    }

    const crosshair = {
        id: "ddCrosshair",
        afterDatasetsDraw(chart) {
            const [active] = chart.getActiveElements();
            if (!active || chart.isZoomingOrPanning?.()) return;

            const { x, y } = active.element;
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            if (x < left || x > right || y < top || y > bottom) return;

            ctx.save();
            ctx.strokeStyle = "#66788b";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            if (active.datasetIndex === 0) {
                ctx.moveTo(left, y);
                ctx.lineTo(right, y);
            }
            ctx.stroke();
            ctx.restore();
        }
    };

    byId("reset-zoom").addEventListener("click", () => chart?.resetZoom?.("none"));

    const today = updateDateLimits();
    byId("start").value = shiftDate(today, -30);
    byId("end").value = shiftDate(today, -1);
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
        const measuring = days.some((day) => day.status === "measuring");
        const coverage = byId("coverage");
        coverage.textContent = [
            missing.length ? `欠測日あり（${missing.length}日）` : "欠測日なし",
            measuring ? "当日：計測中" : ""
        ].filter(Boolean).join(" ／ ");
        coverage.classList.toggle("has-missing", missing.length > 0);
        byId("missing-detail").hidden = missing.length === 0;
        byId("missing-dates").textContent = missing.map((day) => day.date).join("、");

        const title = gdd ? "有効積算温度" : "単純積算温度";
        let total = 0;
        const added = days.map((day) => {
            if (day.status !== "valid") return null;
            return gdd ? Math.max(0, day.average - base.valueAsNumber) : day.average;
        });
        const cumulative = added.map((value) => value === null ? null : (total += value));
        status.textContent = cumulative.some((value) => value !== null) ? "" : "積算に使える日がありません。";
        byId("chart-title").textContent = title + "の推移";

        if (chart) chart.destroy();
        result.hidden = false;
        chart = new Chart(byId("chart"), {
            type: "line",
            plugins: [crosshair],
            data: {
                labels: days.map((day) => day.date),
                datasets: [
                    {
                        label: title,
                        data: cumulative,
                        borderColor: "#3f6388",
                        backgroundColor: "#3f6388",
                        borderWidth: 2,
                        pointRadius: days.length > 90 ? 1.5 : 3,
                        spanGaps: false
                    },
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
                    x: { offset: true, ticks: { maxTicksLimit: 10 } },
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
                    tooltip: {
                        callbacks: {
                            label(context) {
                                if (context.datasetIndex !== 0) return context.dataset.label;
                                const index = context.dataIndex;
                                return [
                                    `累計 ${numberFormat.format(context.parsed.y)} ℃·日`,
                                    `加算値 ${numberFormat.format(added[index])} ℃·日`,
                                    `日平均気温 ${numberFormat.format(days[index].average)} ℃`
                                ];
                            }
                        }
                    }
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
        result.hidden = true;
        status.classList.remove("error");
        status.textContent = "実測気温を読み込み中です。";

        try {
            if (typeof Chart !== "function") throw new Error("グラフの表示機能を読み込めませんでした。");
            const query = new URLSearchParams(new FormData(form));
            const response = await fetch("measurements.php?" + query);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            days = data.days;
            render();
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
