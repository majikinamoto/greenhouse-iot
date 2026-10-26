<?php
declare(strict_types=1);

// Explicit maintenance command; never run from the web or the scheduler.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
if ($argv !== [$argv[0], '--apply']) {
    fwrite(STDERR, "Usage: php scripts/migrate-alert-schema.php --apply\nRun diagnostics and back up the database first.\n");
    exit(2);
}
try {
    require dirname(__DIR__) . '/db_config.php';
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $db = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_GREENHOUSE);
    $db->set_charset('utf8mb4');
    $schema = file_get_contents(dirname(__DIR__) . '/alert_settings.sql');
    // Only create missing tables; do not run the legacy enum modification.
    foreach (explode(';', $schema) as $statement) {
        if (preg_match('/^\s*CREATE TABLE IF NOT EXISTS /', $statement)) $db->query($statement);
    }
    $columns = array_column($db->query('SHOW COLUMNS FROM alert_settings')->fetch_all(MYSQLI_ASSOC), 'Field');
    foreach ([
        'setting_updated_at' => 'DATETIME DEFAULT NULL',
        'sensor_type' => "VARCHAR(32) NOT NULL DEFAULT 'temperature'",
        'cooldown_minutes' => 'INT NOT NULL DEFAULT 180',
        'last_status' => "ENUM('normal','alert') NOT NULL DEFAULT 'normal'",
    ] as $name => $definition) {
        if (!in_array($name, $columns, true)) {
            $db->query('ALTER TABLE alert_settings ADD COLUMN `' . $name . '` ' . $definition);
            echo 'Added alert_settings.' . $name . PHP_EOL;
        }
    }
    $db->close();
    echo "Schema update complete. Run: php check_alerts.php --diagnose\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'Schema update failed (code ' . $error->getCode() . "). Some DDL may already be applied; rerun after resolving the cause.\n");
    exit(1);
}
