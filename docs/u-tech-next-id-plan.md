# U-Tech Next：ID引き継ぎと地点対応

## 今回実装した範囲

Next側の画面だけに、既存U-Techに近いテーマ、user_id入力・履歴、任意point_id入力を追加。既存本体、予報取得・保存処理、読み取りAPI、DBを変更しない。

画面のuser_idは利用者・測定対象、point_idは将来参照する実測ID。現在は実測値を取得せず、入力だけでは予報地点との対応登録にならない。IDを変更しても、現在表示する予報は研究センター代表地点の参考予報であることを明示する。対応状態は未設定。実測比較・予報補正・独自推定は実装しない。

## ブラウザ内の引き継ぎ

既存U-Techは「表示」時に `usui_user_id` を保存し、履歴を `usui_user_id_history` に保存する。Nextはこれを読み取るのみ。Next独自の保存先は `utech_next_selection_v1` と `utech_next_user_history_v1`。本体のuser_id・履歴・外気参照設定を上書きしない。

初期値の優先順位：URLの明示指定 → U-Tech系列画面で最後に表示したuser_id → Nextで最後に使ったuser_id。point_idは明示URL、または同じuser_idに保存されたNextのpoint_idのみ。別user_idのpoint_idを流用しない。入力・履歴選択後は「表示」で確定する。

例（架空ID）： `/u-tech-next/?user_id=TEST_USER&point_id=P_TEST`。現在の既存本体はこのURLを生成しない。本体からのNextリンク追加は今回行わない。Nextを直接開く場合でも、同一オリジンの保存済みuser_idは読める。

localStorageは同じブラウザ・同じオリジン（プロトコル、ホスト、ポート）内のみ共有する。http/https、IP/ドメイン、別端末間では引き継がれない。既存Yui-Techも同じ保存キーを使うため、「直前にどの系列画面で選んだか」は区別できない。URLで明示するかNextで入力し直せる。

IDは英数字で始まる64文字以内の英数字・ハイフン・アンダースコア。point_idのみの指定は不可。既存保存値が不正・JSON破損・ストレージ利用不可でも参考予報を表示できる。IDはtextContentで表示し、HTMLとして解釈しない。Nextの履歴は最大10件。本体の保存済み履歴も読み取り候補として表示する。

## 既存point_idを自動で対応付けない理由

既存画面は全体で単一point_idを選ぶ方式ではない。外気温湿度は通常P11だが、別user_id・point_idへ変更可能。P31はハウス内日射、P61はハウス内風速として表示されている。屋外予報と比較する実測IDは、実際の設置条件を確認して決める。

温湿度・日射・風速で異なるpoint_idやuser_idを使用できる構造が必要。今回の単一point_id入力は参照IDの選択準備であり、4要素すべての比較元を指定するものではない。

## 地点対応のSQL案（未実行・未採用）

`locations` と実測IDを結ぶ新規テーブルを候補とする。forecastsに実測IDを重複保存せず、取得処理も変更しない。

```sql
CREATE TABLE location_links (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    point_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    location_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_location_link_source (user_id, point_id),
    KEY idx_location_link_location (location_id),
    CONSTRAINT fk_next_location_links_location
        FOREIGN KEY (location_id) REFERENCES locations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

これは追加2テーブルに対する次段階の設計案。DBには実行しない。実user_id・point_id未確認のためINSERT案はまだ作らない。IDの大文字小文字は区別する案だが、既存実測DBの照合順序とID運用を確認して確定する。

将来の解決方法案：

- user_id＋point_id：登録済みペアのlocation_idを参照。
- user_idのみ：登録先が1地点に確定する場合のみ選択。複数なら明示的な選択が必要。
- 未登録：未設定と表示し、そのID向け予報として研究センターを自動割り当てしない。
- センサー移設：過去比較のため履歴が必要になるかを別途確認。v1で履歴構造は先回りして実装しない。

今回の画面はこのテーブルを参照しない。地点対応の読み取りAPIと複数地点取得は、DB案と実IDを確認した後の別段階。SQLを作成しても実行はユーザーが行う。

## 確認待ち

研究センターのuser_idと、屋外温湿度・日射・風速の実point_id。未設置・未決定ならそのままとし、仮の実IDで登録しない。

## 検証

モックAPIによるブラウザテストで、ID引き継ぎ、独立履歴、URL指定、user変更時のpoint解除、不正ID拒否、ストレージ不可時の表示、本体保存キー不変を確認する。実DBへの接続・SQL実行は行わない。
