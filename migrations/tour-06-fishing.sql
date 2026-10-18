-- Турниры, турнир рыбаков (владелец, 12.10.2026): «1. Кто больше словит рыбы.
-- 2. Кто больше продаст рыбы. 3. Кто больше выпьет зелий скорости (делается из
-- рыбы). Топ 40».
--
-- Категории (lib/tournament/types.ts — TOUR_METRICS): fish_catch, fish_sell,
-- potion_drink. Колонка metric — текст без CHECK (проверку делает сервер,
-- isTourMetric), поэтому новых ограничений не нужно.
--
-- items — товары турнира: id своих товаров (raid_custom_item, cst_…). У
-- «Зелий скорости» — какие зелья засчитываются; пусто — все зелья со скоростью
-- в бусте. Остальным категориям не нужен (пустой список).
--
-- Журнал сделок (trade_journal) получает новые строки без новых колонок:
-- source 'fish' — улов удочкой (side 'take' — в рюкзак, 'put' — мешочком у
-- рыбака), source 'drink' + side 'use' — выпил/съел товар-буст. Ключ повтора —
-- прежний (source, ref).
--
-- Идемпотентно: повторный прогон ничего не меняет. Применять ДО выката кода:
-- колонку читают все запросы турниров (tour-rows.TOUR_COLS).
ALTER TABLE yuplink.tournament
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Подтяжка «Продажи рыбы» ищет виды рыбы по строкам улова.
CREATE INDEX IF NOT EXISTS trade_journal_fish_item_idx
  ON yuplink.trade_journal (item_key) WHERE source = 'fish';
