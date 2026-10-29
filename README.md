# greenhouse-iot
IoTデータ可視化

## データベース設定

db_config.example.php をコピーして db_config.php を作成してください。

例：

```bash
cp db_config.example.php db_config.php
```

必要に応じてDB接続情報を書き換えてください。
## 本番反映

GitHub Actionsの「本番反映」ボタンの初回設定と使い方は [本番反映の手順](docs/production-deploy.md) を参照してください。

## U-Techの引き継ぎ

初めてコードを読む方は [U-Tech引き継ぎガイド](docs/u-tech-handover.md) から確認してください。現在のファイル構成・読み込み順・機能ごとの変更先・CSVと通知の仕様・検証手順をまとめています。

本体とPlusの担当範囲、user_idの引き継ぎ・保存、共通処理の構成は [U-Tech / Plus構成ガイド](docs/u-tech-plus.md) を参照してください。
