// Билетные предложения: цены «от якоря» и проверка «за энергию» (07.10.2026).
//
// Владелец: «если DARAI — пляши от них, если $ — от $». Якорь — то, в чём цена
// задана: у строки в DARAI DARAI остаётся как стоит, а USDT и звёзды считаются
// от неё по курсу; у строки с price_usd всё считается от $ (lib/usdTariff.ts).
import { pricesFromDarai, usdPrices, type UsdPrices } from "@/lib/usdTariff";

type OfferRow = {
  price_energy: number;
  payment_token: string | null;
  price_usd?: number | string | null;
};

/** Цена тарифа в $ (null — обычное предложение). */
export function offerUsd(row: { price_usd?: number | string | null }): number | null {
  const usd = Number(row.price_usd);
  return row.price_usd != null && Number.isFinite(usd) && usd > 0 ? usd : null;
}

/** Цена в DARAI — якорь строки (токен Darai). */
export function offerDarai(row: { payment_token: string | null; price_token: number | null }): number | null {
  const v = Number(row.price_token);
  return row.payment_token === "Darai" && Number.isFinite(v) && v > 0 ? v : null;
}

type PricedRow = {
  payment_token: string | null;
  price_token: number | null;
  price_usd?: number | string | null;
};

/** Курс DARAI нужен, только если есть строки в $ или в DARAI. */
export async function rateFor(rows: PricedRow[]) {
  if (!rows.some((r) => offerUsd(r) != null || offerDarai(r) != null)) return null;
  const { daraiPerUsd } = await import("./energy-sub/rate");
  return (await daraiPerUsd())?.rate ?? null;
}

/**
 * Цены строки во всех валютах счёта для витрины (со скидкой подписки на USDT и
 * DARAI, звёзды без скидки). null — валют из курса нет: у строки в DARAI без
 * курса остаются прежние фиксированные цены.
 */
export function usdFields(
  row: PricedRow,
  rate: number | null,
  discountPct: number,
): { priceUsd: number | null; usd: UsdPrices | null } {
  const usd = offerUsd(row);
  if (usd != null) return { priceUsd: usd, usd: usdPrices(usd, rate, discountPct) };
  const darai = offerDarai(row);
  return { priceUsd: null, usd: darai != null ? pricesFromDarai(darai, rate, discountPct) : null };
}

/**
 * Покупка «за энергию Yupland» — только у предложения с ценой в энергии.
 * Прежде проверки не было: у токеновой строки price_energy = 0, списание нуля
 * проходило, и билеты выдавались даром (в истории таких покупок нет).
 */
export function assertEnergyOffer(offer: OfferRow): void {
  if (offer.payment_token || offerUsd(offer) != null || !(Number(offer.price_energy) > 0)) {
    throw new Error("Это предложение не продаётся за энергию");
  }
}
