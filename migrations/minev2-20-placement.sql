-- Шахты v2 — постановка шахты из заготовки (ПРАВИЛА §8.59.8).
--
-- 1. Явные метки «дерево» / «гора» у шаблонов декора — колонка nature в
--    существующих метках ассетов (raid_asset_tags, migrations/tags-01). Админ
--    правит её галочкой в том же окне меток (AdminTagChecks). Первичная
--    разметка — ОДИН раз, когда колонка появляется (повторный прогон её не
--    повторяет и снятые админом метки не возвращает):
--      · дерево — инструмент взаимодействия «…Топор» или имя дерева
--        («Дерево …», «Древо …», ель/ёлка, пальма, дуб, баобаб, лиственница,
--        яблоня) — §8.59.8: «сейчас узнаются по инструменту и названию»;
--      · гора — имя со словом «гора/горы» (не «город») или кирка, дающая камень.
--    Автоматика меток (asset-tags-auto) колонку не трогает.
-- 2. raid_nature_around(map, q, r) — сколько деревьев и гор на шести соседних
--    клетках. Гора — ещё и местность «Горы» / «Высокогорье». Декор без живого
--    шаблона не считается. Одна клетка — один раз (гора-декор на «Горах» — одна).
-- 3. raid_mine_place_op — ключ нажатия «Поставить»: лежит только вместе с
--    шахтой, повтор того же нажатия вторую шахту не ставит. sent_at — дельта
--    клетки записана в журнал карты; без него постановку досылает минутный
--    цикл сервера (mine-place-resend), как возврат декора.
--
-- Колонки mode / life_left / life_at / accrue_from у raid_mine_state заводит
-- minev2-01 (engine) — постановка пишет их, поэтому идёт после неё. Идемпотентно.
BEGIN;
SET lock_timeout = '5s';

-- ── 1. Метка природы + первичная разметка (только при появлении колонки).
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'yuplink' AND table_name = 'raid_asset_tags' AND column_name = 'nature'
  ) THEN
    ALTER TABLE yuplink.raid_asset_tags ADD COLUMN nature text;
    ALTER TABLE yuplink.raid_asset_tags ADD CONSTRAINT raid_asset_tags_nature_check
      CHECK (nature IS NULL OR nature IN ('tree', 'mountain'));

    WITH d AS (
      SELECT t.id, t.name,
             CASE WHEN jsonb_typeof(t.meta->'interact') = 'object'
                  THEN t.meta->'interact' ELSE '{}'::jsonb END AS ia
        FROM yuplink.mystic_item_template t
       WHERE t.kind = 'decoration'
    ), tool AS (
      SELECT d.id, ci.name
        FROM d
        CROSS JOIN LATERAL (
          SELECT x.v FROM jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(d.ia->'toolItemIds') = 'array'
                        THEN d.ia->'toolItemIds' ELSE '[]'::jsonb END) AS x(v)
          UNION
          SELECT d.ia->>'toolItemId'
        ) AS tid(v)
        JOIN yuplink.raid_custom_item ci ON ci.id = tid.v
    ), mark AS (
      SELECT d.id,
             CASE
               WHEN EXISTS (SELECT 1 FROM tool WHERE tool.id = d.id AND tool.name ~* 'топор')
                 THEN 'tree'
               WHEN d.name ~* '(дерев|древо|(^|[^а-яё])ел(ь|ка|ки|и)([^а-яё]|$)|пальм|(^|[^а-яё])дуб|баобаб|лиственниц|яблон)'
                 THEN 'tree'
               WHEN d.name ~* '(^|[^а-яё])гор(а|ы|у|е|ой|ный|ная|ное|ные)?([^а-яё]|$)'
                 THEN 'mountain'
               WHEN EXISTS (SELECT 1 FROM tool WHERE tool.id = d.id AND tool.name ~* 'кирк')
                AND EXISTS (SELECT 1 FROM yuplink.raid_custom_item it
                             WHERE it.id = d.ia->>'itemId' AND it.name ~* '^\s*кам(ень|ни)\s*$')
                 THEN 'mountain'
             END AS nature
        FROM d
    )
    INSERT INTO yuplink.raid_asset_tags (ref_id, kind, nature)
    SELECT mark.id, 'decoration', mark.nature FROM mark WHERE mark.nature IS NOT NULL
    ON CONFLICT (ref_id) DO UPDATE
       SET nature = EXCLUDED.nature, updated_at = now()
     WHERE yuplink.raid_asset_tags.nature IS NULL;
  END IF;
END
$mig$;

-- ── 2. Деревья и горы вокруг клетки (шесть соседей, осевые координаты).
CREATE OR REPLACE FUNCTION yuplink.raid_nature_around(p_map text, p_q integer, p_r integer)
RETURNS TABLE(trees integer, mountains integer)
LANGUAGE sql STABLE AS $fn$
  SELECT count(*) FILTER (WHERE tg.nature = 'tree')::int,
         count(*) FILTER (WHERE tg.nature = 'mountain'
                            OR tt.name ~* '^\s*(горы|высокогорье)\s*$')::int
    FROM (VALUES (1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)) AS d(dq, dr)
    JOIN yuplink.raid_map_cells c
      ON c.map_id = p_map AND c.q = p_q + d.dq AND c.r = p_r + d.dr
    LEFT JOIN yuplink.mystic_item_template dt
      ON dt.id = c.decoration_id AND dt.kind = 'decoration'
    LEFT JOIN yuplink.raid_asset_tags tg ON tg.ref_id = dt.id
    LEFT JOIN yuplink.mystic_item_template tt
      ON tt.id = c.terrain_id AND tt.kind = 'terrain';
$fn$;

-- ── 3. Ключи нажатий «Поставить шахту» (уборка — старше двух суток, ручка).
CREATE TABLE IF NOT EXISTS yuplink.raid_mine_place_op (
  op         text PRIMARY KEY,
  account_id text NOT NULL,
  map_id     text NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  kind       text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);
-- Таблица из раннего прогона — без отметки рассылки.
ALTER TABLE yuplink.raid_mine_place_op ADD COLUMN IF NOT EXISTS sent_at timestamptz;
CREATE INDEX IF NOT EXISTS raid_mine_place_op_at ON yuplink.raid_mine_place_op (at);
CREATE INDEX IF NOT EXISTS raid_mine_place_op_unsent
  ON yuplink.raid_mine_place_op (at) WHERE sent_at IS NULL;

COMMIT;
