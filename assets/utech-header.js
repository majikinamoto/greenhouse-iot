// U-Tech-only clock, sun information, farm calendar, tides and weather forecasts.
// Load after utech-shared.js; Plus uses only the shared date/region/sun calculations.
let tideCalendarText = "満潮・干潮：読み込み中...";

function formatDurationMinutes(totalMinutes){
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours + "時間" + minutes + "分";
}

function formatTideTimes(items){
    if(!Array.isArray(items) || !items.length) return "-";
    return items.map(item=>item && item.time ? item.time : "").filter(Boolean).join(" / ") || "-";
}

async function loadTideCalendarInfo(){
    const area = getSelectedUtechArea();
    try{
        const url = "get_tide_calendar.php?station=" + encodeURIComponent(area.tideStation || "NH");
        const res = await fetch(url, { cache:"no-store" });
        const result = await res.json();

        if(!res.ok || !result.success){
            throw new Error(result.error || "潮汐情報を取得できません");
        }

        tideCalendarText = area.label + " 満潮：" + formatTideTimes(result.high_tides) +
            "　干潮：" + formatTideTimes(result.low_tides);

    }catch(e){
        tideCalendarText = area.label + " 満潮：-　干潮：-";
    }

    updateHeaderTimeInfo();
}

function parseLunarNumber(value){
    const text = String(value || "")
        .replace(/[年月日\s]/g, "")
        .replace(/初/g, "")
        .replace(/[闰閏]/g, "");
    const numeric = Number(text);
    if(!isNaN(numeric) && numeric > 0) return numeric;

    const map = {
        "〇":0, "零":0, "正":1,
        "一":1, "二":2, "三":3, "四":4, "五":5,
        "六":6, "七":7, "八":8, "九":9,
        "冬":11, "腊":12, "臘":12
    };
    if(map[text] !== undefined) return map[text];
    if(text === "十") return 10;
    if(text === "廿") return 20;
    if(text === "卅") return 30;

    let total = 0;
    let current = 0;
    for(const char of text){
        if(char === "十"){
            total += current || 1;
            total *= 10;
            current = 0;
        }else if(char === "廿"){
            total += 20;
        }else if(char === "卅"){
            total += 30;
        }else if(map[char] !== undefined){
            current = map[char];
        }
    }
    return total + current;
}

function getIntlLunarDate(date){
    try{
        const formatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
            timeZone:"Asia/Tokyo",
            month:"long",
            day:"numeric"
        });
        const parts = formatter.formatToParts(date);
        const monthPart = parts.find(part=>part.type === "month");
        const dayPart = parts.find(part=>part.type === "day");
        if(!monthPart || !dayPart) return null;

        const month = parseLunarNumber(monthPart.value);
        const day = parseLunarNumber(dayPart.value);
        if(!month || !day) return null;

        return {
            month:month,
            day:day,
            isLeap:/[闰閏]|leap/i.test(monthPart.value)
        };
    }catch(e){
        return null;
    }
}

function calculateApproximateLunarDate(date){
    const synodicMonth = 29.530588853;
    const baseNewMoon = Date.UTC(2000, 0, 6, 18, 14);
    const jstDate = getJapanDateParts(date);
    const currentNoon = Date.UTC(jstDate.year, jstDate.month - 1, jstDate.day, 3, 0);
    const daysSinceBase = (currentNoon - baseNewMoon) / (24*60*60*1000);
    const lunation = Math.floor(daysSinceBase / synodicMonth);
    const age = ((daysSinceBase % synodicMonth) + synodicMonth) % synodicMonth;

    return {
        month:((lunation + 1) % 12) + 1,
        day:Math.floor(age) + 1,
        isLeap:false
    };
}

function calculateLunarDate(date){
    // Intl中国暦が使えない環境では簡易計算に戻すため、旧暦日付が多少ずれる場合があります。
    return getIntlLunarDate(date) || calculateApproximateLunarDate(date);
}

