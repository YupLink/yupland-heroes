-- «Починить всё» (владелец, 05.11.2026): «должно быть сохранение значений, по
-- которым последний раз выбирал человек себе чинить с запасом ниже N». Порог
-- ползунка живёт на аккаунте, рядом с остальным «что игрок выбрал»
-- (account_view, как закладки таверны) — едет с телефона на ПК.
-- NULL / нет строки — по умолчанию 90 % (lib/mineV2 MINE_REPAIR_ALL_BELOW).
-- Колонка без DEFAULT — мгновенно, без перезаписи таблицы. Повтор безвреден.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.account_view
  ADD COLUMN IF NOT EXISTS mine_repair_below numeric
  CHECK (mine_repair_below IS NULL OR (mine_repair_below > 0 AND mine_repair_below <= 1));

COMMIT;
