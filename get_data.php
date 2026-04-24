<?php

header('Content-Type: application/json');

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {

    $conn = new mysqli("localhost", "gh_user", "majikina.moto", "greenhouse");

    $result = $conn->query("
        SELECT temperature, humidity, recorded_at
        FROM measurements
        ORDER BY recorded_at ASC
    ");

    $data = [];

    while ($row = $result->fetch_assoc()) {
        $data[] = $row;
    }

    echo json_encode($data);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}
