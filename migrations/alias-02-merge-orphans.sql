-- Свести сирот витрины с шаблонами справочника.
--
-- Позиции маркета без шаблона (ref_id IS NULL) выдавали товар под ключом самой
-- позиции: «Помидор» с одной витрины стал отдельным предметом от «Помидоров»
-- из справочника. Здесь три вещи разом:
--   1) связки в item_alias — чтобы старые ключи всюду читались как канон;
--   2) ref_id у самих позиций — чтобы НОВЫЕ выдачи сразу шли в канон;
--   3) слияние уже разъехавшихся стеков в рюкзаках, с суммой количеств.

-- 1. Связки: сирота → шаблон с той же основой имени.
INSERT INTO yuplink.item_alias (kind, from_ref, to_ref, note)
SELECT DISTINCT 'custom', m.id, c.id, 'сирота витрины → шаблон справочника'
  FROM yuplink.raid_market_item m
  JOIN yuplink.raid_custom_item c
    ON lower(regexp_replace(regexp_replace(c.name, 'ё', 'е', 'g'), '(ы|и|а|я|ов|ей)$', ''))
     = lower(regexp_replace(regexp_replace(m.name, 'ё', 'е', 'g'), '(ы|и|а|я|ов|ей)$', ''))
 WHERE m.kind = 'custom' AND m.ref_id IS NULL
ON CONFLICT (kind, from_ref) DO NOTHING;

-- 2. Сами позиции теперь ссылаются на шаблон.
UPDATE yuplink.raid_market_item m
   SET ref_id = a.to_ref
  FROM yuplink.item_alias a
 WHERE a.kind = 'custom' AND a.from_ref = m.id AND m.ref_id IS NULL;

-- 3. Слияние стеков: количество канонического растёт на количество сироты.
UPDATE yuplink.raid_hero_backpack dst
   SET count = dst.count + src.total, updated_at = now()
  FROM (
    SELECT b.hero_id, 'custom:' || a.to_ref AS to_key, SUM(b.count) AS total
      FROM yuplink.raid_hero_backpack b
      JOIN yuplink.item_alias a
        ON a.kind = 'custom' AND ('custom:' || a.from_ref) = b.stack_key
     GROUP BY 1, 2
  ) src
 WHERE dst.hero_id = src.hero_id AND dst.stack_key = src.to_key;

-- 3b. У кого канонического стека ещё не было — переименовываем сироту.
UPDATE yuplink.raid_hero_backpack b
   SET stack_key = 'custom:' || a.to_ref,
       ref_id = a.to_ref,
       name = COALESCE((SELECT c.name FROM yuplink.raid_custom_item c WHERE c.id = a.to_ref), b.name),
       image = COALESCE((SELECT c.image FROM yuplink.raid_custom_item c WHERE c.id = a.to_ref), b.image),
       updated_at = now()
  FROM yuplink.item_alias a
 WHERE a.kind = 'custom'
   AND b.stack_key = 'custom:' || a.from_ref
   AND NOT EXISTS (
     SELECT 1 FROM yuplink.raid_hero_backpack o
      WHERE o.hero_id = b.hero_id AND o.stack_key = 'custom:' || a.to_ref);

-- 3c. Сирот, чьё содержимое уже влилось в канон, убираем.
DELETE FROM yuplink.raid_hero_backpack b
 USING yuplink.item_alias a
 WHERE a.kind = 'custom' AND b.stack_key = 'custom:' || a.from_ref;
