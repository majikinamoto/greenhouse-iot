<?php
declare(strict_types=1);

function alertTemperatureMatches(string $condition, float $temperature, float $threshold): bool
{
    return ($condition === 'above' && $temperature >= $threshold)
        || ($condition === 'below' && $temperature <= $threshold);
}

function alertSmtpData(string $message): string
{
    // Normalize in one pass so replacement CRLF is never processed again.
    $normalized = preg_replace('/\r\n|\r|\n/', "\r\n", $message);
    return preg_replace('/^\./m', '..', $normalized);
}
