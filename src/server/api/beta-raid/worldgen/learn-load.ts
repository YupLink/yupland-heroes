// Прочитать образец для мира: все строки learn-sql одним проходом через
// переданный запросчик — сервер даёт мост (mcpExec), скрипт — psql. Запросы
// по очереди, а не разом: мост длинные пачки режет, а спешить тут некуда.
import { cleanList, type AssetTags } from "@/lib/raid/assetTags";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { affinitySql, buildAffinity } from "../zonegen/affinity";
import { buildingsSql, skinsSql, toOptions, type SkinRow } from "../zonegen/catalog-buildings";
import type { LearnRows } from "./learn";
import type { TownCellRow } from "./learn-kits";
import {
  adjacencySql,
  assetTagsSql,
  buildingConfigsSql,
  buildingUsageSql,
  coreSharesSql,
  decorCatalogSql,
  decorNearSql,
  objectPoolSql,
  terrainCatalogSql,
  terrainStatsSql,
  topRoadSql,
  townCellsSql,
  townFreeSql,
  townTemplatesSql,
  walkableDecorSql,
} from "./learn-sql";

/** Запросчик: SQL → строки (json-объекты). */
export type Query = (sql: string) => Promise<unknown[]>;

type Raw = Record<string, unknown>;
const rowsOf = async (q: Query, sql: string): Promise<Raw[]> => ((await q(sql)) ?? []) as Raw[];
const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v) || 0;

async function loadTags(q: Query): Promise<Map<string, AssetTags>> {
  const out = new Map<string, AssetTags>();
  for (const r of await rowsOf(q, assetTagsSql())) {
    out.set(str(r.ref_id), {
      terrains: cleanList(r.terrains),
      races: cleanList(r.races),
      auto: r.auto !== false,
    });
  }
  return out;
}

export async function loadLearnRows(q: Query, mapId: string, size: number): Promise<LearnRows> {
  const terrains = (await rowsOf(q, terrainCatalogSql())).map((r) => ({
    id: str(r.id),
    name: str(r.name),
  }));
  const stats = (await rowsOf(q, terrainStatsSql(mapId))).map((r) => ({
    id: str(r.id),
    n: num(r.n),
    bld: num(r.bld),
    road: num(r.road),
    free: num(r.free),
    obj: num(r.obj),
  }));
  const core = (await rowsOf(q, coreSharesSql(mapId, size))).map((r) => ({
    id: str(r.id),
    n: num(r.n),
  }));
  const objects = (await rowsOf(q, objectPoolSql(mapId))).map((r) => ({
    terrain: str(r.terrain),
    id: str(r.id),
    n: num(r.n),
    cfg: r.cfg ?? null,
  }));
  const adjacency = (await rowsOf(q, adjacencySql(mapId))).map((r) => ({
    a: str(r.a),
    b: str(r.b),
    n: num(r.n),
  }));
  const towns = (await rowsOf(q, townTemplatesSql(mapId))).map((r) => ({ config: r.config }));
  const walk = (await rowsOf(q, walkableDecorSql())).map((r) => str(r.id));
  const road = (await rowsOf(q, topRoadSql(mapId)))[0]?.id;
  const affRows = (await rowsOf(q, affinitySql(mapId))) as Parameters<typeof buildAffinity>[0];
  // Метки местности у живого декора — как loadDecorTerrains генератора зон;
  // метки расы — расовый декор только в городах своей расы.
  const tags = await loadTags(q);
  const decorTerrains: Record<string, string[]> = {};
  const decorRaces: Record<string, string[]> = {};
  for (const r of await rowsOf(q, decorCatalogSql())) {
    const t = tags.get(str(r.id))?.terrains ?? [];
    if (t.length > 0) decorTerrains[str(r.id)] = t;
    const races = tags.get(str(r.id))?.races ?? [];
    if (races.length > 0) decorRaces[str(r.id)] = races;
  }
  const decorNear = (await rowsOf(q, decorNearSql(mapId))).map((r) => ({
    id: str(r.id),
    n: num(r.n),
    town: num(r.town),
    hall: num(r.hall),
  }));
  const townFree = num((await rowsOf(q, townFreeSql(mapId)))[0]?.n);
  const configs = (await rowsOf(q, buildingConfigsSql(mapId))).map((r) => ({
    effect: str(r.effect),
    cfg: r.cfg ?? null,
  }));
  return {
    terrains,
    stats,
    core,
    objects,
    adjacency,
    towns,
    walk,
    road: road === undefined || road === null ? null : str(road),
    affinity: { ...buildAffinity(affRows), decorTerrains },
    decorRaces,
    decorNear,
    townFree,
    configs,
  };
}

/** Сколько раз каждый шаблон постройки стоит на образце. */
export async function loadBuildingUsage(q: Query, mapId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const r of await rowsOf(q, buildingUsageSql(mapId))) out.set(str(r.id), num(r.n));
  return out;
}

const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const strOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

/** Постройки образца для наборов городов (learn-kits). */
export async function loadTownCells(q: Query, mapId: string): Promise<TownCellRow[]> {
  return (await rowsOf(q, townCellsSql(mapId))).map((r) => ({
    q: num(r.q),
    r: num(r.r),
    tpl: str(r.tpl),
    skin: strOrNull(r.skin),
    effect: strOrNull(r.effect),
    text: strOrNull(r.text),
    terrain: strOrNull(r.terrain),
    townQ: numOrNull(r.town_q),
    townR: numOrNull(r.town_r),
    name: strOrNull(r.name),
  }));
}

/** Справочник построек с обликами и метками — как loadBuildingOptions, через запросчик. */
export async function loadBuildingCatalog(q: Query): Promise<BuildingOption[]> {
  const rows = (await rowsOf(q, buildingsSql())) as Parameters<typeof toOptions>[0];
  const skins = (await rowsOf(q, skinsSql()).catch(() => [])) as SkinRow[];
  return toOptions(rows, skins, await loadTags(q));
}
