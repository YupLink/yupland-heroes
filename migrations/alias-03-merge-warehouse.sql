-- То же слияние, но для склада: сироты витрины лежат и там.
--
-- Слот склада ключуется той же строкой `kind:ref`, что и стек рюкзака, поэтому
-- «Помидор» с витрины без шаблона занимал на складе свои слоты и не смешивался
-- с «Помидорами». Сводим по тем же связкам item_alias.

-- 1. Влить количество в канонический слот того же владельца, места и области.
UPDATE yuplink.raid_warehouse_slot dst
   SET count = dst.count + src.total
  FROM (
    SELECT w.map_id, w.q, w.r, w.scope, w.owner_account,
           'custom:' || a.to_ref AS to_key, SUM(w.count) AS total
      FROM yuplink.raid_warehouse_slot w
      JOIN yuplink.item_alias a
        ON a.kind = 'custom' AND ('custom:' || a.from_ref) = w.stack_key
     GROUP BY 1, 2, 3, 4, 5, 6
  ) src
 WHERE dst.map_id = src.map_id AND dst.q = src.q AND dst.r = src.r
   AND dst.scope = src.scope
   AND dst.owner_account IS NOT DISTINCT FROM src.owner_account
   AND dst.stack_key = src.to_key;

-- 2. Где канонического слота не было — переименовываем сироту в канон.
UPDATE yuplink.raid_warehouse_slot w
   SET stack_key = 'custom:' || a.to_ref,
       ref_id = a.to_ref,
       name = COALESCE((SELECT c.name FROM yuplink.raid_custom_item c WHERE c.id = a.to_ref), w.name),
       image = COALESCE((SELECT c.image FROM yuplink.raid_custom_item c WHERE c.id = a.to_ref), w.image)
  FROM yuplink.item_alias a
 WHERE a.kind = 'custom'
   AND w.stack_key = 'custom:' || a.from_ref
   AND NOT EXISTS (
     SELECT 1 FROM yuplink.raid_warehouse_slot o
      WHERE o.map_id = w.map_id AND o.q = w.q AND o.r = w.r AND o.scope = w.scope
        AND o.owner_account IS NOT DISTINCT FROM w.owner_account
        AND o.stack_key = 'custom:' || a.to_ref);

-- 3. Осевшие пустышки-сироты убираем.
DELETE FROM yuplink.raid_warehouse_slot w
 USING yuplink.item_alias a
 WHERE a.kind = 'custom' AND w.stack_key = 'custom:' || a.from_ref;

-- 4. Подписи слотов — из справочника: один товар, одно имя.
UPDATE yuplink.raid_warehouse_slot w
   SET name = c.name, image = COALESCE(c.image, w.image)
  FROM yuplink.raid_custom_item c
 WHERE w.stack_key = 'custom:' || c.id AND w.name <> c.name;
