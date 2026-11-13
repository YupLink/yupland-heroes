-- Стартовая энергия новичка = максимум (владелец, 25.10.2026: «на старте у новых игроков должно быть
-- максимум энергии — если 200, то 200 со старта»). Строки энергии заводят energy_touch_acc / energy_add_acc
-- (обе уже кладут 200 из 200 — 6bf9cffd); здесь — запасное значение колонки, было 30. Применено 25.10.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.user_energy ALTER COLUMN energy SET DEFAULT 200;
COMMIT;
