-- Основной замок игрока (владелец, 07.10.2026): по умолчанию — замок в центре
-- карты; ратушу можно сделать основным замком. Первый выбор бесплатно, каждое
-- следующее переселение — 5 билетов (ticket_move, kind 'home_castle').
-- Строки нет — основной замок центральный. moves — сколько раз выбирали.
CREATE TABLE IF NOT EXISTS yuplink.account_home_castle (
  account_id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('castle', 'town')),
  moves INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE yuplink.account_home_castle OWNER TO supabase_admin;
