// Ключи товаров и валют для журнала сделок — та же формула, что у отчёта
// продаж (admin-economy-keys): иначе журнал и отчёт разъедутся, и цепочки
// «купил → продал» не склеятся. Чистые функции без базы; сами хуки — в
// trade-hooks.ts.
import type { MarketItem, MarketPriceResource } from "@/lib/marketItem";
import type { PortalPrice } from "@/lib/portal";
import { goodKey } from "../admin-economy-keys";

const ITEM_KINDS = new Set(["pack", "hero", "art", "boss", "custom"]);

/**
 * Валюта цены словарём отчётов (EconCurrency): токен — символом, энергия —
 * 'Energy' (как token в currency_ledger), предметная цена — 'kind:<шаблон>'.
 */
export function priceCurOf(res: MarketPriceResource | "item", token?: string | null): string {
  if (res === "token") return token ?? "token";
  if (res === "energy") return "Energy";
  if (ITEM_KINDS.has(res)) return `${res}:${token ?? ""}`;
  return res;
}

/**
 * Ключ товара по стеку рюкзака/склада. Токен-ресурс берём из самого ключа:
 * у полки resource:token:USDT в ref_id лежит символ, и goodKey дал бы
 * 'resource:USDT' — не тот ключ, что у отчёта продаж.
 */
export function stackItemKey(
  stackKey: string,
  kind: string,
  refId: string | null,
  name: string,
): string {
  const tok = "resource:token:";
  if (stackKey.startsWith(tok)) return `${tok}${stackKey.slice(tok.length).toUpperCase()}`;
  return goodKey(kind, refId, name, null) ?? stackKey;
}

/**
 * Ключ позиции витрины по её СОБСТВЕННОМУ имени, без справочника. Журнал пишет
 * marketTradeKey (canon-key): у своего товара — имя канона, как у стека.
 */
export function marketItemKey(item: MarketItem): string {
  return (
    goodKey(item.kind, item.refId, item.name, item.giveToken) ??
    `${item.kind}:${item.refId ?? item.id}`
  );
}

/** Строка цены ворот/портала → ключ того, чем платили. */
export function priceItemKey(p: PortalPrice): string {
  if (p.resource === "item") {
    const key = p.itemKey ?? "custom:";
    const [kind, ...rest] = key.split(":");
    return stackItemKey(key, kind, rest.join(":") || null, p.itemName ?? "");
  }
  if (ITEM_KINDS.has(p.resource)) {
    return (
      goodKey(p.resource, p.token ?? null, p.itemName ?? "", null) ??
      `${p.resource}:${p.token ?? ""}`
    );
  }
  return goodKey("resource", p.resource, p.resource, p.token) ?? `resource:${p.resource}`;
}
