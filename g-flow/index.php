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
<header class="hero"><div class="brand"><div class="logo-mark" aria-hidden="true">G</div><div><h1>G-Flow</h1><p class="eyebrow">ゴーヤーのハウス内の風を見る</p><p class="subtitle">Greenhouse Wind Flow</p></div></div><a class="back" href="../">U-Techへ戻る</a></header>
<?php if (!flowAuthorized()): ?>
<section class="tab-toolbar"><h2>G-Flowへ入る</h2><form method="post"><label for="password">パスワード</label><input id="password" name="password" type="password" inputmode="numeric" required autofocus autocomplete="current-password"><button type="submit">入る</button></form><p class="error" role="alert"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></p></section>
<?php else: ?>
<form id="data-form" class="tab-toolbar"><div class="selection-controls"><label>user_id <input id="user-id" maxlength="64" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" required placeholder="例: T0001" autocomplete="off"></label><label>開始（JST）<input id="start" type="datetime-local" required></label><label>終了（JST）<input id="end" type="datetime-local" required></label><button type="submit">表示</button><button id="last72" type="button">直近72時間</button></div></form>
<p class="caption">No.1〜No.4の10分平均・10分最大風速を比較します。初期表示は直近72時間です。</p>
<form id="axis-form" class="tab-toolbar"><div class="selection-controls"><strong>No.1（P61）の縦軸を4棟に適用</strong><label>最小 <input id="axis-min" type="number" min="0" step="0.1" value="0" required></label><label>最大 <input id="axis-max" type="number" min="0" step="0.1" placeholder="自動"></label><button type="submit">縦軸を適用</button><button id="reset" type="button">ズームリセット</button></div></form>
<p id="status" role="status" aria-live="polite">user_idを入力して「表示」を押してください。</p><div class="export-actions"><button id="csv" type="button" disabled>表示データをCSVダウンロード</button><span class="caption">4棟の風速・測定日時（JST）を出力します。</span></div><div id="charts" class="chart-grid"></div>
<p class="caption">ドラッグで時間を拡大できます。表示時間・縦軸は4棟で共通です。風速のみを表示し、植物のストレス判定は行いません。</p>
<?php endif; ?><footer>G-Flow · Gima / Goya</footer></main></body></html>
