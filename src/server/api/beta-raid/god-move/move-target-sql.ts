// Перенос здания, блока или декора: что лежит на клетках, куда едет единица.
//
// Вынесено из move-check-sql (правило ≤250 строк): там — порядок причин и
// решение, здесь — признаки клеток: земля, чужой блок, декор, беглец, игрок,
// мешочки под встающим декором, клетки посадки постройки и декора среди своих
// старых и данные снесённой постройки на клетке, куда встаёт постройка.
import { sqlStr } from "@/server/api/raid-shared";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";
import {
  buildingCell,
  decorCell,
  freshCells,
  newCells,
  shifted,
  type UnitAt,
} from "@/server/api/beta-raid/god-move/move-unit";
import { atCell, hasAt, inCells } from "@/server/api/beta-raid/god-move/move-where";
import type { GodCell } from "@/lib/godMove";

/**
 * Данные снесённой постройки на клетке, куда встаёт постройка, — по видам.
 * Лавка — ещё и лавки, привязанные к этой клетке как к ратуше: новая ратуша
 * здесь молча забрала бы их себе. Тир, отметки вышек и журналы сюда не входят:
 * тир переписывается тиром переезжающей, отметки и журналы сливаются.
 */
export function leftoversSql(o: UnitAt): string {
  const b = buildingCell(o);
  if (!b) {
    return `SELECT NULL::boolean AS market, NULL::boolean AS town, NULL::boolean AS warehouse,
                   NULL::boolean AS field, NULL::boolean AS mine`;
  }
  const t = shifted(o, b);
  const has = (table: string) => hasAt(table, o.mapId, t);
  return `SELECT (${has("raid_market_shop")} OR ${has("raid_market_item")}
            OR EXISTS (SELECT 1 FROM yuplink.raid_market_shop x
                        WHERE x.map_id = ${sqlStr(o.mapId)} AND x.town_q = ${t.q}
                          AND x.town_r = ${t.r})) AS market,
          (${has("raid_town")} OR ${has("raid_town_stock")}) AS town,
          ${has("raid_warehouse_slot")} AS warehouse,
          ${has("raid_field_worker")} AS field,
          (${has("raid_mine_state")} OR ${has("raid_mine_guard")}) AS mine`;
}

/** Новые клетки без земли (нет строки или местности) — цель мимо карты. */
export const groundSql = (o: UnitAt): string =>
  `SELECT 1 FROM (VALUES ${newCells(o)
    .map((c) => `(${c.q}, ${c.r})`)
    .join(", ")}) AS p(q, r)
     LEFT JOIN yuplink.raid_map_cells c
            ON c.map_id = ${sqlStr(o.mapId)} AND c.q = p.q AND c.r = p.r
    WHERE c.terrain_id IS NULL`;

/** Что ещё на новых клетках: чужой блок, любой декор, беглец, игрок. */
export function freshExtraSql(o: UnitAt): string {
  const m = sqlStr(o.mapId);
  return `SELECT bool_or(c.group_id IS NOT NULL) AS block,
            bool_or(c.decoration_id IS NOT NULL) AS any_decor,
            bool_or(EXISTS (SELECT 1 FROM yuplink.beta_raid_runner rn
                             WHERE rn.map_id = c.map_id AND rn.q = c.q AND rn.r = c.r)) AS runner,
            bool_or(EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                             WHERE p.q = c.q AND p.r = c.r
                               AND ${POS_MAP_SQL("p")} = c.map_id)) AS player
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${m} AND ${inCells("c", freshCells(o))}`;
}

/**
 * Живые мешочки на клетке, куда встаёт декор: под любым декором их не видно и
 * не открыть (§8.19), а нерубящийся декор закрыл бы их до сгорания.
 */
export function bagsUnderSql(o: UnitAt): string {
  const d = decorCell(o);
  if (!d) return "SELECT NULL::boolean AS bag";
  return `SELECT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag lb
                    JOIN yuplink.raid_loot_bag_item li ON li.bag_id = lb.id
                   WHERE ${atCell("lb", o.mapId, shifted(o, d))}
                     AND li.count > 0 AND li.expires_at > now()) AS bag`;
}

/** Клетки, куда встают постройка и декор, если это свои старые клетки блока. */
export function landingCells(o: UnitAt): GodCell[] {
  const fresh = new Set(freshCells(o).map((c) => `${c.q},${c.r}`));
  return [buildingCell(o), decorCell(o)]
    .filter((c): c is GodCell => c !== null)
    .map((c) => shifted(o, c))
    .filter((c) => !fresh.has(`${c.q},${c.r}`));
}
