-- Генератор артефактов (владелец, 08.11.2026; ПРАВИЛА §8.122).
-- Задания игроков живут в той же artifact_craft, что лаборатория (§8.81):
-- kind = 'gen', клетка генератора, снимок уплаченной цены и отметка возврата
-- (не вышло — цена возвращается сама, один раз).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE yuplink.artifact_craft
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'lab',
  ADD COLUMN IF NOT EXISTS map_id text,
  ADD COLUMN IF NOT EXISTS q integer,
  ADD COLUMN IF NOT EXISTS r integer,
  ADD COLUMN IF NOT EXISTS paid jsonb,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS artifact_craft_gen_idx
  ON yuplink.artifact_craft (account_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS artifact_craft_refund_idx
  ON yuplink.artifact_craft (account_id)
  WHERE kind = 'gen' AND status = 'failed' AND refunded_at IS NULL;

COMMIT;
