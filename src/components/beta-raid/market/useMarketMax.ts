// Сколько единиц сделки игрок может взять ПРЯМО СЕЙЧАС — число для кнопки «Макс».
//
// ПОЧЕМУ одна формула на обе витрины. Расстаётся игрок в обоих случаях с чем-то
// своим, просто лежит оно в разных полях позиции: в скупке это сам товар
// (goodAsPrice), в покупке — цена, и цен бывает две (алхимия, платят обеими).
// Дальше правило общее: делим запас на расход за единицу, берём худшее плечо и
// режем остатком витрины и капом. Разойдись стороны в формуле — кнопка на одной
// из них обещала бы то, чего сервер не примет.
//
// ПОЧЕМУ цены сначала складываются по валютам. Админ вправе поставить ОБЕ цены
// в одном золоте (10 и 5): минимум из «баланс/10» и «баланс/5» соврал бы в
// полтора раза, потому что за единицу уходит 15. Сводим по валютам, как cartCost.
//
// Откуда берётся запас, по видам:
//   валюты                — usePlayerFunds (счёт, лайки, билеты, энергия, токен);
//   босс / свой товар     — стек рюкзака героя, ключ как у сервера в
//     market-money.spend: `${вид}:${шаблон}`. Без шаблона сервер сделку и не
//     примет («market.not_enough»), поэтому кнопки там нет — считать «Макс» по
//     стеку, который выдача сложила под ключ с id позиции, значит обещать
//     невыполнимое;
//   «любой арт редкости X» — свободные уже посчитал пикер артефакта;
//   именной артефакт      — свободные того же шаблона (useFreeArtCounts);
//   пак / герой           — состав клиенту не виден → null, и кнопки нет:
//     обещать наугад хуже, чем не обещать вовсе.
//
// Ещё один источник «нет числа» — непрогретый кэш балансов: usePlayerFunds
// отдаёт null, пока баланс не приехал. Кнопка в этот момент не показывается,
// иначе она успевала соврать «Макс 0» и через мгновение прыгнуть на правду.
import { useQuery } from "@tanstack/react-query";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import type { MarketItemView } from "@/lib/buildingEffect";
import type { MarketPriceResource } from "@/lib/marketItem";
import { costKey, goodAsPrice } from "./cartCost";
import { usePlayerFunds, type HaveFn } from "./usePlayerFunds";
import { useFreeArtCounts } from "./useFreeArts";
import { artAnyRarity } from "./artAnyIcon";
import { backpackRoomFor } from "@/lib/hero/backpackCells";
import { bagCellsOf, roomFor } from "@/lib/hero/potionBag";
import { listingUnits, maxBuyUnits } from "@/lib/townPricing";

/** Кап количества — как на сервере (market-qty.QTY_CAP): выше он не примет. */
export const QTY_CAP = 99;

type Stack = { stackKey: string; count: number };

/** Чем игрок располагает — все источники под рукой у одной формулы. */
type Funds = {
  have: HaveFn;
  stacks: Stack[] | undefined;
  /** Свободных штук выбранного артефакта; null — игрок ещё не выбрал. */
  pickCount: number | null;
  /** Свободных штук ИМЕННОГО артефакта; null — список ещё не готов. */
  freeArt: (templateId: string) => number | null;
};

type UnitCost = { resource: MarketPriceResource; token: string | null; amount: number };

/** Сколько единиц сделки покрывает запас этого вида. null — источник неизвестен. */
function unitsOf(
  resource: MarketPriceResource,
  token: string | null,
  perUnit: number,
  f: Funds,
): number | null {
  if (!(perUnit > 0)) return null;
  // Артефакты живут штучно в инвентаре, а не в рюкзаке.
  if (resource === "art") {
    // «Любой арт редкости X» — считаем по тому, что игрок выбрал в пикере:
    // отдаст он именно его, а не «что-нибудь такой же редкости».
    if (artAnyRarity(token)) return f.pickCount != null ? f.pickCount / perUnit : null;
    // Именная позиция: выбирать нечего, зато свободные штуки того же шаблона
    // посчитаны отдельным списком.
    if (!token) return null;
    const free = f.freeArt(token);
    return free == null ? null : free / perUnit;
  }
  if (resource === "boss" || resource === "custom") {
    // Ключ — как у market-money.spend, который эту сделку и проведёт. Стека без
    // шаблона он не ищет вовсе, поэтому и мы ничего не обещаем.
    if (!token || !f.stacks) return null;
    return (f.stacks.find((s) => s.stackKey === `${resource}:${token}`)?.count ?? 0) / perUnit;
  }
  if (resource === "pack" || resource === "hero") return null;
  const n = f.have(resource, token);
  // null — баланс ещё не загружен, Infinity — предметный вид («спросим
  // сервер»). Ни то, ни другое в потолок кнопки не годится.
  return n != null && Number.isFinite(n) ? n / perUnit : null;
}

