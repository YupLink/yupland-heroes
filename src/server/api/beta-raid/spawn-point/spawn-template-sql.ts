// SQL шаблонов точек спавна (migrations/mob-04). Шаблон — радиус и строки мобов
// точки без клетки; общий на все карты.
import { sqlStr } from "@/server/api/raid-shared";
import type { SpawnPointMob } from "@/lib/raid/spawnPoint";

const int = (n: number): string => String(Math.floor(Number(n) || 0));
const json = (v: unknown): string => `${sqlStr(JSON.stringify(v))}::jsonb`;

export const listTemplatesSql = (): string =>
  `SELECT id, name, radius, mobs FROM yuplink.raid_spawn_template ORDER BY lower(name), created_at`;

export const templateSql = (id: string): string =>
  `SELECT id, name, radius, mobs FROM yuplink.raid_spawn_template WHERE id = ${sqlStr(id)} LIMIT 1`;

/** Новый шаблон или правка своего (тот же id). */
export const saveTemplateSql = (t: {
  id: string;
  name: string;
  radius: number;
  mobs: SpawnPointMob[];
}): string =>
  `INSERT INTO yuplink.raid_spawn_template (id, name, radius, mobs)
   VALUES (${sqlStr(t.id)}, ${sqlStr(t.name)}, ${int(t.radius)}, ${json(t.mobs)})
   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, radius = EXCLUDED.radius,
     mobs = EXCLUDED.mobs, updated_at = now()`;

export const deleteTemplateSql = (id: string): string =>
  `DELETE FROM yuplink.raid_spawn_template WHERE id = ${sqlStr(id)}`;

/** Клетки точек карты — значки в режиме бога. */
export const mapPointsSql = (mapId: string): string =>
  `SELECT q, r, radius FROM yuplink.raid_spawn_point WHERE map_id = ${sqlStr(mapId)}`;
