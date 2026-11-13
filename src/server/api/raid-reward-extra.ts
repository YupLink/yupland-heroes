// Выдача НОВЫХ видов награды: ресурс — на счёт, свой товар и босс — в рюкзак героя.
//
// Отдельный модуль от raid-helpers (лимит ≤250 строк) и потому, что своей
// арифметики здесь нет: обе ветки стоят на готовых функциях, которыми уже
// кормятся шахты, грядки и маркет. Здесь только ссылка, проверка и ключ
// повтора.
//
// Ссылку награда несёт в колонке pack_id (raid_reward): для ресурса это код
// (gold/stone/wood/diamonds), для товара — id справочника (cst_…).
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { isRewardResource } from "./reward-filler";
import { accountOf } from "./user-shared";
import type { MarketItem } from "@/lib/marketItem";
import type { StackOrigin } from "@/server/api/beta-raid/stack-origin";

/**
 * «Бытовые» отказы выдачи: награда не доехала, но виноват не сбой базы.
 * Клейм такие не роняет — строка остаётся в очереди, игрок читает ключ.
 */
export const SOFT_GRANT_ERRORS = [
  "market.need_hero",
  "market.backpack_no_hero",
  "market.backpack_need",
  "market.potion_bag_need",
  "raid.reward_bad_ref",
  // Клад не выдался (сбой начисления) — строка ждёт следующего «Забрать».
  "treasure.pay_later",
  // Доля казино не выдалась (сбой базы) — строка ждёт следующего «Забрать» (§8.124).
  "casino.share_later",
] as const;

/** Ссылки нет или она чужая: выдать нечего, но и терять награду нельзя. */
export const BAD_REF = "raid.reward_bad_ref";

/**
 * Ресурс на единый счёт. Идемпотентность даёт сама база: res_move хранит
 * (kind, ref) в res_ledger и повтор с тем же ref не зачисляет. Свой op-лог
 * здесь не нужен именно поэтому — в отличие от грядок, где тем же вызовом идут
 * лайки и билеты, дедупа не имеющие.
 *
 * Вид в журнале — происхождение (ПРАВИЛА §8.18): 'mob' — добыча с моба,
 * 'reward' — прочие награды карты (объекты, декор, грабёж). До 28.09 обе шли
 * шахтной функцией видом 'mine' и не отличались от шахт. Строку, уже
 * зачисленную любым из этих видов (сбой после записи — награда вернулась в
 * очередь; между попытками сменился вид — прежний 'mine', удалённый шаблон
 * босса), второй раз не зачисляем: дедуп res_move видит только свой вид.
 */
async function creditResource(opts: {
  account: string;
  code: string;
  amount: number;
  ref: string;
  origin?: StackOrigin | null;
}): Promise<void> {
  const ref = sqlStr(opts.ref);
  await mcpExec(
    `WITH fresh AS (
       SELECT 1 WHERE NOT EXISTS (
         SELECT 1 FROM yuplink.res_ledger
          WHERE kind IN ('mine', 'mob', 'reward') AND ref = ${ref})
     )
     SELECT yuplink.res_move(${sqlStr(opts.account)}, ${sqlStr(opts.code)}, ${opts.amount},
            ${sqlStr(opts.origin === "mob" ? "mob" : "reward")}, ${ref})
       FROM fresh;`,
  );
}

/**
 * Свой товар — в рюкзак ВЫБРАННОГО героя, тем же стеком, что и покупки в
 * маркете: «двадцать на ячейку» считается одинаково, ключ стека канонический.
 * Нет героя или нет места — бытовой отказ, награда ждёт в очереди.
 */
async function depositCustom(opts: {
  wallet: string;
  account: string;
  itemId: string;
  amount: number;
  ref: string;
  origin?: StackOrigin | null;
}): Promise<void> {
  const { canonCustomMeta } = await import("./beta-raid/item-alias");
  // Товара нет в справочнике — выдавать нечего: пустой стек «cst_…» в рюкзаке
  // хуже, чем награда, честно оставшаяся в очереди.
  const meta = await canonCustomMeta(opts.itemId);
  if (!meta) throw new Error(BAD_REF);

  const { resolveBackpack, depositToBackpack, assertBackpackRoom, stackKeyFor } =
    await import("./beta-raid/market-backpack");
  const bp = await resolveBackpack(opts.wallet);
  if (!bp) throw new Error("market.need_hero");

  // Витринной позиции у награды нет — собираем минимальный товар: рюкзаку
  // нужны только вид, ссылка, имя и картинка (подпись он всё равно берёт
  // у канона справочника).
  const item = {
    id: opts.itemId,
    kind: "custom",
    refId: opts.itemId,
    name: meta.name || opts.itemId,
    image: meta.image,
  } as unknown as MarketItem;

  await assertBackpackRoom(bp, await stackKeyFor(item), opts.amount);
  // Ключ повтора — ref награды (в нём id строки raid_reward): слепой ретрай
  // моста видит ключ занятым и стек второй раз не растит.
  await depositToBackpack({
    heroId: bp.heroId,
    account: opts.account,
    item,
    qty: opts.amount,
    nonce: opts.ref,
    capacity: bp.capacity,
    potionCapacity: bp.potionCapacity,
    // Метка награды (бой — mob, объект/декор/грабёж — loot): годится в сундук.
    origin: opts.origin ?? null,
  });
}

/**
 * Единая дверь для новых видов. `ref` — то, что лежит в pack_id награды.
 */
export async function grantExtraReward(opts: {
  kind: "resource" | "custom" | "boss";
  wallet: string;
  amount: number;
  ref: string | null;
  /** Ключ начисления: уникален на строку награды, стабилен между повторами. */
  opRef: string;
  /**
   * Происхождение награды: товар ляжет в рюкзак с этой меткой — его можно
   * положить в сундук; ресурс с 'mob' уйдёт в журнал счёта видом 'mob',
   * прочий — 'reward'.
   */
  origin?: StackOrigin | null;
}): Promise<void> {
  const amount = Number(opts.amount) || 0;
  if (!(amount > 0)) return;
  const ref = (opts.ref ?? "").trim();
  if (!ref) throw new Error(BAD_REF);
  const account = await accountOf(opts.wallet);

  if (opts.kind === "resource") {
    // Токен сюда не пускаем: Darai обязан идти видом "token", иначе обойдёт
    // залог свободного пула карты.
    if (!isRewardResource(ref)) throw new Error(BAD_REF);
    await creditResource({ account, code: ref, amount, ref: opts.opRef, origin: opts.origin });
    return;
  }

  // Босс (промокод, не влезший в рюкзак, promo-deliver): стопкой boss:<шаблон>
  // в рюкзак выбранного героя — тем же предметом, что охрана из лавки.
  if (opts.kind === "boss") {
    const { depositRefStack } = await import("./beta-raid/stack-deposit");
    await depositRefStack({
      wallet: opts.wallet,
      account,
      kind: "boss",
      ref,
      qty: amount,
      nonce: opts.opRef,
    });
    return;
  }

  if (!ref.startsWith("cst_")) throw new Error(BAD_REF);
  await depositCustom({
    wallet: opts.wallet,
    account,
    itemId: ref,
    amount,
    ref: opts.opRef,
    origin: opts.origin,
  });
}
