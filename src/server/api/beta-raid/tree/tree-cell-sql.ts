// Признаки клетки под посадку дерева (lib/treePlant) — одним куском на оба места:
// оператор посадки (одна клетка, tree-plant-sql) и подсветка окна выбора (семь
// клеток одним запросом, tree-plant-cells). Правило одно — расходиться негде.
//
// Берём признаки постановки шахт (chest-cell + mine-place-cell, §8.59 п. 8) и
// меняем одно: сундук и мешочек делятся на стоящие и кучки. Кучка — бугорок
// (закопанный мешочек, обычный или магический сундук) — дереву не мешает:
// декор встаёт поверх и перекрывает её до рубки (дополнение №5). Стоящий сундук
// и мешочек на земле — мешают («только на кучку», владелец 22.10.2026).
//
// Строка клетки — алиас c (raid_map_cells) с местностью t (mystic_item_template).
import { ROCK_KIND, type PlantKind } from "@/lib/treePlant";
import {
  cellExtraColsSql,
  cellFlagsColsSql,
  type CellAt,
} from "@/server/api/beta-raid/chest/chest-cell";
import { liveBagSql, mineCellColsSql } from "@/server/api/beta-raid/mine-place/mine-place-cell-sql";

/** Стоящий (не закопанный) сундук и живой мешочек на земле. */
export const treeExtraColsSql = (at: CellAt): string =>
  `(EXISTS (SELECT 1 FROM yuplink.raid_magic_chest sm WHERE ${at("sm")} AND sm.buried_at IS NULL)
              OR EXISTS (SELECT 1 FROM yuplink.raid_plain_chest sp
                          WHERE ${at("sp")} AND sp.buried_at IS NULL)) AS stand_chest,
              EXISTS (SELECT 1 FROM yuplink.raid_loot_bag gb
                       WHERE ${at("gb")} AND gb.buried_at IS NULL AND ${liveBagSql("gb")}) AS ground_bag`;

/**
 * Все признаки клетки под дерево для строки c: постройка, объект, вода, купол,
 * сундук, охрана (chest-cell), декор и судно (extra), дорога, блок/объект/декор,
 * мешочек, игрок (как у шахт) и свои — стоящий сундук, мешочек на земле.
 */
export const treeCellColsSql = (account: string, at: CellAt): string =>
  `${cellFlagsColsSql(at)},
            ${cellExtraColsSql(at)},
            ${mineCellColsSql(account, at)},
            ${treeExtraColsSql(at)}`;

/**
 * Клетку под дерево держит хоть что-то (строка признаков — алиас tf). Сундук и
 * мешочек — только стоящие: tf.chest / tf.bag (с бугорками) сюда не входят.
 */
export const TREE_HELD =
  "(tf.building OR tf.obj OR tf.water OR tf.dome OR tf.guard OR tf.decor OR tf.ship" +
  " OR tf.road OR tf.taken OR tf.player OR tf.stand_chest OR tf.ground_bag)";

/**
 * Шаблон d — камень или гора (владелец, 25.10.2026: «что киркой можно снести»):
 * декор, живой, взаимодействие включено, среди его инструментов — кирка (свой
 * товар с «кирк»/«pick» в имени, как isPickTool турниров). Список инструментов —
 * toolItemIds (jsonb-массив) или старый одиночный toolItemId.
 */
export const pickRockSql = (d: string): string =>
  `(${d}.kind = 'decoration' AND COALESCE(${d}.active, true)
        AND ${d}.meta->'interact'->>'on' = 'true'
        AND EXISTS (SELECT 1 FROM yuplink.raid_custom_item ci
                     WHERE (ci.id = ${d}.meta->'interact'->>'toolItemId'
                            OR (jsonb_typeof(${d}.meta->'interact'->'toolItemIds') = 'array'
                                AND ${d}.meta->'interact'->'toolItemIds' @> to_jsonb(ci.id::text)))
                       AND ci.name ~* '(кирк|pick)'))`;

/** Годный шаблон под вид стопки: дерево — срубаемое, камень — под кирку. */
export const plantableSql = (kind: PlantKind, d: string): string =>
  kind === ROCK_KIND ? pickRockSql(d) : choppableTreeSql(d);

/** Шаблон d — срубаемое дерево: декор, живой, взаимодействие с надписью «Срубить»/«Chop». */
export const choppableTreeSql = (d: string): string =>
  `(${d}.kind = 'decoration' AND COALESCE(${d}.active, true)
        AND ${d}.meta->'interact'->>'on' = 'true'
        AND (lower(btrim(COALESCE(${d}.meta->'interact'->'label'->>'ru', ''))) = 'срубить'
             OR lower(btrim(COALESCE(${d}.meta->'interact'->'label'->>'en', ''))) = 'chop'))`;
