-- Рыбу принимает ратуша острова (владелец, 21.10.2026: «должна принимать рыбу
-- ратуша — а соответственно и маркеты рядом»). Новые острова кладут рыбу в
-- товары ратуш сами (lib/raid/island/townFish); здесь — уже созданные. Определения
-- — самые частые у ратуш мира (шаблоны городов): обычная 0,2 золота за штуку при
-- норме, производство 10/сут; редкая 10, золотая 50, легендарная 100 — по 1/сут;
-- расход 0,02 на жителя (еда). Есть рыба в товарах — не трогаем. Повтор безвреден.
WITH fish(ref, price, prod) AS (
  VALUES ('cst_jkxm6tnvuudp', 0.2, 10), ('cst_a35czzelxztg', 10, 1),
         ('cst_9ijo78e7wyg0', 50, 1), ('cst_oi7voipk9hz0', 100, 1)
)
UPDATE yuplink.raid_town t
   SET config = jsonb_set(
         t.config, '{goods}',
         COALESCE(t.config->'goods', '[]'::jsonb) || (
           SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', 'isle_fish_' || f.ref, 'kind', 'custom', 'refId', f.ref, 'token', NULL,
                    'operation', 'both', 'marketPrice', f.price,
                    'consumePerResident', 0.02, 'producePerDay', f.prod)), '[]'::jsonb)
             FROM fish f
            WHERE NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(t.config->'goods', '[]'::jsonb)) g
               WHERE g->>'refId' = f.ref))),
       updated_at = now()
 WHERE t.map_id LIKE 'isle\_%';
