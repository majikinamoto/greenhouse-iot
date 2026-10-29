# U-Tech / U-Tech Plus

U-Tech本体はメイン・環境スコア・データ出力・利用案内・システム情報を表示します。
`u-tech-plus/` はアラート・分析・WBGT・過去データ・メンテの5タブです。
本体のPlus移動ボタンはパスワード不要です。Next / G-Flow / Yui-Techの既存の移動方法は変更していません。

## ファイル構成

- `index.html`: 本体の画面。
- `assets/utech.css`: U-Techの既存デザインを引き継ぐ共通CSS。
- `assets/utech-shared.js`: グラフ描画・日時・API取得など両画面で使う処理。
- `assets/utech-main.js`: メイン・環境スコア・CSV・表示設定・本体の初期化。
- `u-tech-plus/index.html`: Plusの5タブと共通ヘッダー。
- `u-tech-plus/assets/plus.js`: 5タブの処理とタブ別設定・初期化。
- `u-tech-plus/assets/plus.css`: Plusのロゴ、入力欄、スマホ幅の補正。

両画面とも共通JSを先に、専用JSを次に読み込みます。共通の関数・定数は従来と同じグローバル名で参照されます。本体はPlus専用の取得・計算・設定操作コードを読み込みません。
元の処理を移植しているため、グラフや計算の仕様は維持しています。
メンテの電圧だけは直近30日間、それ以外のメンテグラフは既存の期間設定です。

## APIとURL

Plusは `<base href="../">` を使い、既存のPHP APIをルートから参照します。
PHP、DB、アラートのサーバー側通知処理は変更していません。
Plusを閉じたことによってサーバー側の保存済み通知設定が解除されることはありません。
Yui-Tech / Nextのファイルも変更していません。

## user_id / 設定

- 本体からの移動時は、表示へ適用済みのuser_idを `?user_id=` で渡します。
- Plusの初回タブはメンテ。以降は最後に開いたタブを復元します。
- URLのIDは開いたタブへ適用。他タブは各自の保存値を優先し、未設定なら引継ぎIDを使います。
- 直接開いた場合も各タブの保存値を優先。初回移行では既存の分析/WBGT設定や本体のIDを初期値に使います。
- 引継ぎURLは初期化後に取り除き、再読み込みで後の変更を上書きしないようにします。
- 各タブのuser_id・入力条件は `utechPlus_v1_{tab}`、前回タブは `utechPlus_v1_lastTab` に保存します。
- 本体の `usui_user_id` と表示・非表示設定はPlusから上書きしません。
- ID履歴は従来の `usui_user_id_history` を共用します。分析比較元やWBGTの既存キーは互換性のため維持しています。
- 通知先のWebhookやパスワードはPlusの汎用フォーム保存から除外します。アラートの保存先は従来どおりサーバーです。

## 検証

`scripts/test-utech-plus.cjs` はローカルHTTPサーバーと模擬APIを使います。
PlaywrightとMicrosoft Edgeが必要です（`NODE_PATH` でPlaywrightのあるnode_modulesを指定できます）。

```powershell
node scripts/test-utech-plus.cjs
```

検証範囲: 本体グラフ・表示設定、相互移動、初期/前回タブ、タブごとのID分離と保存、分析・WBGT/P51・過去データ、メンテの30日電圧、空データ、390px表示、JavaScriptエラー。
通知やDBの変更はすべてローカルの模擬APIで扱います。実サーバーのデータや通知先は操作しません。
本番API・実センサーでの確認とデプロイは別途必要です。
