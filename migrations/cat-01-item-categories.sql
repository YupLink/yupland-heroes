-- Категории своих товаров (владелец, 04.10.2026): «пища, воины и т. д. — сейчас
-- там бардак и всё вместе». Категория — своя таблица: её создают, переименовывают
-- и удаляют, а у товара — ссылка. Удалили категорию — товары «без категории»,
-- сами товары не трогаются (ON DELETE SET NULL).
--
-- Раскладка 71 товара — по смыслу и по лавкам, где товар продаётся
-- (Путешественника-Рынок, Алхимия, Строительный-Рынок…). Товары других видов
-- (ресурсы, бойцы, паки, артефакты, герои) категорию берут по виду — в базе им
-- ничего не нужно (lib/itemCategories.ts).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_item_category (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  pos        INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS raid_item_category_name_uq
  ON yuplink.raid_item_category (lower(name));

ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS category_id TEXT
    REFERENCES yuplink.raid_item_category(id) ON DELETE SET NULL;

INSERT INTO yuplink.raid_item_category (id, name, pos) VALUES
  ('icat_food',       'Еда',                  10),
  ('icat_potion',     'Зелья и напитки',      20),
  ('icat_ingredient', 'Ингредиенты',          30),
  ('icat_build',      'Стройматериалы',       40),
  ('icat_metal',      'Руда и металлы',       50),
  ('icat_tool',       'Инструменты',          60),
  ('icat_travel',     'Снаряжение путника',   70),
  ('icat_chest',      'Сундуки',              80)
ON CONFLICT (id) DO NOTHING;

-- Еда: съедается героем (часто с бустом), идёт на кухню и в рецепты.
UPDATE yuplink.raid_custom_item SET category_id = 'icat_food' WHERE id IN (
  'cst_r0hwiwq7m4hb', 'cst_i3fhoad96zdn', 'cst_5ojzsjwys3dn', 'cst_yofa9yu5aepo',
  'cst_dhwbu2xna349', 'cst_sgkt7wrp2y9n', 'cst_1i90lt8xpvv8', 'cst_e8xu98eva5si',
  'cst_bs1mzltn627t', 'cst_m3nxv79fwdmb', 'cst_so10bgce3tt7', 'cst_7ce4i4dx3oio',
  'cst_jkxm6tnvuudp', 'cst_z082it3nhog6', 'cst_npbej44tjvtc', 'cst_2utao8xzcxlz');

-- Зелья и напитки: всё с галочкой «зелье» — живёт в сумке зелий.
UPDATE yuplink.raid_custom_item SET category_id = 'icat_potion' WHERE is_potion;

-- Ингредиенты: сырьё алхимии и кухни, само по себе не едят.
UPDATE yuplink.raid_custom_item SET category_id = 'icat_ingredient' WHERE id IN (
  'cst_3vq0rcp4sv4x', 'cst_jt18ffuovaze', 'cst_plnb53k8v5dm', 'cst_wy5y8v1uzqt6',
  'cst_x4igtuarw86c', 'cst_x6kp8is521u8', 'cst_wxhq6aaa4s9i', 'cst_fciu273j48lp');

-- Стройматериалы: брёвна, доска, парусина, цемент, песок и набор Строительного
-- рынка (молоток, наковальня, токарный станок) — идут на постройки и корабли.
UPDATE yuplink.raid_custom_item SET category_id = 'icat_build' WHERE id IN (
  'cst_05bvno59cvth', 'cst_f4ai8iucbsty', 'cst_v7n1c4rdw7on', 'cst_wtza7b6iq7va',
  'cst_8hnwx0g9yoq0', 'cst_enln93ubvhsn', 'cst_pykrpujitzq0', 'cst_xefj7vewkq11',
  'cst_k6xnfra9nxzn', 'cst_o804ad51rj1d', 'cst_6qgopv9lbizf', 'cst_9p70ese6y5eh',
  'cst_9oi6vq5a41x7');

-- Руда и металлы: на изготовление артефактов.
UPDATE yuplink.raid_custom_item SET category_id = 'icat_metal' WHERE id IN (
  'cst_izilsngrki5v', 'cst_64csav5sczbu', 'cst_0chsk0wpqt2b');

-- Инструменты героя: кирка, лопата, топор, удочка.
UPDATE yuplink.raid_custom_item SET category_id = 'icat_tool' WHERE id IN (
  'cst_yhb7xhrdp1dq', 'cst_aosknovigzpu', 'cst_g7uwp1syvmng', 'cst_rew3z8sxs897');

-- Снаряжение путника: то, что продаёт Путешественника-Рынок.
UPDATE yuplink.raid_custom_item SET category_id = 'icat_travel' WHERE id IN (
  'cst_o311vlryorg7', 'cst_owth3ujbrz5m', 'cst_wohttq3845e7', 'cst_cm4iv4ahk78x',
  'cst_lmfx6wofogos');

-- Сундуки: магический и обычный.
UPDATE yuplink.raid_custom_item SET category_id = 'icat_chest'
 WHERE magic_chest OR plain_chest;

COMMIT;