function calculateMoonInfo(date){
    const synodicMonth = 29.530588853;
    const baseNewMoon = Date.UTC(2000, 0, 6, 18, 14);
    const lunarDate = calculateLunarDate(date);
    const jstDate = getJapanDateParts(date);
    const currentNoon = Date.UTC(jstDate.year, jstDate.month - 1, jstDate.day, 3, 0);
    const daysSinceBase = (currentNoon - baseNewMoon) / (24*60*60*1000);
    const age = ((daysSinceBase % synodicMonth) + synodicMonth) % synodicMonth;

    let moonMark = "🌑";
    let phase = "新月";
    if(age < 1){
        moonMark = "🌑";
        phase = "新月";
    }else if(age < 6){
        moonMark = "🌒";
        phase = "三日月";
    }else if(age < 9){
        moonMark = "🌓";
        phase = "上弦";
    }else if(age < 14){
        moonMark = "🌔";
        phase = "満月に向かう月";
    }else if(age < 16){
        moonMark = "🌕";
        phase = "満月";
    }else if(age < 21){
        moonMark = "🌖";
        phase = "満月の後／下弦に向かう月";
    }else if(age < 24){
        moonMark = "🌗";
        phase = "下弦";
    }else{
        moonMark = "🌘";
        phase = "新月に向かう月";
    }

    let tideName = "中潮";
    if(age < 1.5 || (age >= 14 && age < 16.5) || age >= 29){
        tideName = "大潮";
    }else if((age >= 6 && age < 9) || (age >= 21 && age < 24)){
        tideName = "小潮";
    }else if((age >= 9 && age < 10) || (age >= 24 && age < 25)){
        tideName = "長潮";
    }else if((age >= 10 && age < 12) || (age >= 25 && age < 27)){
        tideName = "若潮";
    }

    return {
        lunarMonth:lunarDate.month,
        lunarDay:lunarDate.day,
        lunarLeap:lunarDate.isLeap,
        age:age,
        moonMark:moonMark,
        phase:phase,
        tideName:tideName
    };
}

function getMoonProgressPositionStyle(progress){
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const progressPercent = (clampedProgress * 100).toFixed(3);
    const edgeOffset = (clampedProgress * 32).toFixed(3);
    return "calc(16px + " + progressPercent + "% - " + edgeOffset + "px)";
}

function getMoonProgressLeftStyle(age){
    const synodicMonth = 29.530588853;
    const progress = age / synodicMonth;
    return getMoonProgressPositionStyle(progress);
}

function updateFarmCalendarInfo(now){
    const container = document.getElementById("farmCalendarInfo");
    if(!container) return;

    const moon = calculateMoonInfo(now);
    const moonPosition = getMoonProgressLeftStyle(moon.age);
    container.innerHTML =
        '<div class="farm-calendar-summary">' +
            '<span class="farm-calendar-title">農作業こよみ</span>' +
            '<span>' + moon.moonMark + ' 月齢：' + moon.age.toFixed(1) + '</span>' +
            '<span>月相：' + moon.phase + '</span>' +
            '<span style="font-weight:bold">旧暦：' + (moon.lunarLeap ? '閏' : '') + moon.lunarMonth + '月' + moon.lunarDay + '日</span>' +
            '<span>潮：' + moon.tideName + '　' + tideCalendarText + '</span>' +
        '</div>' +
        '<div class="moon-progress">' +
            '<div>月の満ち欠け：</div>' +
            '<div class="moon-progress-track">' +
                '<span style="left:' + getMoonProgressPositionStyle(0) + '">🌑</span>' +
                '<span style="left:' + getMoonProgressPositionStyle(0.25) + '">🌓</span>' +
                '<span style="left:' + getMoonProgressPositionStyle(0.5) + '">🌕</span>' +
                '<span style="left:' + getMoonProgressPositionStyle(0.75) + '">🌗</span>' +
                '<span style="left:' + getMoonProgressPositionStyle(1) + '">🌑</span>' +
                '<div class="moon-progress-today" style="left:' + moonPosition + '">▲<br>今日</div>' +
            '</div>' +
        '</div>';
}

