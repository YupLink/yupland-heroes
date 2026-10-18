// Гейт «в глухом тумане ничего не делают» — общий для боя, стройки и вышки.
//
// Клиент такие клетки не показывает и тапать не даёт, но клиент — не защита:
// запрос с координатами внутри зоны собирается руками. Раньше закрыт был
// только ХОД (helpers.isValidMove), а удар, постройка и осмотр с вышки
// работали с соседней клетки как ни в чём не бывало: стена держала ноги, но
// не руки.
//
// Спрашиваем живьём, без loadVoidCells. Тот кэш живёт минуту и обслуживает
// туман войны, где протухший ответ безвреден — игрок увидит чёрный гекс чуть
// позже. Здесь протухший ответ — дыра в стене ровно на время TTL.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { isAdminWallet } from "../../auth";
import { VOID_SQL } from "./voidCells";

/** Накрыта ли клетка глухим туманом — по флагу самой клетки. */
export async function isVoidCellLive(mapId: string, q: number, r: number): Promise<boolean> {
  // Шаблон местности не спрашиваем: купол лежит на клетке. Прежний INNER JOIN
  // заодно терял клетку с осиротевшим terrain_id — в этой дырке стены не было.
  const rows = (await mcpExec(
    `SELECT 1 AS hit
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
        AND ${VOID_SQL} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ hit: number }>;
  return (rows?.length ?? 0) > 0;
}

/**
 * Кому глухой туман не преграда.
 *
 * ОДИН ответ на весь рейд — ход, удар, стройка, вышка, корабль, туман войны.
 * Раньше «а можно ли админу» решалось в каждом гейте отдельно (где-то через
 * isAdminWallet, где-то никак), и ход админа упирался в стену, которую его же
 * удар пробивал. Клиент спрашивает то же самое у сессии (`session.isAdmin`),
 * а та считает ответ этим же ADMIN_WALLETS — списки не разъедутся.
 *
 * Зону рисует админ, и проверить её можно только действием: закрытый ему гейт
 * означал бы туман, который нечем отладить.
 */
export function canIgnoreVoid(wallet: string | null): boolean {
  return isAdminWallet(wallet);
}

/**
 * Отказать, если цель действия стоит в глухом тумане.
 *
 * Отказ — КЛЮЧОМ словаря: serverErrorText переведёт его на языке игрока, а
 * русская фраза посреди EN-интерфейса нарушала бы §4.0.1.
 */
export async function requireNotVoid(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
): Promise<void> {
  if (canIgnoreVoid(wallet)) return;
  if (await isVoidCellLive(mapId, q, r)) throw new Error("braid.void_blocked");
}
