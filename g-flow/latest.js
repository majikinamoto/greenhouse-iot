'use strict';

// Keep the two sensors' timestamps separate; never fill a missing value from an older row.
function latestPointRow(rows, point) {
    return rows.filter(row => row.point_id === point && Number.isFinite(stamp(row.recorded_at)))
        .reduce((latest, row) => !latest || stamp(row.recorded_at) > stamp(latest.recorded_at) ? row : latest, null);
}

function renderLatestCards(rows = [], message = '', now = Date.now()) {
    const container = $('latest-cards');
    container.replaceChildren();
    points.forEach((windPoint, index) => {
        const temperaturePoint = temperaturePoints[index];
        const temperature = latestPointRow(rows, temperaturePoint);
        const wind = latestPointRow(rows, windPoint);
        const card = document.createElement('article');
        card.className = 'latest-card';
        const heading = document.createElement('h3');
        heading.textContent = `No.${index + 1}`;
        const sensors = document.createElement('span');
        sensors.className = 'latest-sensors';
        sensors.textContent = `${temperaturePoint} / ${windPoint}`;
        heading.append(sensors);
        const metrics = document.createElement('dl');
        metrics.className = 'latest-metrics';
        for (const [row, key, label, unit, digits, color] of [
            [temperature, 'temperature', '温度', '℃', 1, 'temperature'],
            [temperature, 'humidity', '湿度', '%', 1, 'humidity'],
            [wind, 'wind_speed_avg', '10分平均風速', 'm/s', 2, 'wind-avg'],
            [wind, 'wind_speed_max', '10分最大風速', 'm/s', 2, 'wind-max'],
        ]) {
            const metric = document.createElement('div');
            metric.className = `latest-metric latest-${color}`;
            const term = document.createElement('dt');
            term.textContent = label;
            const value = document.createElement('dd');
            value.textContent = numeric(row?.[key])?.toFixed(digits) ?? '—';
            const suffix = document.createElement('span');
            suffix.className = 'latest-unit';
            suffix.textContent = unit;
            value.append(suffix);
            metric.append(term, value);
            metrics.append(metric);
        }
        const times = document.createElement('div');
        times.className = 'latest-times';
        for (const [label, row] of [['温湿度', temperature], ['風速', wind]]) {
            const line = document.createElement('p');
            line.textContent = `${label}　`;
            if (row) {
                const time = document.createElement('time');
                time.dateTime = row.recorded_at.replace(' ', 'T') + '+09:00';
                time.textContent = `${row.recorded_at.slice(5, 16).replaceAll('-', '/')} JST`;
                line.append(time);
                if (now - stamp(row.recorded_at) > 20 * 60000) {
                    const warning = document.createElement('span');
                    warning.className = 'latest-stale';
                    warning.textContent = '更新が遅れています';
                    line.append(warning);
                }
            } else {
                line.append('データなし');
            }
            times.append(line);
        }
        card.append(heading, metrics);
        if (message) {
            const note = document.createElement('p');
            note.className = 'latest-message';
            note.textContent = message;
            card.append(note);
        } else {
            card.append(times);
        }
        container.append(card);
    });
}