function updateHeaderTimeInfo(){
    const timeContainer = document.getElementById("headerTimeInfo");
    const sunContainer = document.getElementById("headerSunInfo");
    const farmContainer = document.getElementById("farmCalendarInfo");
    if(!timeContainer && !sunContainer && !farmContainer) return;

    const now = new Date();
    const area = getSelectedUtechArea();
    updateFarmCalendarInfo(now);
    const parts = getJapanDateParts(now);
    const currentText =
        parts.year + "年" +
        parts.month + "月" +
        parts.day + "日 " +
        String(parts.hour).padStart(2, "0") + ":" +
        String(parts.minute).padStart(2, "0");
    const sunrise = calculateSunTime(parts.year, parts.month, parts.day, true, area);
    const sunset = calculateSunTime(parts.year, parts.month, parts.day, false, area);

    if(timeContainer){
        timeContainer.innerText = "現在日時：" + currentText;
    }

    if(!sunContainer) return;

    const sunriseMinutes = timeTextToMinutes(sunrise);
    const sunsetMinutes = timeTextToMinutes(sunset);
    if(sunriseMinutes === null || sunsetMinutes === null || sunsetMinutes <= sunriseMinutes){
        sunContainer.innerHTML = "<span>日の出・日の入り：取得できません</span>";
        return;
    }

    const dayMinutes = sunsetMinutes - sunriseMinutes;
    const nightMinutes = 24*60 - dayMinutes;

    sunContainer.innerHTML =
        "<span>" + escapeHtml(area.label) + " 日の出：" + sunrise + "</span>" +
        "<span>日の入り：" + sunset + "</span>" +
        "<span>昼：" + formatDurationMinutes(dayMinutes) + "</span>" +
        "<span>夜：" + formatDurationMinutes(nightMinutes) + "</span>";
}

function getJapanDateKey(date){
    const parts = getJapanDateParts(date);
    return parts.year + "-" +
        String(parts.month).padStart(2, "0") + "-" +
        String(parts.day).padStart(2, "0");
}

function findJmaArea(areas, names){
    if(!Array.isArray(areas)) return null;
    return areas.find(item=>{
        const name = item && item.area && item.area.name;
        return names.includes(name);
    }) || null;
}

function getJmaValuesForDate(timeSeries, area, field, dateKey){
    if(!timeSeries || !area || !Array.isArray(timeSeries.timeDefines) || !Array.isArray(area[field])){
        return [];
    }
    return timeSeries.timeDefines.reduce((values, timeText, index)=>{
        if(typeof timeText === "string" && timeText.slice(0, 10) === dateKey && area[field][index] !== undefined){
            values.push(area[field][index]);
        }
        return values;
    }, []);
}

function toNumberList(values){
    if(!Array.isArray(values)) return [];
    return values.map(value=>{
        const normalized = String(value == null ? "" : value).replace(/[０-９．]/g, char=>{
            return "０１２３４５６７８９．".indexOf(char) === 10 ? "." : String("０１２３４５６７８９．".indexOf(char));
        });
        const match = normalized.match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : NaN;
    }).filter(value=>Number.isFinite(value));
}

function getAllJmaTimeSeries(payload){
    if(!Array.isArray(payload)) return [];
    return payload.reduce((series, item)=>{
        if(item && Array.isArray(item.timeSeries)){
            return series.concat(item.timeSeries);
        }
        return series;
    }, []);
}

function getJmaTempSource(payload, areaConfig){
    const pointNames = [areaConfig.jmaTempAreaName, areaConfig.label, areaConfig.jmaAreaName].filter(Boolean);
    const primarySeries = Array.isArray(payload) && payload[0] && Array.isArray(payload[0].timeSeries)
        ? payload[0].timeSeries
        : getAllJmaTimeSeries(payload);

    for(const tempTimeSeries of primarySeries){
        const selectedTempArea = findJmaArea(tempTimeSeries.areas, pointNames);
        if(selectedTempArea && Array.isArray(selectedTempArea.temps)){
            return { tempTimeSeries, selectedTempArea };
        }
    }

    return { tempTimeSeries:null, selectedTempArea:null };
}

function getJmaForecastHour(timeText){
    const match = String(timeText || "").match(/T(\d{2}):/);
    return match ? Number(match[1]) : null;
}

