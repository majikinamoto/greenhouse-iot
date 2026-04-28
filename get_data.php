<?php
$conn = new mysqli("localhost","iot","password123","greenhouse");

$user_id = $_GET['user_id'] ?? null;

if ($user_id) {
    $stmt = $conn->prepare("SELECT * FROM measurements WHERE user_id=? ORDER BY recorded_at DESC LIMIT 1000");
    $stmt->bind_param("i",$user_id);
} else {
    $stmt = $conn->prepare("SELECT * FROM measurements ORDER BY recorded_at DESC LIMIT 1000");
}

$stmt->execute();
$result = $stmt->get_result();

$data = [];
while($row = $result->fetch_assoc()){
    $data[] = $row;
}

echo json_encode(array_reverse($data));