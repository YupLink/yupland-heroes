-- Ломбард: наценка перепродажи (владелец, 13.10.2026). Артефакт, сданный в
-- скупку «Любой … артефакт», встаёт на витрину покупки той же лавки по цене
-- выплаты × наценка. Наценка — на лавку, правит админ, по умолчанию ×5.
ALTER TABLE yuplink.raid_market_shop
  ADD COLUMN IF NOT EXISTS pawn_markup numeric NOT NULL DEFAULT 5 CHECK (pawn_markup > 0);

-- Сразу проставить ×5 всем лавкам, которые скупают артефакты по редкости:
-- у кого строки настроек ещё нет — создать её, фильтр торгующих пустой.
INSERT INTO yuplink.raid_market_shop(map_id, q, r, buyer_races, buyer_specs, pawn_markup, updated_at)
SELECT DISTINCT i.map_id, i.q, i.r, '[]'::jsonb, '[]'::jsonb, 5, now()
  FROM yuplink.raid_market_item i
 WHERE i.side = 'sell' AND i.kind = 'art' AND i.ref_id LIKE 'art_any_%'
ON CONFLICT (map_id, q, r) DO NOTHING;
