-- Зачарование героев (владелец, 29.10.2026; lib/enchant/heroRite): постройка с
-- эффектом hero_enchant, обряды админ настраивает в окне самого здания. Обряд:
-- N героев одной редкости → с шансом один новый герой следующей редкости; при
-- неудаче пропадает от lose_min до lose_max из положенных.
--
-- Попытки пишутся в общий журнал зачарований (enchant_attempt, enchant-01):
-- item_id = 'heroes:<id копий через запятую>', spell — снимок обряда. Герои
-- снимаются снимками ломбарда (pawn_hero_take, pawn-heroes-01) — возврат и
-- мешочек с рюкзаком у ушедших — тем же кодом.
--
-- Накатывать ДО кода. Повторный накат безопасен: только IF NOT EXISTS. Обрядов
-- заранее НЕ создаём. Готово, когда есть таблица raid_hero_rite.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_hero_rite (
  id         text        PRIMARY KEY,
  map_id     text        NOT NULL,
  q          integer     NOT NULL,
  r          integer     NOT NULL,
  pos        integer     NOT NULL DEFAULT 0,
  name       text        NOT NULL,
  rarity     text        NOT NULL CHECK (rarity IN ('rare', 'epic')),
  need       integer     NOT NULL CHECK (need BETWEEN 2 AND 10),
  success    numeric     NOT NULL CHECK (success >= 0 AND success <= 100),
  lose_min   integer     NOT NULL,
  lose_max   integer     NOT NULL,
  cost       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raid_hero_rite_lose CHECK (lose_min >= 0 AND lose_min <= lose_max AND lose_max <= need),
  CONSTRAINT raid_hero_rite_cost
    CHECK (jsonb_typeof(cost) = 'array' AND jsonb_array_length(cost) >= 1)
);
CREATE INDEX IF NOT EXISTS raid_hero_rite_cell ON yuplink.raid_hero_rite (map_id, q, r, pos);
ALTER TABLE yuplink.raid_hero_rite OWNER TO postgres;

COMMIT;
