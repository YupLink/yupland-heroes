-- Баффы игрока живут КАЖДЫЙ в СВОЕЙ строке (два заклинания на атаку — две
-- независимые строки со своим expires_at и value). Дебаффы (weak_*, slow) и
-- остальные виды по-прежнему одна строка на (account_id, kind) с средним по
-- времени. UNIQUE-индекс перебиваем на partial: он теперь исключает kind LIKE
-- 'buff_%'.
BEGIN;
DROP INDEX IF EXISTS yuplink.beta_raid_player_effects_acc_kind_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS beta_raid_player_effects_acc_kind_uniq
  ON yuplink.beta_raid_player_effects (account_id, kind)
  WHERE kind NOT LIKE 'buff_%';
COMMIT;