function buildJmaTempItems(tempTimeSeries, selectedTempArea){
    if(!tempTimeSeries || !selectedTempArea || !Array.isArray(tempTimeSeries.timeDefines) || !Array.isArray(selectedTempArea.temps)){
        return [];
    }

    return tempTimeSeries.timeDefines.map((time, index)=>{
        const values = toNumberList([selectedTempArea.temps[index]]);
        return {
            time,
            date:typeof time === "string" ? time.slice(0, 10) : "",
            hour:getJmaForecastHour(time),
            temp:values.length ? values[0] : null,
            index
        };
    });
}

function getJmaTempsForDate(tempItems, dateKey){
    const dayItems = tempItems.filter(item=>item.date === dateKey && Number.isFinite(item.temp));
    const maxItem = dayItems.find(item=>item.hour === 9);
    const minItem = dayItems.find(item=>item.hour === 0 && (!maxItem || item.index < maxItem.index));

    return {
        maxTemp:maxItem ? maxItem.temp : null,
        minTemp:minItem ? minItem.temp : null
    };
}

function applyJmaTemperatureForecast(forecast, temps){
    forecast.maxTemp = temps && Number.isFinite(temps.maxTemp) ? temps.maxTemp : null;
    forecast.minTemp = temps && Number.isFinite(temps.minTemp) ? temps.minTemp : null;
}

function extractRepresentativeWindDirection(windText){
    if(!windText) return "";
    const directions = ["北北東","東北東","東南東","南南東","南南西","西南西","西北西","北北西","北東","南東","南西","北西","北","東","南","西"];
    const text = String(windText);
    return directions.find(direction=>text.includes(direction + "の風") || text.includes(direction)) || text;
}

function parseForecastForDate(payload, areaConfig, dateKey){
    const seriesList = getAllJmaTimeSeries(payload);
    const areaNames = [areaConfig.jmaAreaName, areaConfig.label].filter(Boolean);
    const pointNames = [areaConfig.jmaTempAreaName, areaConfig.label, areaConfig.jmaAreaName].filter(Boolean);
    const result = {
        maxTemp:null,
        minTemp:null,
        pop:null,
        weather:"",
        windDirection:"",
        windSpeedMin:null,
        windSpeedMax:null
    };

    seriesList.forEach(series=>{
        const forecastArea = findJmaArea(series.areas, areaNames);
        if(forecastArea){
            const pops = toNumberList(getJmaValuesForDate(series, forecastArea, "pops", dateKey));
            if(pops.length){
                result.pop = result.pop === null ? Math.max(...pops) : Math.max(result.pop, ...pops);
            }

            const weathers = getJmaValuesForDate(series, forecastArea, "weathers", dateKey).filter(Boolean);
            if(!result.weather && weathers.length){
                result.weather = String(weathers[0]).split(/\s|　/).filter(Boolean).slice(0, 3).join(" ");
            }

            const winds = getJmaValuesForDate(series, forecastArea, "winds", dateKey).filter(Boolean);
            if(!result.windDirection && winds.length){
                result.windDirection = extractRepresentativeWindDirection(winds[0]);
            }

            try{
                const speedFields = ["windSpeeds","windSpeed","wind_speed","windSpeedsMps","windSpeedMps","wind_speed_mps","windVelocities","windVelocity"];
                speedFields.forEach(field=>{
                    const speeds = toNumberList(getJmaValuesForDate(series, forecastArea, field, dateKey));
                    if(speeds.length){
                        const min = Math.min(...speeds);
                        const max = Math.max(...speeds);
                        result.windSpeedMin = result.windSpeedMin === null ? min : Math.min(result.windSpeedMin, min);
                        result.windSpeedMax = result.windSpeedMax === null ? max : Math.max(result.windSpeedMax, max);
                    }
                });
            }catch(e){
                console.warn(e);
            }
        }

    });

    return result;
}

function isForecastValueMissing(value){
    return value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value));
}

function formatForecastValue(value, unit){
    return isForecastValueMissing(value) ? "-" : Math.round(value) + unit;
}

function formatOpenMeteoWindSpeed(speed){
    return Number.isFinite(speed) ? speed.toFixed(1) + " m/s" : "";
}

function getWindDirectionName(degrees){
    if(!Number.isFinite(degrees)) return "";
    const directions = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];
    const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % directions.length;
    return directions[index];
}

