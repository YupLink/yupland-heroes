-- БУСТ: постоянная прибавка к характеристике героя.
--
-- Постройка-«алтарь» и некоторые товары дают герою «+N к скорости» навсегда.
-- Прибавка не привязана ни к уровню, ни к артефакту, поэтому живёт отдельной
-- строкой: уровень качают за лайки, артефакт можно снять, а буст — свой.
CREATE TABLE IF NOT EXISTS yuplink.hero_boost (
  hero_id text NOT NULL,
  -- atk | arm | int | spd | hp | luck — те же ключи, что у характеристик героя
  stat    text NOT NULL,
  amount  numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hero_id, stat)
);

-- Ключ операции: и постройка, и товар выдают буст «один раз за нажатие».
-- Слепой повтор моста не имеет права начислить прибавку дважды.
CREATE TABLE IF NOT EXISTS yuplink.hero_boost_op (
  op         text PRIMARY KEY,
  hero_id    text NOT NULL,
  stat       text NOT NULL,
  amount     numeric NOT NULL,
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
