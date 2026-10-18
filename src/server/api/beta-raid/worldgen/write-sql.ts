// Запись мира: карта-черновик, клетки пачками, тиры, ратуши со складом,
// привязка лавок, отметки чанков. Только тексты — исполняет сервер (мост,
// пачка за пачкой) или скрипт (psql одной транзакцией).
//
// Клетка пишется по своему режиму (WorldCell.mode): простая — только в пустое
// место, у дороги — снимает декор с лежащей, дом и дорога — поверх целиком.
// Ратуша, лавка и склад — «если ещё нет»: дорастить мир не значит сбросить
// город, который уже живёт.
import { cityNorm, parseTownConfig } from "@/lib/townConfig";
import type { ChunkKey } from "@/lib/raid/worldgen/geo";
import type {
  CellMode,
  WorldArea,
  WorldCell,
  WorldHall,
  WorldSpec,
} from "@/lib/raid/worldgen/spec";
import { sqlStr } from "@/server/api/raid-shared";

/** Строк в одном INSERT: мост режет длинные запросы. */
export const ROWS_PER_INSERT = 400;

const lit = (v: string | null): string => (v === null ? "NULL" : sqlStr(v));
const json = (v: unknown): string =>
  v === null || v === undefined ? "NULL" : `${sqlStr(JSON.stringify(v))}::jsonb`;

