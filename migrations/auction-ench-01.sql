-- Зачарованные артефакты на аукционе (31.10.2026, §8.87): зачарование экземпляров,
-- взятых в залог лота игрока, едет победителю в подарке и ложится на выданные
-- предметы (gifts-deliver → applyGiftEnchants). Массив {pct, spellId, spellName}.
-- Только новая колонка, NULL у всех прежних подарков.
SET lock_timeout = '3s';
ALTER TABLE yuplink.player_gift ADD COLUMN IF NOT EXISTS item_enchant jsonb;
