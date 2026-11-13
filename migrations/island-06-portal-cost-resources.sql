-- Починка портала острова (Архан через владельца, 19.10.2026): «портал починка
-- 100 дерева / 10 камней / 50 золота / 2 алмаза» — ресурсы счёта, а не товары
-- рюкзака (было: 2 бревна дуба, 2 пыльцы, 1 слиток). Меняется только список
-- оплаты первого тира шаблона; остальное мета — как на проде (снято 20.10).
-- Тиры читаются из шаблона — новая цена сразу у всех островов.
UPDATE yuplink.mystic_item_template
   SET meta = jsonb_set(meta, '{tiers,0,costs}', '[
     {"resource": "wood", "amount": 100, "token": null},
     {"resource": "stone", "amount": 10, "token": null},
     {"resource": "gold", "amount": 50, "token": null},
     {"resource": "diamonds", "amount": 2, "token": null}
   ]'::jsonb)
 WHERE id = 'building_island_portal';
