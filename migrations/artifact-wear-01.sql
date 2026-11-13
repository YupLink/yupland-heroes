-- Износ артефактов (владелец, 22.10.2026): «по артам и их хп — утверждаю».
-- Срок службы — боёв до поломки: Обычный 100, Редкий 125, Эпический 160,
-- Легендарный 200. Одно нажатие «Атаковать» изнашивает всё, что надето на
-- дерущегося героя. На нуле артефакт сломан: остаётся у игрока и на герое, но
-- ничего не даёт. Правило — src/lib/hero/artWear.ts, SQL удара —
-- src/server/api/beta-raid/art-wear-hit.ts.
--
-- Только добавляет (плюс п. 4 — дописывает wear в старые снимки ломбарда).
-- Идемпотентно — повтор безвреден. Накатывать СТРОГО ДО кода: код читает
-- user_game_item.wear в каждом бою и в окне героя; без колонки hero-load молча
-- отдаёт героя БЕЗ надетого (бой без артефактов), а маркет-арты, аукцион
-- артефактов и клейм подарка-артефакта падают.
-- Старые строки: wear 0 — все имеющиеся артефакты стартуют со 100 %.
--
-- ALTER берёт ACCESS EXCLUSIVE: чужой лок ждём не дольше 5 с (как decor-03),
-- иначе все записи в инвентарь встали бы в очередь за миграцией. Отказ — файл
-- просто прогнать ещё раз. Готово, когда есть колонки user_game_item.wear,
-- player_gift.item_wear, ограничение user_game_item_wear_ok и таблица
-- art_wear_op.
SET lock_timeout = '5s';

-- 1. Износ живёт в САМОМ предмете: сколько процентов уже снято (0 — целый,
--    100 — сломан). Переходит вместе с предметом: строка та же.
ALTER TABLE yuplink.user_game_item
  ADD COLUMN IF NOT EXISTS wear numeric NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_game_item_wear_ok'
       AND conrelid = 'yuplink.user_game_item'::regclass
  ) THEN
    ALTER TABLE yuplink.user_game_item
      ADD CONSTRAINT user_game_item_wear_ok CHECK (wear >= 0 AND wear <= 100) NOT VALID;
  END IF;
END $$;

-- 2. Ключ каждого удара. Мост к базе повторяет запрос вслепую: повтор найдёт
--    ключ и износ второй раз не снимет. Ключи героя старше суток убирает сам
--    удар (art-wear-hit.ts).
CREATE TABLE IF NOT EXISTS yuplink.art_wear_op (
  op      text        PRIMARY KEY,
  hero_id text        NOT NULL,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS art_wear_op_hero_at ON yuplink.art_wear_op (hero_id, at);

-- 3. Подарок-артефакт с аукциона несёт износ проданного предмета: победитель
--    получает его таким, каким выставил продавец. NULL — новый, 100 %.
ALTER TABLE yuplink.player_gift
  ADD COLUMN IF NOT EXISTS item_wear numeric;

-- 4. Снимки ломбарда героев (pawn-heroes-01), снятые ДО этой миграции, не
--    знают колонки wear. Откат сделки вставляет копию героя через
--    jsonb_populate_record (hero-pawn-sql.restoreHeroSql): без ключа wear там
--    явный NULL, NOT NULL его не пустит — и герой не вернулся бы. Дописываем 0
--    (износа до миграции не было). Снимки после миграции поле уже несут.
--    На 22.10 таблица пуста; повтор безвреден.
DO $$
BEGIN
  IF to_regclass('yuplink.pawn_hero_take') IS NOT NULL THEN
    UPDATE yuplink.pawn_hero_take SET item = item || '{"wear": 0}'::jsonb
     WHERE NOT (item ? 'wear');
  END IF;
END $$;
