-- Награды за друзей (владелец, 22.10.2026): бонус-боксы за вехи и 10 % USDT
-- с подписок друзей. Забираются кнопкой «Забрать» в «Друзьях», без срока.
--
-- НАКАТЫВАТЬ ДО ВЫКАТА КОДА: покупка подписки за USDT пишет сюда долю
-- пригласившего ОДНИМ запросом с подпиской и корзинами (energy-sub/buy-sql.ts);
-- без таблицы такая покупка упадёт и вернёт деньги. «Свободно USDT»
-- (token-free-reserved.ts) читает отсюда неполученное.
--
-- Строка:
--  · box  — веха друзей (1, 3, 5, 10, 15, дальше каждые 15): пак pack_id, одна
--    штука. Ключ повтора source_ref = 'refbox:<аккаунт>:<веха>'. Вехи, оплаченные
--    по старой схеме (users.referral_tier_tickets_granted), код не заводит.
--  · usdt — 10 % USDT-оплаты подписки другом: ключ 'refsub:<подписка>', одна на
--    подписку. Деньги лежат на кошельке проекта и до клейма — обязательство
--    в «Свободно USDT».
-- Клейм — CAS pending → claimed в одном запросе с выдачей: бокс — строка
-- chip_pack_grants (source 'referral', source_ref 'refbox:<id>'), USDT —
-- acc_move вида 'ref_sub' ключом 'refsub:<id>' (на счёт, откуда сразу вывод).
BEGIN;
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.ref_reward (
  id             text PRIMARY KEY,
  account_id     text NOT NULL REFERENCES yuplink.accounts(id),
  kind           text NOT NULL CHECK (kind IN ('box', 'usdt')),
  -- box: сколько засчитанных друзей нужно было для вехи
  milestone      int CHECK (milestone IS NULL OR milestone >= 1),
  pack_id        text REFERENCES yuplink.chip_packs(id),
  token          text,
  amount         numeric(38,8) NOT NULL CHECK (amount > 0),
  -- usdt: кто из друзей купил подписку и какую
  friend_account text,
  sub_id         text UNIQUE REFERENCES yuplink.energy_sub(id),
  source_ref     text NOT NULL UNIQUE,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  claimed_at     timestamptz,
  CONSTRAINT ref_reward_shape CHECK (
    (kind = 'box' AND milestone IS NOT NULL AND pack_id IS NOT NULL AND token IS NULL)
    OR (kind = 'usdt' AND token = 'USDT' AND sub_id IS NOT NULL AND milestone IS NULL)
  )
);

-- Список «ждёт получения» игрока и точка в профиле.
CREATE INDEX IF NOT EXISTS ref_reward_pending_acc
  ON yuplink.ref_reward (account_id, created_at) WHERE status = 'pending';
-- Сумма неполученных USDT для «Свободно USDT».
CREATE INDEX IF NOT EXISTS ref_reward_pending_token
  ON yuplink.ref_reward (token) WHERE status = 'pending' AND kind = 'usdt';

COMMIT;
