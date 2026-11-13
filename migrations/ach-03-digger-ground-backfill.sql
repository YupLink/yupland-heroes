-- «Кладоискатель» (§8.57) за копку земли лопатой до caf6cfcc (владелец 08.11:
-- «копка всё равно не даёт повышение ачивки»). Код с 2026-11-07 20:27 UTC
-- считает сам; здесь — находки и клады дня раньше этой отметки. Один раз:
-- ключ yuplink.settings 'ach_digger_ground_backfill'.
BEGIN;
WITH guard AS (
  INSERT INTO yuplink.settings (key, value) VALUES ('ach_digger_ground_backfill', '2026-11-07T20:27:00Z')
  ON CONFLICT (key) DO NOTHING RETURNING 1
), dug AS (
  SELECT account_id, count(*) AS n FROM (
    SELECT o.account_id FROM yuplink.raid_loot_bag_op o
     WHERE o.op LIKE 'gdig:%' AND o.kind = 'ground' AND o.state = 'done'
       AND o.parts->>'item' IS NOT NULL AND o.parts->>'item' <> 'none'
       AND o.at < '2026-11-07 20:27:00+00'
    UNION ALL
    SELECT t.found_by FROM yuplink.raid_treasure t
     WHERE t.status = 'found' AND t.found_by IS NOT NULL AND t.found_at < '2026-11-07 20:27:00+00'
  ) x GROUP BY account_id
)
INSERT INTO yuplink.account_achievement (account_id, track, count, updated_at)
SELECT d.account_id, 'digger', d.n, now() FROM dug d WHERE EXISTS (SELECT 1 FROM guard)
ON CONFLICT (account_id, track)
DO UPDATE SET count = yuplink.account_achievement.count + EXCLUDED.count, updated_at = now();
COMMIT;
