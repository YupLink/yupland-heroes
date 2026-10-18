-- Один юпик прихожей на игрока: правило держит сама база, а не перебор адресов.
CREATE UNIQUE INDEX IF NOT EXISTS hallway_yupiks_account_uniq
  ON yuplink.hallway_yupiks (account_id) WHERE account_id IS NOT NULL;
