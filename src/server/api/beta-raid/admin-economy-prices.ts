// Дёшево / Дорого: где купить дешевле всего и где продать дороже всего.
//
// Клиент фильтрует по товару (goodKey), поэтому здесь мы просто отдаём
// весь маркет карты с координатами и остатками — цену и сравнение делает
// таблица во вкладке (сортировка по price ASC/DESC).
//
// Товары для выпадающего списка собираем ТОЛЬКО те, что реально есть в
// маркетах — иначе игрок увидит «Свиток» в списке, а витрин под него нет.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { PriceExtreme, PriceGood } from "./admin-economy-types";
import { keyFromMarketItem } from "./admin-economy-keys";

type Row = {
  id: string;
  q: number;
  r: number;
  side: "buy" | "sell";
  kind: string;
  ref_id: string | null;
  name: string;
  image: string | null;
  price_amount: number;
  price_resource: string;
  price_token: string | null;
  give_token: string | null;
  stock: number | null;
  sold: number;
};

export type PriceIndex = { extremes: Record<string, PriceExtreme[]>; goods: PriceGood[] };

export async function buildPrices(mapId: string): Promise<PriceIndex> {
  const rows = await fetchRows(mapId);
  const goods = new Map<string, PriceGood>();
  const extremes: Record<string, PriceExtreme[]> = {};

  // Редкость подтянем одним запросом по всем встреченным ref_id: JOIN в
  // fetchRows раздул бы строки (у товара может быть N маркетов), поэтому
  // забираем её отдельно и мапим по refId.
  const rarityByRef = await fetchRarityMap(rows);

  for (const r of rows) {
    const key = keyFromMarketItem(r.kind, r.ref_id, r.name, r.give_token);
    if (!key) continue;
    if (!goods.has(key)) {
      goods.set(key, {
        key,
        name: r.name,
        image: r.image,
        kind: r.kind,
        rarity: r.ref_id ? rarityByRef.get(r.ref_id) ?? null : null,
      });
    }
    const remaining = r.stock == null ? null : Math.max(0, Number(r.stock) - Number(r.sold));
    (extremes[key] ??= []).push({
      itemId: r.id,
      q: Number(r.q),
      r: Number(r.r),
      price: Number(r.price_amount) || 0,
      priceResource: String(r.price_resource),
      priceToken: r.price_token,
      remaining,
      side: r.side,
    });
  }

  return {
    extremes,
    goods: [...goods.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function fetchRows(mapId: string): Promise<Row[]> {
  const rows = (await mcpExec(
    `SELECT id, q, r, side, kind, ref_id, name, image,
            price_amount, price_resource, price_token, give_token, stock, sold
       FROM yuplink.raid_market_item WHERE map_id=${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];
  return rows ?? [];
}

/**
 * Редкость шаблонных товаров (арты / паки / герои). Берём одним запросом по
 * всем ref_id из витрин; ресурсы и custom к таблице не относятся — их не
 * трогаем, вернут null.
 */
async function fetchRarityMap(rows: Row[]): Promise<Map<string, string>> {
  const refs = new Set<string>();
  for (const r of rows) {
    if (!r.ref_id) continue;
    if (r.kind === "art" || r.kind === "pack" || r.kind === "hero") refs.add(r.ref_id);
  }
  if (refs.size === 0) return new Map();
  const list = [...refs].map((id) => sqlStr(id)).join(",");
  const templates = (await mcpExec(
    `SELECT id, rarity FROM yuplink.mystic_item_template
      WHERE id IN (${list}) AND rarity IS NOT NULL;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; rarity: string | null }>;
  const map = new Map<string, string>();
  for (const t of templates ?? []) if (t.rarity) map.set(t.id, t.rarity);
  return map;
}
