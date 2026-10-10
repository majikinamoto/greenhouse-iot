<?php
require_once __DIR__.'/auth.php';
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (is_string($_POST['password'] ?? null) && hash_equals('8515', $_POST['password'])) {
        session_regenerate_id(true);
        $_SESSION['g_flow_access'] = true;
        header('Location: ./'); exit;
    }
    $error = 'パスワードが違います。';
}
?><!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>G-Flow｜ハウス内の風を見る</title>
<link rel="stylesheet" href="../u-tech-next/assets/next.css"><link rel="stylesheet" href="../u-tech-next/assets/utech-style.css"><link rel="stylesheet" href="flow.css">
<?php if (flowAuthorized()): ?>
<script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js" defer></script><script src="https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js" defer></script><script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@1.2.1/dist/chartjs-plugin-zoom.min.js" defer></script><script src="flow.js" defer></script>
<?php endif; ?></head><body><main>
<header class="hero"><div class="brand"><div class="logo-mark" aria-hidden="true">G</div><div><div class="brand-title-row"><h1>G-Flow</h1><a class="back" href="../" aria-label="U-Techへ移動">U-Techへ移動</a></div><p class="eyebrow">ゴーヤーのハウス内の風を見る</p><p class="subtitle">Greenhouse Wind Flow</p></div></div></header>
<?php if (!flowAuthorized()): ?>
<section class="tab-toolbar"><h2>G-Flowへ入る</h2><form method="post"><label for="password">パスワード</label><input id="password" name="password" type="password" inputmode="numeric" required autofocus autocomplete="current-password"><button type="submit">入る</button></form><p class="error" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p></section>
<?php else: ?>
<form id="data-form" class="tab-toolbar"><div class="selection-controls"><label>user_id <input id="user-id" maxlength="64" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" required placeholder="例: T0001" autocomplete="off"></label><label>履歴<select id="user-history" aria-label="user_idの履歴"><option value="">履歴</option></select></label><button type="submit">表示</button></div></form>
<div class="next-tabs" role="tablist" aria-label="G-Flowの表示">
<button id="tab-main" type="button" role="tab" aria-selected="true" aria-controls="main-panel">メイン</button>
<button id="tab-export" type="button" role="tab" aria-selected="false" aria-controls="export-panel" tabindex="-1">データ出力</button>
</div>
<section id="main-panel" role="tabpanel" aria-labelledby="tab-main">
<p class="caption">No.1〜No.4の10分平均・10分最大風速を比較します。初期表示は直近72時間です。</p>
<p id="status" role="status" aria-live="polite">user_idを入力して「表示」を押してください。</p>
<div id="charts" class="chart-grid">
<?php foreach (['P61','P62','P63','P64'] as $index=>$point): ?>
<section class="chart-card"><h3>No.<?= $index+1 ?> · <?= $point ?></h3><div class="chart-container"><canvas aria-label="No.<?= $index+1 ?>の風速グラフ" role="img"></canvas></div><p class="chart-readout">user_idを入力して「表示」を押してください。</p></section>
<?php endforeach; ?>
</div>
<p class="caption">マウスでドラッグした範囲を縦横に拡大できます。「表示リセット」で元に戻せます。表示時間は4棟で連動します。No.2〜No.4は「P61と同じ縦軸」で連動・個別調整を選べます。</p>
</section>
<section id="export-panel" role="tabpanel" aria-labelledby="tab-export" hidden>
<h2>データ出力</h2><p class="caption">上部で選んだuser_idと、ここで指定した期間の4棟の風速データをCSVに出力します。メインのグラフは直近72時間を表示します。</p>
<p id="export-context" role="status" aria-live="polite">出力対象：未選択</p>
<form id="export-form"><div class="export-actions"><label>開始（JST）<input id="start" type="datetime-local" required></label><label>終了（JST）<input id="end" type="datetime-local" required></label><button id="last72" type="button">直近72時間</button><button id="csv" type="submit">CSVダウンロード</button></div></form>
<p class="caption">user_id・ハウス名・point_id・測定日時（JST）・10分平均風速・10分最大風速（m/s）。欠測値は空欄です。</p>
</section>
<?php endif; ?><footer>G-Flow · Gima / Goya</footer></main></body></html>
