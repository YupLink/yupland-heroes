-- Ингредиенты цены товара лавки (владелец, 04.11.2026; ПРАВИЛА §8.104 п. 1а):
-- до пяти — первая и вторая цена своими колонками, ещё до трёх здесь:
-- [{resource, token, amount}] (lib/marketPrices). Платят всеми разом.
ALTER TABLE yuplink.raid_market_item
  ADD COLUMN IF NOT EXISTS price_more jsonb NOT NULL DEFAULT '[]'::jsonb;
