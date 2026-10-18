-- Магический сундук (правила владельца 27.09.2026 — шапка src/lib/magicChest.ts).
--
-- Сундук на карте — отдельный слой, а не постройка raid_map_cells: клетки
-- карты пишет редактор целиком, и сундук игрока пропал бы при первом
-- сохранении админа. Сеть — одна на аккаунт, без карты: «достал из одного —
-- сразу меньше везде» даёт сама одна таблица.

-- 1. Предмет «Магический сундук» — свой товар с галочкой. Вид один.
ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS magic_chest boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS raid_custom_item_one_magic_chest
  ON yuplink.raid_custom_item ((true)) WHERE magic_chest;

-- 2. Происхождение в рюкзаке: сколько штук стека добыто с мобов. Читается как
--    LEAST(mob_count, count) — купленное тратится первым. Прежние стеки — 0:
--    откуда они пришли, база не помнит.
ALTER TABLE yuplink.raid_hero_backpack
  ADD COLUMN IF NOT EXISTS mob_count numeric NOT NULL DEFAULT 0;

-- 3. Сундуки на картах: владелец, вид, картинка на момент установки.
CREATE TABLE IF NOT EXISTS yuplink.raid_magic_chest (
  map_id        text NOT NULL,
  q             int  NOT NULL,
  r             int  NOT NULL,
  owner_account text NOT NULL,
  item_id       text NOT NULL,          -- raid_custom_item.id (cst_…)
  name          text NOT NULL,
  image         text,
  placed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, q, r)
);
CREATE INDEX IF NOT EXISTS raid_magic_chest_owner
  ON yuplink.raid_magic_chest (owner_account);

-- 4. Сеть игрока: 10 ячеек по 20 единиц, одна на аккаунт.
CREATE TABLE IF NOT EXISTS yuplink.raid_chest_slot (
  account_id text NOT NULL,
  stack_key  text NOT NULL,
  kind       text NOT NULL,
  ref_id     text,
  item_id    text,
  name       text NOT NULL,
  image      text,
  count      numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, stack_key)
);

-- 5. Журнал грабежей: что лежало в сети и что грабитель унёс.
CREATE TABLE IF NOT EXISTS yuplink.raid_chest_plunder (
  id             text PRIMARY KEY,
  map_id         text NOT NULL,
  q              int  NOT NULL,
  r              int  NOT NULL,
  owner_account  text NOT NULL,
  raider_account text NOT NULL,
  items          jsonb NOT NULL DEFAULT '[]'::jsonb,
  taken          jsonb NOT NULL DEFAULT '[]'::jsonb,
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raid_chest_plunder_owner
  ON yuplink.raid_chest_plunder (owner_account, at DESC);

-- 6. Сам предмет — чтобы механика не ждала ручной заводки. Картинка — сундук,
--    уже загруженный на сервер; админ меняет её в справочнике своих товаров.
--    Вставляем, только если сундука ещё нет (вид один).
INSERT INTO yuplink.raid_custom_item (id, name, image, description, magic_chest)
SELECT 'cst_magic_chest', 'Магический сундук', '/uploads/tasks/9r7UtlzREr.png',
       'Одна сеть на 10 ячеек для всех твоих сундуков', true
 WHERE NOT EXISTS (SELECT 1 FROM yuplink.raid_custom_item WHERE magic_chest)
ON CONFLICT (id) DO NOTHING;
