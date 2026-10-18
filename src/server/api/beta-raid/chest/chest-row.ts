// Сундук на клетке: кто его хозяин и стоит ли игрок рядом.
//
// Общая часть всех ручек сундука (поставить, окно, положить, забрать,
// разграбить, забрать сундук) и охраны на нём: одна проверка «подойди» и одна «чей», иначе
// копии разъедутся — у склада окно пускало с соседней клетки, а забор нет.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { actionGate } from "@/server/rateGate";
import { accAccountId } from "@/server/api/currency/move";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { myMapId, ownCell } from "@/server/api/beta-raid/encounter-where";
import { hexDistance } from "@/server/api/beta-raid/helpers";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { guardAlive, loadGuardRow } from "@/server/api/beta-raid/mine-guard-read";

export type ChestRow = {
  owner_account: string;
  item_id: string;
  name: string;
  image: string | null;
  /** Закопан (бугорок, 29.09): не открыть, не ограбить, не забрать. */
  buried?: boolean;
};

/** Кто действует: кошелёк, его карта и аккаунт (игрок = аккаунт). */
export type ChestActor = { wallet: string; mapId: string; account: string };

export const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Первая строка ответа запроса, который сам собирает row_to_json: мост отдаёт
 * `_row` то объектом, то строкой JSON, прямой канал — объектом.
 */
export function sqlRow<T>(rows: unknown[] | null | undefined): T | undefined {
  const raw = rows?.[0];
  if (!raw || typeof raw !== "object") return undefined;
  const inner = "_row" in raw ? (raw as { _row: unknown })._row : raw;
  if (typeof inner === "string") {
    try {
      return JSON.parse(inner) as T;
    } catch {
      return undefined;
    }
  }
  return (inner ?? undefined) as T | undefined;
}

/** Вход в любую ручку сундука: гейт рейда, частота, карта и аккаунт. */
export async function chestActor(what: string): Promise<ChestActor> {
  const wallet = await requireBetaRaid();
  await actionGate(what, wallet);
  const mapId = await myMapId(wallet);
  const account = await accAccountId(wallet).catch(() => null);
  if (!account) throw new Error("market.need_account");
  return { wallet, mapId, account };
}

/** Сундук на клетке или null. */
export async function loadChest(mapId: string, q: number, r: number): Promise<ChestRow | null> {
  const rows = (await mcpExec(
    `SELECT owner_account, item_id, name, image, (buried_at IS NOT NULL) AS buried
       FROM yuplink.raid_magic_chest
      WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r} LIMIT 1;`,
    { wrapJson: true },
  )) as ChestRow[];
  return rows?.[0] ?? null;
}

/**
 * Герой на клетке сундука или на соседней, и клетка не под куполом. Ключ
 * отказа — словарём, игрок прочтёт его на своём языке.
 */
export async function requireChestNear(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
): Promise<void> {
  const pos = await ownCell(wallet);
  if (!pos || hexDistance(pos.q, pos.r, q, r) > 1) throw new Error("chest.approach");
  await requireNotVoid(wallet, mapId, q, r);
}

/**
 * Сундук на клетке и я рядом — свой или чужой (29–30.09: чужой открывает,
 * берёт из сети хозяина и кладёт в неё, когда живой охраны нет). Нет —
 * chest.gone; закопан — своему chest.buried, чужому chest.gone (что под
 * бугорком сундук, не говорим); чужой при живой охране — chest.guarded.
 */
export async function chestNearAny(
  a: ChestActor,
  q: number,
  r: number,
): Promise<{ chest: ChestRow; mine: boolean }> {
  const chest = await loadChest(a.mapId, q, r);
  const mine = !!chest && chest.owner_account === a.account;
  if (!chest || (chest.buried && !mine)) throw new Error("chest.gone");
  if (chest.buried) throw new Error("chest.buried");
  await requireChestNear(a.wallet, a.mapId, q, r);
  if (!mine && guardAlive(await loadGuardRow(a.mapId, q, r))) throw new Error("chest.guarded");
  return { chest, mine };
}

/** Стоит ли на клетке сундук этого аккаунта — для охраны (mine-guard.ts). */
export async function isMyChestAt(
  mapId: string,
  q: number,
  r: number,
  account: string,
): Promise<boolean> {
  const chest = await loadChest(mapId, q, r).catch(() => null);
  return !!chest && chest.owner_account === account;
}
