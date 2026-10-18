-- Мешочки на карте рейда (владелец, 29.09.2026; ПРАВИЛА §8.21, src/lib/lootBag.ts).
--
-- Предметы из объектов карты, с рубки декора и из наград боссов ложатся сразу
-- в рюкзак выбранного героя; что не влезло — мешочком на клетке, где взято.
-- Мешочек видят все во «втором обзоре» (круг 20 клеток, разведанное, не под
-- куполом). Открывается как склад: любой вплотную забирает в рюкзак и кладёт
-- из рюкзака. Содержимое — порциями со своим сроком: 24 часа с попадания в
-- мешочек, забирается сначала сгорающее раньше; пустой мешочек исчезает. С
-- лопатой мешочек закапывают (бугорок: содержимое не видно и не забирается,
-- всё сгорает через 24 часа после закапывания) и выкапывают (сроки остаются).
-- Сгоревшее и опустевшее убирает сборщик (раз в минуту, loot-bag/bag-sweep.ts).
--
-- Только добавляет: колонку-флаг с ограничением и три таблицы. Идемпотентно.
-- Накатывать ДО кода. ALTER берёт ACCESS EXCLUSIVE на справочник своих товаров:
-- чужой лок ждём не дольше 5 с (как decor-03) — отказ, просто прогнать ещё раз.
-- Готово, когда есть raid_custom_item.is_shovel, ограничение
-- raid_custom_item_shovel_ok и таблицы raid_loot_bag, raid_loot_bag_item
-- (с колонкой expires_at), raid_loot_bag_op (с колонкой parts).
SET lock_timeout = '5s';

-- 1. Лопата — галочка у своего товара (видов может быть несколько). Тратит
--    износ, как топор: «Износ за удар, %» (tool_wear), пусто — ломается сразу.
--    Лопата не зелье и не магический сундук.
ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS is_shovel boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'raid_custom_item_shovel_ok'
       AND conrelid = 'yuplink.raid_custom_item'::regclass
  ) THEN
    ALTER TABLE yuplink.raid_custom_item
      ADD CONSTRAINT raid_custom_item_shovel_ok CHECK (
        NOT is_shovel OR (NOT is_potion AND NOT magic_chest)
      ) NOT VALID;
  END IF;
END $$;

-- 2. Мешочки. id = 'lb_' || md5(ключ выпадения): повтор моста не роняет второй.
--    buried_at IS NOT NULL — бугорок. dropped_by — чья добыча не влезла,
--    source — откуда ('object' — сундук/монетка/кучка, 'boss', 'decor').
--    Своего срока у мешочка нет: он жив, пока жива хоть одна порция.
CREATE TABLE IF NOT EXISTS yuplink.raid_loot_bag (
  id          text        PRIMARY KEY,
  map_id      text        NOT NULL,
  q           int         NOT NULL,
  r           int         NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  buried_at   timestamptz,
  buried_by   text,
  dropped_by  text,
  source      text        NOT NULL,
  source_name text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- «Мешочки рядом» — диапазон клеток «второго обзора» по индексу карты.
CREATE INDEX IF NOT EXISTS raid_loot_bag_cell ON yuplink.raid_loot_bag (map_id, q, r);

-- 3. Содержимое порциями: вид + сколько + свой срок, с метками происхождения
--    (ПРАВИЛА §8.18) — собранное остаётся собранным, купленное купленным.
--    Порции одного вида сливаются только с одинаковым сроком (ключ). Внешний
--    ключ без CASCADE: мешочек удаляется только пустым, явным оператором сборщика.
CREATE TABLE IF NOT EXISTS yuplink.raid_loot_bag_item (
  bag_id      text        NOT NULL REFERENCES yuplink.raid_loot_bag (id),
  stack_key   text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  kind        text        NOT NULL,
  ref_id      text,
  item_id     text,
  name        text        NOT NULL,
  image       text,
  count       numeric     NOT NULL,
  mob_count   numeric     NOT NULL DEFAULT 0,
  mine_count  numeric     NOT NULL DEFAULT 0,
  field_count numeric     NOT NULL DEFAULT 0,
  loot_count  numeric     NOT NULL DEFAULT 0,
  PRIMARY KEY (bag_id, stack_key, expires_at)
);
-- Сборщик берёт сгоревшие порции.
CREATE INDEX IF NOT EXISTS raid_loot_bag_item_expires
  ON yuplink.raid_loot_bag_item (expires_at);

-- 4. Ключи нажатий: забрать (kind 'take', state 'taken' → 'done' | 'undone'),
--    положить ('put', 'done'), закопать и выкопать ('bury' / 'dig', 'done' |
--    'failed'). Повтор того же нажатия видит ключ и второй раз ничего не
--    делает; у «забрать» здесь же сколько снято, с какими метками, из каких
--    порций (parts: срок, штуки, метки) и в чей рюкзак (hero_id) — откат вернёт
--    ровно это в те же порции, а зависшее снятие (сбой базы между снятием и
--    выдачей) сборщик развяжет сам: выдачи не было — назад, была — закрыть.
CREATE TABLE IF NOT EXISTS yuplink.raid_loot_bag_op (
  op         text        PRIMARY KEY,
  bag_id     text        NOT NULL,
  account_id text        NOT NULL,
  hero_id    text,
  kind       text        NOT NULL,
  stack_key  text,
  qty        numeric     NOT NULL DEFAULT 0,
  mob        numeric     NOT NULL DEFAULT 0,
  mine       numeric     NOT NULL DEFAULT 0,
  field      numeric     NOT NULL DEFAULT 0,
  loot       numeric     NOT NULL DEFAULT 0,
  parts      jsonb,
  state      text        NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
-- Уборка ключей старше двух суток (сборщик).
CREATE INDEX IF NOT EXISTS raid_loot_bag_op_at ON yuplink.raid_loot_bag_op (at);
-- Снятия в полёте: сборщику (зависшие) и «закопать» (ждёт их развязки).
CREATE INDEX IF NOT EXISTS raid_loot_bag_op_taken
  ON yuplink.raid_loot_bag_op (bag_id) WHERE state = 'taken';
