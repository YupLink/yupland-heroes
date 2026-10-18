-- Волна 2: позиция на карте и экипаж судна принадлежат аккаунту.
--
-- Позиция раньше ключевалась адресом, а «один игрок — одна фишка на карте»
-- держал триггер, который переписывал любую вставку на канонический кошелёк.
-- Аккаунт делает это свойством ключа, а не поведением триггера.
BEGIN;

ALTER TABLE yuplink.beta_raid_positions DROP CONSTRAINT beta_raid_positions_pkey;
ALTER TABLE yuplink.beta_raid_positions ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE yuplink.beta_raid_positions ALTER COLUMN wallet DROP NOT NULL;
ALTER TABLE yuplink.beta_raid_positions ADD CONSTRAINT beta_raid_positions_pkey PRIMARY KEY (account_id);
DROP TRIGGER IF EXISTS one_actor_per_account ON yuplink.beta_raid_positions;
DROP FUNCTION IF EXISTS yuplink.raid_position_one_per_account() CASCADE;

-- Экипаж: судно занимает аккаунт. Адрес капитана остаётся справочно.
ALTER TABLE yuplink.beta_raid_ship ADD COLUMN IF NOT EXISTS crew_account text;
UPDATE yuplink.beta_raid_ship SET crew_account = yuplink.acc_of(crew_wallet)
 WHERE crew_wallet IS NOT NULL AND crew_account IS NULL;
-- Один игрок — одно судно.
CREATE UNIQUE INDEX IF NOT EXISTS beta_raid_ship_crew_account_uniq
  ON yuplink.beta_raid_ship (crew_account) WHERE crew_account IS NOT NULL;

COMMIT;

-- Эффекты игрока (замедление, ослабления героя) — тоже на аккаунт: раньше у
-- игрока с двумя адресами висели две независимые строки одного эффекта.
BEGIN;
ALTER TABLE yuplink.beta_raid_player_effects ADD COLUMN IF NOT EXISTS account_id text;
UPDATE yuplink.beta_raid_player_effects SET account_id = yuplink.acc_of(wallet)
 WHERE account_id IS NULL AND yuplink.acc_of(wallet) IS NOT NULL;
DELETE FROM yuplink.beta_raid_player_effects WHERE account_id IS NULL;
-- Дубли одного эффекта у одного игрока: оставляем самый долгий.
DELETE FROM yuplink.beta_raid_player_effects e
 USING yuplink.beta_raid_player_effects o
 WHERE e.account_id = o.account_id AND e.kind = o.kind
   AND (o.expires_at, o.id) > (e.expires_at, e.id);
ALTER TABLE yuplink.beta_raid_player_effects ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE yuplink.beta_raid_player_effects ALTER COLUMN wallet DROP NOT NULL;
DROP INDEX IF EXISTS yuplink.beta_raid_player_effects_uq;
CREATE UNIQUE INDEX IF NOT EXISTS beta_raid_player_effects_acc_kind_uniq
  ON yuplink.beta_raid_player_effects (account_id, kind);
COMMIT;
