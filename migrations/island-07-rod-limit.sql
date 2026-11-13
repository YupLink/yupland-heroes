-- Остров новичка (владелец, 21.10.2026): удочек в мастерской — 20 в сутки (было 10).
-- Новые острова пишут 20 сами (island-write, ISLAND_RECIPES.rod.dayLimit);
-- здесь — уже созданные. Повтор безвреден.
UPDATE yuplink.raid_market_item
   SET per_account_limit = 20
 WHERE map_id LIKE 'isle\_%' AND id = map_id || '_rod' AND per_account_limit IS DISTINCT FROM 20;
