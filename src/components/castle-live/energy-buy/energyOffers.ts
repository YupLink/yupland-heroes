// Окно «Купить энергию» в замке (дизайн Ангелины): модель карточек из ответов
// игры. Цены не придумываем — только то, что отдал сервер: лестницы энергопаков
// (listEnergyPacksPublic), «+N за лайки» (getEnergyLikeOffer), тарифы подписки
// (getEnergySubOffers). Звёзды — первыми (владелец, 07.10.2026), игровая цена
// (золото, лайки) — прямой кнопкой «Купить за …». Энергопак платится только
// золотом (бывшие билеты ×500), DARAI и звёздами (владелец, 20.10.2026, §8.61):
// USDT и прочие токены окно не кажет (lib/energyPayAllowed.ts).
import type { listEnergyPacksPublic } from "@/server/api/energyPacks";
import type { SubOffer } from "@/server/api/energy-sub/tiers";
import type { SubToken } from "@/lib/energySub";
import type { UsdToken } from "@/lib/usdTariff";
import { goldForTicketPrice } from "@/lib/ticketGold";
import { isEnergyPayAllowed } from "@/lib/energyPayAllowed";

type PublicPack = Awaited<ReturnType<typeof listEnergyPacksPublic>>["packs"][number];

export type PayHow =
  | { kind: "gold"; packId: string }
  | { kind: "likes"; expected: number }
  | { kind: "account"; packId: string; symbol: string; payKind: "token" | "darai" }
  | { kind: "usd"; packId: string; token: UsdToken }
  | { kind: "sub"; tierId: string; token: SubToken };

export type PayOpt = {
  key: string;
  /** Чем платят — для значка: золото, лайки, звёзды или токен со счёта. */
  method: "gold" | "likes" | "stars" | "token";
  /** Символ на счёте (STARS, Darai) или gold/likes. */
  token: string;
  price: number;
  used?: number;
  total?: number;
  how: PayHow;
};

export type PackCard = {
  id: string;
  amount: number;
  discount: number;
  game: PayOpt | null;
  others: PayOpt[];
  /** Цена ступени USDT-лесенки — не способ оплаты, только база выгоды подписки. */
  usdt?: number | null;
};

const ORDER: Record<string, number> = { STARS: 0, USDT: 1, Darai: 2 };
const rank = (o: PayOpt) => ORDER[o.token] ?? 3;

function usdOpts(packId: string, usd: Partial<Record<UsdToken, number | null>>, only?: UsdToken[]): PayOpt[] {
  const out: PayOpt[] = [];
  for (const token of only ?? (["STARS", "USDT", "Darai"] as UsdToken[])) {
    const price = usd[token];
    if (price == null || !isEnergyPayAllowed(token)) continue;
    out.push({
      key: `${packId}:usd:${token}`,
      method: token === "STARS" ? "stars" : "token",
      token,
      price,
      how: { kind: "usd", packId, token },
    });
  }
  return out;
}

/**
 * Карточка энергопака: игровая цена (золото) и остальные способы со счёта.
 * stars=false — аккаунт без настоящего Telegram (§8.127): звёзд среди способов нет.
 */
