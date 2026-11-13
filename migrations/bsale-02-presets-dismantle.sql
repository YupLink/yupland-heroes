-- Продажа построек, шаг 2 (владелец, 05.11.2026): «систему с шаблонами нужно
-- использовать сразу же», «плавильня не работает», «все здания что продаются —
-- сразу улучшенные — так нельзя», «самому можно разобрать свою постройку,
-- забрав 50 % стоимости».
--
--  · raid_building_preset — шаблон постройки: снимок настроенной на карте клетки
--    (шаблон, облик, настройка + витрина лавки / заклинания зачарования / обряды).
--    Один шаблон на клетку-источник: сохранил ещё раз — шаблон обновился.
--  · чертёж несёт снимок витрины (cells) и цену покупки (price);
--  · ключ установки несёт цену (для разбора) и отметку «разобрана» (gone_at);
--  · raid_building_dismantle_op — ключ нажатия «Разобрать» и что вернули.

-- Триггер на горячей таблице клеток — не ждать замка дольше 5 с.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_building_preset (
  id text PRIMARY KEY,
  name text NOT NULL,
  src_map text NOT NULL,
  src_q integer NOT NULL,
  src_r integer NOT NULL,
  building_id text NOT NULL,
  building_skin_id text,
  building_config jsonb,
  cells jsonb,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS raid_building_preset_src
  ON yuplink.raid_building_preset (src_map, src_q, src_r);

ALTER TABLE yuplink.raid_building_blueprint
  ADD COLUMN IF NOT EXISTS cells jsonb,
  ADD COLUMN IF NOT EXISTS price jsonb;

ALTER TABLE yuplink.raid_building_place_op
  ADD COLUMN IF NOT EXISTS price jsonb,
  ADD COLUMN IF NOT EXISTS gone_at timestamptz;

CREATE TABLE IF NOT EXISTS yuplink.raid_building_dismantle_op (
  op text PRIMARY KEY,
  account_id text NOT NULL,
  map_id text NOT NULL,
  q integer NOT NULL,
  r integer NOT NULL,
  place_op text NOT NULL,
  refund jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Возврат забрал ровно один вызов (CAS): предметные строки цены не идемпотентны.
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Постройку убрали или заменили не разбором (режим бога, перенос, перегенерация) —
-- поставивший больше не хозяин: иначе разобрал бы с возвратом уже чужую. Ставка
-- на пустую клетку (NULL → постройка) не трогает: её ключ пишет сама установка.
CREATE OR REPLACE FUNCTION yuplink.raid_building_place_op_gone()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  UPDATE yuplink.raid_building_place_op x SET gone_at = now()
   WHERE x.map_id = OLD.map_id AND x.q = OLD.q AND x.r = OLD.r AND x.gone_at IS NULL;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS raid_map_cells_building_gone ON yuplink.raid_map_cells;
CREATE TRIGGER raid_map_cells_building_gone
  AFTER UPDATE OF building_id ON yuplink.raid_map_cells
  FOR EACH ROW
  WHEN (OLD.building_id IS NOT NULL AND OLD.building_id IS DISTINCT FROM NEW.building_id)
  EXECUTE FUNCTION yuplink.raid_building_place_op_gone();

DROP TRIGGER IF EXISTS raid_map_cells_building_gone_del ON yuplink.raid_map_cells;
CREATE TRIGGER raid_map_cells_building_gone_del
  AFTER DELETE ON yuplink.raid_map_cells
  FOR EACH ROW
  WHEN (OLD.building_id IS NOT NULL)
  EXECUTE FUNCTION yuplink.raid_building_place_op_gone();

-- Цена уже поставленных до этого шага: по товару лавки с тем же содержимым
-- (шаблон, облик, настройка). Не нашёлся (товар сняли) — цены нет, разбор без возврата.
UPDATE yuplink.raid_building_place_op o
   SET price = m.lines
  FROM yuplink.raid_building_blueprint b
  CROSS JOIN LATERAL (
    SELECT jsonb_build_array(jsonb_build_object(
             'resource', mi.price_resource, 'token', mi.price_token, 'amount', mi.price_amount))
           || CASE WHEN mi.price2_resource IS NOT NULL AND COALESCE(mi.price2_amount, 0) > 0
                   THEN jsonb_build_array(jsonb_build_object(
                          'resource', mi.price2_resource, 'token', mi.price2_token,
                          'amount', mi.price2_amount))
                   ELSE '[]'::jsonb END
           || COALESCE(mi.price_more, '[]'::jsonb) AS lines
      FROM yuplink.raid_market_item mi
     WHERE mi.kind = 'building' AND mi.ref_id = b.building_id
       AND COALESCE(mi.building->'config', 'null'::jsonb)
           = COALESCE(b.building_config, 'null'::jsonb)
       AND (mi.building->>'skinId') IS NOT DISTINCT FROM b.building_skin_id
     ORDER BY mi.created_at
     LIMIT 1
  ) m
 WHERE o.blueprint_id = b.id AND o.price IS NULL;

-- Поставленные первым шагом встали сразу последним тиром — владелец: «так нельзя».
-- Только строки, что тир ставила сама установка (updated_by = 'bsale'): улучшенное
-- игроком за плату (updated_by другой) не трогаем.
UPDATE yuplink.beta_raid_building_state
   SET tier = 0, updated_at = now()
 WHERE map_id = 'rmap_builders' AND updated_by = 'bsale' AND tier > 0;
