-- Рецепт лавки (владелец, 04.11.2026; ПРАВИЛА §8.104): товар kind='recipe' —
-- игрок платит ценой позиции, получает ОДИН исход по шансам. Исходы с долями
-- лежат здесь: [{id, kind, refId, amount, name, image, pct}] (lib/marketRecipe).
ALTER TABLE yuplink.raid_market_item ADD COLUMN IF NOT EXISTS outcomes jsonb;
