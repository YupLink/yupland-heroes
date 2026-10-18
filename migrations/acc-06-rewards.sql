-- Волна 3: награды и журналы боёв принадлежат аккаунту.
-- Раньше получателем был «представитель группы» — min(wallet) из тех, кто бил.
-- Если такой адрес отвязывали, награда оставалась висеть на чужом ключе.
BEGIN;

ALTER TABLE yuplink.raid_reward ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE yuplink.raid_reward ALTER COLUMN wallet DROP NOT NULL;
CREATE INDEX IF NOT EXISTS raid_reward_account_idx ON yuplink.raid_reward (account_id)
  WHERE claimed_at IS NULL;

-- Журнал ударов: три строки остались без аккаунта (били адресом, которого нет
-- среди входов) — им заводим аккаунт-сироту, чтобы урон не выпал из зачёта.
INSERT INTO yuplink.accounts (id, telegram_id)
SELECT DISTINCT 'acc_w' || substr(md5(r.wallet), 1, 16), NULL::bigint
  FROM yuplink.beta_raid_object_run r
 WHERE r.account_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE yuplink.beta_raid_object_run r
   SET account_id = COALESCE(yuplink.acc_of(r.wallet), 'acc_w' || substr(md5(r.wallet), 1, 16))
 WHERE r.account_id IS NULL;

ALTER TABLE yuplink.beta_raid_object_run ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE yuplink.chip_boss_run ALTER COLUMN account_id SET NOT NULL;

COMMIT;
