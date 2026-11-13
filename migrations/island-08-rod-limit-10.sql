-- Остров новичка (владелец, 21.10.2026, вечер): «если много мастерских — верни
-- лимит на 10 удок». Удочки продают мастерская и магазины трёх городов — у каждой
-- лавки 10 в сутки. Возвращает island-07 (20) и магазины, записанные с 20.
UPDATE yuplink.raid_market_item
   SET per_account_limit = 10
 WHERE map_id LIKE 'isle\_%' AND ref_id = 'cst_rew3z8sxs897' AND side = 'buy'
   AND per_account_limit IS DISTINCT FROM 10;
