# U-Tech Next：DB準備手順

この手順のDB操作はユーザーがターミナルで行う。CodexはDBへ接続・操作しない。まず読み取り確認の結果をレビューし、その後にテーブル作成を行う。

## 1. 本番サーバーで読み取り確認

普段使用している方法で本番サーバーへログインする。DB名は既存の `DB_GREENHOUSE` の値をローカルで確認する。設定ファイル全体やパスワードはチャットに貼らない。以下はDB名が `greenhouse` の場合。

普段のMySQL管理用ログイン方法を使う。Ubuntuでローカル管理者接続が可能なら：

```bash
sudo mysql greenhouse
```

管理ユーザーのパスワードで接続する場合は、実際の管理ユーザー名へ置き換える。パスワードはプロンプトで入力し、コマンドへ直接記載しない。

```bash
mysql -h localhost -u 管理ユーザー名 -p greenhouse
```

MySQL/MariaDBプロンプトで、以下だけを実行する。すべて読み取りで、テーブルやデータは変更しない。

```sql
SELECT DATABASE() AS selected_database,
       VERSION() AS database_version,
       @@session.sql_mode AS sql_mode,
       @@session.time_zone AS session_time_zone;

SHOW TABLES LIKE 'locations';
SHOW TABLES LIKE 'forecasts';

SELECT ENGINE, SUPPORT, TRANSACTIONS
FROM information_schema.ENGINES
WHERE ENGINE = 'InnoDB';
```

貼り付けてもらうのは、この4つの結果のみ。どちらかのテーブルが既に存在する場合は作成SQLを実行せず、既存用途と定義を確認する。実DB名が異なれば手順の接続先を合わせる。

権限は管理者が確認する。作成側にはCREATEと地点INSERT、外部キー作成に必要な権限が必要。アプリ側の既存DB_USERには新規テーブルのSELECTとforecastsのINSERTが必要。SHOW GRANTSを使う場合はターミナル内で確認し、認証情報を含む出力をチャットへ貼らない。既存権限の変更はこの手順では行わない。

## 2. SQLレビュー結果

`docs/u-tech-next-schema.sql` と実装の対応を確認した。

- 新規テーブルはlocations / forecastsの2つだけ。
- 既存テーブルのALTER、UPDATE、DELETE、DROPなし。
- 外部キーの両側はINT UNSIGNEDで一致。
- InnoDBを指定し、25行保存のトランザクションに対応。
- forecast_dateにより、隣接する取得日の00:00境界値を区別。
- 一意制約はlocation_id / model / forecast_date / forecast_for。
- API19項目のDB列と、INSERT／SELECT側の列名が一致。
- NULLを許容し、0と区別。
- 取得時刻はJSTのDATETIME、25行で共通。
- 換算値・日集計を重複保存しない。
- 日付・モデル・単位・件数の検証はアプリ側でも行う。

実MySQL/MariaDBでDDLを実行して検証したわけではない。実バージョン・既存テーブル・権限の確認後に適用可否を確定する。

## 3. テーブル作成（確認結果のレビュー後）

SQL案をChatGPTと確認したうえでユーザーが実行する。現在のSQLファイルはローカル作業ツリーにのみ存在し、まだcommit / pushしていない。本番サーバーに既にあるとは扱わない。

確認したSQLファイルをサーバーの公開領域外へ用意してから実行する。以下は `/home/ubuntu/u-tech-next-schema.sql` へ用意した場合の例。接続方法・DB名・パスは実環境に合わせる。

```bash
sudo mysql --default-character-set=utf8mb4 greenhouse < /home/ubuntu/u-tech-next-schema.sql
```

初回のみ実行する。`--force` は付けない。DDLはMySQL/MariaDBで自動コミットされるため、途中エラー時には先に作成できたテーブルが残る可能性がある。エラーが出たらそこで止め、どこまで完了したか確認する。再実行や削除で修復しようとせず、結果に合わせたSQL案を再確認する。

## 4. 作成後の読み取り確認

```sql
SHOW CREATE TABLE locations;
SHOW CREATE TABLE forecasts;
SHOW INDEX FROM forecasts;

SELECT id, name, latitude, longitude, elevation, timezone, address
FROM locations;

SELECT COUNT(*) AS forecast_count FROM forecasts;
```

期待する状態：

- locationsに研究センターの1行。
- 座標26.110374 / 127.686838、timezone=Asia/Tokyo、elevation=NULL。
- forecastsは0行。
- forecastsに4列の一意制約と外部キーが存在。

ここでは取得CLIをまだ起動しない。PHP環境、公開領域外の状態ディレクトリと権限、ファイルの本番反映を確認してから進む。

## 5. この後

1. PHPとCA設定、CLI/Web実行者、状態ディレクトリの権限を確認。
2. 新規ファイルを確認してcommit / push、本番への手動反映。
3. 合意した時刻・対象日で初回取得を実行し、25行と取得日時、画面を確認。
4. 毎日18:10 JSTのcron等を登録。既存の定期処理を残す。

詳細は `docs/u-tech-next-spec.md` を参照。既存U-Tech本体の処理は変更しない。
