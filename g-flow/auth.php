<?php
declare(strict_types=1);
ini_set('session.use_strict_mode', '1');
session_set_cookie_params(['httponly'=>true,'samesite'=>'Lax','secure'=>(!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),'path'=>str_replace('\\','/',dirname($_SERVER['SCRIPT_NAME'] ?? '/g-flow/')).'/']);
session_start();
header('Cache-Control: no-store');
function flowAuthorized(): bool { return ($_SESSION['g_flow_access'] ?? false) === true; }
