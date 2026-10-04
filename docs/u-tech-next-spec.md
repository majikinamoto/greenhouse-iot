# U-Tech Next v1

既存U-Techと同じ `greenhouse` DBに、新規 `locations` / `forecasts` のみを追加する。既存実測データ・登録・アラート処理は変更しない。Next画面は `/u-tech-next/` で誰でも閲覧可能。非商用研究利用。

## 地点とAPI

- 沖縄県農業研究センター、沖縄県糸満市真壁820番地
- WGS84代表座標：26.110374, 127.686838
- 確認元：[沖縄県公式の所在地・地図](https://www.pref.okinawa.jp/shigoto/kenkyu/1010703/1018783/1023951.html)からのGoogle Mapsリンク。測量座標ではない。
- `https://api.open-meteo.com/v1/forecast`、`models=jma_msm`。Best Matchへの切り替えなし。
- `timezone=Asia/Tokyo`、`wind_speed_unit=ms`、`temperature_unit=celsius`、`precipitation_unit=mm`
- 標高は指定せずOpen-Meteoの推定を使用。locations.elevationは未確認のためNULL。
- APIの返却座標は格子座標であり、locationsの指定座標とは別。地点の座標を変更する際は過去履歴の意味が変わらないよう、新しい地点IDを使う。

## 保存・時刻

毎日18:10 JSTにPHP CLIを起動し、JSTの翌日00:00〜翌々日00:00の25時刻を取得する。失敗時は試行開始から5分間隔で6回まで再試行（初回含め7回）。通常最終開始は18:40。処理時間やOSスケジューリングで秒単位の遅延はあり得る。

`forecast_date` は選択する予報日。翌日00:00の境界値も同じforecast_dateに所属する。`forecast_for` はAPI原時刻。`fetched_at` は成功応答を受信した実時刻で25行共通。いずれもJST。対象日は初回に固定し、再試行中の日付変更に影響されない。モデル初期時刻は取得時刻とは異なり、v1では保存・固定しない。

一意制約 `(location_id, model, forecast_date, forecast_for)` により、隣接取得日の境界値を別の予報として保持し、同じ対象日の重複を防ぐ。保存済み25行がある場合はAPIへ再アクセスしない。25行を1トランザクションでINSERTし、途中失敗はロールバック。UPDATE/REPLACEを行わない。

25時刻の不一致、配列の不足、単位の不一致、不正数値は保存せず再試行する。値のNULLはそのまま保存し、その項目の集計は欠損扱い。配列そのものが欠けた場合は構造不正として再試行する。0は有効値でありNULLと区別する。

## 項目の由来

API名と単位の対応は `u-tech-next/lib/forecast.php` のVARIABLESを参照。短いDB名 `vpd` は `vapour_pressure_deficit`、`et0` は `et0_fao_evapotranspiration` に対応。

|分類|項目|
|---|---|
|A：JMAネイティブ場に対応、Open-Meteo経由|気温、湿度、全天日射、降水量、全／下／中／上層雲量、海面更正気圧|
|B：JMA場からOpen-Meteoが算出|露点、VPD、直達／散乱日射、ET0、風速／風向、地表面気圧、日照時間、天気コード|
|C：U-Tech Nextが算出|単位換算、日最高・最低・平均、日積算|
|D/E：実測／実測からの算出|v1対象外|

Aも生のJMA配信値と完全同一とは限らず、Open-Meteoの標高補正等を含み得る。風速・風向はJMAのU/V成分から算出するためBとする。天気コードは数値を保持し、未取得の天気を補完しない。

[Open-Meteo公式JMA仕様](https://open-meteo.com/en/docs/jma-api)に由来・時間定義がある。API提供値と自前計算値はUIでも明示する。元の日射W/m²を保存し、換算値・日集計をDBへ重複保存しない。

## 集計

- 気温・湿度・VPD・風速：00:00〜23:00の24瞬時値。最高・最低は時間別サンプル中の値。
- 日射：01:00〜翌日00:00の24値を合計して0.0036倍し、MJ/m²/dayへ換算。
- ET0・降水量・日照時間：同じ24期間値を合計。対象は暦日の00:00〜24:00。
- 日射は直前1時間平均、ET0・降水量・日照時間は直前1時間積算。時刻をシフトして保存しない。
- 対象24値にNULLがあれば、その項目の集計は表示しない。他項目は独立して集計。
- 日照時間はDBで秒、UI日概要で時間に換算。

## 本番準備（ユーザーが実施・まだ未実施）

1. PHP 8.1以上、CLI/Web双方のPDO MySQL、CLIのcURL、CA証明書、HTTPS外向き通信を確認。
2. 実DBのバージョン・InnoDB・同名テーブル・権限を確認し、`docs/u-tech-next-schema.sql`をレビュー後にユーザーが実行。SQLは初回のみ。既存テーブルを上書きしない。
3. 既存 `db_config.php` を利用。NextもDB_GREENHOUSEへ接続。Web APIはSELECT、CLIはSELECT/INSERTのみのコード。テーブル作成は実行しない。
4. 状態ディレクトリを公開領域外に準備。既定 `/var/lib/utech-next`。CLI実行者が書けて、Web実行者が読める共有グループ権限を設定。例：共有グループを決めたうえでディレクトリ2770、CLI umask 0007。Webから書く必要はない。
5. 別パスならCLI/Web双方に同じ `UTECH_NEXT_STATE_DIR` を設定。環境変数はPHP-FPMやApacheへの伝播も確認。既定パスなら環境変数は不要。
6. crontabの既存設定を保ったまま定時取得を追加。ログも公開領域外へ。下の例はサーバー・スケジューラーがJSTの場合。PHPパス・実行ユーザーを実環境で確認。

```cron
10 18 * * * umask 0007 && /usr/bin/php /var/www/html/scripts/fetch-next-forecast.php >> /var/lib/utech-next/fetch.log 2>&1
```

UTCで動くスケジューラーなら09:10に設定する。PHPのJST設定だけではcron起動時刻は変わらない。状態ファイル・ログは機密エラーを含み得るため公開しない。ログローテーションを運用側で設定。状態ファイルは対象日別。全試行失敗は `failed`、APIは状態のみを返し内部エラーを公開しない。状態ディレクトリが未設定・読めない場合は「まだ保存されていません」と表示するため、権限確認が必要。

DB保存後に状態更新が失敗しても、画面は保存済みデータを優先する。再試行はまず保存済みを確認するため上書きしない。

Git pushだけでは本番反映されない。既存の手動デプロイ方式を利用。Nextリンクは既存画面にはまだ追加していない。

## 確認方法

```bash
php scripts/test-next-forecast.php
node --check u-tech-next/assets/next.js
```

PHPテストはDB接続・HTTP通信・既存データ操作なし。境界時刻、欠損、単位、日集計、保存トランザクションを検証。ブラウザテスト `scripts/test-next-ui.cjs` はモックAPIで画面のみ検証し、本番DBには接続しない。

ブラウザテストはNode.jsとPlaywright、Microsoft Edgeが必要。Playwrightが別のランタイムにある場合は、そのnode_modulesディレクトリをNODE_PATHに設定してから `node scripts/test-next-ui.cjs` を実行する。スクリーンショットはOSの一時フォルダーへ出力し、リポジトリには保存しない。

### ローカル検証記録（2026-10-03）

- 一時配置した公式PHP 8.5.11で新規PHPの構文・DB非接続テストを確認。
- 実装したPHP取得処理から、TLS証明書検証を有効にして実APIを取得。10月4日00:00〜10月5日00:00、25時刻、19項目、NULLなし。取得日時16:48:09 JST。DB保存なし。
- 一時PHPにはCA設定がなかったため、検証時だけWindowsの信頼済み公開CAを一時ファイルで指定。本番も有効なCA設定が必要。証明書検証は無効化していない。
- モックAPIでPC幅1280px・スマートフォン幅390pxの表示、25行表、ET0暦日集計、NULLと0、取得失敗／再試行／未保存／APIエラーからの切り替えを確認。実DBは使用していない。
- 実MySQLでのDDL・INSERT・API連携、cron起動、実時間での7試行は未検証。ユーザーによるDB適用と本番環境確認後に実施する。

CSV、実測連携、独自ET0、かん水推定、病害・葉濡れ、黒球日射推定、予報精度評価、1日複数回取得は実装しない。

## Next画面のデザインとID選択（2026-10-03追加）

Next専用テーマで既存U-Techに近い配色・ヘッダー・カードを使用。user_idと任意point_idを選択でき、既存の保存済みuser_id・履歴を読み取りで引き継ぐ。Nextでの編集はNext独自の保存キーへ記録し、本体の値を変えない。

地点対応は未登録であり、入力したIDに研究センターの予報を自動割り当てしない。代表地点の参考予報と明示する。実測値の取得・比較は未実装。対応表SQL案と確認待ち事項は [ID引き継ぎと地点対応](u-tech-next-id-plan.md) を参照。DBには実行していない。
