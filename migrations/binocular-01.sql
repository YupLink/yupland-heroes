-- Бинокль и лестница (владелец, 08.11.2026; ПРАВИЛА §8.121).
-- Галочки товара: «Применить» из рюкзака. Эффект бинокля — строка
-- beta_raid_player_effects вида 'sight' (одна на аккаунт, уникальный индекс
-- acc_kind уже есть); ключ нажатия — hero_boost_op (как у зелий).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS is_binocular boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_ladder boolean NOT NULL DEFAULT false;

-- Уже продающиеся «Бинокль» и «Лестница» (лавка Мидгарда −9,84).
UPDATE yuplink.raid_custom_item SET is_binocular = true WHERE id = 'cst_o311vlryorg7';
UPDATE yuplink.raid_custom_item SET is_ladder = true WHERE id = 'cst_cm4iv4ahk78x';

COMMIT;
