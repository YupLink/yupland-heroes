// Опыт карты: на какой местности админ какой декор ставил и как часто.
//
// У ассетов нет «к какой местности подходит» — ни у 42 местностей биома, ни у
// 121 декора весов. Вместо того чтобы угадывать по названиям, генератор
// повторяет то, что админ уже нарисовал руками на этой карте: ёлки там, где
// он ставил ёлки, и с той же густотой. Один GROUP BY по клеткам карты — и
// весь его вкус в двух сотнях строк.
//
// Декор считается живым только пока есть его активный шаблон: удалённый
// шаблон оставляет на клетке «мёртвую» ссылку (см. dead-decor.ts), и учить
// генератор ставить то, чего больше нет, нельзя — такая клетка идёт в total,
// но не в decorated.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { Affinity, TerrainAffinity } from "@/lib/raid/zonegen/recipe";

/** Опыт карты меняется кистью админа, а не сам по себе: пять минут — с запасом. */
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { expires: number; value: Affinity }>();

type Row = { terrain_id: string; decoration_id: string | null; n: number | string };

/** Текст запроса отдельно — правило про мёртвый декор живёт в SQL, тест читает его. */
export const affinitySql = (mapId: string): string =>
  `SELECT c.terrain_id, d.id AS decoration_id, count(*)::int AS n
     FROM yuplink.raid_map_cells c
     LEFT JOIN yuplink.mystic_item_template d
       ON d.id = c.decoration_id AND d.kind = 'decoration' AND COALESCE(d.active, true)
    WHERE c.map_id = ${sqlStr(mapId)} AND c.terrain_id IS NOT NULL
    GROUP BY 1, 2;`;

/** Чистая сборка из строк — без базы, чтобы тест мог скормить свои. */
export function buildAffinity(rows: Row[]): Affinity {
  const byTerrain: Record<string, TerrainAffinity> = {};
  const global = new Map<string, number>();
  for (const row of rows) {
    const tid = String(row.terrain_id);
    const n = Number(row.n) || 0;
    const t = (byTerrain[tid] ??= { total: 0, decorated: 0, pool: [] });
    t.total += n;
    if (!row.decoration_id) continue;
    const did = String(row.decoration_id);
    t.decorated += n;
    t.pool.push({ decorationId: did, n });
    global.set(did, (global.get(did) ?? 0) + n);
  }
  // Частый декор первым: генератор режет пул по весу, и порядок ему удобен.
  for (const t of Object.values(byTerrain)) t.pool.sort((a, b) => b.n - a.n);
  return {
    byTerrain,
    global: [...global.entries()]
      .map(([decorationId, n]) => ({ decorationId, n }))
      .sort((a, b) => b.n - a.n),
  };
}

export async function loadAffinity(mapId: string): Promise<Affinity> {
  const hit = cache.get(mapId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const rows = ((await mcpExec(affinitySql(mapId), { wrapJson: true })) ?? []) as Row[];
  const value = buildAffinity(rows);
  cache.set(mapId, { expires: Date.now() + TTL_MS, value });
  return value;
}

/** Админ переразметил карту и хочет видеть новый вкус сразу, а не через 5 минут. */
export function dropAffinityCache(mapId?: string): void {
  if (mapId) cache.delete(mapId);
  else cache.clear();
}