function chunked<T>(list: readonly T[], n = ROWS_PER_INSERT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** Новая карта — черновик: не активна, игроки на ней не появятся. */
export const insertMapSql = (o: { id: string; name: string; size: number }): string =>
  `INSERT INTO yuplink.raid_maps (id, name, size, active, created_at, updated_at)
   VALUES (${sqlStr(o.id)}, ${sqlStr(o.name)}, ${o.size}, false, now(), now());`;

export const insertWorldSql = (o: {
  mapId: string;
  spec: WorldSpec;
  endless: boolean;
  by: string;
}): string =>
  `INSERT INTO yuplink.raid_world (map_id, seed, endless, spec, created_by)
   VALUES (${sqlStr(o.mapId)}, ${o.spec.seed}, ${o.endless}, ${json(o.spec)}, ${sqlStr(o.by)});`;

/** Убрать недописанный мир целиком: у ратуш, складов, лавок и тиров каскада нет. */
export const dropWorldSql = (mapId: string): string[] =>
  ["raid_town_stock", "raid_town", "raid_market_shop", "beta_raid_building_state", "raid_maps"].map(
    (t) =>
      `DELETE FROM yuplink.${t} WHERE ${t === "raid_maps" ? "id" : "map_id"} = ${sqlStr(mapId)};`,
  );

const CONFLICT: Record<CellMode, string> = {
  base: "ON CONFLICT (map_id, q, r) DO NOTHING",
  clear: "ON CONFLICT (map_id, q, r) DO UPDATE SET decoration_id = NULL, saved_at = now()",
  built: `ON CONFLICT (map_id, q, r) DO UPDATE SET terrain_id = EXCLUDED.terrain_id,
     road_id = EXCLUDED.road_id, object_id = EXCLUDED.object_id,
     object_config = EXCLUDED.object_config, decoration_id = EXCLUDED.decoration_id,
     building_id = EXCLUDED.building_id, building_config = EXCLUDED.building_config,
     building_skin_id = EXCLUDED.building_skin_id, saved_at = now()`,
};

export function cellsSql(mapId: string, cells: readonly WorldCell[]): string[] {
  const out: string[] = [];
  for (const mode of ["base", "clear", "built"] as const) {
    for (const part of chunked(cells.filter((c) => c.mode === mode))) {
      const values = part
        .map(
          (c) =>
            `(${sqlStr(mapId)}, ${c.q}, ${c.r}, ${lit(c.terrainId)}, ${lit(c.roadId)}, ` +
            `${lit(c.objectId)}, ${json(c.objectConfig)}, ${lit(c.decorationId)}, ` +
            `${lit(c.buildingId)}, ${lit(c.buildingSkinId)}, ${json(c.buildingConfig)}, now())`,
        )
        .join(",\n");
      out.push(
        `INSERT INTO yuplink.raid_map_cells AS c (map_id, q, r, terrain_id, road_id, object_id,
           object_config, decoration_id, building_id, building_skin_id, building_config, saved_at)
         VALUES ${values}
         ${CONFLICT[mode]};`,
      );
    }
  }
  return out;
}

/** Достроенность домов (тир) — там же, где её пишет режим бога. */
export function tiersSql(mapId: string, cells: readonly WorldCell[]): string[] {
  const built = cells.filter((c) => c.buildingId !== null && c.tier !== null);
  return chunked(built).map(
    (part) =>
      `INSERT INTO yuplink.beta_raid_building_state (map_id, q, r, tier, updated_at, updated_by)
       VALUES ${part.map((c) => `(${sqlStr(mapId)}, ${c.q}, ${c.r}, ${c.tier}, now(), 'worldgen')`).join(", ")}
       ON CONFLICT (map_id, q, r) DO UPDATE SET tier = EXCLUDED.tier, updated_at = now(),
         updated_by = EXCLUDED.updated_by;`,
  );
}

/** Ратуши с настройкой и стартовым складом (норма — как при сохранении пульта). */
export function townsSql(mapId: string, halls: readonly WorldHall[]): string[] {
  const out: string[] = [];
  for (const h of halls) {
    const cfg = parseTownConfig(h.config);
    out.push(
      `INSERT INTO yuplink.raid_town (map_id, q, r, config, created_at, updated_at)
       VALUES (${sqlStr(mapId)}, ${h.q}, ${h.r}, ${json(cfg)}, now(), now())
       ON CONFLICT (map_id, q, r) DO NOTHING;`,
    );
    if (cfg.goods.length === 0) continue;
    const stock = cfg.goods
      .map(
        (g) =>
          `(${sqlStr(mapId)}, ${h.q}, ${h.r}, ${sqlStr(g.id)}, ${cityNorm(g, cfg.residents)}, now())`,
      )
      .join(", ");
    out.push(
      `INSERT INTO yuplink.raid_town_stock (map_id, q, r, good_id, amount, updated_at)
       VALUES ${stock}
       ON CONFLICT (map_id, q, r, good_id) DO NOTHING;`,
    );
  }
  return out;
}

export function shopsSql(mapId: string, area: Pick<WorldArea, "shops">): string[] {
  return chunked(area.shops).map(
    (part) =>
      `INSERT INTO yuplink.raid_market_shop (map_id, q, r, town_q, town_r, updated_at)
       VALUES ${part.map((s) => `(${sqlStr(mapId)}, ${s.q}, ${s.r}, ${s.hallQ}, ${s.hallR}, now())`).join(", ")}
       ON CONFLICT (map_id, q, r) DO NOTHING;`,
  );
}

export function chunksSql(mapId: string, chunks: readonly ChunkKey[]): string[] {
  return chunked(chunks).map(
    (part) =>
      `INSERT INTO yuplink.raid_world_chunk (map_id, cx, cy)
       VALUES ${part.map((c) => `(${sqlStr(mapId)}, ${c.cx}, ${c.cy})`).join(", ")}
       ON CONFLICT (map_id, cx, cy) DO NOTHING;`,
  );
}

/** Всё о участке по порядку: клетки, тиры, ратуши, лавки, чанки. */
export function areaSql(mapId: string, area: WorldArea, chunks: readonly ChunkKey[]): string[] {
  return [
    ...cellsSql(mapId, area.cells),
    ...tiersSql(mapId, area.cells),
    ...townsSql(mapId, area.halls),
    ...shopsSql(mapId, area),
    ...chunksSql(mapId, chunks),
  ];
}
