$user_id = isset($data["user_id"]) ? $data["user_id"] : null;
$point_id = isset($data["point_id"]) ? $data["point_id"] : "default";

$temperature = isset($data["temperature"]) ? floatval($data["temperature"]) : null;
$humidity = isset($data["humidity"]) ? floatval($data["humidity"]) : null;
$co2 = isset($data["co2"]) ? floatval($data["co2"]) : null;
$solar_radiation = isset($data["solar_radiation"]) ? floatval($data["solar_radiation"]) : null;
$voltage = isset($data["voltage"]) ? floatval($data["voltage"]) : null;

if (!$user_id) {
    die("user_idが必要です");
}

$sql = "INSERT INTO measurements 
(user_id, point_id, temperature, humidity, CO2, solar_radiation, voltage) 
VALUES (?, ?, ?, ?, ?, ?, ?)";

$stmt = $conn->prepare($sql);

if (!$stmt) {
    die("SQLエラー: " . $conn->error);
}

$stmt->bind_param("ssddddd", 
    $user_id, 
    $point_id,
    $temperature, 
    $humidity, 
    $co2, 
    $solar_radiation, 
    $voltage
);