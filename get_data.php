<?php
$conn = new mysqli("localhost","iot","password123","greenhouse");

if ($conn->connect_error) {
    die("DB接続失敗");
}

// user_id 必須にする
if (!isset($_GET['user_id']) || !is_numeric($_GET['user_id'])) {
    die("user_idが必要です");
}

$user_id = intval($_GET['user_id']);

$stmt = $conn->prepare(
    "SELECT * FROM measurements 
WHERE user_id = ? AND point_id = ?
     ORDER BY recorded_at DESC 
     LIMIT 1000"
);

$stmt->bind_param("i",$user_id);
$stmt->execute();

$result = $stmt->get_result();

$data = [];
while($row = $result->fetch_assoc()){
    $data[] = $row;
}

// 時系列を昇順にする
echo json_encode(array_reverse($data)); 

$stmt->close();
$conn->close();
?>