-- Остров новичка (владелец, 14.10.2026 вечер): «портал какой-то левый — возьми
-- тот, что уже был в игре, в виде сломанного; и чтобы вид менялся». Руины —
-- тот же «Портал» (E4hVRf4o2l, 32 штуки на Альфе) с отбитыми камнями арки и
-- погасшим треснувшим проёмом; после починки тир 2 — сам «Портал». Накатано 14.10.
UPDATE yuplink.mystic_item_template
   SET image_url = '/uploads/tasks/island-portal-broken.webp',
       meta = jsonb_set(meta, '{tiers,0,imageUrl}', '"/uploads/tasks/island-portal-broken.webp"')
 WHERE id = 'building_island_portal';
