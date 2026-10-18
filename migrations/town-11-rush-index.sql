-- Особый спрос (09.10.2026): сколько товар лежит на НЗ и ниже, считается по
-- журналу движений склада (town-rush.ts) — по товару ратуши от свежих к старым.
CREATE INDEX IF NOT EXISTS raid_town_stock_move_good_idx
  ON yuplink.raid_town_stock_move (map_id, q, r, good_id, created_at DESC);
