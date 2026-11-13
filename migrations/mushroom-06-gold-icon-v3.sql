-- Новая картинка золотого гриба (владелец, 23.10.2026: «замени иконку у золотого гриба —
-- в загрузках, там сменилось»). Файл — /uploads/tasks/mushroom-gold-v3.webp (из
-- «золотой гриб.png», обрезан по рисунку с полем 4 px, как v2); новое имя, а не замена
-- v2 — загрузки кэшируются браузером на 7 дней.
--
-- Облик bskin_dm_gold и копии картинки у грибов на карте (raid_dmine), в рюкзаках и
-- мешочках. Снимок карты держит картинку облика в словаре — поколение снимка поднято
-- в коде (mapCache GEN / ASSEMBLY_GEN = 6). Повтор безвреден.
BEGIN;
UPDATE yuplink.raid_building_skin SET image = '/uploads/tasks/mushroom-gold-v3.webp'
 WHERE id = 'bskin_dm_gold' AND image = '/uploads/tasks/mushroom-gold-v2.webp';
UPDATE yuplink.raid_dmine SET image = '/uploads/tasks/mushroom-gold-v3.webp'
 WHERE image = '/uploads/tasks/mushroom-gold-v2.webp';
UPDATE yuplink.raid_hero_backpack SET image = '/uploads/tasks/mushroom-gold-v3.webp'
 WHERE image = '/uploads/tasks/mushroom-gold-v2.webp';
UPDATE yuplink.raid_loot_bag_item SET image = '/uploads/tasks/mushroom-gold-v3.webp'
 WHERE image = '/uploads/tasks/mushroom-gold-v2.webp';
COMMIT;
