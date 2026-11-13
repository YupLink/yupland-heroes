-- Цены рыбы в ратушах острова — в 10 раз ниже мировых (владелец, 22.10.2026:
-- «цены рыбы на острове в 10 раз ниже»): обычная 0,02, редкая 1, золотая 5,
-- легендарная 10 золота за штуку при норме (мир: 0,2 / 10 / 50 / 100). Новые
-- острова ставят их сами (lib/raid/island/townFish); здесь — уже созданные, и у
-- рыбы шаблона тоже. Цена абсолютная — повтор безвреден. Склад не трогаем.
UPDATE yuplink.raid_town t
   SET config = jsonb_set(t.config, '{goods}', (
         SELECT jsonb_agg(CASE e.g->>'refId'
                  WHEN 'cst_jkxm6tnvuudp' THEN jsonb_set(e.g, '{marketPrice}', '0.02')
                  WHEN 'cst_a35czzelxztg' THEN jsonb_set(e.g, '{marketPrice}', '1')
                  WHEN 'cst_9ijo78e7wyg0' THEN jsonb_set(e.g, '{marketPrice}', '5')
                  WHEN 'cst_oi7voipk9hz0' THEN jsonb_set(e.g, '{marketPrice}', '10')
                  ELSE e.g END ORDER BY e.ord)
           FROM jsonb_array_elements(t.config->'goods') WITH ORDINALITY AS e(g, ord))),
       updated_at = now()
 WHERE t.map_id LIKE 'isle\_%' AND jsonb_typeof(t.config->'goods') = 'array'
   AND jsonb_array_length(t.config->'goods') > 0;
