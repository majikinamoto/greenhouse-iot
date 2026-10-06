-- Apply to the same database as forecasts before deploying the updated fetcher.
CREATE TABLE next_water_settings (
    location_id INT UNSIGNED NOT NULL PRIMARY KEY,
    settings_json JSON NOT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE next_water_history (
    location_id INT UNSIGNED NOT NULL,
    forecast_date DATE NOT NULL,
    fetched_at DATETIME NOT NULL,
    result_json JSON NOT NULL,
    PRIMARY KEY (location_id, forecast_date),
    FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
