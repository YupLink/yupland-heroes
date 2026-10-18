// Окно «Купить энергию» в замке (дизайн Ангелины): модель карточек из ответов
// игры. Цены не придумываем — только то, что отдал сервер: лестницы энергопаков
// (listEnergyPacksPublic), «+N за лайки» (getEnergyLikeOffer), тарифы подписки
// (getEnergySubOffers). Звёзды — первыми (владелец, 07.10.2026), игровая цена
// (билеты, лайки) — прямой кнопкой «Купить за …».
import type { listEnergyPacksPublic } from "@/server/api/energyPacks";
import type { SubOffer } from "@/server/api/energy-sub/tiers";
import type { SubToken } from "@/lib/energySub";
import type { UsdToken } from "@/lib/usdTariff";

type PublicPack = Awaited<ReturnType<typeof listEnergyPacksPublic>>["packs"][number];

export type PayHow =
  | { kind: "tickets"; packId: string }
  | { kind: "likes"; expected: number }
  | { kind: "account"; packId: string; symbol: string; payKind: "token" | "darai" }
  | { kind: "usd"; packId: string; token: UsdToken }
  | { kind: "sub"; tierId: string; token: SubToken };

export type PayOpt = {
  key: string;
  /** Чем платят — для значка: билеты, лайки, звёзды или токен со счёта. */
  method: "tickets" | "likes" | "stars" | "token";
  /** Символ на счёте (STARS, USDT, Darai, HOPE…) или tickets/likes. */
  token: string;
  price: number;
  used?: number;
  total?: number;
  how: PayHow;
};

export type PackCard = { id: string; amount: number; discount: number; game: PayOpt | null; others: PayOpt[] };

const ORDER: Record<string, number> = { STARS: 0, USDT: 1, Darai: 2 };
const rank = (o: PayOpt) => ORDER[o.token] ?? 3;

function usdOpts(packId: string, usd: Partial<Record<UsdToken, number | null>>, only?: UsdToken[]): PayOpt[] {
  const out: PayOpt[] = [];
  for (const token of only ?? (["STARS", "USDT", "Darai"] as UsdToken[])) {
    const price = usd[token];
    if (price == null) continue;
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

/** Карточка энергопака: игровая цена (билеты) и остальные способы со счёта. */
export function packCard(p: PublicPack): PackCard {
  let game: PayOpt | null = null;
  const others: PayOpt[] = [];
  for (const o of p.offers ?? []) {
    if (o.kind === "tickets") {
      // Ступени кончились — цены нет, но кнопка остаётся «Лимит на сегодня».
      game = {
        key: `${p.id}:tickets`,
        method: "tickets",
        token: "tickets",
        price: o.price ?? 0,
        used: o.used,
        total: o.price == null ? Math.min(o.total ?? 0, o.used ?? 0) : o.total,
        how: { kind: "tickets", packId: p.id },
      };
      continue;
    }
    if (o.price == null) continue;
    if (o.kind === "usd" && o.usd) {
      others.push(...usdOpts(p.id, o.usd));
    } else if (o.kind === "darai" || o.kind === "token") {
      const symbol = o.kind === "darai" ? "Darai" : (o.symbol ?? "");
      if (!symbol) continue;
      others.push({
        key: `${p.id}:acc:${symbol}`,
        method: "token",
        token: symbol,
        price: o.price,
        used: o.used,
        total: o.total,
        how: { kind: "account", packId: p.id, symbol, payKind: o.kind === "darai" ? "darai" : "token" },
      });
      // Цена в $ (USDT-лесенка) — к ней звёзды от её цены, в тот же счётчик.
      if (o.kind === "token" && symbol === "USDT" && o.usd) others.push(...usdOpts(p.id, o.usd, ["STARS"]));
    }
  }
  // Пак без лестницы — старая одиночная цена в билетах (со скидкой подписки).
  if (!p.offers && p.effectivePriceTickets != null) {
    game = {
      key: `${p.id}:tickets`,
      method: "tickets",
      token: "tickets",
      price: p.effectivePriceTickets,
      used: p.dailyUsed,
      total: p.dailyLimit ?? undefined,
      how: { kind: "tickets", packId: p.id },
    };
  }
  others.sort((a, b) => rank(a) - rank(b));
  return { id: p.id, amount: p.amount, discount: p.bulkDiscountTickets ?? 0, game, others };
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

/** Способы оплаты тарифа подписки: звёзды, USDT, DARAI — всё со счёта. */
export function subOpts(t: SubOffer): PayOpt[] {
  return (["STARS", "USDT", "Darai"] as SubToken[]).flatMap((token) => {
    const price = t.prices[token];
    if (price == null) return [];
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
    .flatMap((c) => c.others.filter((o) => o.token === "USDT").map((o) => ({ amount: c.amount, price: o.price })))
    .sort((a, b) => b.amount - a.amount)[0];
  const usdt = t.prices.USDT;
  const energy = t.energyPerDay * t.days;
  if (!base || usdt == null || !(energy > 0) || !(base.price > 0)) return null;
  const saving = Math.round((1 - usdt / ((energy * base.price) / base.amount)) * 100);
  return saving > 0 ? saving : null;
}