async function fetchOpenMeteoForecast(areaConfig, dateKey){
    if(!areaConfig || !Number.isFinite(areaConfig.lat) || !Number.isFinite(areaConfig.lon)) return null;

    const params = new URLSearchParams({
        latitude:areaConfig.lat,
        longitude:areaConfig.lon,
        daily:"shortwave_radiation_sum,wind_speed_10m_max,wind_direction_10m_dominant",
        wind_speed_unit:"ms",
        timezone:"Asia/Tokyo"
    });
    const res = await fetch("https://api.open-meteo.com/v1/forecast?" + params.toString(), { cache:"no-store" });
    if(!res.ok) throw new Error("Open-Meteo forecast fetch failed: " + res.status);

    const payload = await res.json();
    const daily = payload && payload.daily;
    const targetDateKey = dateKey || getJapanDateKey(new Date(Date.now() + 24*60*60*1000));
    const dateIndex = daily && Array.isArray(daily.time) ? daily.time.indexOf(targetDateKey) : -1;
    const value = dateIndex >= 0 && Array.isArray(daily.shortwave_radiation_sum)
        ? Number(daily.shortwave_radiation_sum[dateIndex])
        : NaN;
    const windSpeed = dateIndex >= 0 && Array.isArray(daily.wind_speed_10m_max)
        ? Number(daily.wind_speed_10m_max[dateIndex])
        : NaN;
    const windDirectionDegrees = dateIndex >= 0 && Array.isArray(daily.wind_direction_10m_dominant)
        ? Number(daily.wind_direction_10m_dominant[dateIndex])
        : NaN;

    const result = {
        solarRadiationSum:null,
        windDirection:getWindDirectionName(windDirectionDegrees),
        windSpeed:Number.isFinite(windSpeed) ? windSpeed : null
    };
    if(!Number.isFinite(value)) return result;

    const unit = payload.daily_units && payload.daily_units.shortwave_radiation_sum;
    if(unit === "MJ/m²" || unit === "MJ/m2" || unit === "MJ/m^2") result.solarRadiationSum = value;
    else if(unit === "kWh/m²") result.solarRadiationSum = value * 3.6;
    else if(unit === "Wh/m²") result.solarRadiationSum = value * 0.0036;
    else if(unit === "J/m²") result.solarRadiationSum = value / 1000000;
    else if(unit === "J/cm²") result.solarRadiationSum = value * 0.01;
    return result;
}

function renderForecastBlock(title, forecast){
    const openMeteoWindSpeed = formatOpenMeteoWindSpeed(forecast.openMeteoWindSpeed);
    const windText = forecast.openMeteoWindDirection || openMeteoWindSpeed
        ? (forecast.openMeteoWindDirection || "-") + (openMeteoWindSpeed ? " " + openMeteoWindSpeed : "")
        : "-";
    const solarRadiationText = Number.isFinite(forecast.solarRadiationSum)
        ? forecast.solarRadiationSum.toFixed(1)
        : "--";

    return '<div class="forecast-day">' +
        '<span class="tomorrow-forecast-title">' + escapeHtml(title) + '</span>' +
        '<span class="forecast-item"><span class="forecast-label">最高</span><span class="forecast-value">' + formatForecastValue(forecast.maxTemp, "℃") + '</span></span>' +
        '<span class="forecast-item"><span class="forecast-label">最低</span><span class="forecast-value">' + formatForecastValue(forecast.minTemp, "℃") + '</span></span>' +
        '<span class="forecast-item"><span class="forecast-label">降水確率</span><span class="forecast-value">' + formatForecastValue(forecast.pop, "%") + '</span></span>' +
        '<span class="forecast-item"><span class="forecast-label">予想積算日射</span><span class="forecast-value">' + solarRadiationText + ' MJ/m²</span></span>' +
        '<span class="forecast-item"><span class="forecast-label">風</span><span class="forecast-value">' + escapeHtml(windText) + '</span></span>' +
        '</div>';
}

function renderTomorrowForecast(todayForecast, tomorrowForecast, areaConfig){
    const container = document.getElementById("tomorrowForecastInfo");
    if(!container) return;

    container.innerHTML =
        renderForecastBlock("今日の予報", todayForecast) +
        renderForecastBlock("明日の予報", tomorrowForecast);
}

