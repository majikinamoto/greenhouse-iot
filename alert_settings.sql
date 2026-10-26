CREATE TABLE IF NOT EXISTS alert_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    point_id VARCHAR(50) NOT NULL DEFAULT 'P01',
    sensor_type VARCHAR(32) NOT NULL DEFAULT 'temperature',
    temperature_threshold DECIMAL(5,2) NOT NULL,
    condition_type ENUM('above','below') NOT NULL,
    notify_target ENUM('discord','email','line') NOT NULL,
    webhook_url TEXT NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    last_notified_at DATETIME DEFAULT NULL,
    cooldown_minutes INT NOT NULL DEFAULT 180,
    last_status ENUM('normal','alert') NOT NULL DEFAULT 'normal',
    setting_updated_at DATETIME DEFAULT NULL COMMENT 'Last settings edit in Asia/Tokyo - notifications do not update this',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_alert_enabled (enabled),
    INDEX idx_alert_user_point (user_id, point_id),
    INDEX idx_alert_last_notified_at (last_notified_at)
);

ALTER TABLE alert_settings
    MODIFY notify_target ENUM('discord','email','line') NOT NULL;

CREATE TABLE IF NOT EXISTS alert_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_id INT NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    point_id VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(32) NOT NULL DEFAULT 'temperature',
    alert_type VARCHAR(50) NOT NULL,
    value DECIMAL(10,3) NOT NULL,
    threshold_value DECIMAL(10,3) NOT NULL,
    message TEXT NOT NULL,
    notified_at DATETIME NOT NULL,
    INDEX idx_alert_history_user_time (user_id, notified_at)
);
