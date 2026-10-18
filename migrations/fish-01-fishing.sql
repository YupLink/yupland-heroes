-- Рыбалка (владелец, 04.10.2026; ПРАВИЛА §8.35, src/lib/raid/fishing.ts,
-- сервер — src/server/api/beta-raid/fishing/).
--
-- Удочка — свой товар с галочкой «Удочка» (is_rod; видов может быть несколько),
-- инструмент по правилам основного (§8.24) с износом за поимку (§8.19). Герой с
-- удочкой в руках стоит на суше у воды, жмёт «Рыбачить» — и каждые N минут
-- (настройка админа в yuplink.settings, ключ fishing_config, по умолчанию 10) в
-- рюкзак падает улов. Строка raid_fishing — рыбалка аккаунта (одна на аккаунт:
-- новая заменяет закрытую): где и с какой версией позиции встал, когда
-- следующая поимка, сколько поймано, когда видели на месте, первое другое
-- действие (трата энергии) и чем кончилась.
--
-- Только добавляет: колонку-флаг с ограничением, таблицу и индекс. Идемпотентно.
--
-- Накатывать ДО кода. Без таблицы падают не только ручки рыбалки: заметка
-- «на что ушла энергия» (econ/energy-note.ts) тем же оператором отмечает
-- рыбаку «другое действие», и без raid_fishing она не запишется вовсе — отчёты
-- трат энергии в админке опустеют. Без колонки is_rod — список своих товаров и
-- рюкзак.
--
-- ALTER берёт ACCESS EXCLUSIVE на справочник своих товаров: чужой лок ждём не
-- дольше 5 с (как bag-01, pchest-01) — отказ, просто прогнать ещё раз. Готово,
-- когда есть raid_custom_item.is_rod, ограничение raid_custom_item_rod_ok,
-- таблица raid_fishing и индекс raid_fishing_hero_live.
SET lock_timeout = '5s';

-- 1. Удочка — галочка у своего товара. Не зелье, не сундук (обычный и
--    магический) и не лопата: удочкой рыбачат, в сумку и на карту она не идёт.
--    Ограничение «одна галочка» (raid_custom_item_kind_ok, pchest-01) не
--    трогаем — у удочки своё.
ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS is_rod boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'raid_custom_item_rod_ok'
       AND conrelid = 'yuplink.raid_custom_item'::regclass
  ) THEN
    ALTER TABLE yuplink.raid_custom_item
      ADD CONSTRAINT raid_custom_item_rod_ok CHECK (
        NOT is_rod OR NOT (is_potion OR magic_chest OR plain_chest OR is_shovel)
      ) NOT VALID;
  END IF;
END $$;

-- 2. Рыбалка аккаунта. op — ключ нажатия «Рыбачить» (он же ключ рыбалки в
--    ключах выдачи улова); pos_at — версия позиции при старте
--    (beta_raid_positions.updated_at, её меняет любой шаг); next_at — когда
--    следующая поимка; seen_at — последний раз, когда герой был на месте;
--    acted_at/acted_pos — первая трата энергии после старта и версия позиции
--    в тот миг; claim — ключ последнего захвата поимок (повтор моста узнаёт
--    свой); stopped_at/stop_reason — чем кончилась (NULL — идёт).
CREATE TABLE IF NOT EXISTS yuplink.raid_fishing (
  account_id  text        PRIMARY KEY,
  op          text        NOT NULL,
  hero_id     text        NOT NULL,
  map_id      text        NOT NULL,
  q           int         NOT NULL,
  r           int         NOT NULL,
  pos_at      timestamptz,
  started_at  timestamptz NOT NULL DEFAULT now(),
  next_at     timestamptz NOT NULL,
  caught      int         NOT NULL DEFAULT 0,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  acted_at    timestamptz,
  acted_pos   timestamptz,
  claim       text,
  stopped_at  timestamptz,
  stop_reason text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Идущая рыбалка героя — по герою (смена инструмента в руках сначала
--    досчитывает улов, main-tool-set → endFishingOnTool).
CREATE INDEX IF NOT EXISTS raid_fishing_hero_live
  ON yuplink.raid_fishing (hero_id) WHERE stopped_at IS NULL;
