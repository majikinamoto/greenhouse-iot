<?php
declare(strict_types=1);

// P41と同じ区間転倒数の集計を再利用する。係数・集計値の単位はmL。
define('RAINFALL_API_TEST_MODE', true);
define('DRAINAGE_API_MODE', true);
require_once __DIR__ . '/get_rainfall_data.php';
$_GET['mode'] = 'tip';
runRainfallApi();
