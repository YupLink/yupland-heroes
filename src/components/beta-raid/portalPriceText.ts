// Цена прохода одной строкой: «100 золота · 5 алмазов».
//
// Отдельным модулем от компонента: ту же строку показывает и окно портала, и
// подсказка на карте, а держать перевод ресурсов в двух местах — верный способ
// развести их со временем.
import type { PortalPrice } from "@/lib/portal";
import type { MarketPriceResource } from "@/lib/marketItem";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import { starsForDarai } from "@/lib/starsForDarai";
import type { HaveFn } from "./market/usePlayerFunds";

type TFn = (key: string, params?: Record<string, string | number>) => string;

// Названия ресурсов берём готовые, маркетовские: одно и то же золото не
// должно называться в двух окнах по-разному.
const KEYS: Record<MarketPriceResource, string> = {
  gold: "market.res.gold",
  stone: "market.res.stone",
  wood: "market.res.wood",
  diamonds: "market.res.diamonds",
  likes: "market.res.likes",
  tickets: "market.res.tickets",
  energy: "market.res.energy",
  token: "market.res.token",
  pack: "market.res.pack",
  hero: "market.res.hero",
  art: "market.res.art",
  boss: "market.res.boss",
  custom: "market.res.custom",
};

/** Одна строка цены словами: «100 золота», «1000 Darai», «2 × Яблоко». */
export function priceLine(p: PortalPrice, t: TFn): string {
  // Товар называем его именем: ключ стека игроку ничего не скажет.
  if (p.resource === "item") return `${p.amount} × ${p.itemName ?? t("market.res.item")}`;
  // Звездочнику без DARAI — та же цена в звёздах (lib/starsForDarai.ts).
  const stars = p.resource === "token" && p.token === "Darai" ? starsForDarai(p.amount) : null;
  if (stars != null) return `${stars} ★`;
  const name = p.resource === "token" ? (p.token ?? t(KEYS.token)) : t(KEYS[p.resource]);
  return `${p.amount} ${name}`;
}

export function priceText(prices: PortalPrice[], t: TFn): string {
  return prices.map((p) => priceLine(p, t)).join(" · ");
}

/**
 * Строка цены для плашки маршрута: с картинкой ресурса — только число (как в
 * полосе ресурсов), без картинки (токен, билеты, товар) — словами.
 */
export function priceRow(p: PortalPrice, t: TFn): { icon: string | null; label: string } {
  const icon = p.resource === "item" ? null : marketResourceIconSrc(p.resource);
  return { icon, label: icon ? String(p.amount) : priceLine(p, t) };
}

/**
 * Строки цены не хватает (счёт известен и меньше цены). Цена в DARAI, которую
 * звездочник платит звёздами, сверяется со звёздами. Товар — не знаем (сервер).
 */
export function priceShort(p: PortalPrice, have: HaveFn): boolean {
  if (p.resource === "item") return false;
  const stars = p.resource === "token" && p.token === "Darai" ? starsForDarai(p.amount) : null;
  const owned = stars != null ? have("token", "STARS") : have(p.resource, p.token ?? null);
  const need = stars ?? p.amount;
  return owned != null && Number.isFinite(owned) && owned < need;
}
