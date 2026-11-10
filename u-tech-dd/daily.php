<?php
declare(strict_types=1);

function ddDailyAverages(DateTimeImmutable $start, DateTimeImmutable $end, DateTimeImmutable $today, iterable $rows): array
{
    $days = [];
    for ($day = $start; $day <= $end; $day = $day->modify('+1 day')) {
        $days[$day->format('Y-m-d')] = ['count' => 0, 'sum' => 0.0, 'last' => 0, 'gap' => 0];
    }

    foreach ($rows as $row) {
        $date = substr($row['recorded_at'], 0, 10);
        $time = substr($row['recorded_at'], 11, 8);
        [$hours, $minutes, $seconds] = array_map('intval', explode(':', $time));
        $second = $hours * 3600 + $minutes * 60 + $seconds;
        $daily = &$days[$date];
        $daily['gap'] = max($daily['gap'], $second - $daily['last']);
        $daily['last'] = $second;
        $daily['count']++;
        $daily['sum'] += (float) $row['temperature'];
        unset($daily);
    }

    $todayKey = $today->format('Y-m-d');
    $result = [];
    foreach ($days as $date => $daily) {
        $status = $date === $todayKey ? 'measuring' : 'missing';
        $average = null;
        if ($status === 'missing' && $daily['count'] >= 120 && max($daily['gap'], 86400 - $daily['last']) < 7200) {
            $status = 'valid';
            $average = $daily['sum'] / $daily['count'];
        }
        $result[] = ['date' => $date, 'status' => $status, 'average' => $average];
    }
    return $result;
}

function ddFillMissingDays(array $days, int $limit): array
{
    $index = 0;
    $count = count($days);
    while ($index < $count) {
        if ($days[$index]['status'] !== 'missing') {
            $index++;
            continue;
        }
        $first = $index;
        while ($index < $count && $days[$index]['status'] === 'missing') {
            $index++;
        }
        if ($index - $first > $limit || $first === 0 || $index === $count
            || $days[$first - 1]['status'] !== 'valid' || $days[$index]['status'] !== 'valid') {
            continue;
        }
        $average = ($days[$first - 1]['average'] + $days[$index]['average']) / 2;
        for ($day = $first; $day < $index; $day++) {
            $days[$day]['status'] = 'filled';
            $days[$day]['average'] = $average;
        }
    }
    return $days;
}
