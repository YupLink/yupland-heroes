// Члены блоков-шахт и дельта карты (§8.59 п. 9).
//
// Блок режима бога: постройка стоит на одной клетке, картинка — на весь блок,
// и стена — весь блок (mine-cell-sql.blockMineSql). Дельта же несёт только
// постройку самой клетки: члену блока без своей постройки отметку шахты ей не
// передать (packedMines решает по постройке клетки). Поэтому правка, после
// которой такой член стал шахтой или перестал ею быть, уходит игрокам «карта
// перестроена» — полным снимком, где список шахт считает сервер.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { blockMineSql, ownMineSql } from "@/server/api/beta-raid/mine-cell-sql";

type At = { q: number; r: number };

/** Члены блоков, шахта которым досталась только от блока, и все id этих блоков. */
export type BlockMines = { keys: Set<string>; groups: string[] };

const keyOf = (c: At) => `${Math.floor(c.q)},${Math.floor(c.r)}`;

/** Что спрашивать у правки кисти: клетки, которые могут сменить блок-шахту. */
export function blockMineProbe(
  cells: Array<At & { groupId?: string | null; buildingConfig?: unknown; voidFog?: boolean }>,
): { cells: At[]; groups: string[]; lifted: Set<string> } {
  const hit = cells.filter(
    (c) => c.groupId !== undefined || c.buildingConfig !== undefined || c.voidFog === false,
  );
  return {
    cells: hit.map((c) => ({ q: c.q, r: c.r })),
    groups: [...new Set(hit.map((c) => c.groupId).filter((g): g is string => !!g))],
    lifted: new Set(hit.filter((c) => c.voidFog === false).map(keyOf)),
  };
}

/**
 * Блоки этих клеток (и названные блоки) — кто в них шахта только по блоку.
 * Одна выборка по индексу (map_id, group_id); пустой ввод — без похода в базу.
 */
export async function readBlockMines(
  mapId: string,
  cells: At[],
  groups: string[],
): Promise<BlockMines> {
  if (cells.length === 0 && groups.length === 0) return { keys: new Set(), groups: [] };
  const m = sqlStr(mapId);
  const own =
    cells.length > 0
      ? `SELECT c.group_id FROM yuplink.raid_map_cells c
          WHERE c.map_id = ${m} AND c.group_id IS NOT NULL
            AND (c.q, c.r) IN (${cells.map((c) => `(${Math.floor(c.q)},${Math.floor(c.r)})`).join(",")})`
      : null;
  const named =
    groups.length > 0 ? `SELECT unnest(ARRAY[${groups.map(sqlStr).join(",")}]::text[])` : null;
  const g = [own, named].filter(Boolean).join("\n UNION ");
  const rows = (await mcpExec(
    `SELECT c.q, c.r, c.group_id,
            (${blockMineSql("c")} AND NOT ${ownMineSql("c")}) AS by_block
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${m} AND c.group_id IN (${g});`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number; group_id: string; by_block: boolean | null }> | null;
  const keys = new Set<string>();
  const ids = new Set(groups);
  for (const row of rows ?? []) {
    ids.add(String(row.group_id));
    if (row.by_block === true) keys.add(`${Number(row.q)},${Number(row.r)}`);
  }
  return { keys, groups: [...ids] };
}

/**
 * Дельтой не обойтись: состав членов-шахт сменился, или с члена блока-шахты
 * сняли купол (до этого игрок не знал о клетке ничего, а патч несёт лишь её
 * собственную постройку — её нет).
 */
export function blockMinesMoved(
  before: BlockMines,
  after: BlockMines,
  lifted: Set<string>,
): boolean {
  if (before.keys.size !== after.keys.size) return true;
  for (const k of after.keys) if (!before.keys.has(k) || lifted.has(k)) return true;
  return false;
}

/** Сняли купол с одной клетки (правка по клетке) — она член блока-шахты? Сбой чтения — «да». */
export async function liftedBlockMine(
  mapId: string,
  c: At & { voidFog?: boolean },
): Promise<boolean> {
  if (c.voidFog !== false) return false;
  return readBlockMines(mapId, [c], []).then(
    (b) => b.keys.has(keyOf(c)),
    () => true,
  );
}
