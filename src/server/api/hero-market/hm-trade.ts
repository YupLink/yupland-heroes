// Рынок героев: купить лот и снять свой (ПРАВИЛА §8.67).
//
// Покупка — один вызов hero_market_buy: под замком строки лота сверка (жив ли,
// не свой ли, есть ли цена в выбранной валюте, та ли цена, хватает ли денег),
// деньги (покупатель → 91 % продавцу, 9 % комиссии) и переезд героя с его
// артефактами на аккаунт покупателя — одной транзакцией. Двойное нажатие / вторая
// вкладка ждёт первую и видит «уже купили» (или, с тем же ключом, — тот же итог);
// списания второй раз не бывает: деньги ключуются лотом ('hmkt:<лот>'). Сломанное
// с купленного героя снимается следом (art-broken.stripBrokenFromHero, §8.63 п.3).
//
// Снятие — hero_market_withdraw: только продавец и только активный лот; герой и
// артефакты возвращаются продавцу. Карманы назад не едут — они уже в мешочке на
// карте, где их можно поднять.
import { z } from "zod";
import type { HeroMarketCurrency } from "@/lib/heroMarket";
import { marketLockState } from "@/server/api/chips-market-lock";
import {
  OP_RE,
  buyCallSql,
  callFn,
  dbErrorText,
  opKey,
  refusalText,
  withdrawCallSql,
  type HmResult,
} from "@/server/api/hero-market/hm-call";

export const buyInputSchema = z.object({
  op: z.string().regex(OP_RE),
  lotId: z.string().trim().min(1).max(80),
  currency: z.enum(["gold", "darai"]),
  /** Цена, которую видел игрок: другая в базе — отказ «цена изменилась». */
  expectPrice: z.number().positive().optional(),
});
export type BuyInput = z.infer<typeof buyInputSchema>;

export const withdrawInputSchema = z.object({
  op: z.string().regex(OP_RE),
  lotId: z.string().trim().min(1).max(80),
});
export type WithdrawInput = z.infer<typeof withdrawInputSchema>;

export type BuyResult = {
  ok: true;
  /** false — повтор уже прошедшей покупки тем же нажатием (денег второй раз не брали). */
  fresh: boolean;
  lotId: string;
  itemId: string;
  heroId: string | null;
  currency: HeroMarketCurrency;
  price: number;
  fee: number;
  sellerGot: number;
};

export type WithdrawResult = { ok: true; fresh: boolean; lotId: string; itemId: string };

/** Вызов функции: исключение базы → ключ словаря, отказ по существу → ключ с подстановками. */
async function run(sql: string): Promise<HmResult> {
  let r: HmResult;
  try {
    r = await callFn(sql);
  } catch (e) {
    console.warn("[hero-market] сделка не прошла:", e instanceof Error ? e.message : e);
    throw new Error(dbErrorText(e));
  }
  if (!r.ok) throw new Error(refusalText(r));
  return r;
}

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function buyHeroAs(
  wallet: string,
  account: string,
  input: BuyInput,
): Promise<BuyResult> {
  // Новичок — как на маркете фишек: покупка открывается после первого купленного пака.
  if ((await marketLockState(account)).locked) throw new Error("heromkt.market_locked");
  const r = await run(
    buyCallSql({
      op: opKey(account, input.op),
      account,
      wallet,
      lotId: input.lotId,
      currency: input.currency,
      expect: input.expectPrice ?? null,
    }),
  );
  const currency: HeroMarketCurrency = r.currency === "darai" ? "darai" : "gold";
  const heroId = typeof r.heroId === "string" ? r.heroId : null;
  // Сломанное на купленном герое — в инвентарь покупателя (§8.63 п.3): надетым
  // сломанный не приезжает. Механика не запущена — ничего; повтор — тот же итог.
  if (heroId) {
    const { stripBrokenFromHero } = await import("@/server/api/art-repair/art-broken");
    await stripBrokenFromHero(wallet, heroId, `hm_${String(r.lotId ?? input.lotId)}`);
  }
  if (r.fresh !== false && currency === "darai") {
    // Комиссия DARAI легла в корзины — пачкой, если набрали порог (как после лота аукциона).
    void import("@/server/api/energy-sub/batch")
      .then((m) => m.runDueBatches("auto"))
      .catch((e: unknown) =>
        console.warn("[hero-market] пачки:", e instanceof Error ? e.message : e),
      );
  }
  return {
    ok: true,
    fresh: r.fresh !== false,
    lotId: String(r.lotId),
    itemId: String(r.itemId),
    heroId,
    currency,
    price: n(r.price),
    fee: n(r.fee),
    sellerGot: n(r.sellerGot),
  };
}

export async function withdrawHeroAs(
  account: string,
  input: WithdrawInput,
): Promise<WithdrawResult> {
  const r = await run(
    withdrawCallSql({ op: opKey(account, input.op), account, lotId: input.lotId }),
  );
  return { ok: true, fresh: r.fresh !== false, lotId: String(r.lotId), itemId: String(r.itemId) };
}
