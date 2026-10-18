// Лавка, привязанная к ратуше (галочка в настройке лавки, town-binding.ts):
// торгует тем, чем водится ратуша, по её складу и цене.
//
// Правила владельца (03.10.2026):
//   • чего нет в ратуше — в лавках города не видно и не продаётся, даже если
//     позицию в лавку добавили случайно; товар ратуши — в обе стороны;
//   • цена — не фикс из лавки, а кривая ратуши по объёму сделки (townPricing);
//   • склад один на весь город: купил в одной лавке — меньше во всех;
//   • голод: лавки ничего не продают и принимают только еду жителей;
//   • особый спрос (09.10.2026): запас сутки на НЗ и ниже — до НЗ скупка ×4.
// Лавки без привязки работают как раньше — этот модуль их не касается.
import { readTown } from "./town-state";
import { shopTown } from "./town-binding";
import { readTownStock, seedTownStock, type TownKey } from "./town-stock";
import { readLowSince } from "./town-rush";
import { isUpkeep, type TownConfig, type TownGood } from "@/lib/townConfig";
import {
  availableToBuy,
  ceilMoney,
  floorMoney,
  isRush,
  listingUnits,
  priceFactorAt,
  quoteBuy,
  quoteSell,
  RUSH_X,
  townCurve,
  type TownCurve,
} from "@/lib/townPricing";
import type { MarketKind } from "@/lib/marketItem";
import type { MarketItemView } from "@/lib/marketItemView";

export type CityShop = {
  town: TownKey;
  cfg: TownConfig;
  stock: Record<string, number>;
  starving: boolean;
  /** good_id → с какого момента запас на НЗ и ниже (town-rush); нет — особого спроса нет. */
  lowSince?: Record<string, string | null>;
};

/** Лавка на этой клетке привязана к ратуше? null — обычная лавка, правила прежние. */
export async function cityShopAt(mapId: string, q: number, r: number): Promise<CityShop | null> {
  const town = await shopTown(mapId, q, r);
  if (!town) return null;
  const t = await readTown(town);
  if (!t) return null;
  // Товар добавили в ратушу, а склада под него ещё нет — заводим ровно норму.
  await seedTownStock(town, t.cfg.goods, t.cfg.residents).catch(() => undefined);
  const reserves: Record<string, number> = {};
  for (const g of t.cfg.goods) reserves[g.id] = townCurve(g, t.cfg.residents, t.cfg.rules).reserve;
  const [stock, lowSince] = await Promise.all([
    readTownStock(town),
    // Сбой этого чтения не роняет лавку: особого спроса просто нет.
    readLowSince(town, reserves).catch(() => ({})),
  ]);
  return { town, cfg: t.cfg, stock, starving: !!t.starvingSince, lowSince };
}

type ListingLike = {
  side: "buy" | "sell";
  kind: MarketKind;
  refId: string | null;
  giveToken: string | null;
};

/** Товар ратуши, которому соответствует позиция лавки. */
export function townGoodFor(cfg: TownConfig, it: Omit<ListingLike, "side">): TownGood | null {
  return (
    cfg.goods.find((g) => {
      if (g.kind !== it.kind) return false;
      if (g.kind === "resource") {
        if ((g.refId ?? "") !== (it.refId ?? "")) return false;
        return (
          g.refId !== "token" ||
          (g.token ?? "").toLowerCase() === (it.giveToken ?? "").toLowerCase()
        );
      }
      return !!g.refId && g.refId === it.refId;
    }) ?? null
  );
}

export type CityLine = { good: TownGood; curve: TownCurve; stock: number };

/**
 * Что позиции лавки можно в этом городе. null — позиции в городе нет вовсе:
 * товара нет в ратуше. Товар ратуши город и продаёт, и покупает (владелец,
 * 03.10.2026); в голод — ничего не продаёт и принимает только еду.
 */
export function cityLine(shop: CityShop, it: ListingLike): CityLine | null {
  const good = townGoodFor(shop.cfg, it);
  if (!good) return null;
  if (shop.starving && (it.side === "buy" || !isUpkeep(good))) return null;
  const base = townCurve(good, shop.cfg.residents, shop.cfg.rules);
  const stock = shop.stock[good.id] ?? base.norm;
  const rush = isRush(base, stock, shop.lowSince?.[good.id] ?? null, Date.now());
  return { good, curve: rush ? { ...base, lowX: RUSH_X } : base, stock };
}

/** Цена одной единицы позиции прямо сейчас — для плитки. */
function unitPrice(line: CityLine, per: number, sell: boolean): number {
  const q = sell ? quoteSell(line.curve, line.stock, per) : quoteBuy(line.curve, line.stock, per);
  if (q.ok) return q.total;
  // Сейчас не купить/не сдать — показываем цену момента, чтобы плитка не врала нулём.
  const raw = line.curve.base * priceFactorAt(line.curve, line.stock) * per;
  return sell ? floorMoney(raw) : ceilMoney(raw * (1 + line.curve.markupPct / 100));
}

/**
 * Витрина городской лавки: лишнее скрыто, цена — по кривой ратуши (в золоте),
 * остаток — сколько город продаст выше НЗ; скупает он без лимита.
 */
export function cityShopView(
  items: MarketItemView[],
  shop: CityShop,
  heroOk: boolean,
): MarketItemView[] {
  const out: MarketItemView[] = [];
  for (const it of items) {
    const line = cityLine(shop, it);
    if (!line) continue;
    const per = listingUnits(it);
    const sell = it.side === "sell";
    // Скупка без потолка (null — «без лимита»), продажа — до НЗ.
    const avail = sell ? null : Math.floor(availableToBuy(line.curve, line.stock) / per + 1e-9);
    out.push({
      ...it,
      priceResource: "gold",
      priceToken: null,
      priceAmount: unitPrice(line, per, sell),
      priceName: null,
      priceImage: null,
      price2Resource: null,
      price2Token: null,
      price2Amount: null,
      price2Name: null,
      price2Image: null,
      stock: avail,
      sold: 0,
      remaining: avail,
      buyable: heroOk && (avail == null || avail > 0),
      lockKey: avail == null || avail > 0 ? null : "market.sold_out",
      // Особый спрос — метка на скупке: город платит до НЗ вдвое больше обычного.
      town: { stock: line.stock, curve: line.curve, rush: sell && line.curve.lowX === RUSH_X },
    });
  }
  return out;
}
