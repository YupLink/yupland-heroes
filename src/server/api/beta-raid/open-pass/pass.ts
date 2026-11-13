// Вход в мешочек и сундук за энергию (владелец, 29–30.09.2026; ПРАВИЛА §8.23).
//
// «Открыть» мешочек — 1 энергия; обычный или магический сундук — занятые
// ячейки в миг открытия, но не меньше 1 (у магического — ячейки сети
// владельца; lib/openPass). Каждое новое открытие платит заново (30.09):
// живой вход ничего не даёт даром и не продлевается; повтор того же нажатия и
// тап при ещё живом входе — без платы и без записи. Вход живёт, пока окно
// открыто и герой не сошёл с клетки, но не дольше 10 минут от нажатия;
// «Положить» и «Забрать» внутри входа бесплатны, без живого входа — отказ
// pass.closed («Сначала открой»). Закрыл окно — вход закрыт. Цена выше
// показанной кнопкой — отказ pass.price_changed, ничего не списано.
// Касается и владельца своего магического сундука. Чужой открывает
// магический, когда живой охраны нет, и платит по ячейкам сети хозяина.
// Рыба от красного динамита (30.10.2026) открывается как мешочек; башмак внутри —
// тот же оператор входа снимает его (loot-bag/bag-fish), ответ boot — окну «Упс,
// показалось», рыба исчезает у всех. Повтор нажатия, когда рыбы уже нет, — тот же ответ.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { EnergySpendReason } from "@/lib/econ/types";
import { noteEnergySpendByWallet } from "@/server/api/beta-raid/econ/energy-note";
import { BAG_OPEN_PRICE } from "@/lib/openPass";
import { chestNearAny, requireChestNear, sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { bagNear } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { bootAgainSql } from "@/server/api/beta-raid/loot-bag/bag-fish";
import { publishRaid } from "@/server/raidLive";
import { loadPlainChest, pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import {
  bagTarget,
  cellsPriceSql,
  closePassSql,
  magicTarget,
  openPassSql,
  passAliveSql,
  plainTarget,
  type OpenRow,
} from "@/server/api/beta-raid/open-pass/pass-sql";
import { priceOnMapSql } from "@/server/api/beta-raid/open-pass/pass-price";

/** Живой ли вход аккаунта в цель (свежим чтением). */
export async function passOpen(account: string, target: string): Promise<boolean> {
  const rows = (await mcpExec(`SELECT ${passAliveSql(account, sqlStr(target))} AS alive;`, {
    wrapJson: true,
  })) as Array<{ alive: boolean }>;
  return rows?.[0]?.alive === true;
}

/** «Положить» / «Забрать» — только внутри живого входа. */
export async function requirePass(account: string, target: string): Promise<void> {
  if (!(await passOpen(account, target))) throw new Error("pass.closed");
}

/** Нехватку энергии — ключом «Нужно N энергии» (N — сколько просили). */
function energyError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const m = /not_enough_energy:(-?[\d.]+):([\d.]+)/.exec(msg);
  return m ? new Error(`braid.need_energy|${JSON.stringify({ n: Number(m[2]) })}`) : (e as Error);
}

/** Ключ нажатия «Открыть» от окна. */
const opKey = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/);

const openInput = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /** Мешочек клетки; нет — сундук на клетке (обычный или свой магический). */
  bagId: z.string().regex(/^lb_[0-9a-f]{32}$/).optional(),
  /** Ключ нажатия: повтор того же нажатия второй раз не платит. */
  op: opKey,
  /** Цена, которую показала кнопка: сейчас дороже — не платим (вкладка до выката — без неё).
   *  Дробная: на острове вход в 10 раз дешевле (0,1). */
  price: z.number().min(0).max(100_000).optional(),
});

/** Ответ «Открыть»; boot — открыли рыбу с башмаком: «Упс, показалось», рыбы больше нет. */
export type OpenAnswer = { ok: true; paid: number; until: string | null; boot?: true };

/** Ключ нажатия в строке входа: «open:» + ключ окна (закрытие ищет по нему же). */
const openOp = (op: string): string => `open:${op}`;

/**
 * Рыбы уже не видно (bag.gone), а это повтор нажатия, которое сняло её башмак: ответ
 * тот же «Упс, показалось», без платы. Сбой чтения — прежний отказ.
 */
async function bootAgain(a: { account: string }, bagId: string, op: string): Promise<boolean> {
  const sql = bootAgainSql({ account: a.account, target: bagTarget(bagId), bagId, op });
  const rows = (await mcpExec(sql, { wrapJson: true }).catch(() => [])) as Array<{
    boot?: boolean;
  }> | null;
  return rows?.[0]?.boot === true;
}

