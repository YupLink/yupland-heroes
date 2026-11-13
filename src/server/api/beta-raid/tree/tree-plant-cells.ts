// Подсветка окна «Посадить дерево» (lib/treePlant): можно ли посадить на свою
// клетку и на каждую из шести соседних — зелёная или красная и почему. Те же
// признаки, что у оператора посадки (tree-cell-sql), одним запросом на все семь
// клеток; вердикт — treeCellVerdict, тот же, что разбирает ответ посадки.
// Зелёная клетка — не обещание: посадка ещё раз проверит всё под локами.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { PLACE_DIRS } from "@/lib/plainChest";
import { treeCellVerdict, type TreeCellChoice, type TreeCellFlags } from "@/lib/treePlant";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { sameCellAsC } from "@/server/api/beta-raid/chest/chest-cell";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { treeCellColsSql } from "@/server/api/beta-raid/tree/tree-cell-sql";

type At = { mapId: string; q: number; r: number; account: string };

/** Строка признаков клетки с её координатами. */
export type TreeCellRow = TreeCellFlags & { q: number | string; r: number | string };

/** Признаки своей и шести соседних клеток — один запрос. */
export function treeCellsSql(o: At): string {
  const [q, r] = [Math.floor(o.q), Math.floor(o.r)];
  const list = PLACE_DIRS.map((d) => `(${q + d.dq}, ${r + d.dr})`).join(", ");
  return `SELECT c.q, c.r, ${treeCellColsSql(o.account, sameCellAsC)}
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(o.mapId)} AND (c.q, c.r) IN (${list})`;
}

/** Вердикты в порядке PLACE_DIRS. Клетки нет в ответе — её нет на карте (занято). */
export function treeCellChoices(
  center: { q: number; r: number },
  rows: readonly TreeCellRow[],
): TreeCellChoice[] {
  const byKey = new Map(rows.map((x) => [`${Number(x.q)},${Number(x.r)}`, x]));
  return PLACE_DIRS.map(({ dq, dr }) => {
    const reason = treeCellVerdict(byKey.get(`${center.q + dq},${center.r + dr}`) ?? null);
    return { dq, dr, ok: reason === null, reason };
  });
}

/** Окно посадки: семь клеток вокруг героя. Остров — отказ (деревья там не сажают). */
export const getTreePlantCells = createServerFn({ method: "GET" }).handler(
  async (): Promise<TreeCellChoice[]> => {
    const a = await pchestActor(null);
    if (isIslandMapId(a.mapId)) throw new Error("tree.island");
    const pos = await playerCell(a.wallet);
    const at = { mapId: a.mapId, q: pos.q, r: pos.r, account: a.account };
    const rows = (await mcpExec(treeCellsSql(at), { wrapJson: true })) as TreeCellRow[] | null;
    return treeCellChoices(pos, rows ?? []);
  },
);
