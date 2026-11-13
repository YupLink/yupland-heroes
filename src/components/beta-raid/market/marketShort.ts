// Чего игроку не хватает на корзину — по строкам цены (владелец, 13.11.2026:
// «недостающие ресурсы подсвечивать нужно красным», а кнопку «Купить» не
// давать). Чистая сверка без React: её читают плитка (цена «/шт» красным),
// итог «Передашь» (та же строка красным) и кнопка (гаснет).
//
// Сколько есть — три ответа, как у usePlayerFunds:
//   число — столько у игрока есть;
//   null  — не знаем (баланс не приехал, состав клиенту не виден) — НЕ красим:
//           ложная нехватка хуже молчания, отказать всё равно есть кому — серверу.
// Предметная цена (босс / свой товар) лежит стеком в рюкзаке героя, ключ как
// у сервера (market-money.spend): `${вид}:${шаблон}`. Раньше её «спрашивали у
// сервера» (Infinity), и лопату за бревно и руду игрок без бревна «покупал» —
// а получал безликое «Не хватает средств».
import type { MarketItemView } from "@/lib/buildingEffect";
import type { MarketPriceResource } from "@/lib/marketItem";
import { allPrices } from "@/lib/marketPrices";
import { starsForDarai } from "@/lib/starsForDarai";
import { costKey, type CostEntry } from "./cartCost";
import type { HaveFn } from "./usePlayerFunds";

export type BackpackStack = { stackKey: string; count: number };

/** Чем игрок располагает: счёт (usePlayerFunds) и рюкзак героя (undefined — не приехал). */
export type ShortSources = { have: HaveFn; stacks: readonly BackpackStack[] | undefined };

/** Допуск сравнения: дробные цены (0,1 за штуку) складываются с хвостом. */
const EPS = 1e-9;

/** Сколько этого у игрока прямо сейчас; null — не знаем. */
export function haveOf(
  resource: MarketPriceResource,
  token: string | null,
  s: ShortSources,
): number | null {
  if (resource === "boss" || resource === "custom") {
    if (!token || !s.stacks) return null;
    const key = `${resource}:${token}`;
    return s.stacks.reduce((n, x) => (x.stackKey === key ? n + (Number(x.count) || 0) : n), 0);
  }
  // Артефакт, пак, герой — штучные, их состав витрина не читает.
  if (resource === "art" || resource === "pack" || resource === "hero") return null;
  const n = s.have(resource, token);
  return n != null && Number.isFinite(n) ? n : null;
}

/** Не покрывает ли игрок эту строку цены. Неизвестный баланс — не нехватка. */
export function isShort(c: CostEntry, s: ShortSources): boolean {
  // DARAI звездочника, которой не хватает, списывается звёздами — их и сверяем.
  const stars = c.resource === "token" && c.token === "Darai" ? starsForDarai(c.need) : null;
  const n = stars != null ? haveOf("token", "STARS", s) : haveOf(c.resource, c.token, s);
  return n != null && n + EPS < (stars ?? c.need);
}

/** Ключи (costKey) строк, которых не хватает. Пусто — сделка по карману. */
export function shortKeys(costs: readonly CostEntry[], s: ShortSources): Set<string> {
  return new Set(costs.filter((c) => isShort(c, s)).map((c) => costKey(c.resource, c.token)));
}

/** Ключи строк цены плитки в порядке показа (priceEntries): первая, вторая, ещё. */
export function priceKeys(it: MarketItemView): string[] {
  return allPrices(it).map((l) => costKey(l.resource, l.token));
}
