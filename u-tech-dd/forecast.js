const ddForecast = (() => {
    const model = "jma_seamless";
    const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
    const normalCacheKey = "utech_dd_era5_normals_1991_2020_v1";

    async function hourly(host, path, coords, options) {
        const query = new URLSearchParams({ ...coords, timezone: "Asia/Tokyo", ...options });
        const response = await fetch(`https://${host}.open-meteo.com/v1/${path}?${query}`, {
            signal: AbortSignal.timeout(45000)
        });
        if (!response.ok) throw new Error("Open-Meteoの気温データを取得できませんでした。");
        const { hourly: data } = await response.json();
        const values = data?.[options.hourly];
        if (!Array.isArray(data?.time) || !Array.isArray(values) || data.time.length !== values.length) {
            throw new Error("Open-Meteoの応答に時間別気温がありません。");
        }
        return data.time.map((time, index) => [time, values[index]]);
    }

    function corrections(comparison, past, count, shiftDate) {
        return hours.map((hour) => {
            const suffix = `T${hour}:00`;
            const end = Number.isFinite(comparison.hourly[comparison.today + suffix])
                ? comparison.today : shiftDate(comparison.today, -1);
            let sum = 0;
            let pairs = 0;
            for (let offset = 0; offset < count; offset++) {
                const key = shiftDate(end, -offset) + suffix;
                const indoor = comparison.hourly[key];
                const outdoor = past.get(key);
                if (Number.isFinite(indoor) && Number.isFinite(outdoor)) {
                    sum += indoor - outdoor;
                    pairs++;
                }
            }
            return pairs ? sum / pairs : null;
        });
    }

    async function normals(coords) {
        const key = JSON.stringify(coords);
        try {
            const cached = JSON.parse(localStorage.getItem(normalCacheKey));
            if (cached?.key === key && cached.values) return cached.values;
        } catch {
            // Storage can be unavailable.
        }

        const entries = await hourly("archive-api", "archive", coords, {
            models: "era5_land",
            hourly: "temperature_2m",
            start_date: "1991-01-01",
            end_date: "2020-12-31"
        });
        const sums = new Map();
        for (const [time, value] of entries) {
            if (!Number.isFinite(value)) continue;
            const key = time.slice(5);
            const sample = sums.get(key) ?? { sum: 0, count: 0 };
            sample.sum += value;
            sample.count++;
            sums.set(key, sample);
        }
        const values = Object.fromEntries([...sums]
            .filter(([, sample]) => sample.count === 30)
            .map(([key, sample]) => [key, sample.sum / sample.count]));
        if (Object.keys(values).length === 365 * 24) {
            try {
                localStorage.setItem(normalCacheKey, JSON.stringify({ key, values }));
            } catch {
                // The calculation still works without a cache.
            }
        }
        return values;
    }

    async function estimate(coords, comparison, count, start, end, shiftDate) {
        const past = new Map(await hourly("previous-runs-api", "forecast", coords, {
            models: model,
            hourly: "temperature_2m_previous_day1",
            start_date: comparison.first,
            end_date: comparison.today
        }));
        const offsets = corrections(comparison, past, count, shiftDate);
        const missing = hours.filter((_, index) => offsets[index] === null);
        if (missing.length) {
            return { days: [], message: `補正に使える実測と予報の組がありません（${missing.map(hour => hour + "時").join("、")}）。` };
        }

        const forecast = new Map(await hourly("api", "forecast", coords, {
            models: model,
            hourly: "temperature_2m",
            forecast_days: 11
        }));
        const forecastDates = [...new Set([...forecast.keys()].map((time) => time.slice(0, 10)))];
        const lastForecast = forecastDates.reverse().find((date) =>
            hours.every((hour) => Number.isFinite(forecast.get(`${date}T${hour}:00`))));
        if (!lastForecast) return { days: [], message: "利用できる外気の予報がありません。" };

        const days = [];
        let baseline;
        for (let date = start; date <= end; date = shiftDate(date, 1)) {
            const source = date <= lastForecast ? "forecast" : "normal";
            if (source === "normal" && !baseline) {
                try {
                    baseline = await normals(coords);
                } catch {
                    return { days, message: "平年相当値を取得できなかったため、予報が取れた日まで表示しています。" };
                }
            }
            const temperatures = hours.map((hour, index) => {
                const time = `T${hour}:00`;
                if (source === "forecast") {
                    const value = forecast.get(date + time);
                    return Number.isFinite(value) ? value + offsets[index] : null;
                }
                const monthDay = date.slice(5);
                if (monthDay === "02-29") {
                    const before = baseline["02-28" + time];
                    const after = baseline["03-01" + time];
                    return Number.isFinite(before) && Number.isFinite(after) ? (before + after) / 2 + offsets[index] : null;
                }
                const value = baseline[monthDay + time];
                return Number.isFinite(value) ? value + offsets[index] : null;
            });
            if (temperatures.includes(null)) {
                return { days, message: `${date}は外気の時間別データが不足しているため、点線を延ばせません。` };
            }
            days.push({ date, source, average: temperatures.reduce((sum, value) => sum + value, 0) / 24 });
        }
        return { days, message: "" };
    }

    return { estimate };
})();
