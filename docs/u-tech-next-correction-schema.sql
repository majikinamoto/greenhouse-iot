-- Proposal for the existing greenhouse database (MariaDB 10.6).
-- Apply once, before deploying the correction persistence code.
-- These statements add tables only; no existing rows are modified.
-- DATETIME values use Asia/Tokyo, like the existing forecast tables.

CREATE TABLE next_water_correction_settings (
    location_id INT UNSIGNED NOT NULL PRIMARY KEY,
    source_user_id VARCHAR(64) DEFAULT NULL,
    comparison_days TINYINT UNSIGNED NOT NULL DEFAULT 5,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL,
    CONSTRAINT next_wc_settings_days CHECK (comparison_days BETWEEN 1 AND 10),
    CONSTRAINT next_wc_settings_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE next_water_correction_jobs (
    location_id INT UNSIGNED NOT NULL,
    forecast_date DATE NOT NULL,
    forecast_fetched_at DATETIME NOT NULL,
    measurement_cutoff DATETIME NOT NULL,
    context_json JSON NOT NULL,
    status ENUM('pending','retrying','complete') NOT NULL DEFAULT 'pending',
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at DATETIME DEFAULT NULL,
    last_error VARCHAR(255) DEFAULT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (location_id, forecast_date),
    KEY next_wc_jobs_due (status, next_attempt_at),
    CONSTRAINT next_wc_jobs_attempts CHECK (attempts BETWEEN 0 AND 6),
    CONSTRAINT next_wc_jobs_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE next_water_correction_history (
    location_id INT UNSIGNED NOT NULL,
    forecast_date DATE NOT NULL,
    forecast_fetched_at DATETIME NOT NULL,
    measurement_cutoff DATETIME NOT NULL,
    finalized_at DATETIME NOT NULL,
    source_user_id VARCHAR(64) DEFAULT NULL,
    comparison_days TINYINT UNSIGNED NOT NULL,
    acquisition_status ENUM('success','source_unset','measurement_fetch_failed') NOT NULL,
    result_json JSON NOT NULL,
    PRIMARY KEY (location_id, forecast_date),
    CONSTRAINT next_wc_history_days CHECK (comparison_days BETWEEN 1 AND 10),
    CONSTRAINT next_wc_history_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