export function packCard(p: PublicPack, stars = true): PackCard {
  let game: PayOpt | null = null;
  let usdt: number | null = null;
  const others: PayOpt[] = [];
  for (const o of p.offers ?? []) {
    if (o.kind === "tickets") {
      // Билетная ступень платится золотом ×500 (сервер отдаёт готовую цену).
      // Ступени кончились — цены нет, но кнопка остаётся «Лимит на сегодня».
      game = {
        key: `${p.id}:gold`,
        method: "gold",
        token: "gold",
        price: o.gold ?? goldForTicketPrice(o.price ?? 0),
        used: o.used,
        total: o.price == null ? Math.min(o.total ?? 0, o.used ?? 0) : o.total,
        how: { kind: "gold", packId: p.id },
      };
      continue;
    }
    if (o.price == null) continue;
    if (o.kind === "usd" && o.usd) {
      others.push(...usdOpts(p.id, o.usd));
    } else if (o.kind === "darai" || o.kind === "token") {
      const symbol = o.kind === "darai" ? "Darai" : (o.symbol ?? "");
      // Цена в $ (USDT-лесенка) — к ней звёзды от её цены, в тот же счётчик.
      // Саму оплату USDT и прочими токенами окно не предлагает (§8.61).
      if (o.kind === "token" && symbol === "USDT") {
        usdt = o.price;
        if (o.usd) others.push(...usdOpts(p.id, o.usd, ["STARS"]));
      }
      if (!symbol || !isEnergyPayAllowed(symbol)) continue;
      others.push({
        key: `${p.id}:acc:${symbol}`,
        method: "token",
        token: symbol,
        price: o.price,
        used: o.used,
        total: o.total,
        how: { kind: "account", packId: p.id, symbol, payKind: o.kind === "darai" ? "darai" : "token" },
      });
    }
  }
  // Пак без лестницы — старая одиночная цена в билетах (со скидкой) → золото ×500.
  if (!p.offers && p.effectivePriceGold != null) {
    game = {
      key: `${p.id}:gold`,
      method: "gold",
      token: "gold",
      price: p.effectivePriceGold,
      used: p.dailyUsed,
      total: p.dailyLimit ?? undefined,
      how: { kind: "gold", packId: p.id },
    };
  }
  const pay = stars ? others : others.filter((o) => o.method !== "stars");
  pay.sort((a, b) => rank(a) - rank(b));
  return { id: p.id, amount: p.amount, discount: p.bulkDiscountTickets ?? 0, game, others: pay, usdt };
}

type LikeOffer = { visible?: boolean; amount: number; priceLikes: number; boughtToday?: boolean; used?: number; total?: number };

/** «+N энергии за лайки» — карточка с прямой ценой в лайках. */
export function likesCard(o: LikeOffer | undefined | null): PackCard | null {
  if (!o?.visible) return null;
  const total = Number(o.total ?? 1) || 1;
  const used = Number(o.used ?? (o.boughtToday ? 1 : 0)) || 0;
  return {
    id: "likes",
    amount: o.amount,
    discount: 0,
    game: { key: "likes", method: "likes", token: "likes", price: o.priceLikes, used, total, how: { kind: "likes", expected: o.priceLikes } },
    others: [],
  };
}

/** Лимит на сегодня по прямой цене выбран. */
export const gameSpent = (o: PayOpt | null) => !!o && o.total != null && (o.used ?? 0) >= o.total;

/** Способы оплаты тарифа подписки: звёзды (если можно, §8.127), USDT, DARAI — всё со счёта.
 *  googleOnly — «только Google» (13.11.2026): картой (строка карты) или за DARAI со счёта. */
export function subOpts(t: SubOffer, stars = true, googleOnly = false): PayOpt[] {
  return ((googleOnly ? ["Darai"] : ["STARS", "USDT", "Darai"]) as SubToken[]).flatMap((token) => {
    const price = t.prices[token];
    if (price == null || (!stars && token === "STARS")) return [];
    return [{ key: `${t.id}:${token}`, method: token === "STARS" ? "stars" : "token", token, price, how: { kind: "sub", tierId: t.id, token } } as PayOpt];
  });
}

/**
 * Выгода подписки — против самого большого разового пакета в USDT, как в
 * макете («+8000 энергии за 25 USDT», боксы не считаются). Нет пакета в USDT —
 * выгоды не показываем.
 */
export function subSaving(t: SubOffer, cards: PackCard[]): number | null {
  const base = cards
    .flatMap((c) => (c.usdt != null ? [{ amount: c.amount, price: c.usdt }] : []))
    .sort((a, b) => b.amount - a.amount)[0];
  const usdt = t.prices.USDT;
  const energy = t.energyPerDay * t.days;
  if (!base || usdt == null || !(energy > 0) || !(base.price > 0)) return null;
  const saving = Math.round((1 - usdt / ((energy * base.price) / base.amount)) * 100);
  return saving > 0 ? saving : null;
}
