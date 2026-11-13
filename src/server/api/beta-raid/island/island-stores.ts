// Запись лавок-магазинов городов острова (lib/raid/island/stores): лавка без
// ратуши, удочка по рецепту мастерской и еда за золото. id позиций — от карты и
// номера города, повтор записи ничего не удваивает.
import { sqlStr } from "@/server/api/raid-shared";
import { ISLAND_ITEMS, ISLAND_RECIPE_DAY_LIMIT, ISLAND_RECIPES } from "@/lib/raid/island/catalog";
import { ISLAND_FOOD } from "@/lib/raid/island/stores";
import type { WorldShop } from "@/lib/raid/worldgen/spec";

const ROD = ISLAND_RECIPES.find((rc) => rc.id === "rod")!;

const itemSql = (o: {
  id: string;
  mapId: string;
  at: WorldShop;
  pos: number;
  itemId: string;
  price: string;
  limit: number | null;
}) =>
  `INSERT INTO yuplink.raid_market_item
     (id, map_id, q, r, pos, kind, ref_id, give_amount, name, image,
      price_resource, price_token, price_amount, side, per_account_limit)
   SELECT ${sqlStr(o.id)}, ${sqlStr(o.mapId)}, ${o.at.q}, ${o.at.r}, ${o.pos}, 'custom', ci.id, 1,
          ci.name, ci.image, ${o.price}, 'buy', ${o.limit ?? "NULL"}
     FROM yuplink.raid_custom_item ci WHERE ci.id = ${sqlStr(o.itemId)}
   ON CONFLICT (id) DO NOTHING;`;

/** Лавка номер k: сама лавка (без ратуши) и её товары. */
export function storeSql(mapId: string, at: WorldShop, k: number): string[] {
  const m = sqlStr(mapId);
  const shop = `INSERT INTO yuplink.raid_market_shop (map_id, q, r, updated_at)
     VALUES (${m}, ${at.q}, ${at.r}, now()) ON CONFLICT (map_id, q, r) DO NOTHING;`;
  const log = ROD.cost[0];
  const rod = itemSql({
    id: `${mapId}_s${k}_rod`,
    mapId,
    at,
    pos: 0,
    itemId: ISLAND_ITEMS.rod,
    price: `'custom', ${sqlStr(ISLAND_ITEMS[log.item])}, ${log.n}`,
    limit: ISLAND_RECIPE_DAY_LIMIT,
  });
  const food = ISLAND_FOOD.map((f, i) =>
    itemSql({
      id: `${mapId}_s${k}_${f.key}`,
      mapId,
      at,
      pos: 1 + i,
      itemId: f.itemId,
      price: `'gold', NULL, ${f.gold}`,
      limit: null,
    }),
  );
  return [shop, rod, ...food];
}
