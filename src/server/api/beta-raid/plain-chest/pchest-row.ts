// Обычный сундук на клетке: кто действует, какой сундук и стоит ли игрок рядом.
//
// Общее начало всех ручек сундука (окно, положить, забрать, «Забрать сундук»,
// закопать): одна проверка «подойди» (та же, что у магического, chest-row) и
// одно чтение строки. Хозяина у сундука нет — пользуется любой вплотную.
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { actionGate } from "@/server/rateGate";
import { accAccountId } from "@/server/api/currency/move";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { myMapId } from "@/server/api/beta-raid/encounter-where";
import { canonRef, refFromStackKey } from "@/server/api/beta-raid/item-alias";
import { requireChestNear, type ChestActor } from "@/server/api/beta-raid/chest/chest-row";

/** Сундук на клетке: id склада, товар, закопан ли. */
export type PlainChestRow = {
  id: string;
  q: number;
  r: number;
  itemId: string;
  name: string;
  image: string | null;
  buried: boolean;
};

/** Вход в ручку: гейт рейда, частота (для записи; null — чтение), карта и аккаунт. */
export async function pchestActor(what: string | null): Promise<ChestActor> {
  const wallet = await requireBetaRaid();
  if (what) await actionGate(what, wallet);
  const mapId = await myMapId(wallet);
  const account = await accAccountId(wallet).catch(() => null);
  if (!account) throw new Error("market.need_account");
  return { wallet, mapId, account };
}

/** Вход «положить» / «забрать»: клетка сундука, стек, сколько и ключ нажатия. */
export const moveInput = z.object({
  q: z.number().int(),
  r: z.number().int(),
  stackKey: z.string().min(1).max(200),
  qty: z.number().positive().max(100_000),
  /** Ключ нажатия: повтор того же нажатия второй раз ничего не двигает. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

/** Строка сундука клетки — выражением для запросов соседних модулей. */
export const plainAtSql = (a: string, mapId: string, q: number, r: number): string =>
  `${a}.map_id = ${sqlStr(mapId)} AND ${a}.q = ${Math.floor(q)} AND ${a}.r = ${Math.floor(r)}`;

/** Сундук на клетке или null. Ошибку базы не глотаем: «не прочли» — не «нет». */
export async function loadPlainChest(
  mapId: string,
  q: number,
  r: number,
): Promise<PlainChestRow | null> {
  const rows = (await mcpExec(
    `SELECT c.id, c.q, c.r, c.item_id AS "itemId", c.name, c.image,
            (c.buried_at IS NOT NULL) AS buried
       FROM yuplink.raid_plain_chest c
      WHERE ${plainAtSql("c", mapId, q, r)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Omit<PlainChestRow, "q" | "r"> & { q: unknown; r: unknown }>;
  const row = rows?.[0];
  if (!row?.id) return null;
  return {
    id: String(row.id),
    q: Number(row.q),
    r: Number(row.r),
    itemId: String(row.itemId),
    name: String(row.name ?? ""),
    image: row.image ?? null,
    buried: row.buried === true,
  };
}

/**
 * Стоящий (не закопанный) сундук на клетке, и я рядом. Нет — pchest.gone,
 * закопан — pchest.buried: пока он бугорок, ни положить, ни забрать, ни
 * «Забрать сундук».
 */
export async function plainNear(a: ChestActor, q: number, r: number): Promise<PlainChestRow> {
  const chest = await loadPlainChest(a.mapId, q, r);
  if (!chest) throw new Error("pchest.gone");
  if (chest.buried) throw new Error("pchest.buried");
  await requireChestNear(a.wallet, a.mapId, q, r);
  return chest;
}

/** Сундук не стоит: закопан или его уже нет — точной причиной. */
export async function whyNotHere(mapId: string, q: number, r: number): Promise<string> {
  const now = await loadPlainChest(mapId, q, r).catch(() => null);
  return now?.buried ? "pchest.buried" : "pchest.gone";
}

/**
 * Сундук ли этот стек рюкзака (custom:cst_… с галочкой plain_chest). Ошибку
 * базы не глотаем: «не узнали» — не «не сундук».
 */
export async function isPlainChestStack(stackKey: string): Promise<boolean> {
  if (!stackKey.startsWith("custom:")) return false;
  const id = (await canonRef("custom", refFromStackKey(stackKey))) ?? "";
  if (!id.startsWith("cst_")) return false;
  const rows = (await mcpExec(
    `SELECT plain_chest AS chest FROM yuplink.raid_custom_item WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ chest: boolean | null }>;
  return rows?.[0]?.chest === true;
}

/** Ключ нажатия: исход, сколько переложено и итог «Забрать сундук». */
export type PchestOp = { state: string; qty: number; result: unknown };

/**
 * Прежний исход нажатия (свежим отдельным чтением) или null — нажатия не было.
 * Нужен, когда ответ записи потерялся: ключ ложится только вместе с делом.
 */
export async function loadOp(op: string): Promise<PchestOp | null> {
  const rows = (await mcpExec(
    `SELECT state, qty, result FROM yuplink.raid_plain_chest_op WHERE op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ state: string; qty: unknown; result: unknown }>;
  const row = rows?.[0];
  if (!row?.state) return null;
  return { state: String(row.state), qty: Number(row.qty) || 0, result: row.result ?? null };
}
