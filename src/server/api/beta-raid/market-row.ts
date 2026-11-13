// Строка raid_market_item → товар витрины. Вынесено из market-admin.ts ради
// лимита ≤250 строк.
import type { MarketItem, MarketKind, MarketPriceResource, MarketSide } from "@/lib/marketItem";
import { parseRecipe } from "@/lib/marketRecipe";
import { parsePriceMore } from "@/lib/marketPrices";
import { parseBuildingGood } from "@/lib/buildingSale";

export function toItem(row: Record<string, unknown>): MarketItem {
  const races = row.buyer_races;
  const specs = row.buyer_specs;
  return {
    id: String(row.id),
    q: Number(row.q),
    r: Number(row.r),
    pos: Number(row.pos) || 0,
    // Сторона витрины: buy — продаём игроку, sell — скупаем у игрока. Старые
    // строки (до колонки side) читаются как покупка.
    side: row.side === "sell" ? "sell" : ("buy" as MarketSide),
    kind: String(row.kind) as MarketKind,
    refId: row.ref_id != null ? String(row.ref_id) : null,
    giveAmount: Number(row.give_amount) || 0,
    giveToken: row.give_token != null ? String(row.give_token) : null,
    name: String(row.name ?? ""),
    image: row.image != null ? String(row.image) : null,
    priceResource: String(row.price_resource) as MarketPriceResource,
    priceToken: row.price_token != null ? String(row.price_token) : null,
    priceAmount: Number(row.price_amount) || 0,
    price2Resource:
      row.price2_resource != null ? (String(row.price2_resource) as MarketPriceResource) : null,
    price2Token: row.price2_token != null ? String(row.price2_token) : null,
    price2Amount: row.price2_amount != null ? Number(row.price2_amount) : null,
    stock: row.stock != null ? Number(row.stock) : null,
    sold: Number(row.sold) || 0,
    perAccountLimit: row.per_account_limit != null ? Number(row.per_account_limit) : null,
    buyerMode: row.buyer_mode === "filter" ? "filter" : "all",
    buyerRaces: Array.isArray(races) ? races.map(String) : [],
    buyerSpecs: Array.isArray(specs) ? specs.map(String) : [],
    // Ещё ингредиенты цены — только у витрины покупки (§8.104 п. 1а).
    priceMore: row.side === "sell" ? [] : parsePriceMore(row.price_more),
    // Рецепт: исходы с шансами; у прочих товаров колонка пустая.
    outcomes: row.kind === "recipe" ? parseRecipe(row.outcomes) : null,
    // Постройка: облик и настройка; у прочих товаров колонка пустая.
    building: row.kind === "building" ? parseBuildingGood(row.building) : null,
  };
}
