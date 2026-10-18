-- Город: голод и журнал склада (владелец, 03.10.2026).
--
-- starving_since — город голодает с этого момента: жителям не хватило хоть
-- чего-то из еды на сутки. Пока стоит отметка, постройки города не работают,
-- лавки только принимают еду. Снимается, когда запас еды вернулся к норме.
--
-- raid_town_stock_move — каждое движение склада города по своему ключу: сделка
-- в лавке, откат, суточная еда и производство. Ключ делает движение
-- однократным (повтор запроса не спишет дважды), а журнал — видимым: откуда у
-- города взялось и куда ушло.
--
-- Накатывать ДО выката кода: новый код пишет эти колонки. Старому коду они не
-- мешают — он их не знает.
BEGIN;

ALTER TABLE yuplink.raid_town
  ADD COLUMN IF NOT EXISTS starving_since timestamptz;

CREATE TABLE IF NOT EXISTS yuplink.raid_town_stock_move (
  ref        text PRIMARY KEY,
  map_id     text NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  good_id    text NOT NULL,
  delta      numeric NOT NULL,
  before     numeric NOT NULL,
  after      numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS raid_town_stock_move_town_idx
  ON yuplink.raid_town_stock_move (map_id, q, r, created_at DESC);

COMMIT;
