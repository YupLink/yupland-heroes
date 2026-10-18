// Общее начало ручек мешочка: кто действует, какой мешочек и стоит ли игрок
// вплотную. Одна проверка «подойди» на всех — окно, забрать, положить,
// закопать, выкопать, — иначе копии разъедутся (как у сундука, chest-row.ts).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { actionGate } from "@/server/rateGate";
import { accAccountId } from "@/server/api/currency/move";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { myMapId, ownCell } from "@/server/api/beta-raid/encounter-where";
import { hexDistance } from "@/server/api/beta-raid/helpers";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";
import { buildingHeldSql } from "@/server/api/beta-raid/cell-sql";

/** Кто действует: кошелёк, его карта и аккаунт (игрок = аккаунт). */
export type BagActor = { wallet: string; mapId: string; account: string };

/**
 * На клетке `b` (map_id, q, r) живой объект — босс воскрес поверх мешочка или
 * бугорка: сначала бой. Общее с бугорком сундука (plain-chest/pchest-dig).
 */
export const guardedSql = (b: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
            WHERE c.map_id = ${b}.map_id AND c.q = ${b}.q AND c.r = ${b}.r
              AND c.object_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
                               WHERE h.map_id = c.map_id AND h.q = c.q AND h.r = c.r
                                 AND h.cycle_no = 0
                                 AND (h.killed_at IS NOT NULL OR h.current_hp <= 0)))`;

/**
 * На клетке `b` стоит декор (дерево, камень…): он вырос поверх мешочка или
 * бугорка и перекрывает их (владелец, 29.09, дополнение №5) — сначала рубка.
 */
export const decorSql = (b: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
            WHERE c.map_id = ${b}.map_id AND c.q = ${b}.q AND c.r = ${b}.r
              AND c.decoration_id IS NOT NULL)`;

/**
 * Что держит мешочки и бугорки клетки: живой объект — bag.guarded (сначала
 * бой), декор — bag.decor (сначала рубка); свободно — null. Общее с окном
 * клетки и бугорком сундука (plain-chest/pchest-dig).
 */
export async function blockedAt(mapId: string, q: number, r: number): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT ${guardedSql("x")} AS guarded, ${decorSql("x")} AS decor
       FROM (SELECT ${sqlStr(mapId)}::text AS map_id, ${Math.floor(q)}::int AS q,
                    ${Math.floor(r)}::int AS r) x;`,
    { wrapJson: true },
  )) as Array<{ guarded: boolean; decor?: boolean }>;
  const row = rows?.[0];
  return row?.guarded === true ? "bag.guarded" : row?.decor === true ? "bag.decor" : null;
}

/**
 * Под зданием (и всей площадью большого) не закапывают (владелец, 03.10.2026):
 * отказ dig.under_building до денег и лопаты. Выкопать старое — можно, иначе
 * бугорок под новым зданием застрял бы навсегда.
 */
export async function requireNotUnderBuilding(mapId: string, q: number, r: number): Promise<void> {
  const rows = (await mcpExec(
    `SELECT ${buildingHeldSql("c")} AS held FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${Math.floor(q)} AND c.r = ${Math.floor(r)}
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ held: boolean }>;
  if (rows?.[0]?.held === true) throw new Error("dig.under_building");
}

/** Мешочек глазами ручки: где лежит, закопан ли, жив ли (есть живая порция). */
export type BagRow = { id: string; q: number; r: number; buried: boolean; alive: boolean };

/** Вход в ручку мешочка: гейт рейда, частота (для записи), карта и аккаунт. */
export async function bagActor(what: string | null): Promise<BagActor> {
  const wallet = await requireBetaRaid();
  if (what) await actionGate(what, wallet);
  const mapId = await myMapId(wallet);
  const account = await accAccountId(wallet).catch(() => null);
  if (!account) throw new Error("market.need_account");
  return { wallet, mapId, account };
}

/** Герой на клетке мешочка или на соседней, и клетка не под куполом. */
export async function requireBagNear(a: BagActor, q: number, r: number): Promise<void> {
  const pos = await ownCell(a.wallet);
  if (!pos || hexDistance(pos.q, pos.r, q, r) > 1) throw new Error("bag.approach");
  await requireNotVoid(a.wallet, a.mapId, q, r);
}

/**
 * Мешочек моей карты, и я рядом. Нет его, чужая карта, пуст или всё сгорело —
 * bag.gone. Живость здесь — подсказка для отказа; решает оператор записи под
 * локом.
 *
 * На клетке живой объект (босс воскрес поверх мешочка) — bag.guarded: сначала
 * бой, потом мешочек или кучка (владелец, 29.09). Клиент и так ведёт тап в бой,
 * пока объект жив (useLootBags), — здесь та же граница для прямого вызова.
 * Декор вырос поверх (дополнение №5) — bag.decor: сначала рубка.
 */
export async function bagNear(a: BagActor, bagId: string): Promise<BagRow> {
  const rows = (await mcpExec(
    `SELECT b.id, b.q, b.r, b.buried_at IS NOT NULL AS buried,
            EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
                     WHERE x.bag_id = b.id AND ${livePortion("x")}) AS alive,
            ${guardedSql("b")} AS guarded, ${decorSql("b")} AS decor
       FROM yuplink.raid_loot_bag b
      WHERE b.id = ${sqlStr(bagId)} AND b.map_id = ${sqlStr(a.mapId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    q: number | string;
    r: number | string;
    buried: boolean;
    alive: boolean;
    guarded: boolean;
    decor?: boolean;
  }>;
  const row = rows?.[0];
  if (!row || row.alive !== true) throw new Error("bag.gone");
  if (row.guarded === true) throw new Error("bag.guarded");
  if (row.decor === true) throw new Error("bag.decor");
  const bag = {
    id: row.id,
    q: Number(row.q),
    r: Number(row.r),
    buried: row.buried === true,
    alive: true,
  };
  await requireBagNear(a, bag.q, bag.r);
  return bag;
}
