-- Тренировочный пак острова новичка (владелец, 14.10.2026): награда хомяка,
-- открывается в «Паки» как обычный, но даёт 3 тренировочные фишки
-- (chips-pack-open → island-pack). Не продаётся: active = false (в витринах
-- его нет), market_hidden. drop_table пустой — фишки коллекций он не выдаёт.
INSERT INTO yuplink.chip_packs
  (id, name, description, cover_image_url, kind, drop_table, active, market_hidden, daily_limit)
VALUES
  ('cp_island_training', 'Тренировочный пак',
   '3 тренировочные фишки 1–3★: бьются вполсилы, не продаются.',
   '/uploads/tasks/FjYH7fwpUl.webp', 'standard',
   '{"slots": 3, "dropTable": [], "training": true}'::jsonb, false, true, 5)
ON CONFLICT (id) DO NOTHING;
