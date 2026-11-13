-- Жила из лавки (владелец, 29.10.2026; lib/veinPlace): ключ нажатия «положить
-- жилу» — повтор того же нажатия вторую жилу не кладёт и вторую штуку из стопки
-- vein:<вид> не берёт (vein-place-sql). По ключу же сервер досылает рассылку
-- клетки, если ответ первого нажатия потерялся (vein-place): поэтому здесь
-- карта, клетка, вид и поворот.
--
-- Сами жилы — прежняя yuplink.raid_map_vein (minev2-30): игрок кладёт туда ту
-- же строку, что раскладка. Новых столбцов там нет — снимок и шахты читают её
-- как раньше.
--
-- Накатывать ДО кода: укладка пишет в эту таблицу тем же оператором.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS yuplink.raid_vein_place_op (
  op          text PRIMARY KEY,
  account_id  text NOT NULL,
  map_id      text NOT NULL,
  q           integer NOT NULL,
  r           integer NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('gold', 'diamonds')),
  rot         smallint NOT NULL CHECK (rot IN (0, 60, 120, 180, 240, 300)),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raid_vein_place_op_map_idx
  ON yuplink.raid_vein_place_op (map_id, created_at DESC);
-- Как у соседних таблиц-ключей (raid_land_place_op): владелец — роль приложения.
ALTER TABLE yuplink.raid_vein_place_op OWNER TO postgres;
GRANT SELECT ON yuplink.raid_vein_place_op TO secretary_bot_ro;
COMMIT;
