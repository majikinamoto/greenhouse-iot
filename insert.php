echo "PHP OK";
exit;


<?php
// 1. JSONの受信と解析
$json = file_get_contents('php://input');
$data = json_decode($json, true);

file_put_contents("debug.log", file_get_contents("php://input") . "\n", FILE_APPEND);

// 【デバッグ用】もし動かない場合、サーバー上に log.txt を作って中身を確認できます
// file_put_contents("log.txt", "Received: " . $json . "\n", FILE_APPEND);

if (!$data) {
    die("JSONデータが空、または解析できません");
}

// 2. データの抽出（スケッチから送られないものは 0 などを入れると安全）
$user_id    = isset($data["user_id"]) ? $data["user_id"] : null;
$point_id   = isset($data["point_id"]) ? $data["point_id"] : "default";
$temperature= isset($data["temperature"]) ? floatval($data["temperature"]) : 0.0;
$humidity   = isset($data["humidity"]) ? floatval($data["humidity"]) : 0.0;
$co2        = isset($data["co2"]) ? floatval($data["co2"]) : 0.0;
$solar_radiation = isset($data["solar_radiation"]) ? floatval($data["solar_radiation"]) : 0.0;
$voltage    = isset($data["voltage"]) ? floatval($data["voltage"]) : 0.0;

if (!$user_id) {
    die("user_idが必要です");
}

// 3. SQLの実行
$sql = "INSERT INTO measurements (user_id, point_id, temperature, humidity, CO2, solar_radiation, voltage) VALUES (?, ?, ?, ?, ?, ?, ?)";
$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("SQLエラー: " . $conn->error);
}

// 型指定: s(string), d(double/float)
$stmt->bind_param("ssddddd", 
    $user_id, 
    $point_id, 
    $temperature, 
    $humidity, 
    $co2, 
    $solar_radiation, 
    $voltage
);

if ($stmt->execute()) {
    echo "保存成功";
} else {
    echo "実行エラー: " . $stmt->error;
}

$stmt->close();
?>