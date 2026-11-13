// Кто последним поднимал DARAI-шахту, что стоит на клетке (raid_dmine «на
// клетке», migrations/minebag-02) — для окна шахты: «одно поднятие до
// размещения» (владелец, 22.10.2026). Сам отказ — в raid_dmine_take
// (dmine_once); здесь только кнопка с причиной. И до какой минуты гриб
// созревает (защита на час, migrations/mushroom-04) — подпись в окне для всех.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { ripeAtMs } from "@/lib/mushroomRipe";

/**
 * Строка «на клетке» той же постройки, последняя по размещению — тот же выбор,
 * что у raid_dmine_take. Шахта ни разу не поднималась — строки нет.
 */
export const dmineLastTakerSql = (mapId: string, q: number, r: number): string =>
  `SELECT d.taken_by AS "takenBy", d.ripe_at AS "ripeAt"
     FROM yuplink.raid_dmine d
     JOIN yuplink.raid_map_cells c
       ON c.map_id = d.placed_map AND c.q = d.placed_q AND c.r = d.placed_r
      AND c.building_id = d.building_id
    WHERE d.state = 'placed' AND d.lifted_at IS NULL
      AND d.placed_map = ${sqlStr(mapId)} AND d.placed_q = ${Math.floor(q)}
      AND d.placed_r = ${Math.floor(r)}
    ORDER BY d.placed_at DESC NULLS LAST
    LIMIT 1`;

export type DmineCellRow = {
  /** Последний поднявший гриб на клетке; не поднимали — null. */
  takenBy: string | null;
  /** До какой минуты созревает (защита на час, мс); защиты нет или вышла — null. */
  ripeAt: number | null;
};

/** Строка гриба на клетке; нет строки или сбой чтения — пусто. */
export async function dmineCellRow(mapId: string, q: number, r: number): Promise<DmineCellRow> {
  const rows = (await mcpExec(dmineLastTakerSql(mapId, q, r), { wrapJson: true }).catch(
    () => [],
  )) as Array<{ takenBy?: string | null; ripeAt?: unknown }> | null;
  const row = rows?.[0];
  return { takenBy: row?.takenBy ?? null, ripeAt: ripeAtMs(row?.ripeAt) };
}
