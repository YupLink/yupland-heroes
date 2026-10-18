-- Прочность инструмента (владелец, 28.09.2026): у своего товара настройка
-- «Износ за удар, %». Пусто — ломается с первого раза, как было («1 топор =
-- 1 декор»). Задано (например 25) — у инструмента 100 % прочности, каждая
-- рубка −25 %; дошла до нуля — штука сломалась, из стопки ушла 1 шт.,
-- следующая начинает со 100 %. Правило — src/lib/raid/toolWear.ts, SQL —
-- src/server/api/beta-raid/tool-wear.ts.
--
-- Только добавляет: две колонки с умолчанием, ограничение на новую колонку и
-- таблицу ключей. Идемпотентно. Старые строки: tool_wear NULL («сразу»),
-- wear 0 («все штуки целые») — всё работает как раньше.
--
-- ALTER берёт ACCESS EXCLUSIVE на рюкзак: чужой лок ждём не дольше 5 с (как
-- origin-01), иначе все записи в рюкзак встали бы в очередь за миграцией.
-- Отказ — файл просто прогнать ещё раз; готово, когда есть колонки
-- raid_hero_backpack.wear и raid_custom_item.tool_wear, оба ограничения
-- (raid_hero_backpack_worn_stays, raid_custom_item_tool_wear_ok) и
-- таблица raid_tool_wear_op.
SET lock_timeout = '5s';

-- 1. Износ за удар, % (целое 1…100). NULL — ломается с первого удара.
--    Магический сундук инструментом с износом быть не может: его ставят на
--    карту списанием целой штуки (chest-place-sql.ts, DELETE последней), и
--    изношенная ушла бы в сундук целой.
ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS tool_wear numeric;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'raid_custom_item_tool_wear_ok'
       AND conrelid = 'yuplink.raid_custom_item'::regclass
  ) THEN
    ALTER TABLE yuplink.raid_custom_item
      ADD CONSTRAINT raid_custom_item_tool_wear_ok CHECK (
        tool_wear IS NULL OR (tool_wear BETWEEN 1 AND 100 AND NOT magic_chest)
      ) NOT VALID;
  END IF;
END $$;

-- 2. Прочность живёт у СТОПКИ в рюкзаке героя: сколько процентов уже снято с
--    текущей штуки. 0 — все штуки целые.
ALTER TABLE yuplink.raid_hero_backpack
  ADD COLUMN IF NOT EXISTS wear numeric NOT NULL DEFAULT 0;

-- 3. «Починить» переносом нельзя: изношенная штука из рюкзака не уходит.
--    Продажа, склад, маркет, оплата и выброс забирают только целые — база не
--    даёт опустить стопку с износом ниже одной штуки. Уничтожить стопку целиком
--    (выбросить всё) можно: это DELETE, а не перенос. NOT VALID — прежние строки
--    не перепроверяются (у всех wear = 0), новые записи проверяются.
--    ⚠️ DELETE ограничение не видит: путь, удаляющий строку рюкзака целиком,
--    обязан сам не брать строку с wear > 0 (см. ПРАВИЛА §8.19).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'raid_hero_backpack_worn_stays'
       AND conrelid = 'yuplink.raid_hero_backpack'::regclass
  ) THEN
    ALTER TABLE yuplink.raid_hero_backpack
      ADD CONSTRAINT raid_hero_backpack_worn_stays CHECK (wear = 0 OR count >= 1) NOT VALID;
  END IF;
END $$;

-- 4. Ключ каждой рубки. Мост к базе повторяет запрос вслепую: повтор найдёт
--    ключ и прочность второй раз не снимет. taken / mob_taken — сколько снял
--    удар и сколько штук «с мобов» ушло с поломкой: откат (сбой после
--    списания) возвращает ровно это. Откат ключ не удаляет, а ставит undone:
--    опоздавшая попытка удара увидит ключ и ничего не снимет. settled — рубка
--    прошла. Пока рубка тем же инструментом не прошла и не откатилась, второй
--    удар им не бьёт (до 30 с): откат всегда точная обратная операция.
CREATE TABLE IF NOT EXISTS yuplink.raid_tool_wear_op (
  op         text        PRIMARY KEY,
  hero_id    text        NOT NULL,
  stack_key  text        NOT NULL,
  taken      numeric     NOT NULL,
  mob_taken  numeric     NOT NULL DEFAULT 0,
  undone     boolean     NOT NULL DEFAULT false,
  settled    boolean     NOT NULL DEFAULT false,
  at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE yuplink.raid_tool_wear_op
  ADD COLUMN IF NOT EXISTS settled boolean NOT NULL DEFAULT false;
-- Рубка «в деле» ищется по стопке героя среди незакрытых ключей.
CREATE INDEX IF NOT EXISTS raid_tool_wear_op_live
  ON yuplink.raid_tool_wear_op (hero_id, stack_key) WHERE NOT settled AND NOT undone;
-- Уборка ключей героя старше суток.
CREATE INDEX IF NOT EXISTS raid_tool_wear_op_hero_at ON yuplink.raid_tool_wear_op (hero_id, at);
