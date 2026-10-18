-- Предел кассы ратуши — обратно (владелец, 16.10.2026, вечер: «по ратушам то, что было
-- до этого — возвращай назад»). Скупка ратуши — только из кассы, пусто — «У ратуши нет
-- денег». За время без предела в минус ушла одна касса (Yup Vegas, −813,60) — обнулена
-- записью fix:2026-10-16:limit-back:… Выключить предел снова — town_cash_limit = 'off'.
INSERT INTO yuplink.raid_town_cash_move (ref, map_id, q, r, delta, after)
SELECT 'fix:2026-10-16:limit-back:' || map_id || ':' || q || ',' || r, map_id, q, r, -gold, 0
  FROM yuplink.raid_town_cash WHERE gold < 0
ON CONFLICT (ref) DO NOTHING;
UPDATE yuplink.raid_town_cash SET gold = 0, updated_at = now() WHERE gold < 0;
ALTER TABLE yuplink.raid_town_cash DROP CONSTRAINT IF EXISTS raid_town_cash_gold_check;
ALTER TABLE yuplink.raid_town_cash ADD CONSTRAINT raid_town_cash_gold_check CHECK (gold >= 0);
INSERT INTO yuplink.settings (key, value) VALUES ('town_cash_limit', 'on')
  ON CONFLICT (key) DO UPDATE SET value = 'on';
