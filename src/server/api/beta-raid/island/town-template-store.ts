// Шаблоны городов острова в базе: снять с острова дизайнера, список, вкл/выкл,
// удалить, включённые — генератору (island-create).
import { nanoid } from "nanoid";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { parsePlaces } from "@/lib/raid/island/steps";
import {
  TEMPLATE_RADIUS,
  townBuildingIds,
  type TownTemplate,
} from "@/lib/raid/island/townTemplate";
import {
  captureTemplate,
  nearestHall,
  taskCells,
  type MapLayers,
} from "@/lib/raid/island/townTemplateCapture";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { WATER_SQL } from "../cell-sql";
import { islandBase } from "./island-base";

const cellSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
  t: z.string().nullable(),
  rd: z.string().nullable(),
  d: z.string().nullable(),
  b: z.string().nullable(),
  g: z.number().int().nullable().optional(),
  s: z.number().nullable().optional(),
});
const cellsSchema = z.array(cellSchema);

export type TemplateRow = { id: string; name: string; active: boolean; buildings: number };

const parseCells = (raw: unknown) =>
  cellsSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);

/** Включённые шаблоны — для генератора острова. Битая строка пропускается. */
export async function activeTemplates(): Promise<TownTemplate[]> {
  const rows = (await mcpExec(
    `SELECT id, name, cells FROM yuplink.raid_town_template
      WHERE active ORDER BY created_at, id;`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; cells: unknown }>;
  const out: TownTemplate[] = [];
  for (const r of rows ?? []) {
    const cells = parseCells(r.cells);
    if (cells.success) out.push({ id: r.id, name: r.name, cells: cells.data });
  }
  return out;
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const rows = (await mcpExec(
    `SELECT id, name, active,
            (SELECT count(*) FROM jsonb_array_elements(cells) e
              WHERE e->>'b' IS NOT NULL)::int AS buildings
       FROM yuplink.raid_town_template ORDER BY created_at DESC, id;`,
    { wrapJson: true },
  )) as TemplateRow[];
  return rows ?? [];
}

/** Городские постройки — что дизайнеру можно ставить (палитра кисти). */
export async function townIds(): Promise<string[]> {
  return [...townBuildingIds((await islandBase()).catalog)];
}

/** Ратуши на карте — по функции постройки (meta.effect = town_hall). */
async function hallsOf(mapId: string, hallIds: string[]): Promise<Cell[]> {
  if (hallIds.length === 0) return [];
  const rows = (await mcpExec(
    `SELECT q, r FROM yuplink.raid_map_cells
      WHERE map_id = ${sqlStr(mapId)} AND building_id IN (${hallIds.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number }>;
  return (rows ?? []).map((h) => ({ q: Number(h.q), r: Number(h.r) }));
}

async function layersAround(mapId: string, at: Cell): Promise<MapLayers[]> {
  const R = TEMPLATE_RADIUS;
  const rows = (await mcpExec(
    `SELECT q, r, terrain_id, road_id, decoration_id, building_id, group_id, icon_scale
       FROM yuplink.raid_map_cells
      WHERE map_id = ${sqlStr(mapId)}
        AND q BETWEEN ${at.q - R} AND ${at.q + R} AND r BETWEEN ${at.r - R} AND ${at.r + R};`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>>;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return (rows ?? []).map((c) => ({
    q: Number(c.q),
    r: Number(c.r),
    t: s(c.terrain_id),
    rd: s(c.road_id),
    d: s(c.decoration_id),
    b: s(c.building_id),
    gid: s(c.group_id),
    s: c.icon_scale == null ? null : Number(c.icon_scale),
  }));
}

/** Вода по имени местности — как в игре (WATER_SQL): речка своей местностью — тоже вода. */
async function waterIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = (await mcpExec(
    `SELECT t.id FROM yuplink.mystic_item_template t
      WHERE t.id IN (${ids.map(sqlStr).join(", ")}) AND ${WATER_SQL};`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  return new Set((rows ?? []).map((r) => r.id));
}

/**
 * Снять город у ратуши рядом с тапом на острове mapId. Ошибки — ключами
 * перевода (tpl.*): клиент показывает их на языке игрока.
 */
export async function saveTemplate(mapId: string, tap: Cell, name: string, by: string) {
  const isle = (await mcpExec(
    // Демо-остров (demo-island) — тоже остров: его места в своей строке.
    `SELECT places FROM yuplink.raid_island WHERE map_id = ${sqlStr(mapId)}
     UNION ALL
     SELECT places FROM yuplink.raid_demo_island WHERE map_id = ${sqlStr(mapId)}
     LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ places: unknown }>;
  const raw = isle?.[0]?.places;
  const places = raw ? parsePlaces(typeof raw === "string" ? JSON.parse(raw) : raw) : null;
  if (!places) throw new Error("tpl.not_island");
  const { spec, catalog } = await islandBase();
  const hallIds = [...catalog.byId.values()]
    .filter((b) => b.effect === "town_hall")
    .map((b) => b.id);
  const halls = await hallsOf(mapId, hallIds);
  const at = nearestHall(halls, tap);
  if (!at) throw new Error("tpl.no_hall");
  const layers = await layersAround(mapId, at);
  const named = await waterIds([...new Set(layers.flatMap((c) => (c.t ? [c.t] : [])))]);
  const water = (id: string) =>
    id === spec.water.shallow || id === spec.water.ocean || named.has(id);
  const town = townBuildingIds(catalog);
  // Шахты, поля, порталы — не городские: на новых островах их не будет.
  const cells = captureTemplate(layers, at, halls, taskCells(places), water).map((c) =>
    c.b !== null && !town.has(c.b) ? { ...c, b: null } : c,
  );
  const id = `ttpl_${nanoid(10)}`;
  await mcpExec(
    `INSERT INTO yuplink.raid_town_template (id, name, cells, created_by)
     VALUES (${sqlStr(id)}, ${sqlStr(name)}, ${sqlStr(JSON.stringify(cells))}::jsonb, ${sqlStr(by)});`,
    { wrapJson: false },
  );
  return { id, buildings: cells.filter((c) => c.b !== null).length };
}

export async function setTemplateActive(id: string, active: boolean): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_town_template SET active = ${active ? "true" : "false"}, updated_at = now()
      WHERE id = ${sqlStr(id)};`,
    { wrapJson: false },
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  await mcpExec(`DELETE FROM yuplink.raid_town_template WHERE id = ${sqlStr(id)};`, {
    wrapJson: false,
  });
}
