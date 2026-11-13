// SQL формы мира креатора: голая рамка, расширение, копия, очистка. Только
// тексты — исполняют creator-store, creator-clear и creator-world.
import { sqlStr } from "@/server/api/raid-shared";
import type { Cell } from "@/lib/raid/worldgen/geo";

/** Пустые клетки голой карты: только координаты (земли нет — blankMap). */
export function blankCellsSql(mapId: string, cells: readonly Cell[], chunk = 1000): string[] {
  const out: string[] = [];
  for (let i = 0; i < cells.length; i += chunk) {
    const values = cells
      .slice(i, i + chunk)
      .map((c) => `(${sqlStr(mapId)}, ${Math.trunc(c.q)}, ${Math.trunc(c.r)}, now())`)
      .join(", ");
    out.push(
      `INSERT INTO yuplink.raid_map_cells (map_id, q, r, saved_at) VALUES ${values}
         ON CONFLICT (map_id, q, r) DO NOTHING;`,
    );
  }
  return out;
}

/**
 * «Очистить всё»: каждая клетка мира — пустая. Обеспечение наград (darai_ref,
 * darai_hold) не трогаем — его сводит settleDaraiHold по снимку до очистки.
 */
export const wipeCellsSql = (mapId: string): string =>
  `UPDATE yuplink.raid_map_cells
      SET terrain_id = NULL, road_id = NULL, object_id = NULL, object_config = NULL,
          decoration_id = NULL, building_id = NULL, building_skin_id = NULL,
          building_config = NULL, group_id = NULL, icon_scale = NULL,
          planted_decor = NULL, void_fog = false, saved_at = now()
    WHERE map_id = ${sqlStr(mapId)};`;

/**
 * Состояние мира поверх клеток — тоже прочь (как при сносе острова,
 * island-write.dropIslandSql), но карта, журнал карты, позиции героев,
 * туман и строки работы остаются. Ратуши снимаются раньше — штатным путём
 * (town-resolve.handleBuildingChange): касса и привязка лавок.
 */
export function clearStateSql(mapId: string): string[] {
  const m = sqlStr(mapId);
  const byMap = [
    "beta_raid_building_state",
    "beta_raid_building_use",
    "beta_raid_runner",
    "beta_raid_ship",
    "raid_decor_respawn",
    "raid_dig_hole",
    "raid_loot_spawn",
    "raid_magic_chest",
    "raid_market_shop",
    "raid_mine_state",
    "raid_mine_guard",
    "raid_mob_spawn",
    "raid_mushroom_spawn",
    "raid_spawn_point",
    "raid_town_stock_move",
    "raid_town_stock",
    "raid_map_vein",
    "raid_warehouse_slot",
    "raid_field_worker",
    "raid_fishing",
  ];
  return [
    `DELETE FROM yuplink.raid_market_buyer
      WHERE item_id IN (SELECT id FROM yuplink.raid_market_item WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_market_item WHERE map_id = ${m};`,
    `DELETE FROM yuplink.beta_raid_object_run
      WHERE hp_id IN (SELECT id FROM yuplink.beta_raid_object_hp WHERE map_id = ${m});`,
    `DELETE FROM yuplink.beta_raid_object_hp WHERE map_id = ${m};`,
    `DELETE FROM yuplink.raid_loot_bag_item
      WHERE bag_id IN (SELECT id FROM yuplink.raid_loot_bag WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_loot_bag_op
      WHERE bag_id IN (SELECT id FROM yuplink.raid_loot_bag WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_loot_bag WHERE map_id = ${m};`,
    `DELETE FROM yuplink.raid_plain_chest_slot
      WHERE chest_id IN (SELECT id FROM yuplink.raid_plain_chest WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_plain_chest_op
      WHERE chest_id IN (SELECT id FROM yuplink.raid_plain_chest WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_plain_chest WHERE map_id = ${m};`,
    ...byMap.map((t) => `DELETE FROM yuplink.${t} WHERE map_id = ${m};`),
  ];
}

/** Ратуши мира — снять штатно до очистки (касса, привязка лавок). */
export const hallsSql = (mapId: string): string =>
  `SELECT q, r FROM yuplink.raid_town WHERE map_id = ${sqlStr(mapId)};`;

/**
 * Пустые клетки рамки size × size (blankMap.frameCells) одним оператором: рамку
 * считает база, по сети едет только размер — 512² это 262 тыс. строк, пачками
 * из приложения выходило ~8 с, так — секунда-две. Есть уже — не трогает.
 * Переход offset → axial тот же, что offsetToAxial: q = col − (row − (row & 1)) / 2.
 */
export function growFrameSql(mapId: string, size: number): string {
  const n = Math.max(4, Math.floor(size));
  const from = 32 - Math.floor(n / 2);
  const to = from + n - 1;
  return `INSERT INTO yuplink.raid_map_cells (map_id, q, r, saved_at)
    SELECT ${sqlStr(mapId)}, c.col - (r.row - (r.row & 1)) / 2, r.row, now()
      FROM generate_series(${from}, ${to}) AS r(row)
     CROSS JOIN generate_series(${from}, ${to}) AS c(col)
    ON CONFLICT (map_id, q, r) DO NOTHING;`;
}

/** Новый размер рамки мира (клетки дописывает growFrameSql). */
export const setSizeSql = (mapId: string, size: number): string =>
  `UPDATE yuplink.raid_maps SET size = ${Math.trunc(size)}, updated_at = now()
    WHERE id = ${sqlStr(mapId)};`;

/**
 * Копия мира (владелец, 07.11.2026: «из любого мира можно создать копию и
 * продолжить менять — даже из того, которым поделились только на просмотр»):
 * карта той же рамки, все клетки со слоями, тиры построек, ратуши с
 * настройкой и жилы. Обеспечение наград (darai_*) не копируется — мир без денег.
 */
export function copyMapSql(from: string, to: string, name: string): string[] {
  const f = sqlStr(from);
  const t = sqlStr(to);
  return [
    `INSERT INTO yuplink.raid_maps (id, name, size, active, created_at, updated_at)
       SELECT ${t}, ${sqlStr(name)}, size, false, now(), now() FROM yuplink.raid_maps WHERE id = ${f};`,
    `INSERT INTO yuplink.raid_map_cells (map_id, q, r, terrain_id, road_id, object_id, object_config,
            decoration_id, building_id, building_skin_id, building_config, group_id, icon_scale,
            void_fog, planted_decor, saved_at)
       SELECT ${t}, q, r, terrain_id, road_id, object_id, object_config, decoration_id, building_id,
              building_skin_id, building_config, group_id, icon_scale, void_fog, planted_decor, now()
         FROM yuplink.raid_map_cells WHERE map_id = ${f};`,
    `INSERT INTO yuplink.beta_raid_building_state (map_id, q, r, tier, updated_at, updated_by)
       SELECT ${t}, q, r, tier, now(), 'creator-copy'
         FROM yuplink.beta_raid_building_state WHERE map_id = ${f};`,
    `INSERT INTO yuplink.raid_town (map_id, q, r, config, created_at, updated_at)
       SELECT ${t}, q, r, config, now(), now() FROM yuplink.raid_town WHERE map_id = ${f};`,
    `INSERT INTO yuplink.raid_map_vein (map_id, q, r, kind, rot, created_at, placed_by)
       SELECT ${t}, q, r, kind, rot, now(), placed_by FROM yuplink.raid_map_vein WHERE map_id = ${f};`,
  ];
}
