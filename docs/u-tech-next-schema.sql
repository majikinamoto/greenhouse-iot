-- REVIEW ONLY: Codex does not execute this SQL.
-- The user must confirm database name, existing tables, engine and privileges.
-- Execute once in the existing greenhouse database. No existing tables are altered.
-- Do not use IF NOT EXISTS to silently accept an incompatible existing schema.

CREATE TABLE locations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    elevation DOUBLE NULL COMMENT 'Verified site elevation m; unknown is NULL',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Tokyo',
    address VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE forecasts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    location_id INT UNSIGNED NOT NULL,
    forecast_date DATE NOT NULL COMMENT 'Selected forecast day JST; includes next midnight boundary',
    forecast_for DATETIME NOT NULL COMMENT 'Original API valid time JST',
    fetched_at DATETIME NOT NULL COMMENT 'Successful API response reception JST',
    model VARCHAR(32) NOT NULL COMMENT 'v1 jma_msm',
    temperature_2m DOUBLE NULL COMMENT 'JMA via Open-Meteo degC',
    relative_humidity_2m DOUBLE NULL COMMENT 'JMA via Open-Meteo percent',
    dew_point_2m DOUBLE NULL COMMENT 'Open-Meteo derived degC',
    vpd DOUBLE NULL COMMENT 'Open-Meteo vapour_pressure_deficit kPa',
    shortwave_radiation DOUBLE NULL COMMENT 'JMA via Open-Meteo preceding-hour mean W/m2',
    direct_radiation DOUBLE NULL COMMENT 'Open-Meteo derived preceding-hour mean W/m2',
    diffuse_radiation DOUBLE NULL COMMENT 'Open-Meteo derived preceding-hour mean W/m2',
    et0 DOUBLE NULL COMMENT 'Open-Meteo et0_fao_evapotranspiration preceding-hour sum mm',
    wind_speed_10m DOUBLE NULL COMMENT 'Open-Meteo derived from JMA wind components m/s',
    wind_direction_10m DOUBLE NULL COMMENT 'Open-Meteo derived from JMA wind components degree',
    precipitation DOUBLE NULL COMMENT 'JMA via Open-Meteo preceding-hour sum mm',
    cloud_cover DOUBLE NULL COMMENT 'JMA via Open-Meteo percent',
    cloud_cover_low DOUBLE NULL COMMENT 'JMA via Open-Meteo percent',
    cloud_cover_mid DOUBLE NULL COMMENT 'JMA via Open-Meteo percent',
    cloud_cover_high DOUBLE NULL COMMENT 'JMA via Open-Meteo percent',
    pressure_msl DOUBLE NULL COMMENT 'JMA via Open-Meteo hPa',
    surface_pressure DOUBLE NULL COMMENT 'Open-Meteo derived hPa',
    sunshine_duration DOUBLE NULL COMMENT 'Open-Meteo derived preceding-hour sum seconds',
    weather_code SMALLINT UNSIGNED NULL COMMENT 'Open-Meteo derived WMO code',
    PRIMARY KEY (id),
    UNIQUE KEY uq_forecast_day_hour (location_id, model, forecast_date, forecast_for),
    CONSTRAINT fk_next_forecasts_location FOREIGN KEY (location_id) REFERENCES locations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO locations (name, latitude, longitude, elevation, timezone, address)
VALUES ('沖縄県農業研究センター', 26.110374, 127.686838, NULL, 'Asia/Tokyo', '沖縄県糸満市真壁820番地');
