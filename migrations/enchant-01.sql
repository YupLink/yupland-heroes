-- Лавка зачарования (владелец, 28.10.2026): постройка с эффектом enchant, админ
-- настраивает заклинания в окне самого здания; игрок платит списком позиций и
-- получает бросок: успех — все числовые статы экземпляра × (1 + pct/100) вверх,
-- без изменений, или разрушение (артефакт пропадает, с героя снимается).
--
-- Накатывать СТРОГО ДО кода: загрузчики артефактов (hero-load, heroes-gear-read,
-- рынок героев, «надеть копию») читают yuplink.item_enchant — без таблицы бой и
-- окно снаряжения остались бы без статов артефактов.
-- Повторный накат безопасен: только IF NOT EXISTS, данных не трогает.
-- Заклинаний заранее НЕ создаём: пусто, пока админ не добавит.
-- Готово, когда есть таблицы raid_enchant_spell, item_enchant, enchant_attempt.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Заклинания лавки — по клетке здания (как товары маркета raid_market_item).
-- cost — список позиций [{kind: resource|token|custom, code, amount}];
-- fx — усиление шанса {on, pct, cost: {kind, code, amount}} (цена 1-го шага).
CREATE TABLE IF NOT EXISTS yuplink.raid_enchant_spell (
  id             text        PRIMARY KEY,
  map_id         text        NOT NULL,
  q              integer     NOT NULL,
  r              integer     NOT NULL,
  pos            integer     NOT NULL DEFAULT 0,
  name           text        NOT NULL,
  rarity         text        NOT NULL
                 CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  boost_min      integer     NOT NULL CHECK (boost_min >= 0),
  boost_max      integer     NOT NULL,
  success        numeric     NOT NULL CHECK (success >= 0 AND success <= 100),
  destroy        boolean     NOT NULL DEFAULT false,
  destroy_chance numeric     NOT NULL DEFAULT 0,
  cost           jsonb       NOT NULL,
  fx             jsonb       NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raid_enchant_spell_boost CHECK (boost_max >= boost_min),
  CONSTRAINT raid_enchant_spell_destroy
    CHECK (destroy_chance >= 0 AND destroy_chance <= 100 - success),
  CONSTRAINT raid_enchant_spell_cost
    CHECK (jsonb_typeof(cost) = 'array' AND jsonb_array_length(cost) >= 1),
  CONSTRAINT raid_enchant_spell_fx CHECK (jsonb_typeof(fx) = 'object')
);
CREATE INDEX IF NOT EXISTS raid_enchant_spell_cell
  ON yuplink.raid_enchant_spell (map_id, q, r, pos);

-- Зачарование экземпляра артефакта (user_game_item.id). Своя таблица, а не
-- колонка: первичный ключ сам держит «одно зачарование на артефакт», а откат
-- сделки маркета/аукциона возвращает артефакт под тем же id (art-stock
-- restoreArtifacts) — зачарование возвращается вместе с ним.
CREATE TABLE IF NOT EXISTS yuplink.item_enchant (
  item_id    text        PRIMARY KEY,
  account_id text        NOT NULL,
  pct        integer     NOT NULL CHECK (pct >= 0),
  spell_id   text        NOT NULL,
  spell_name text        NOT NULL,
  -- '<аккаунт>:<opId>' попытки, которая зачаровала.
  op_ref     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Журнал попыток. Ключ (account_id, op_id) — повтор нажатия отвечает тем же
-- итогом без второго списания. Одна незавершённая попытка на предмет (индекс
-- ниже): две вкладки не заплатят за один артефакт дважды.
--   status: pending → done (итог) | refunded (оплата не прошла или предмет
--           увели — цена возвращена, error — ключ отказа) | stale (зависла
--           дольше 10 минут — предмет снова свободен; разбирать по paid).
CREATE TABLE IF NOT EXISTS yuplink.enchant_attempt (
  account_id  text        NOT NULL,
  op_id       text        NOT NULL CHECK (op_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  item_id     text        NOT NULL,
  template_id text,
  map_id      text        NOT NULL,
  q           integer     NOT NULL,
  r           integer     NOT NULL,
  spell_id    text        NOT NULL,
  -- Снимок заклинания на момент попытки (цена, шансы, усиление).
  spell       jsonb       NOT NULL,
  steps       integer     NOT NULL CHECK (steps >= 0 AND steps <= 5),
  -- Что просили (база + шаги, слито) и что реально списано (с квитанциями).
  cost        jsonb       NOT NULL,
  paid        jsonb,
  status      text        NOT NULL
              CHECK (status IN ('pending', 'done', 'refunded', 'stale')),
  outcome     text        CHECK (outcome IN ('ok', 'none', 'gone')),
  pct         integer,
  result      jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (account_id, op_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS enchant_attempt_item_pending
  ON yuplink.enchant_attempt (item_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS enchant_attempt_account
  ON yuplink.enchant_attempt (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS enchant_attempt_item
  ON yuplink.enchant_attempt (item_id, created_at DESC);

COMMIT;
