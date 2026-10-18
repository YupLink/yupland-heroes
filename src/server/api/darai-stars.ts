// Звёзды от цены в DARAI (владелец, 07.10.2026: «везде, где цена в DARAI, —
// пересчёт в звёзды, показывать звёзды»). DARAI — якорь: она остаётся как
// стоит, звёзды считаются от неё по курсу Ref в соотношениях подписки
// (lib/usdTariff.ts::pricesFromDarai). Нет курса — null: прежняя цена.
import { pricesFromDarai } from "@/lib/usdTariff";

/** Курс «DARAI за $1» (кэш Ref на 5 минут, как у подписки) или null. */
export async function daraiRate(): Promise<number | null> {
  const { daraiPerUsd } = await import("./energy-sub/rate");
  return (await daraiPerUsd())?.rate ?? null;
}

/** Цена в звёздах за одну штуку при цене `darai`; null — нет цены или курса. */
export function starsFromDarai(darai: number | string | null | undefined, rate: number | null): number | null {
  const d = Number(darai);
  if (darai == null || !(d > 0)) return null;
  return pricesFromDarai(d, rate)?.STARS ?? null;
}
