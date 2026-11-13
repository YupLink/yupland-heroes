// Дорисовать N полос по периметру существующих клеток.
//
// В режиме бога владелец сам крашет края океаном/лесом/и т.д.; чтобы каждый
// раз не мазать вручную вокруг всей карты, эта серверная ручка находит все
// «свободные соседние» клетки текущего периметра и заливает их выбранным
// типом местности. Повторяет N раз — за проход получается по одному кольцу.
//
// Границей мы считаем клетки с непустым terrain_id: пустые (без территории)
// не рисуются в игре и не считаются частью карты.
//
// Рамкой `raid_maps.size` эта ручка НЕ ограничена (владелец, 13.10.2026):
// админская до-генерация может выходить за рамку. За рамку не выходит
// ограниченная генерация миров («карта» size × size, worldgen/create.ts) —
// бесконечного мира это не касается.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import { publishRaid } from "../../raidLive";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";

/** 6 соседей flat-top axial-гекса. */
const DIRS = [
  { dq: 1, dr: 0 },
  { dq: -1, dr: 0 },
  { dq: 0, dr: 1 },
  { dq: 0, dr: -1 },
  { dq: 1, dr: -1 },
  { dq: -1, dr: 1 },
];

type ExpandInput = {
  rings: number;
  terrainId: string;
};

export const adminExpandMapEdges = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        /** Сколько колец докрасить (1..10). Каждое кольцо — одна клетка вокруг
         *  предыдущего периметра. */
        rings: z.number().int().min(1).max(10),
        /** Каким типом местности заливать новые клетки. */
        terrainId: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; added: number }> => {
    const { mapId } = await requireGodAdmin();

    // Рамкой raid_maps.size НЕ ограничиваем: владелец сам ставит клетки
    // далеко за 128×128, и рамка тут — только валидатор hex-editor'а, а не
    // граница живой игры. Кайма растёт куда угодно.

    // Текущий состав клеток с террайном — берём один раз, дальше двигаем сет
    // в памяти. Так каждое кольцо расширяется от границы, наросшей на прошлом.
    const rows = (await mcpExec(
      `SELECT q, r FROM yuplink.raid_map_cells
        WHERE map_id = ${sqlStr(mapId)} AND terrain_id IS NOT NULL;`,
      { wrapJson: true },
    )) as Array<{ q: number; r: number }>;
    const owned = new Set<string>();
    for (const c of rows ?? []) owned.add(`${c.q},${c.r}`);
    if (owned.size === 0) throw new Error("На карте пока нет ни одной клетки");

    const added = new Set<string>();
    // Периметр — то, что было до текущего кольца; расширяем от него.
    let frontier: Array<{ q: number; r: number }> = (rows ?? []).slice();

    for (let ring = 0; ring < data.rings; ring++) {
      const next: Array<{ q: number; r: number }> = [];
      for (const c of frontier) {
        for (const d of DIRS) {
          const nq = c.q + d.dq;
          const nr = c.r + d.dr;
          const key = `${nq},${nr}`;
          if (owned.has(key)) continue;
          owned.add(key);
          added.add(key);
          next.push({ q: nq, r: nr });
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }

    if (added.size === 0) return { ok: true as const, added: 0 };

    // Одной вставкой, чтобы не гонять сотню-другую запросов по мосту.
    // ON CONFLICT — страховка: если клетка была без террайна, обновим её,
    // не создав дубликат по (map_id, q, r).
    const values: string[] = [];
    for (const k of added) {
      const [qs, rs] = k.split(",");
      values.push(
        `(${sqlStr(mapId)}, ${Number(qs)}, ${Number(rs)}, ${sqlStr(data.terrainId)}, now())`,
      );
    }
    // Пачками по 500 — mcpExec не любит гигантский литерал.
    const CHUNK = 500;
    for (let i = 0; i < values.length; i += CHUNK) {
      const part = values.slice(i, i + CHUNK).join(",\n");
      await mcpExec(
        `INSERT INTO yuplink.raid_map_cells (map_id, q, r, terrain_id, saved_at)
         VALUES ${part}
         ON CONFLICT (map_id, q, r) DO UPDATE
           SET terrain_id = EXCLUDED.terrain_id, saved_at = EXCLUDED.saved_at
         WHERE yuplink.raid_map_cells.terrain_id IS NULL;`,
        { wrapJson: false },
      );
    }
    // Версию сдвигает noteMapRebuilt — через журнал, без дыр; редактор увидит.
    // Клиенты перечитают карту — иначе новые клетки останутся невидимыми до F5.
    const { noteMapRebuilt } = await import("./map-change-hooks");
    await noteMapRebuilt(mapId);
    publishRaid({ mapId, type: "restored" });
    return { ok: true as const, added: added.size };
  });
