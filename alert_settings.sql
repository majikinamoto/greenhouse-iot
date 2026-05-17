CREATE TABLE IF NOT EXISTS alert_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    point_id VARCHAR(50) NOT NULL DEFAULT 'P01',
    temperature_threshold DECIMAL(5,2) NOT NULL,
    condition_type ENUM('above','below') NOT NULL,
    notify_target ENUM('line','discord') NOT NULL,
    webhook_url TEXT NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    last_notified_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_alert_enabled (enabled),
    INDEX idx_alert_user_point (user_id, point_id),
    INDEX idx_alert_last_notified_at (last_notified_at)
);
