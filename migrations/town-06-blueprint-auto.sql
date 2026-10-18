-- Шаблоны городов: автоподбор органического роста.
--
-- Владелец, 25.09.2026: «нужно, чтобы ты рандомно делал подборки, и чтобы
-- предустановки расставлялись автоматически». Готовые шаблоны теперь хранят не
-- состав, а масштаб и тему: сколько построек и из какого набора обликов.
-- Состав тянется жребием от сида (docs/town-generation-algorithm.json, шаг 1).
--
-- Старые строки — ручные наборы владельца: auto = false по умолчанию, иначе
-- автоподбор затёр бы их состав. Код читает колонки через to_jsonb и пишет
-- отдельным UPDATE (zonegen/blueprints.ts), так что до наката этой миграции
-- панель работает, просто автоподбор своих шаблонов не запоминается.
BEGIN;

ALTER TABLE yuplink.raid_town_blueprint
  ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false,
  -- Сколько построек в поселении при автоподборе (3..40, как в рецепте).
  ADD COLUMN IF NOT EXISTS buildings integer NOT NULL DEFAULT 12,
  -- Слово из имён обликов («Юпик», «Кабан»); пусто — жребий от сида.
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT '',
  -- Заказ состава: auto | camp | hamlet | village | town | port.
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'auto';

COMMIT;
