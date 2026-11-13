-- Ультра +: энергия не тает, пока подписка действует (владелец, 25.10.2026).
-- Применено на проде 25.10 до этого файла; покупок Ультра + ещё не было —
-- снимки energy_sub править не нужно.
UPDATE yuplink.energy_sub_tier SET no_decay = true, updated_at = now() WHERE id = 'esub_ultra';
