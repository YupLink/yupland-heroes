// Создать мир и дорастить его (владелец, 06.10.2026: «большие территории
// автоматически … бесконечная генерация на чанках»).
//
// Создать — снять спецификацию с образца (живой карты), посчитать чанки и
// записать НОВУЮ карту-черновик: она не активна, игроки её не видят, живая
// карта не трогается. Два вида:
//  • «карта» — рамка size × size, считается целиком; города не вылезают за край;
//  • «бесконечный мир» — без края: начало 8 × 8 чанков в центре рамки 512,
//    «дорастить» добавляет кольцо чанков вокруг посчитанных — по той же
//    спецификации, что сохранена при создании, поэтому стыки не видны.
// Сбой записи при создании — недописанный мир убирается целиком (dropWorldSql).
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { generateArea } from "@/lib/raid/worldgen/area";
import { makeWorld } from "@/lib/raid/worldgen/field";
import {
  ENDLESS_FRAME,
  chunksOfSize,
  endlessStart,
  frontier,
  type ChunkKey,
} from "@/lib/raid/worldgen/geo";
import {
  worldSpecSchema,
  type TownKit,
  type WorldArea,
  type WorldSpec,
} from "@/lib/raid/worldgen/spec";
import { townCatalog, type TownCatalog } from "@/lib/raid/worldgen/town";
import { toRoleOptions } from "@/lib/raid/zonegen/town/roles";
import { raceTowns } from "@/lib/raid/worldgen/collections";
import { kitTowns } from "@/lib/raid/worldgen/kits";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { buildSpec } from "./learn";
import { learnKits } from "./learn-kits";
import {
  loadBuildingCatalog,
  loadBuildingUsage,
  loadLearnRows,
  loadTownCells,
  type Query,
} from "./learn-load";
import { areaSql, dropWorldSql, insertMapSql, insertWorldSql } from "./write-sql";
import { assertUsdtCellSet } from "@/server/api/usdt-cells";

export type WorldKind = "map" | "endless";

export type CreateWorldInput = {
  name: string;
  seed: number;
  kind: WorldKind;
  /** Рамка карты (для «карты»); у бесконечного мира рамка всегда 512. */
  size: 128 | 256;
  /** Суша, % всей площади; null — как в исходном квадрате образца. */
  landPct: number | null;
  /** Земли мира (выбор админа); пусто или null — все земли образца. */
  lands?: string[] | null;
  sourceMapId: string;
  by: string;
};

export type WorldPlan = {
  mapId: string;
  spec: WorldSpec;
  area: WorldArea;
  chunks: ChunkKey[];
  statements: string[];
};

export type WorldReport = {
  mapId: string;
  cells: number;
  towns: number;
  halls: number;
  shops: number;
  roads: number;
  chunks: number;
};

const bridge: Query = async (sql) => ((await mcpExec(sql, { wrapJson: true })) ?? []) as unknown[];

/**
 * Справочник построек для городов: наборы городов мира (kits), а у мира без
 * наборов — коллекции рас (collections) из того, что стоит на образце sampleId.
 */
export async function catalogOf(
  q: Query,
  sampleId: string,
  kits: readonly TownKit[],
  known?: BuildingOption[],
): Promise<TownCatalog> {
  const all = known ?? (await loadBuildingCatalog(q));
  const options = toRoleOptions(all);
  if (kits.length > 0) return townCatalog(options, all, kitTowns(kits, all, options));
  const usage = await loadBuildingUsage(q, sampleId);
  return townCatalog(options, all, raceTowns(options, usage));
}

/** Рамка образца: доли и земли берутся из его исходного квадрата. */
async function sourceSize(q: Query, mapId: string): Promise<number> {
  const rows = (await q(
    `SELECT size FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)};`,
  )) as Array<{
    size: number | string;
  }>;
  const size = Number(rows?.[0]?.size);
  if (!Number.isFinite(size) || size <= 0) throw new Error("worldgen.no_source");
  return size;
}

