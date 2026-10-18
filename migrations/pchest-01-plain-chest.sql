-- Обычный сундук и закапывание сундуков (владелец, 29.09.2026; ПРАВИЛА §8.22,
-- src/lib/plainChest.ts).
--
-- «Сундук» — свой товар, как магический: поставил из рюкзака на свою или
-- соседнюю клетку — на карте склад на 10 ячеек. Сети нет: каждый сундук —
-- свой склад, все 10 ячеек общие для любого игрока. Охраны нет. Хранение без
-- срока. «Забрать сундук» — любой вплотную: сундук в рюкзак, содержимое —
-- сколько влезет, остаток мешочком на клетке (§8.21). С лопатой сундук (и
-- магический без охраны) закапывают — на карте бугорок, как у мешочка, но он
-- не сгорает никогда; выкопали — снова тот же сундук с тем же содержимым.
--
-- Только добавляет: колонку-флаг с ограничениями, две колонки у магического
-- сундука и три таблицы. Идемпотентно. Накатывать ДО кода: без неё слой
-- сундуков, список своих товаров и слой мешочков падают на новых колонках.
-- ALTER берёт ACCESS EXCLUSIVE на справочник своих товаров и на
-- raid_magic_chest: чужой лок ждём не дольше 5 с (как bag-01) — отказ, просто
-- прогнать ещё раз. Готово, когда есть raid_custom_item.plain_chest,
-- ограничения raid_custom_item_kind_ok и raid_custom_item_plain_wear_ok,
-- raid_magic_chest.buried_at и таблицы raid_plain_chest,
-- raid_plain_chest_slot, raid_plain_chest_op.
SET lock_timeout = '5s';

-- 1. Предмет «Сундук» — галочка у своего товара (видов может быть несколько).
ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS plain_chest boolean NOT NULL DEFAULT false;

-- 2. «Сундук», «Магический сундук», «Зелье», «Лопата» — взаимоисключающие
--    (не больше одной галочки; на 29.09 пересечений на проде нет). Сундук не
--    изнашивается: на карту его ставят штукой целиком (как магический, decor-03).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'raid_custom_item_kind_ok'
       AND conrelid = 'yuplink.raid_custom_item'::regclass
  ) THEN
    ALTER TABLE yuplink.raid_custom_item
      ADD CONSTRAINT raid_custom_item_kind_ok CHECK (
        (plain_chest::int + magic_chest::int + is_potion::int + is_shovel::int) <= 1
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'raid_custom_item_plain_wear_ok'
       AND conrelid = 'yuplink.raid_custom_item'::regclass
  ) THEN
    ALTER TABLE yuplink.raid_custom_item
      ADD CONSTRAINT raid_custom_item_plain_wear_ok CHECK (
        NOT plain_chest OR tool_wear IS NULL
      ) NOT VALID;
  END IF;
END $$;

-- 3. Магический сундук тоже закапывается (только без живой охраны):
--    закопанный — бугорок, его не открыть, из сети через него не взять и его
--    не забрать; сеть владельца работает через остальные его сундуки, а сам он
--    для «последнего сундука» считается стоящим.
ALTER TABLE yuplink.raid_magic_chest
  ADD COLUMN IF NOT EXISTS buried_at timestamptz,
  ADD COLUMN IF NOT EXISTS buried_by text;

-- 4. Обычные сундуки на картах. id = 'pc_' || md5(ключ установки): повтор
--    моста второй не поставит. Один сундук на клетку (и магический туда не
--    встанет — проверка клетки и лок 'chestcell:' общие). Хозяина нет:
--    placed_by — кто поставил, для журнала. buried_at IS NOT NULL — бугорок.
CREATE TABLE IF NOT EXISTS yuplink.raid_plain_chest (
  id         text        PRIMARY KEY,
  map_id     text        NOT NULL,
  q          int         NOT NULL,
  r          int         NOT NULL,
  item_id    text        NOT NULL,
  name       text        NOT NULL,
  image      text,
  placed_by  text        NOT NULL,
  placed_at  timestamptz NOT NULL DEFAULT now(),
  buried_at  timestamptz,
  buried_by  text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Клетка — ключ слоя и «сундук здесь»; диапазон «второго обзора» по индексу.
CREATE UNIQUE INDEX IF NOT EXISTS raid_plain_chest_cell
  ON yuplink.raid_plain_chest (map_id, q, r);

-- 5. Содержимое сундука — ячейки по стекам (как сеть магического, но у
--    каждого сундука своя): 10 ячеек по 20, без меток происхождения (сундук
--    общий, как общая полка склада) и без срока хранения.
CREATE TABLE IF NOT EXISTS yuplink.raid_plain_chest_slot (
  chest_id   text        NOT NULL,
  stack_key  text        NOT NULL,
  kind       text        NOT NULL,
  ref_id     text,
  item_id    text,
  name       text        NOT NULL,
  image      text,
  count      numeric     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chest_id, stack_key)
);

-- 6. Ключи нажатий: поставить ('place'), положить ('put'), забрать ('take'),
--    «Забрать сундук» ('pickup', в result — что легло в рюкзак и что в
--    мешочек), закопать/выкопать ('bury'/'dig' — и обычный, и магический:
--    chest_id магического — 'mc:<карта>:<q>:<r>'). state 'done' | 'failed'.
--    Повтор того же нажатия видит ключ и второй раз ничего не делает.
CREATE TABLE IF NOT EXISTS yuplink.raid_plain_chest_op (
  op         text        PRIMARY KEY,
  chest_id   text,
  account_id text        NOT NULL,
  kind       text        NOT NULL,
  state      text        NOT NULL,
  qty        numeric     NOT NULL DEFAULT 0,
  result     jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);
-- Уборка ключей старше двух суток (после каждой установки сундука).
CREATE INDEX IF NOT EXISTS raid_plain_chest_op_at ON yuplink.raid_plain_chest_op (at);
