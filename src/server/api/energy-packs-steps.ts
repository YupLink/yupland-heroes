// Серверная часть умного предложения: сколько раз игрок уже купил пак
// КАЖДОЙ валютой сегодня и сколько стоит следующая покупка.
//
// День считаем ровно так же, как атомарная функция покупки:
// date_trunc('day', now() AT TIME ZONE 'UTC') — иначе лимиты разъедутся.
import { pg } from "../db/pg";
import {
  parsePricing,
  optionFor,
  nextPrice,
  totalTimes,
  payKey,
  payName,
  usdKeyOf,
  type OfferPricing,
  type PayKind,
} from "@/lib/energySteps";

export type { OfferPricing, PayKind };

/** Начало текущих UTC-суток — граница дневных лимитов. */
export function utcDayStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** Настройка предложения (пусто — у пака старые одиночные цены). */
export function pricingOf(pack: { price_steps?: unknown }): OfferPricing {
  return parsePricing(pack.price_steps);
}

/**
 * Сколько раз пак куплен сегодня, В РАЗРЕЗЕ ВАЛЮТ.
 * Ключи: "tickets" | "darai" | "token:HOPE".
 */
export async function boughtTodayByCurrency(
  packId: string,
  account: string,
  /** Ключ тарифа в $ этого пака (usdKeyOf): туда же идут покупки за звёзды. */
  usdKey: string | null = null,
): Promise<Map<string, number>> {
  const { data } = await pg.energyPackPurchases
    .raw()
    .select("pay_with,token_symbol")
    .eq("pack_id", packId)
    .eq("account_id", account)
    .gte("created_at", utcDayStart());
  const rows = (data ?? []) as Array<{ pay_with: string; token_symbol: string | null }>;
  const out = new Map<string, number>();
  for (const r of rows) {
    // Покупка за звёзды по тарифу в $ (pay_with 'usd') — в счётчик тарифа:
    // вида usd или USDT-лесенки (usdKey пака).
    const key =
      r.pay_with === "usd"
        ? (usdKey ?? "usd")
        : r.pay_with === "token" && r.token_symbol
          ? `token:${r.token_symbol}`
          : r.pay_with;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

export type CurrencyOffer = {
  key: string;
  label: string;
  kind: "tickets" | "darai" | "usd" | "token";
  symbol?: string;
  /** Цена следующей покупки этой валютой (null — на сегодня всё). */
  price: number | null;
  used: number;
  total: number;
};

/** Что игрок видит по каждой валюте: цена сейчас, сколько уже взял, лимит. */
export async function offersFor(
  pack: { id: string; price_steps?: unknown },
  account: string,
): Promise<CurrencyOffer[]> {
  const pricing = pricingOf(pack);
  if (pricing.length === 0) return [];
  const used = await boughtTodayByCurrency(pack.id, account, usdKeyOf(pricing));
  return pricing.map((opt) => {
    const key = payKey(opt);
    const u = used.get(key) ?? 0;
    return {
      key,
      label: payName(opt),
      kind: opt.kind,
      symbol: opt.kind === "token" ? opt.symbol : undefined,
      price: nextPrice(opt, u),
      used: u,
      total: totalTimes(opt),
    };
  });
}

/**
 * Цена следующей покупки выбранной валютой. Кидает понятную ошибку, если
 * этой валютой платить нельзя или её ступени на сегодня кончились —
 * ОСТАЛЬНЫЕ валюты при этом остаются доступными.
 */
export async function requireCurrencyPrice(
  pack: { id: string; price_steps?: unknown },
  account: string,
  pay: PayKind,
): Promise<number> {
  const pricing = pricingOf(pack);
  const opt = optionFor(pricing, pay);
  if (!opt) throw new Error(`Этот пак нельзя оплатить через ${payName(pay)}`);
  const used =
    (await boughtTodayByCurrency(pack.id, account, usdKeyOf(pricing))).get(payKey(pay)) ?? 0;
  const price = nextPrice(opt, used);
  if (price == null) {
    throw new Error(
      `Лимит покупок за ${payName(pay)} на сегодня исчерпан (${used} из ${totalTimes(opt)}) — попробуй другую валюту`,
    );
  }
  return price;
}
