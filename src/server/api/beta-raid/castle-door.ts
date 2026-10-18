// Где встать у замка или ратуши: сама клетка, если свободна, иначе ближайшая
// проходимая суша. Один поиск на телепорт домой (spell-teleport-home) и на
// первую клетку новичка (move-hero-state, ход без позиции): на клетке с
// постройкой — ратуше Юпленда — стоять нельзя.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { blockedSql } from "./ships";
import { WATER_SQL } from "./cell-sql";
import { nearestLand } from "./ship-rescue";
import { castleCell } from "./castle";
import type { Cell } from "./encounter-where";

/**
 * Постройку исключаем явно — на клетке с постройкой стоять нельзя, а
 * blockedSql про постройки ничего не знает.
 */
export async function castleLanding(mapId: string, castle: Cell): Promise<Cell | null> {
  const dist = `(abs(c.q - ${castle.q}) + abs(c.r - ${castle.r})
                 + abs((c.q + c.r) - ${castle.q + castle.r})) / 2`;
  const rows = (await mcpExec(
    `SELECT c.q, c.r, ${dist} AS d
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(mapId)}
        AND c.q BETWEEN ${castle.q - 2} AND ${castle.q + 2}
        AND c.r BETWEEN ${castle.r - 2} AND ${castle.r + 2}
        AND NOT ${WATER_SQL}
        AND NOT ${blockedSql(false)}
        AND c.building_id IS NULL
      ORDER BY d, c.q, c.r LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ q: number; r: number }>;
  const cell = rows?.[0];
  if (cell) return { q: Number(cell.q), r: Number(cell.r) };
  // Вокруг замка всё занято постройками — пусть решает общий поиск суши.
  return nearestLand(mapId, castle.q, castle.r);
}

/** Первая клетка игрока на карте — у её замка (в главном мире — у ратуши Юпленда). */
export async function startCell(mapId: string): Promise<Cell> {
  const castle = await castleCell(mapId);
  return (await castleLanding(mapId, castle).catch(() => null)) ?? castle;
}
