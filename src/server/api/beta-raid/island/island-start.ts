// Старт героя на острове (владелец, 05.11.2026: «дай возможность ангелине
// выбрать точку начального спавна»). Клетка, куда встаёт герой при входе на
// остров, — places.spawn строки raid_island (у демо-острова — raid_demo_island). Ставит режим бога: админ — на
// острове, где стоит; право island_god — на своём. С острова-образца
// (island-master) старт уезжает в каждую копию.
//
// Старт — только свободная суша или ратуша: не вода, не купол, без объекта и
// без глухого декора, постройка — только сама ратуша (у короткого обучения
// старт и так у ратуши). Проверка и запись — одним оператором.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { WATER_SQL, buildingHeldSql, decorBlocksSql } from "../cell-sql";
import { voidSql } from "../voidCells";
import { requireGodAdmin } from "./island-editor-auth";

const cell = z.object({ q: z.number().int(), r: z.number().int() });
type Cell = z.infer<typeof cell>;

/** Клетка годится под старт (таблица клеток — `c`). */
export function startCellOkSql(mapId: string, q: number, r: number): string {
  return `EXISTS (
    SELECT 1 FROM yuplink.raid_map_cells c
      LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
     WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
       AND c.terrain_id IS NOT NULL
       AND NOT COALESCE(${WATER_SQL}, false)
       AND NOT COALESCE(${voidSql("c")}, false)
       AND c.object_id IS NULL
       AND NOT ${decorBlocksSql("c")}
       AND (NOT ${buildingHeldSql("c")}
            OR EXISTS (SELECT 1 FROM yuplink.raid_town h
                        WHERE h.map_id = c.map_id AND h.q = c.q AND h.r = c.r)))`;
}

/** Строка с местами острова: остров новичка, демо-остров (demo-island) или работа креатора. */
type PlacesTable = "raid_island" | "raid_demo_island" | "raid_creator_work";

/** Записать старт, если клетка годится; ответ — строка острова или пусто. */
export function setStartSql(
  mapId: string,
  q: number,
  r: number,
  table: PlacesTable = "raid_island",
): string {
  return `UPDATE yuplink.${table}
     SET places = jsonb_set(places, '{spawn}', jsonb_build_object('q', ${q}, 'r', ${r}))
   WHERE map_id = ${sqlStr(mapId)} AND ${startCellOkSql(mapId, q, r)}
   RETURNING map_id`;
}

/** Остров режима бога или null: админ не на острове — старта нет. */
async function islandOfGod(): Promise<string | null> {
  const { mapId } = await requireGodAdmin();
  return isIslandMapId(mapId) ? mapId : null;
}

async function startOf(mapId: string): Promise<Cell | null> {
  const rows = (await mcpExec(
    `SELECT places->'spawn'->>'q' AS q, places->'spawn'->>'r' AS r
       FROM yuplink.raid_island WHERE map_id = ${sqlStr(mapId)}
     UNION ALL
     SELECT places->'spawn'->>'q', places->'spawn'->>'r'
       FROM yuplink.raid_demo_island WHERE map_id = ${sqlStr(mapId)}
     UNION ALL
     SELECT places->'spawn'->>'q', places->'spawn'->>'r'
       FROM yuplink.raid_creator_work WHERE map_id = ${sqlStr(mapId)}
     LIMIT 1`,
    { wrapJson: true },
  )) as Array<{ q: string | null; r: string | null }>;
  const row = rows?.[0];
  if (!row || row.q == null || row.r == null) return null;
  return { q: Number(row.q), r: Number(row.r) };
}

/** Где старт острова; можно ли его ставить. Без прав — просто «нельзя». */
export const getIslandStart = createServerFn({ method: "GET" }).handler(async () => {
  const mapId = await islandOfGod().catch(() => null);
  const start = mapId ? await startOf(mapId) : null;
  return { canSet: start !== null, start };
});

export const setIslandStart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cell.parse(d))
  .handler(async ({ data }) => {
    const mapId = await islandOfGod();
    if (!mapId) throw new Error("island.start_not_island");
    let rows: unknown[] = [];
    for (const table of ["raid_island", "raid_demo_island", "raid_creator_work"] as const) {
      rows = (await mcpExec(setStartSql(mapId, data.q, data.r, table), {
        wrapJsonCte: true,
      })) as unknown[];
      if (rows?.length) break;
    }
    if (!rows?.length) throw new Error("island.start_bad_cell");
    return { start: { q: data.q, r: data.r } };
  });