/** Цена за ОДНУ единицу, сведённая по валютам (две цены в одном золоте — плюсом). */
function unitCosts(it: MarketItemView): UnitCost[] {
  const map = new Map<string, UnitCost>();
  const add = (resource: MarketPriceResource, token: string | null, amount: number) => {
    if (!(amount > 0)) return;
    const key = costKey(resource, token);
    const e = map.get(key);
    // Дробные цены (0,1 за штуку) складываются с хвостом — режем, как cartCost.
    if (e) e.amount = Math.round((e.amount + amount) * 1000) / 1000;
    else map.set(key, { resource, token, amount });
  };
  add(it.priceResource, it.priceToken, it.priceAmount);
  if (it.price2Resource && it.price2Amount) add(it.price2Resource, it.price2Token, it.price2Amount);
  return Array.from(map.values());
}

/** Шаблон ИМЕННОГО артефакта, которым игрок расплачивается. null — не тот случай. */
function namedArtToken(it: MarketItemView): string | null {
  const { resource, token } =
    it.side === "sell" ? goodAsPrice(it) : { resource: it.priceResource, token: it.priceToken };
  return resource === "art" && token && !artAnyRarity(token) ? token : null;
}

export function useMarketMax(
  items: MarketItemView[],
): (it: MarketItemView, pickCount: number | null) => number | null {
  const have = usePlayerFunds();
  // Свободные артефакты по шаблонам спрашиваем, только если на витрине есть
  // именная позиция: у остальных кнопке хватает пикера.
  const freeArt = useFreeArtCounts(items.some((it) => namedArtToken(it) != null));
  // Тот же ключ, что у рюкзака в замке и на складе — общий кэш, лишнего запроса
  // маркет не делает. Сделка его сбрасывает (useMarketCheckout).
  const bp = useQuery({
    queryKey: ["my-hero-backpack"],
    queryFn: () => getMyBackpack(),
    staleTime: 30_000,
  });
  const stacks = bp.data?.stacks;

  return (it, pickCount) => {
    const f: Funds = { have, stacks, pickCount, freeArt };
    let units: number;
    if (it.side === "sell") {
      const g = goodAsPrice(it);
      const u = unitsOf(g.resource, g.token, it.giveAmount, f);
      if (u == null) return null;
      units = u;
    } else if (it.town) {
      // Лавка города: цена растёт с объёмом — ищем по кривой, сколько потянет золото.
      const gold = have("gold", null);
      if (gold == null || !Number.isFinite(gold)) return null;
      units = maxBuyUnits(it.town.curve, it.town.stock, listingUnits(it), gold);
    } else {
      const costs = unitCosts(it);
      // Даровая позиция (цена 0) деньгами не ограничена — потолок задаст
      // остаток товара и кап.
      let best = costs.length === 0 ? QTY_CAP : Number.POSITIVE_INFINITY;
      for (const c of costs) {
        const u = unitsOf(c.resource, c.token, c.amount, f);
        // Хоть одно плечо неизвестно — честного числа не выйдет, кнопки нет.
        if (u == null) return null;
        best = Math.min(best, u);
      }
      units = best;
    }
    // Рюкзак: сервер (market-buy GOES_TO_BACKPACK) не даст купить больше, чем
    // влезет. Показываем честное число сразу, а не «Макс 99 → ошибка».
    if (it.side === "buy" && bp.data && (it.kind === "boss" || it.kind === "custom")) {
      const stackKey = it.refId ? `${it.kind}:${it.refId}` : null;
      const cur = stackKey ? (bp.data.stacks.find((s) => s.stackKey === stackKey)?.count ?? 0) : 0;
      // Зелье — только в сумку, прочее — в рюкзак: та же формула, что у сервера.
      const room = backpackRoomFor({
        ...roomFor({
          ...bagCellsOf(bp.data.stacks),
          potion: !!it.potion,
          capacity: bp.data.capacity,
          potionCapacity: bp.data.potionCapacity,
        }),
        cur,
      });
      units = Math.min(units, room);
    }

    // Вниз: половину единицы сервер не примет, а у старых позиций остаток
    // бывает дробным (7,2).
    return Math.max(0, Math.floor(Math.min(units, it.remaining ?? QTY_CAP, QTY_CAP)));
  };
}
