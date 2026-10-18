-- Респавн декора (владелец, 28.09.2026): у шаблона декора со «Взаимодействием»
-- поле «Респавн, мин» (meta.interact.respawnMin, src/lib/raid/decorInteract.ts).
-- Срубили — через N минут тот же декор встаёт на ту же клетку.
--
-- Здесь очередь возвратов: одна строка на клетку («вернуть декор decor_id на
-- клетку (q, r) карты map_id в момент due_at»). Пишет её рубка
-- (decor-interact.ts), разбирает фоновый сборщик раз в минуту
-- (src/server/api/beta-raid/decor-respawn.ts).
--
-- terrain_id … group_id — клетка в момент рубки. Админ поменял клетку
-- (местность, дорога, постройка, блок, новый объект или уже поставил декор) —
-- возврат не перетирает, строка снимается. Игрок, корабль, беглец или сундук на
-- клетке — возврат ждёт (due_at сдвигается на минуту: ждущие не душат очередь).
--
-- placed_at — декор уже встал, осталось разослать клетку игрокам (журнал
-- карты). Строка уходит только после рассылки: потерянный ответ моста или
-- упавшая рассылка не оставят «невидимой стены» — следующий проход дошлёт.
--
-- Только добавляет таблицу; идемпотентно. Шаблоны без respawnMin сюда ничего не
-- пишут: срубленное исчезает навсегда, как раньше.
CREATE TABLE IF NOT EXISTS yuplink.raid_decor_respawn (
  map_id      text        NOT NULL,
  q           int         NOT NULL,
  r           int         NOT NULL,
  decor_id    text        NOT NULL,          -- mystic_item_template.id (kind = 'decoration')
  due_at      timestamptz NOT NULL,          -- когда вернуть
  terrain_id  text,                          -- клетка в момент рубки
  road_id     text,
  building_id text,
  object_id   text,
  group_id    text,
  placed_at   timestamptz,                   -- декор встал, рассылка ещё не прошла
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, q, r)
);
ALTER TABLE yuplink.raid_decor_respawn ADD COLUMN IF NOT EXISTS placed_at timestamptz;

-- Сборщик берёт созревшие (due_at <= now(), ещё не вставшие) и недосланные.
CREATE INDEX IF NOT EXISTS raid_decor_respawn_due ON yuplink.raid_decor_respawn (due_at);
CREATE INDEX IF NOT EXISTS raid_decor_respawn_placed
  ON yuplink.raid_decor_respawn (placed_at) WHERE placed_at IS NOT NULL;
