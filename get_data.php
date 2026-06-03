<?php

$conn = new mysqli("localhost", "iot", "password123", "greenhouse");

if ($conn->connect_error) {
    die("接続失敗");
}

// ★GETで受け取る
$user_id = $_GET['user_id'] ?? '';
$point_id = $_GET['point_id'] ?? '';
$start = $_GET['start'] ?? '';
$end = $_GET['end'] ?? '';

if (!$user_id || !$point_id) {
    die("user_id または point_id が必要です");
}

// SQL
if ($start !== '' && $end !== '') {
    $sql = "SELECT * FROM measurements 
            WHERE user_id = ? AND point_id = ?
              AND recorded_at >= ? AND recorded_at <= ?
            ORDER BY recorded_at ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ssss", $user_id, $point_id, $start, $end);
} else {
    $sql = "SELECT * FROM measurements 
            WHERE user_id = ? AND point_id = ?
              AND recorded_at >= DATE_SUB(NOW(), INTERVAL 72 HOUR)
            ORDER BY recorded_at ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ss", $user_id, $point_id);
}
$stmt->execute();

$result = $stmt->get_result();

$data = [];
while($row = $result->fetch_assoc()){
    $data[] = $row;
}

header('Content-Type: application/json');
echo json_encode($data);

$stmt->close();
$conn->close();
