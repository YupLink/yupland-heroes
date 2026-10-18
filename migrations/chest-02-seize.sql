-- Магический сундук, правило владельца 27.09.2026 (вторая редакция): победа
-- над охраной сразу открепляет сундук от сети. Добыча ждёт выбора победителя
-- в журнале грабежа: claimed_at IS NULL — ещё не выбрано.
ALTER TABLE yuplink.raid_chest_plunder
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_op text;
CREATE INDEX IF NOT EXISTS raid_chest_plunder_pending
  ON yuplink.raid_chest_plunder (raider_account) WHERE claimed_at IS NULL;

-- Грабежи первой редакции уже разобраны (v1 выдавал добычу сразу, не влезшее
-- сгорало) — закрываем их, иначе новый код принял бы их за невыбранные и выдал
-- второй раз. Добыча второй редакции всегда несёт сам сундук (chest: true),
-- поэтому повторный прогон после выката живые невыбранные добычи не тронет.
UPDATE yuplink.raid_chest_plunder
   SET claimed_at = at, claim_op = 'v1'
 WHERE claimed_at IS NULL
   AND NOT (items @> '[{"chest": true}]'::jsonb);
