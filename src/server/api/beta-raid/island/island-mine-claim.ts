// Остров сносится — накопленное его шахтами остаётся хозяевам ДО сноса карты
// (владелец, 20.10.2026), но не на счёт, а строкой «Отбитых шахт» к «Забрать»
// в «Добыче» (владелец, 23.10.2026: «Зачислять сразу на баланс этот пендинг
// нельзя… пользователь сам нажал кнопку Забрать»; migrations/minecap-01).
// raid_mine_island_release считает по настройке клетки, а клетки уходят со
// снесённой картой каскадом: после сноса считать было бы нечем. Строка
// журнала карту не держит — «Забрать» её не читает; уборка острова сносит
// только забранные строки (island-write). Остаток 7 дней сгорает — шахты
// острова в мир не переезжают. Ачивка «Хозяин шахт» — при «Забрать».
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isIslandMapId } from "@/lib/raid/island/ids";

/** Шахты карты острова, у которых есть хозяин. */
export function islandMinesSql(mapId: string): string {
  // Предохранитель: так собирают только остров — шахты мира не трогаем.
  if (!isIslandMapId(mapId)) throw new Error("island.not_island");
  return `SELECT q, r, owner_account FROM yuplink.raid_mine_state
     WHERE map_id = ${sqlStr(mapId)} AND owner_account IS NOT NULL;`;
}

/** Закрыть шахту острова: несобранное — строкой 'island', владение снято (одна транзакция). */
export const mineReleaseSql = (mapId: string, q: number, r: number): string =>
  `SELECT yuplink.raid_mine_island_release(${sqlStr(mapId)}, ${Math.trunc(q)}, ${Math.trunc(r)}) AS id;`;

type MineRow = { q: unknown; r: unknown; owner_account: unknown };

/**
 * Закрыть все шахты острова с хозяином: несобранное к этой минуте (или до
 * поломки) ждёт «Забрать». Сбой одной шахты не мешает остальным. Возвращает,
 * сколько шахт закрыто.
 */
export async function claimIslandMines(mapId: string): Promise<number> {
  const rows = (await mcpExec(islandMinesSql(mapId), { wrapJson: true })) as MineRow[] | null;
  let n = 0;
  for (const m of rows ?? []) {
    try {
      await mcpExec(mineReleaseSql(mapId, Number(m.q), Number(m.r)), { wrapJson: true });
      n += 1;
    } catch (e) {
      console.warn(
        "[island] шахта перед сносом:",
        mapId,
        `${String(m.q)},${String(m.r)}`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return n;
}
