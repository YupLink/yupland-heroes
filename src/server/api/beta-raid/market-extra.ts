// Витрина маркета для окна покупателя: товары + отметка, проходит ли текущий
// герой ОБЩИЙ фильтр покупателей магазина. Вынесено из building-extra.ts, чтобы
// тот держался в лимите ≤250 строк; building-extra зовёт marketExtra().
import type { BuildingExtra } from "@/lib/buildingEffect";
import type { CurrentHero } from "./hero-current";
import { parseBoostEffects, type BoostEffect } from "@/lib/hero/boost";

/** Позиция, которую ломбард выставил сам (relistPawned в market-pawn.ts). */
export const isPawnId = (id: string): boolean => id.startsWith("pawn_");

/** Бусты и галочки «зелье» у шаблонов своих товаров: id → прибавка / зелье. */
async function customBoosts(
  refs: Array<string | null>,
): Promise<{ boosts: Map<string, BoostEffect[]>; potions: Set<string> }> {
  const ids = [...new Set(refs.filter((r): r is string => !!r && r.startsWith("cst_")))];
  const boosts = new Map<string, BoostEffect[]>();
  const potions = new Set<string>();
  if (ids.length === 0) return { boosts, potions };
  const { mcpExec } = await import("../../db/mcpClient");
  const { sqlStr } = await import("../raid-shared");
  const rows = (await mcpExec(
    `SELECT id, boost, is_potion FROM yuplink.raid_custom_item
      WHERE (boost IS NOT NULL OR is_potion) AND id IN (${ids.map(sqlStr).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; boost: unknown; is_potion: boolean }>;
  for (const r of rows ?? []) {
    const list = parseBoostEffects(r.boost);
    if (list.length > 0) boosts.set(String(r.id), list);
    if (r.is_potion === true) potions.add(String(r.id));
  }
  return { boosts, potions };
}

/** Маркет: витрина товаров с отметкой, проходит ли герой фильтр покупателей. */
export async function marketExtra(opts: {
  mapId: string;
  q: number;
  r: number;
  hero: CurrentHero | null;
  /** Кто смотрит: по нему — сколько ещё можно купить позиций с лимитом. */
  wallet?: string;
}): Promise<BuildingExtra> {
  const { mapId, q, r, hero } = opts;
  const { marketRows } = await import("./market-admin");
  const { marketShopFor } = await import("./market-shop");
  const { priceMetaBatch, priceMetaOf } = await import("./market-payout-meta");
  // Лавка, привязанная к ратуше: на витрине товары ратуши, цены и остаток — её
  // (town-shop, town-shop-items); свои позиции лавки тогда не продаются.
  const { cityShopAt, cityShopView } = await import("./town-shop");
  const [city, shop] = await Promise.all([
    cityShopAt(mapId, q, r).catch(() => null),
    marketShopFor(mapId, q, r).catch(() => ({ races: [] as string[], specs: [] as string[] })),
  ]);
  const all = city
    ? await (await import("./town-shop-items")).cityItems(q, r, city).catch(() => [])
    : await marketRows(mapId, q, r).catch(() => []);
  // Перепродажа ломбарда (pawn_*) раскуплена — с витрины убираем совсем
  // (владелец, 13.10). Сдадут такой же артефакт — запас вырастет, и позиция вернётся.
  const goods = all.filter((g) => !(isPawnId(g.id) && g.stock != null && g.stock - g.sold <= 0));
  // Подписи предметных цен — ОДНИМ запросом на всё окно (плюс кэш внутри).
  // По позиции за раз это был бы десяток походов в базу на каждый тап по
  // клетке, а на скупке имя цены — самое важное на плитке: «на что меняется».
  const metas = await priceMetaBatch(
    goods.flatMap((g) => [
      { res: g.priceResource, token: g.priceToken },
      { res: g.price2Resource, token: g.price2Token },
    ]),
  );
  // Фильтр покупателей — ОБЩИЙ на весь магазин: считаем один раз, применяем ко
  // всем. Запас же у каждого товара свой, поэтому buyable считаем по-товарно.
  let heroOk = true;
  let heroLockKey: string | null = null;
  if (shop.races.length || shop.specs.length) {
    if (!hero || !hero.race) {
      heroOk = false;
      heroLockKey = "market.need_hero";
    } else {
      // «Универсальная» специализация проходит любой спек-фильтр — общая
      // спека common-героев (жалоба «у комон героя универсальная
      // специализация, а маркет пишет что торговец не доступен»).
      // Аналогично трактуем пустую спеку у common: null считаем универсалом.
      const universalSpec =
        hero.spec == null || /^(универс|universal|все|any)/i.test(String(hero.spec).trim());
      const raceOk = shop.races.length === 0 || shop.races.includes(hero.race);
      const specOk =
        shop.specs.length === 0 ||
        universalSpec ||
        (hero.spec != null && shop.specs.includes(hero.spec));
      if (!raceOk || !specOk) {
        heroOk = false;
        heroLockKey = "market.locked_hero";
      }
    }
  }
  // Бусты своих товаров — одним запросом на всю витрину: карточка обязана
  // сказать, что даёт зелье, ещё до покупки.
  const { boosts, potions } = await customBoosts(goods.map((g) => g.refId));
  const items = goods.map((g) => {
    // Остаток читается по стороне витрины: у покупки это «сколько ещё
    // продадим», у скупки — «сколько ещё примем». Исчерпан — позиция гаснет.
    const remaining = g.stock == null ? null : Math.max(0, g.stock - g.sold);
    const soldOut = remaining != null && remaining <= 0;
    const p1 = priceMetaOf(metas, g.priceResource, g.priceToken);
    const p2 = priceMetaOf(metas, g.price2Resource, g.price2Token);
    return {
      id: g.id,
      side: g.side,
      kind: g.kind,
      // refId нужен покупателю, чтобы нарисовать иконку ресурса (у ресурсных
      // товаров своей картинки нет).
      refId: g.refId,
      name: g.name,
      image: g.image,
      giveAmount: g.giveAmount,
      giveToken: g.giveToken ?? null,
      priceResource: g.priceResource,
      priceToken: g.priceToken,
      priceAmount: g.priceAmount,
      // Имя/картинка САМОГО шаблона цены (слиток, пак, герой), а не позиции.
      // null — цена обычным ресурсом или «любой арт редкости»: у клиента для
      // них свои подписи, и они переведены на оба языка.
      priceName: p1?.name ?? null,
      priceImage: p1?.image ?? null,
      price2Resource: g.price2Resource,
      price2Token: g.price2Token,
      price2Amount: g.price2Amount,
      price2Name: p2?.name ?? null,
      price2Image: p2?.image ?? null,
      stock: g.stock,
      sold: g.sold,
      remaining,
      // Фильтр героя перекрывает всё; если герой проходит — смотрим остаток.
      // Причину замка (герой) на карточке не пишем — она общая для магазина и
      // показывается баннером сверху; на карточке только «нет в наличии».
      buyable: heroOk && !soldOut,
      lockKey: soldOut ? (g.side === "sell" ? "market.buyout_full" : "market.sold_out") : null,
      boost: (g.refId && boosts.get(g.refId)) || null,
      potion: !!g.refId && potions.has(g.refId),
    };
  });
  const { applyBuyerLimits } = await import("./market-limit-view");
  const shown = await applyBuyerLimits(
    city ? cityShopView(items, city, heroOk) : items,
    goods,
    opts.wallet,
  );
  return {
    kind: "market",
    items: shown,
    shopRaces: shop.races,
    shopSpecs: shop.specs,
    heroFits: heroOk,
    townStarving: city?.starving ?? false,
    reasonKey: shown.length ? null : city?.starving ? "town.starving" : "market.empty",
  };
}
