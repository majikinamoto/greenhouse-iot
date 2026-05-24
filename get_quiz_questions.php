<?php

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function send_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $pdo = new PDO(
        'mysql:host=localhost;dbname=utech_quiz;charset=utf8mb4',
        'iot',
        'password123',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    $statement = $pdo->query(
        'SELECT id, question, choice_a, choice_b, choice_c, correct_choice, explanation
         FROM quiz_questions
         WHERE enabled = 1
         ORDER BY RAND()
         LIMIT 10'
    );

    $questions = array_map(
        static function (array $question): array {
            $question['id'] = (int) $question['id'];
            return $question;
        },
        $statement->fetchAll()
    );

    send_json([
        'success' => true,
        'questions' => $questions,
    ]);
} catch (Throwable $e) {
    send_json([
        'success' => false,
        'message' => 'Failed to retrieve quiz questions.',
    ], 500);
}
