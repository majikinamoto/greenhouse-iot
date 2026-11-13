# グラフ右余白での最新値表示

U-Tech本体・Plus・Next・G-Flow・DD・Yui-techは、Chart.js読み込み後に
`chart-latest-value.js`を読み込む。新しいグラフにも自動的に適用される。

## 共通仕様

- キャンバス内でプロット領域より右側にポインタがある間、同じ連動グループの値を表示する。
- 各表示系列の、現在のX軸表示範囲内にある最後の有効プロットを選ぶ。
- 系列ごとの日時が違っていてもそれぞれの実際の日時を表示する。時刻差の制限や補間はしない。
- null・非数・非表示系列・補助線・DDの欠測マーカーを除外する。0は有効値とする。
- 日別に分割された同名系列はまとめ、最後のプロットだけを表示する。
- プロット領域に戻れば通常のホバーへ戻り、キャンバス外では解除する。
- 予報や積算も同じ規則を使う。予報の「最後」は将来の予報値を含む。

## 実装

`utechLatestValue`プラグインが右余白のイベントを処理し、ページの通常ホバーを解除して
共通の値ラベルと点を描画する。通常ホバーの処理は各ページが担当する。
右軸がないグラフにも操作場所ができるよう、右のpaddingを最低28px確保する。

本体・Plus・Yui-techは既存の`getChartSyncGroup`を利用する。
その他は最も近い`role="tabpanel"`を連動単位とし、ない場合はページ全体とする。
全ページで共通プラグインを一度だけ読み込むこと。

補助系列はdatasetに`excludeFromLatestValue: true`を設定すると除外できる。
補助プロットだけを除外する場合は個別のデータ点に同じプロパティを付ける。
`tooltipGroup`が同じ系列は表示上ひとつにまとめる。

時刻は日時X軸なら日本時間、カテゴリ軸なら日付ラベル、Next蒸散量なら`$hours`、
それ以外の時間別グラフなら時刻として表示する。

## 確認

```text
node scripts/test-chart-latest-value.cjs
node scripts/test-chart-latest-value-ui.cjs
node scripts/test-g-flow.cjs
```

UIテストはPlaywright、インストール済みのEdge、Chart.js CDNへの接続が必要。
