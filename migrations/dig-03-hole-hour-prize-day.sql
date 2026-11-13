-- Ямка — час, приз клетки — раз в сутки (владелец 31.10.2026, ПРАВИЛА §8.24 п. 6б):
-- «я сказал как должно быть — час»; «через сутки только после того как одну
-- клетку вскопали — она может дать ещё один приз». Строка ямки хранится сутки,
-- rolled_at — когда клетка последний раз дала бросок находки.
-- Катить ДО кода: новый «Копать» пишет rolled_at.
ALTER TABLE yuplink.raid_dig_hole ADD COLUMN IF NOT EXISTS rolled_at timestamptz;

-- Клетки, вскопанные «Копать» за последние сутки, уже дали бросок.
UPDATE yuplink.raid_dig_hole h
   SET rolled_at = h.dug_at
 WHERE h.rolled_at IS NULL
   AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_op o
                WHERE o.kind = 'ground' AND o.state = 'done'
                  AND o.bag_id = 'ground:' || h.map_id || ':' || h.q || ':' || h.r);