type Actor = Awaited<ReturnType<typeof pchestActor>>;
type Aim = { target: string; priceSql: string; reason: EnergySpendReason; cell: { q: number; r: number } };
/** Мешочек входа: оператор входа снимает и метку башмака (bag-fish). */
type BagAim = Aim & { bagId?: string };

/** Что открываем и почём — проверки «подойди», «не закопан», «свой» — до денег. */
async function aimOf(a: Actor, data: z.infer<typeof openInput>): Promise<BagAim> {
  if (data.bagId) {
    const bag = await bagNear(a, data.bagId);
    if (bag.buried) throw new Error("bag.buried");
    const priceSql = String(BAG_OPEN_PRICE);
    const cell = { q: bag.q, r: bag.r };
    return { target: bagTarget(bag.id), priceSql, reason: "bag_open", cell, bagId: bag.id };
  }
  const cell = { q: data.q, r: data.r };
  const plain = await loadPlainChest(a.mapId, data.q, data.r);
  if (plain) {
    if (plain.buried) throw new Error("pchest.buried");
    await requireChestNear(a.wallet, a.mapId, data.q, data.r);
    const where = `s.chest_id = ${sqlStr(plain.id)}`;
    const priceSql = cellsPriceSql("yuplink.raid_plain_chest_slot", where);
    return { target: plainTarget(plain.id), priceSql, reason: "chest_open", cell };
  }
  // Магический: свой — всегда, чужой — когда живой охраны нет (четвёртая
  // редакция, 29.09). Цена — занятые ячейки сети ХОЗЯИНА, не меньше 1.
  const { chest } = await chestNearAny(a, data.q, data.r);
  const where = `s.account_id = ${sqlStr(chest.owner_account)}`;
  return {
    target: magicTarget(a.mapId, data.q, data.r),
    priceSql: cellsPriceSql("yuplink.raid_chest_slot", where),
    reason: "chest_open",
    cell,
  };
}

export const openStorage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => openInput.parse(d))
  .handler(async ({ data }): Promise<OpenAnswer> => {
    const a = await pchestActor("storage-open");
    const aim = await aimOf(a, data).catch(async (e: unknown) => {
      const gone = e instanceof Error && e.message === "bag.gone" && !!data.bagId;
      if (gone && (await bootAgain(a, data.bagId ?? "", openOp(data.op)))) return null;
      throw e;
    });
    if (!aim) return { ok: true as const, paid: 0, until: null, boot: true };
    // На острове вход в 10 раз дешевле (island/energy) — как и цена в окне.
    aim.priceSql = priceOnMapSql(aim.priceSql, a.mapId);
    const who = { account: a.account, wallet: a.wallet, op: openOp(data.op), maxPrice: data.price };
    let row: OpenRow | undefined;
    try {
      row = sqlRow<OpenRow>((await mcpExec(openPassSql({ ...who, ...aim }))) as unknown[]);
    } catch (e) {
      throw energyError(e);
    }
    if (!row) throw new Error("chest.busy");
    if (!row.near) throw new Error(data.bagId ? "bag.approach" : "chest.approach");
    // Сеть наполнили, пока кнопка показывала старую цену, — ни платы, ни входа.
    const price = Number(row.price) || 0;
    if (!row.free && data.price != null && price > data.price) {
      throw new Error(`pass.price_changed|${JSON.stringify({ n: price })}`);
    }
    const paid = Number(row.paid) || 0;
    if (paid > 0) void noteEnergySpendByWallet(a.wallet, paid, aim.reason);
    const res: OpenAnswer = { ok: true as const, paid, until: row.until ?? null };
    if (row.boot !== true) return res;
    // Рыба-башмак: метку снял этот же оператор — рыбы больше нет ни у кого.
    publishRaid({ mapId: a.mapId, type: "bags", cells: [`${aim.cell.q},${aim.cell.r}`] });
    return { ...res, boot: true };
  });

/**
 * Окно закрыли — его входы закрыты: следующее открытие снова платное. ops —
 * ключи нажатий окна: гасим только свои входы, опоздавшее закрытие не тронет
 * вход, оплаченный новым окном. chest: false — только мешочки (окно мешочков
 * не закрывает вход в сундук клетки). Без полей (вкладка до выката) — всё на
 * клетке, как раньше.
 */
export const closeStorage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        bagIds: z.array(z.string().regex(/^lb_[0-9a-f]{32}$/)).max(100).default([]),
        chest: z.boolean().optional(),
        ops: z.array(opKey).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const a = await pchestActor(null);
    const ops = data.ops?.map(openOp);
    await mcpExec(closePassSql({ account: a.account, mapId: a.mapId, ...data, ops }));
    return { ok: true as const };
  });
