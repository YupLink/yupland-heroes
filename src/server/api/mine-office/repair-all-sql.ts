// «Починить всё»: запросы к базе (раскладка — repair-all-plan.ts).
//
// stateSql — состояние клеток пачки одним чтением (цена и проверка до денег);
// repairAllSql — починка пачки одной функцией базы, одной транзакцией.
import { sqlStr } from "@/server/api/raid-shared";
import type { RepairCost } from "./repair-all-plan";

/**
 * Состояние клеток одним запросом. op — ключ повтора клетки (null — только цена).
 * Клетки уже проверены схемой: целые q/r, id карты — строкой в кавычках.
 */
export function stateSql(
  cells: ReadonlyArray<{ mapId: string; q: number; r: number; op: string | null }>,
): string {
  const values = cells
    .map(
      (c) =>
        `(${sqlStr(c.mapId)}::text, ${Math.trunc(c.q)}::int, ${Math.trunc(c.r)}::int, ${
          c.op == null ? "NULL" : sqlStr(c.op)
        }::text)`,
    )
    .join(",\n            ");
  return `SELECT v.map_id, v.q, v.r, s.owner_account AS owner, s.mode, s.life_left,
                 floor(extract(epoch from s.life_at) * 1000) AS life_at,
                 s.accrue_from IS NOT NULL AS v2, c.building_config AS cfg,
                 COALESCE(c.void_fog, false) AS void,
                 yuplink.raid_mine_is_island(c.building_config) AS island_flag,
                 CASE WHEN yuplink.raid_mine_is_island(c.building_config) THEN EXISTS (
                   SELECT 1 FROM yuplink.raid_mine_op o
                    WHERE o.kind = 'repair' AND o.map_id = v.map_id AND o.q = v.q AND o.r = v.r)
                 ELSE false END AS island_spent,
                 (v.op IS NOT NULL AND EXISTS (
                   SELECT 1 FROM yuplink.raid_mine_op o WHERE o.op = v.op)) AS done
            FROM (VALUES ${values}) AS v(map_id, q, r, op)
            LEFT JOIN yuplink.raid_mine_state s ON s.map_id = v.map_id AND s.q = v.q AND s.r = v.r
            LEFT JOIN yuplink.raid_map_cells c ON c.map_id = v.map_id AND c.q = v.q AND c.r = v.r`;
}

/**
 * Починка пачки: одна функция базы (миграция mine-repair-all-01) — локи всех
 * шахт по порядку, решение под локом, каждая клетка — raid_mine_repair.
 * seen — отметка запаса из показанной цены; mode база берёт свой.
 */
export function repairAllSql(o: {
  account: string;
  wallet: string;
  items: ReadonlyArray<{
    mapId: string;
    q: number;
    r: number;
    seen: number;
    cost: RepairCost;
    op: string;
  }>;
}): string {
  const cells = o.items.map((it) => ({
    map: it.mapId,
    q: Math.trunc(it.q),
    r: Math.trunc(it.r),
    seen: Math.trunc(it.seen),
    cost: it.cost,
    op: it.op,
  }));
  return `SELECT x.o_map AS map_id, x.o_q AS q, x.o_r AS r, x.o_status AS status,
                 x.o_captured AS captured, x.o_credited AS credited,
                 x.o_credited_to AS credited_to, x.o_cost AS cost
            FROM yuplink.raid_mine_repair_all(${sqlStr(o.account)}, ${sqlStr(o.wallet)},
                 ${sqlStr(JSON.stringify(cells))}::jsonb) x`;
}
