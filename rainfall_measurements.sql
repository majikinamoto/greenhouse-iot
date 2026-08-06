-- 1. 変更前確認（読み取り専用）
SHOW CREATE TABLE measurements;
SHOW INDEX FROM measurements;

-- user_id + point_id + recorded_at の既存重複確認
SELECT
    user_id,
    point_id,
    recorded_at,
    COUNT(*) AS duplicate_count
FROM measurements
GROUP BY user_id, point_id, recorded_at
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, user_id, point_id, recorded_at;

-- 2. 雨量列の追加（上の確認後に実行）
ALTER TABLE measurements
    ADD COLUMN rainfall_cumulative DECIMAL(10,2) NULL,
    ADD COLUMN rainfall_interval DECIMAL(8,2) NULL;

-- 3. SHOW INDEXの結果に同等の複合インデックスがない場合だけ実行
--    前回値・新しい時刻・重複の検索に使用する非UNIQUEインデックス
-- ALTER TABLE measurements
--     ADD INDEX idx_measurements_user_point_recorded
--         (user_id, point_id, recorded_at);

-- 4. UNIQUE制約は既存重複が0件であることを確認し、運用判断した場合だけ実行
--    既存重複がある状態では実行しない（今回の変更では追加しない）
-- ALTER TABLE measurements
--     ADD UNIQUE KEY uq_measurements_user_point_recorded
--         (user_id, point_id, recorded_at);
