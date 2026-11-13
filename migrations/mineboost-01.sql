-- Усиление чертежа шахты (владелец 31.10/06.11.2026, lib/mineBoost.ts): уровень
-- усиления на аккаунт и вид чертежа. Оплата — res_move алмазов ключом
-- mboost:<аккаунт>:<вид>:<уровень> тем же оператором, что поднимает уровень.
-- Строки НЕ сбрасывать: ключ уровня уже проведён, повторная покупка после
-- сброса прошла бы даром (res_move вернёт applied=false без списания).
CREATE TABLE IF NOT EXISTS yuplink.account_mine_boost (
  account_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('wood', 'stone', 'gold', 'diamonds')),
  level integer NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 4),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, kind)
);
