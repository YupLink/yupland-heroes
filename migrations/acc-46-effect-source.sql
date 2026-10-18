-- Источник эффекта: кто повесил дебафф (имя цели/стража шахты).
--
-- Жалоба Oleg Repin: «дебафф от мобов, у которых его нет в описании» —
-- проверить было нечем: в строках эффектов не хранилось, от кого они.
-- Колонка nullable, старые строки остаются без источника; код пишет её
-- на каждом наложении (encounter-effects.applyPlayerEffect, chip-effects).
--
-- Идемпотентно. Применять ДО выката кода: INSERT с колонкой source на
-- старой схеме падает (побочки боя тихо не лягут, удар при этом засчитан).
-- Таблицы горячие (эффекты читаются на каждом шаге): ALTER ждёт замок не дольше
-- 5 с, чтобы не выстроить за собой очередь шагов; не успел — повторить.
BEGIN;
SET lock_timeout = '5s';
ALTER TABLE yuplink.beta_raid_player_effects ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE yuplink.chip_effects ADD COLUMN IF NOT EXISTS source text;
COMMIT;
