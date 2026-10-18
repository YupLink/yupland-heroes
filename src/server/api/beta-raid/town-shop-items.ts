// Позиции привязанной лавки — это товары её ратуши (владелец, 04.10.2026:
// «выбрал товары в ратуше — они появились в ратуше и, соответственно, в
// лавках»). Своих позиций у привязанной лавки нет: что назначено в ратуше, то и
// продаётся, в обе стороны, по складу и цене ратуши (town-shop, town-shop-trade).
//
// Позиция не лежит в raid_market_item — её id собран из клетки лавки, товара
// ратуши и стороны витрины. marketItemById узнаёт его по префиксу и строит
// позицию заново: так покупка и скупка идут прежними путями.
import { RESOURCE_LABELS_RU, type MarketItem, type MarketPriceResource } from "@/lib/marketItem";
import { isCurrencyGood, type TownGood } from "@/lib/townConfig";
import type { CityShop } from "./town-shop";

const ID_RE = /^town:(-?\d+),(-?\d+):([A-Za-z0-9_-]+):(buy|sell)$/;

export function townItemId(q: number, r: number, goodId: string, side: "buy" | "sell"): string {
  return `town:${q},${r}:${goodId}:${side}`;
}

/** Разобрать id позиции ратуши; null — это обычная позиция лавки. */
export function parseTownItemId(
  id: string,
): { q: number; r: number; goodId: string; side: "buy" | "sell" } | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  return { q: Number(m[1]), r: Number(m[2]), goodId: m[3], side: m[4] as "buy" | "sell" };
}

/** Подпись ресурса: у токена — его символ, у прочих — русское имя. */
function resourceName(g: TownGood): string {
  if (g.refId === "token") return g.token || "Токен";
  return RESOURCE_LABELS_RU[(g.refId ?? "") as MarketPriceResource] ?? g.refId ?? "Ресурс";
}

/** Витрина привязанной лавки: каждый товар ратуши — покупка и скупка. */
export async function cityItems(q: number, r: number, city: CityShop): Promise<MarketItem[]> {
  const goods = city.cfg.goods.filter((g) => !isCurrencyGood(g));
  // Имена и картинки шаблонов — одним запросом на всю витрину (с кэшем).
  const { priceMetaBatch, priceMetaOf } = await import("./market-payout-meta");
  const refOf = (g: TownGood) => ({ res: g.kind as MarketPriceResource, token: g.refId });
  const metas = await priceMetaBatch(goods.filter((g) => g.kind !== "resource").map(refOf));
  const out: MarketItem[] = [];
  for (const g of goods) {
    const meta = g.kind === "resource" ? null : priceMetaOf(metas, g.kind, g.refId);
    const name = g.kind === "resource" ? resourceName(g) : (meta?.name ?? g.refId ?? "Товар");
    for (const side of ["buy", "sell"] as const) {
      out.push({
        id: townItemId(q, r, g.id, side),
        q,
        r,
        pos: out.length,
        side,
        kind: g.kind,
        refId: g.refId,
        // Единица позиции — одна штука: объём сделки задаёт количество.
        giveAmount: 1,
        giveToken: g.kind === "resource" && g.refId === "token" ? g.token : null,
        name,
        image: meta?.image ?? null,
        // Цену и остаток перепишет кривая ратуши (cityShopView).
        priceResource: "gold",
        priceToken: null,
        priceAmount: g.marketPrice,
        price2Resource: null,
        price2Token: null,
        price2Amount: null,
        stock: null,
        sold: 0,
        perAccountLimit: null,
        buyerMode: "all",
        buyerRaces: [],
        buyerSpecs: [],
      });
    }
  }
  return out;
}
