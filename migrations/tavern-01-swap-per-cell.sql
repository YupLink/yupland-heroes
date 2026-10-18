-- Смены героя считаются по КАЖДОЙ таверне отдельно (владелец, 02.10.2026,
-- задача «Починить подсчёт таверн»). Журнал смен запоминает клетку таверны;
-- код (tavern-limit.ts) считает заряды только по ней.
--
-- Накатывать ДО выката кода: новый код пишет эти колонки. Старому коду они не
-- мешают — он их не знает.
BEGIN;

ALTER TABLE yuplink.hero_swap_log
  ADD COLUMN IF NOT EXISTS map_id text,
  ADD COLUMN IF NOT EXISTS q integer,
  ADD COLUMN IF NOT EXISTS r integer;

-- Последние двое суток: клетку берём из оплаты лайками (ref «q,r», пишется
-- через секунды после заявки), карту — где на этой клетке стоит таверна. Иначе
-- сменивший героя утром получил бы в той же таверне второй заряд сразу после
-- выката. Старше суток смены ни на что не влияют — их не трогаем.
WITH m AS (
  SELECT h.id,
         (SELECT l.ref FROM yuplink.like_spend_log l
           WHERE l.reason = 'tavern_swap' AND l.account_id = h.account_id
             AND l.created_at BETWEEN h.at AND h.at + interval '2 minutes'
             AND l.ref ~ '^-?[0-9]+,-?[0-9]+$'
           ORDER BY l.created_at LIMIT 1) AS ref
    FROM yuplink.hero_swap_log h
   WHERE h.map_id IS NULL AND h.at > now() - interval '2 days'
), cell AS (
  SELECT m.id, split_part(m.ref, ',', 1)::int AS q, split_part(m.ref, ',', 2)::int AS r
    FROM m WHERE m.ref IS NOT NULL
)
UPDATE yuplink.hero_swap_log h
   SET q = cell.q, r = cell.r,
       map_id = (SELECT c.map_id FROM yuplink.raid_map_cells c
                   JOIN yuplink.mystic_item_template t ON t.id = c.building_id
                  WHERE c.q = cell.q AND c.r = cell.r AND t.meta->>'effect' = 'tavern'
                  LIMIT 1)
  FROM cell
 WHERE cell.id = h.id;

CREATE INDEX IF NOT EXISTS hero_swap_log_cell_idx
  ON yuplink.hero_swap_log (account_id, map_id, q, r, at DESC);

COMMIT;