async function loadTomorrowForecast(){
    const container = document.getElementById("tomorrowForecastInfo");
    if(!container) return;

    const areaConfig = getSelectedUtechArea();
    container.innerHTML = "<span>予報取得中</span>";

    try{
        const res = await fetch("https://www.jma.go.jp/bosai/forecast/data/forecast/" + areaConfig.jmaOfficeCode + ".json", { cache:"no-store" });
        if(!res.ok) throw new Error("JMA forecast fetch failed: " + res.status);

        const jmaForecast = await res.json();
        console.log("JMA forecast raw", jmaForecast);
        const todayDateKey = getJapanDateKey(new Date());
        const tomorrowDateKey = getJapanDateKey(new Date(Date.now() + 24*60*60*1000));
        const todayForecast = parseForecastForDate(jmaForecast, areaConfig, todayDateKey);
        const tomorrowForecast = parseForecastForDate(jmaForecast, areaConfig, tomorrowDateKey);
        const { tempTimeSeries, selectedTempArea } = getJmaTempSource(jmaForecast, areaConfig);
        const tempItems = buildJmaTempItems(tempTimeSeries, selectedTempArea);
        const todayTempsJma = getJmaTempsForDate(tempItems, todayDateKey);
        const tomorrowTempsJma = getJmaTempsForDate(tempItems, tomorrowDateKey);
        const todayMaxJma = todayTempsJma.maxTemp;
        const todayMinJma = todayTempsJma.minTemp;
        const tomorrowMaxJma = tomorrowTempsJma.maxTemp;
        const tomorrowMinJma = tomorrowTempsJma.minTemp;

        console.log("JMA temp timeSeries", tempTimeSeries);
        console.log("JMA temp timeDefines", tempTimeSeries?.timeDefines);
        console.log("JMA temp areas", tempTimeSeries?.areas);
        console.log("selected temp area", selectedTempArea);
        console.log("selected temps", selectedTempArea?.temps);
        console.log("parsed temp items", tempItems);
        console.log("today forecast temps from JMA", todayMaxJma, todayMinJma);
        console.log("tomorrow forecast temps from JMA", tomorrowMaxJma, tomorrowMinJma);

        applyJmaTemperatureForecast(todayForecast, todayTempsJma);
        applyJmaTemperatureForecast(tomorrowForecast, tomorrowTempsJma);
        if(areaConfig !== getSelectedUtechArea()) return;
        renderTomorrowForecast(todayForecast, tomorrowForecast, areaConfig);

        try{
            const openMeteoForecasts = await Promise.all([
                fetchOpenMeteoForecast(areaConfig, todayDateKey),
                fetchOpenMeteoForecast(areaConfig, tomorrowDateKey)
            ]);
            todayForecast.solarRadiationSum = openMeteoForecasts[0] ? openMeteoForecasts[0].solarRadiationSum : null;
            todayForecast.openMeteoWindDirection = openMeteoForecasts[0] ? openMeteoForecasts[0].windDirection : "";
            todayForecast.openMeteoWindSpeed = openMeteoForecasts[0] ? openMeteoForecasts[0].windSpeed : null;
            tomorrowForecast.solarRadiationSum = openMeteoForecasts[1] ? openMeteoForecasts[1].solarRadiationSum : null;
            tomorrowForecast.openMeteoWindDirection = openMeteoForecasts[1] ? openMeteoForecasts[1].windDirection : "";
            tomorrowForecast.openMeteoWindSpeed = openMeteoForecasts[1] ? openMeteoForecasts[1].windSpeed : null;
        }catch(error){
            console.warn(error);
            todayForecast.solarRadiationSum = null;
            todayForecast.openMeteoWindDirection = "";
            todayForecast.openMeteoWindSpeed = null;
            tomorrowForecast.solarRadiationSum = null;
            tomorrowForecast.openMeteoWindDirection = "";
            tomorrowForecast.openMeteoWindSpeed = null;
        }
        if(areaConfig !== getSelectedUtechArea()) return;
        renderTomorrowForecast(todayForecast, tomorrowForecast, areaConfig);
    }catch(error){
        console.warn(error);
        container.innerHTML = "<span>予報を取得できませんでした</span>";
    }
}
