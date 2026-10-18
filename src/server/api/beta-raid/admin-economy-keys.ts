// Канонические ключи товаров. Держатся в одном месте — иначе сборщик товаров
// и разбор продаж легко разъедутся, и продажи не привяжутся к строке.
//
// Правила:
//   resource:<res>            для gold/stone/wood/diamonds/energy/likes/tickets
//   resource:token:<sym>      для kind=resource + refId=token с символом токена
//   pack:<refId>              и так же hero/art/boss
//   custom:name:<slug>        свои товары дедупятся по имени
//
// item_id (mkt_…) — это ID строки маркета, не имя товара; два одинаковых
// «Помидора» на разных клетках имеют разные item_id и в отчёте обязаны быть
// одной строкой. Поэтому custom склеиваем по нормализованному имени.
import type { FieldReward } from "@/lib/fieldConfig";
import type { EconomyPeriod } from "./admin-economy-types";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Один ключ на разные вкусы вызывающих. */
export function goodKey(kind: string, refId: string | null, name: string, token?: string | null): string | null {
  if (kind === "resource") {
    if (refId === "token") {
      const t = (token ?? "").trim();
      if (!t) return null;
      return `resource:token:${t.toUpperCase()}`;
    }
    if (!refId) return null;
    return `resource:${refId}`;
  }
  if (kind === "pack" || kind === "hero" || kind === "art" || kind === "boss") {
    if (!refId) return null;
    return `${kind}:${refId}`;
  }
  if (kind === "custom") {
    const n = norm(name);
    if (!n) return null;
    return `custom:name:${n}`;
  }
  return null;
}

/** Из строки raid_market_item. giveToken несёт символ токена у ресурса. */
export function keyFromMarketItem(
  kind: string,
  refId: string | null,
  name: string,
  giveToken: string | null,
): string | null {
  return goodKey(kind, refId, name, giveToken);
}

/**
 * Из товара города (TownGood) по его id: token уже вычислен формой админа.
 * Годится только товару БЕЗ шаблона — у товара с шаблоном (refId = cst_…)
 * id это «tg_…», а имя живёт в справочнике: ключ ему даёт econ/town-good-key.
 */
export function keyFromTownGood(g: {
  kind: string;
  refId: string | null;
  token: string | null;
  id: string;
}): string | null {
  // У city.custom «Помидор» имя = g.id (админ его же и вводит).
  return goodKey(g.kind, g.refId, g.id, g.token);
}

/**
 * Из stack_key рюкзака/склада: формат `kind:COALESCE(ref_id, item_id)`.
 * У custom вторая часть — mkt_… id: без имени дедуп невозможен, поэтому name
 * берётся отдельно (кладём то, что видел игрок).
 */
export function keyFromStackKey(
  stackKey: string,
  kind: string,
  refId: string | null,
  name: string,
): string | null {
  return goodKey(kind, refId, name, null);
}

/** Из награды поля (FieldReward). */
export function keyFromFieldReward(reward: FieldReward): {
  key: string;
  kind: string;
  name: string;
  image: string | null;
} | null {
  if (reward.kind === "resource") {
    const key = goodKey("resource", reward.resource, reward.resource, reward.token);
    if (!key) return null;
    return { key, kind: "resource", name: reward.resource, image: null };
  }
  const key = goodKey("custom", null, reward.name);
  if (!key) return null;
  return { key, kind: "custom", name: reward.name, image: reward.image };
}

/** Разбор ref маркета/города — тот же ключ, что и у товара выше. */
export type ParsedRef =
  | { source: "market"; itemId: string; side: "buy" | "sell" }
  | { source: "town-buy"; mapId: string; q: number; r: number; goodId: string }
  | { source: "town-sell"; mapId: string; q: number; r: number; goodId: string }
  | null;

/**
 * Разобрать ref денежного движения из acc_ledger/res_ledger.
 * Формы (см. market-buy.ts, market-sell.ts, town-trade.ts):
 *   mkt:<itemId>:<account>:<nonce>
 *   mkt-sell:<itemId>:<account>:<nonce>
 *   town-buy:<mapId>:<q,r>:<goodId>:<opId>
 *   town-sell:<mapId>:<q,r>:<goodId>:<opId>
 *   mkt:town:<q,r лавки>:<goodId>:buy:<account>:<nonce>      (лавка города)
 *   mkt-sell:town:<q,r лавки>:<goodId>:sell:<account>:<nonce>
 *
 * Хвосты вроде `:undo`, `:p2`, `:undoPart` игнорируем на верхнем уровне —
 * основной ref для одной покупки один, дубли не считаем.
 */
export function parseRef(ref: string): ParsedRef {
  // Лавка города — товар ратуши, а не позиция маркета с id «town». Клетка в
  // ref — лавки, не ратуши, и карты в нём нет: товар ищут по goodId.
  const shop = /^mkt(-sell)?:town:(-?\d+),(-?\d+):([^:]+):/.exec(ref);
  if (shop) {
    const [, sell, q, r, goodId] = shop;
    return {
      source: sell ? "town-sell" : "town-buy",
      mapId: "",
      q: Number(q),
      r: Number(r),
      goodId,
    };
  }
  if (ref.startsWith("mkt-sell:")) {
    const parts = ref.split(":");
    if (parts.length < 4) return null;
    return { source: "market", itemId: parts[1], side: "sell" };
  }
  if (ref.startsWith("mkt:")) {
    const parts = ref.split(":");
    if (parts.length < 4) return null;
    return { source: "market", itemId: parts[1], side: "buy" };
  }
  if (ref.startsWith("town-buy:") || ref.startsWith("town-sell:")) {
    const isBuy = ref.startsWith("town-buy:");
    const rest = ref.slice(isBuy ? "town-buy:".length : "town-sell:".length);
    // mapId может содержать двоеточия — но у нас идёт '<mapId>:<q,r>:<goodId>:<opId>',
    // где ':' в mapId маловероятно; берём хвост справа.
    const parts = rest.split(":");
    if (parts.length < 4) return null;
    const opId = parts.pop();
    const goodId = parts.pop();
    const qr = parts.pop();
    const mapId = parts.join(":");
    if (!goodId || !qr || !mapId || !opId) return null;
    const [qs, rs] = qr.split(",");
    const q = Number(qs);
    const r = Number(rs);
    if (!Number.isFinite(q) || !Number.isFinite(r)) return null;
    return {
      source: isBuy ? "town-buy" : "town-sell",
      mapId,
      q,
      r,
      goodId,
    };
  }
  return null;
}

/** Оконный SQL «за последние N» — единый для всех вкладок. */
export const PERIOD_SQL: Record<EconomyPeriod, string> = {
  "24h": "created_at >= now() - interval '24 hours'",
  "7d": "created_at >= now() - interval '7 days'",
  "30d": "created_at >= now() - interval '30 days'",
};
