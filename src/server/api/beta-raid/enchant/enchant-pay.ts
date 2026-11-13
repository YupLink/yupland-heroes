// Оплата попытки зачарования — механизмом маркета (market-money: spend/credit).
//
// Позиция цены — то же, что цена товара в лавке:
//   resource → золото/камень/дерево/алмазы (res_move), лайки, энергия;
//   token    → счёт токенов (DARAI — в пул карты, как маркет);
//   custom   → свой товар лавок из рюкзака основного героя (канон стека).
// Вся цена берётся ДО броска, по позиции за раз; сорвалась любая — уже
// списанное возвращается теми же квитанциями (как у второй цены маркета), и
// игрок остаётся при своём. Провал возврата не глотаем — алерт админам
// (market-undo-alert), как у маркета.
import type { MarketPriceResource } from "@/lib/marketItem";
import type { EnchantCost } from "@/lib/enchant/enchant";
import type { SpendReceipt } from "@/server/api/beta-raid/market-money";

/** Ресурсы игры, которыми можно назначить цену (тот же счёт, что у маркета). */
export const ENCHANT_RESOURCES = ["gold", "stone", "wood", "diamonds", "likes", "energy"] as const;
export const isEnchantResource = (code: string): boolean =>
  (ENCHANT_RESOURCES as readonly string[]).includes(code);

/** Позиция цены лавки → цена маркета (вид + символ/шаблон). */
export function marketPriceOf(c: EnchantCost): { res: MarketPriceResource; token: string | null } {
  if (c.kind === "token") return { res: "token", token: c.code };
  if (c.kind === "custom") return { res: "custom", token: c.code };
  if (!isEnchantResource(c.code)) throw new Error("enchant.bad_cost");
  return { res: c.code as MarketPriceResource, token: null };
}

/** Что списано: позиция, её ключ и квитанция для отката. */
export type PaidLine = { cost: EnchantCost; ref: string; receipt: SpendReceipt };

/** Деньги — снаружи подменяемы: тесты считают списания без базы. */
export type PayPort = {
  spend: (
    wallet: string,
    account: string,
    res: MarketPriceResource,
    token: string | null,
    amount: number,
    ref: string,
  ) => Promise<SpendReceipt>;
  credit: (
    wallet: string,
    account: string,
    res: MarketPriceResource,
    token: string | null,
    amount: number,
    ref: string,
    receipt?: SpendReceipt,
  ) => Promise<void>;
  /** Возврат не прошёл — сигнал админам (деньги взяты и не вернулись). */
  undoFailed?: (line: PaidLine, e: unknown) => Promise<void>;
};

/** Отказ оплаты → ключ словаря. Нехватка любого вида — один понятный текст. */
export function payErrorKey(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/market\.need_hero|выбери героя/i.test(msg)) return "enchant.need_hero";
  if (/not_enough|не хватает|недостаточно|в минус|нужно .* у тебя|insufficient/i.test(msg))
    return "enchant.not_enough";
  return msg || "enchant.failed";
}

/** Вернуть списанное — в обратном порядке, каждую позицию своим ключом. */
export async function refundEnchant(
  port: PayPort,
  wallet: string,
  account: string,
  paid: PaidLine[],
): Promise<void> {
  for (const line of [...paid].reverse()) {
    const p = marketPriceOf(line.cost);
    try {
      await port.credit(
        wallet,
        account,
        p.res,
        p.token,
        line.cost.amount,
        `${line.ref}:undo`,
        line.receipt,
      );
    } catch (e) {
      if (port.undoFailed) await port.undoFailed(line, e);
      else console.error("[enchant] возврат не прошёл:", line.ref, e);
    }
  }
}

/** Взять всю цену. Сорвалось на середине — вернуть уплаченное и бросить ключ отказа. */
export async function payEnchant(
  port: PayPort,
  wallet: string,
  account: string,
  costs: EnchantCost[],
  ref: string,
): Promise<PaidLine[]> {
  const paid: PaidLine[] = [];
  for (let i = 0; i < costs.length; i += 1) {
    const cost = costs[i];
    const lineRef = `${ref}:${i}`;
    try {
      const p = marketPriceOf(cost);
      const receipt = await port.spend(wallet, account, p.res, p.token, cost.amount, lineRef);
      paid.push({ cost, ref: lineRef, receipt });
    } catch (e) {
      await refundEnchant(port, wallet, account, paid);
      throw new Error(payErrorKey(e));
    }
  }
  return paid;
}

/** Настоящие деньги: функции маркета и его алерт о провале возврата. */
export async function marketPayPort(
  wallet: string,
  account: string,
  payRef: string,
): Promise<PayPort> {
  const { spend, credit } = await import("@/server/api/beta-raid/market-money");
  const { undoFailReporter } = await import("@/server/api/beta-raid/market-undo-alert");
  const report = undoFailReporter({ wallet, account, side: "buy", payRef });
  return {
    spend: (w, a, res, token, amount, ref) => spend(w, a, res, token, amount, ref),
    credit,
    undoFailed: async (line, e) => {
      const p = marketPriceOf(line.cost);
      await report(
        p.res,
        p.token,
        line.cost.amount,
        line.ref,
        `${line.ref.slice(payRef.length + 1)}:undo`,
      )(e);
    },
  };
}
