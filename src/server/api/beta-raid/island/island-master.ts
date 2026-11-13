// Остров-образец на сервере (владелец, 04.11.2026: «остров Бар-На образцом для
// всех… включишь как скажу»). settings.island_master = {"mapId": "isle_…", "on":
// false}: пока on не true, острова строит генератор, как раньше. Включено —
// новый остров копирует образец (lib/raid/island/master): клетки с тирами,
// ратуши, лавки и мастерская с их товарами, бойцы (по точкам возрождения),
// дубы, камни и клады — всё на тех же местах (владелец, 05.11.2026: «реально
// унифицированным — где она что поставит — должно появляться у новичков»).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { parsePlaces } from "@/lib/raid/island/steps";
import type { MasterBoss, MasterIsland } from "@/lib/raid/island/master";
import type { WorldCell, WorldHall } from "@/lib/raid/worldgen/spec";

export const ISLAND_MASTER_KEY = "island_master";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const read = async (sql: string): Promise<Row[]> =>
  ((await mcpExec(sql, { wrapJson: true })) as Row[]) ?? [];

/** Образец, если он включён и это остров; иначе null (остров — генератором). */
export async function masterMapId(): Promise<string | null> {
  const rows = await read(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(ISLAND_MASTER_KEY)} LIMIT 1;`,
  ).catch(() => []);
  let v: unknown = rows[0]?.value ?? null;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const cfg = obj(v);
  const mapId = str(cfg?.mapId);
  return cfg?.on === true && mapId && isIslandMapId(mapId) ? mapId : null;
}

/** Клетки, задание и ратуши образца; нет образца или задания — null. */
export async function loadMaster(mapId: string): Promise<MasterIsland | null> {
  const m = sqlStr(mapId);
  const [isle, cellRows, towns, spawns, waterRows, mountainRows, swimRows] = await Promise.all([
    read(`SELECT places FROM yuplink.raid_island WHERE map_id = ${m} LIMIT 1;`),
    read(
      `SELECT c.q, c.r, c.terrain_id, c.road_id, c.object_id, c.object_config, c.decoration_id,
              c.building_id, c.building_skin_id, c.building_config, c.group_id, c.icon_scale, s.tier
         FROM yuplink.raid_map_cells c
         LEFT JOIN yuplink.beta_raid_building_state s
           ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
        WHERE c.map_id = ${m};`,
    ),
    read(`SELECT q, r, config FROM yuplink.raid_town WHERE map_id = ${m};`),
    read(
      // swims — родная местность бойца вода (raid_boss_template.land): ему в воде можно.
      `SELECT s.home_q, s.home_r, s.cur_q, s.cur_r, s.object_id, s.object_config,
              coalesce((SELECT ${WATER_SQL} FROM yuplink.raid_boss_template b
                          JOIN yuplink.mystic_item_template t ON t.id = b.land
                         WHERE 'boss:' || b.id = s.object_id), false) AS swims
         FROM yuplink.raid_mob_spawn s WHERE s.map_id = ${m};`,
    ),
    read(
      `SELECT DISTINCT c.terrain_id FROM yuplink.raid_map_cells c
         JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
        WHERE c.map_id = ${m} AND ${WATER_SQL};`,
    ),
    read(
      `SELECT DISTINCT c.terrain_id FROM yuplink.raid_map_cells c
         JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
        WHERE c.map_id = ${m} AND t.name ~* '^(горы|mountains?)$';`,
    ),
    read(
      `SELECT DISTINCT c.object_id FROM yuplink.raid_map_cells c
         JOIN yuplink.raid_boss_template b ON 'boss:' || b.id = c.object_id
         JOIN yuplink.mystic_item_template t ON t.id = b.land
        WHERE c.map_id = ${m} AND ${WATER_SQL};`,
    ),
  ]);
  const raw = isle[0]?.places;
  const places = raw ? parsePlaces(typeof raw === "string" ? JSON.parse(raw) : raw) : null;
  if (!places || cellRows.length === 0) return null;
  const cells: WorldCell[] = cellRows.flatMap((c) => {
    const terrainId = str(c.terrain_id);
    if (!terrainId) return [];
    return [
      {
        q: Number(c.q),
        r: Number(c.r),
        terrainId,
        roadId: str(c.road_id),
        objectId: str(c.object_id),
        objectConfig: c.object_config ?? null,
        decorationId: str(c.decoration_id),
        buildingId: str(c.building_id),
        buildingSkinId: str(c.building_skin_id),
        buildingConfig: obj(c.building_config),
        tier: c.tier == null ? null : Number(c.tier),
        groupId: str(c.group_id),
        iconScale: c.icon_scale == null ? null : Number(c.icon_scale),
        mode: "built" as const,
      },
    ];
  });
  const halls: WorldHall[] = towns.map((t) => ({
    q: Number(t.q),
    r: Number(t.r),
    config: obj(t.config) ?? {},
  }));
  const bosses: MasterBoss[] = spawns.flatMap((b) => {
    const objectId = str(b.object_id);
    if (!objectId?.startsWith("boss:")) return [];
    const cur =
      b.cur_q == null || b.cur_r == null ? null : { q: Number(b.cur_q), r: Number(b.cur_r) };
    return [
      {
        q: Number(b.home_q),
        r: Number(b.home_r),
        cur,
        objectId,
        objectConfig: b.object_config ?? null,
        swims: b.swims === true || b.swims === "t",
      },
    ];
  });
  const main = halls.find((h) => places.hall && h.q === places.hall.q && h.r === places.hall.r);
  const name = str(main?.config.name) ?? str(halls[0]?.config.name) ?? "";
  const water = waterRows.flatMap((w) => str(w.terrain_id) ?? []);
  const mountains = mountainRows.flatMap((w) => str(w.terrain_id) ?? []);
  const swimmers = swimRows.flatMap((w) => str(w.object_id) ?? []);
  return { mapId, name, cells, places, halls, bosses, water, mountains, swimmers };
}

/**
 * Лавки и мастерская образца с их товарами — на новую карту (без продаж).
 * id товара: префикс карты образца меняется на новую карту, прочие — от md5.
 */
export function masterShopsSql(from: string, to: string): string[] {
  const f = sqlStr(from);
  const t = sqlStr(to);
  return [
    `INSERT INTO yuplink.raid_market_shop
     SELECT (jsonb_populate_record(NULL::yuplink.raid_market_shop,
             to_jsonb(s) || jsonb_build_object('map_id', ${t}, 'updated_at', now()))).*
       FROM yuplink.raid_market_shop s WHERE s.map_id = ${f}
     ON CONFLICT DO NOTHING;`,
    `INSERT INTO yuplink.raid_market_item
     SELECT (jsonb_populate_record(NULL::yuplink.raid_market_item,
             to_jsonb(i) || jsonb_build_object(
               'id', CASE WHEN left(i.id, length(${f})) = ${f}
                          THEN ${t} || substr(i.id, length(${f}) + 1)
                          ELSE 'mi_' || md5(${t} || ':' || i.id) END,
               'map_id', ${t}, 'sold', 0))).*
       FROM yuplink.raid_market_item i WHERE i.map_id = ${f}
     ON CONFLICT DO NOTHING;`,
  ];
}
