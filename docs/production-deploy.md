# GitHubのボタンから本番反映

対象は `ubuntu@163.43.29.108` の `/var/www/html`、ブランチは `main` です。
GitHub Actionsの「本番反映」を手動実行した時だけ反映します。
プッシュだけでは本番は更新されません。

## 初回の設定

1. いつものターミナルでサーバーへログインします。

   ```bash
   ssh ubuntu@163.43.29.108
   cd /var/www/html
   git pull --ff-only origin main
   bash scripts/setup-production-deploy.sh
   ```

2. [Actions secrets設定](https://github.com/majikinamoto/greenhouse-iot/settings/secrets/actions)を開き、
   「New repository secret」で次の2つを登録します。

   | Name | Secretに貼る内容 |
   | --- | --- |
   | `PRODUCTION_SSH_KEY` | サーバーで `cat ~/.ssh/greenhouse-actions` を実行した出力全体。BEGIN/ENDの行も含めます。 |
   | `PRODUCTION_KNOWN_HOSTS` | 設定スクリプトの最後に表示される `163.43.29.108 ssh-ed25519 ...` の1行。 |

   秘密鍵はGitHubのSecret欄へ直接貼ります。チャットやリポジトリには貼りません。
   ホスト鍵の行をもう一度確認する場合は、サーバーで次を実行します。

   ```bash
   awk '{print "163.43.29.108 " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
   ```

## 毎回の反映

1. 変更をGitHubの `main` にプッシュします。
2. [本番反映](https://github.com/majikinamoto/greenhouse-iot/actions/workflows/deploy-production.yml)を開きます。
3. 「Run workflow」を開き、Branchが `main` であることを確認し、「Run workflow」を押します。
4. 実行結果が緑のチェックになったら、本番サイトを再読み込みして表示を確認します。

反映されるのはボタンを押した時の `main` のコミットです。
その後のプッシュは、次にボタンを押すまで反映されません。
緑のチェックはGitの更新成功を示します。画面やデータ取得の動作はサイトでも確認してください。

## 接続と更新の仕組み

- 専用SSH鍵は、本番反映スクリプトだけを実行できます。通常のシェルやポート転送には使えません。
- スクリプトは公開フォルダー外の `/home/ubuntu/.local/bin/greenhouse-deploy` に配置します。
- サーバーのホスト鍵を照合して接続します。
- サーバーのブランチが `main` で、管理対象ファイルに変更がない場合だけ更新します。
- 未追跡のバックアップやGit管理外のDB・SMTP設定は削除しません。
- 更新はfast-forwardのみです。古い実行による巻き戻しや履歴の強制上書きは行いません。
- サーバーからGitHubへの取得には、これまでの `git pull` と同じ認証設定を使用します。

## 失敗した場合

Actionsの該当実行を開き、赤くなったステップのログを確認します。
認証エラーならSecretの貼り付けとサーバーの鍵登録、接続タイムアウトならSSHへの通信許可を確認します。
作業中の変更やブランチの違いが原因の場合は、自動で上書きせず停止します。
途中で失敗した時は、すでにGitの更新が完了している場合もあるため、サーバーの `git log -1 --oneline` で確認します。

サーバー用スクリプトを変更した際は、サーバーで最新版を取り込んだ後、初回設定のスクリプトを再実行します。
既存の専用鍵は再生成されません。

参考: [GitHub公式の手動実行手順](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
