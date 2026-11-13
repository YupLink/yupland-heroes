// Достроенные склады карты — с коротким кэшем процесса (21.10.2026).
//
// «Добыча» и уход с грядки ищут ближайший склад; запрос «все достроенные склады
// карты» шёл ~74 раза в минуту и съедал ~10 % всего времени базы (pg_stat_statements
// с 16.09: 2,25 млн вызовов по 10,8 мс). Склады достраиваются редко — держим ответ
// 30 с на карту; повышение тира постройки сбрасывает кэш сразу (в этом процессе,
// остальные процессы догонят за 30 с). Сбой чтения не кэшируем.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { hexDistance } from "./helpers";

type Cell = { q: number; r: number };

/** Сколько держим ответ, мс. */
export const WAREHOUSE_CELLS_TTL_MS = 30_000;

/** Предикат «клетка — склад»: cell-override эффекта, meta шаблона или имя. */
const WAREHOUSE_CELL_SQL = `(c.building_config->>'effect' = 'warehouse'
  OR t.meta->>'effect' = 'warehouse' OR t.name ILIKE '%склад%')`;

const cache = new Map<string, { at: number; cells: Promise<Cell[]> }>();

async function loadWarehouseCells(mapId: string): Promise<Cell[]> {
  const rows = (await mcpExec(
    `SELECT c.q, c.r FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.building_id
       LEFT JOIN yuplink.beta_raid_building_state s
              ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
      WHERE c.map_id = ${sqlStr(mapId)} AND c.building_id IS NOT NULL AND ${WAREHOUSE_CELL_SQL}
        AND jsonb_typeof(t.meta->'tiers') = 'array'
        AND jsonb_array_length(t.meta->'tiers') > 0
        AND COALESCE(s.tier, 0) >= jsonb_array_length(t.meta->'tiers') - 1;`,
    { wrapJson: true },
  )) as Cell[] | null;
  return (rows ?? []).map((w) => ({ q: Number(w.q), r: Number(w.r) }));
}

/**
 * Достроенные склады карты (клетки). Недостроенный склад не в списке: его окно не
 * открыть, урожай завис бы в нём мёртво. Сбой — пустой список (как раньше), без кэша.
 */
export async function warehouseCells(mapId: string, now = Date.now()): Promise<Cell[]> {
  const hit = cache.get(mapId);
  if (hit && now - hit.at < WAREHOUSE_CELLS_TTL_MS) return hit.cells;
  const cells = loadWarehouseCells(mapId);
  cache.set(mapId, { at: now, cells });
  try {
    return await cells;
  } catch {
    if (cache.get(mapId)?.cells === cells) cache.delete(mapId);
    return [];
  }
}

/** Сбросить кэш карты: постройку довели до нового тира. */
export function forgetWarehouseCells(mapId: string): void {
  cache.delete(mapId);
}

/** Ближайший из списка складов в радиусе (гекс-расстояние ≤ maxDist); нет — null. */
export function nearestOf(cells: Cell[], q: number, r: number, maxDist: number): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (const w of cells) {
    const d = hexDistance(w.q, w.r, q, r);
    if (d <= maxDist && d < bestD) {
      bestD = d;
      best = { q: w.q, r: w.r };
    }
  }
  return best;
}

/** Ближайший ДОСТРОЕННый склад в радиусе maxDist; null — годного рядом нет. */
export async function nearestWarehouse(
  mapId: string,
  q: number,
  r: number,
  maxDist: number,
): Promise<Cell | null> {
  return nearestOf(await warehouseCells(mapId), q, r, maxDist);
}