/** Всё, что нужно записать: карта, мир, клетки, ратуши, лавки, чанки — без записи. */
export async function planWorld(q: Query, inp: CreateWorldInput): Promise<WorldPlan> {
  const rows = await loadLearnRows(q, inp.sourceMapId, await sourceSize(q, inp.sourceMapId));
  const all = await loadBuildingCatalog(q);
  const kits = learnKits(await loadTownCells(q, inp.sourceMapId), all);
  const spec = buildSpec(rows, { seed: inp.seed, landPct: inp.landPct, lands: inp.lands, kits });
  const endless = inp.kind === "endless";
  const size = endless ? ENDLESS_FRAME : inp.size;
  const chunks = endless ? endlessStart() : chunksOfSize(size);
  const area = generateArea(makeWorld(spec), {
    chunks,
    bounds: endless ? null : { size },
    catalog: await catalogOf(q, inp.sourceMapId, spec.towns.kits, all),
  });
  const mapId = `rmap_${nanoid(8)}`;
  return {
    mapId,
    spec,
    area,
    chunks,
    statements: [
      insertMapSql({ id: mapId, name: inp.name, size }),
      insertWorldSql({ mapId, spec, endless, by: inp.by }),
      ...areaSql(mapId, area, chunks),
    ],
  };
}

const reportOf = (mapId: string, area: WorldArea, chunks: number): WorldReport => ({
  mapId,
  cells: area.cells.length,
  towns: area.towns.length,
  halls: area.halls.length,
  shops: area.shops.length,
  roads: area.roads,
  chunks,
});

export async function createWorld(inp: CreateWorldInput): Promise<WorldReport> {
  const plan = await planWorld(bridge, inp);
  // Объекты мира с USDT в награде — живые деньги: только из свободного (§8.49а).
  await assertUsdtCellSet(plan.mapId, plan.area.cells, "мир с USDT");
  try {
    for (const s of plan.statements) await mcpExec(s, { wrapJson: false });
  } catch (e) {
    for (const s of dropWorldSql(plan.mapId)) await mcpExec(s, { wrapJson: false }).catch(() => []);
    throw e;
  }
  return reportOf(plan.mapId, plan.area, plan.chunks.length);
}

/**
 * Дорастить бесконечный мир кольцом чанков. Повтор и два нажатия разом
 * безопасны: простые клетки — «если пусто», дом и дорога — те же самые, город и
 * лавка — «если ещё нет»; чанк отмечается последним.
 */
export async function growWorld(mapId: string): Promise<WorldReport> {
  const rows = (await bridge(
    `SELECT w.spec, w.endless FROM yuplink.raid_world w WHERE w.map_id = ${sqlStr(mapId)};`,
  )) as Array<{ spec: unknown; endless: boolean | string }>;
  const row = rows?.[0];
  if (!row) throw new Error("worldgen.not_found");
  if (row.endless !== true && row.endless !== "t") throw new Error("worldgen.not_endless");
  const spec = worldSpecSchema.parse(row.spec);
  const have = (await bridge(
    `SELECT cx, cy FROM yuplink.raid_world_chunk WHERE map_id = ${sqlStr(mapId)};`,
  )) as Array<{ cx: number | string; cy: number | string }>;
  const next = frontier(have.map((c) => ({ cx: Number(c.cx), cy: Number(c.cy) })));
  const { activeBetaMapId } = await import("@/server/api/beta-raid/encounter-where");
  const area = generateArea(makeWorld(spec), {
    chunks: next,
    bounds: null,
    catalog: await catalogOf(bridge, await activeBetaMapId(), spec.towns.kits),
  });
  await assertUsdtCellSet(mapId, area.cells, "мир с USDT");
  for (const s of areaSql(mapId, area, next)) await mcpExec(s, { wrapJson: false });
  return reportOf(mapId, area, have.length + next.length);
}
