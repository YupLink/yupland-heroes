// Сборка строк журнала сделок из объектов торговли — чтобы в самих торговых
// путях хук был в одну-две строки, а правила «какой ключ у товара» и «как
// зовётся валюта цены» жили в одном месте (trade-keys.ts, рядом с
// admin-economy-keys — иначе журнал и отчёт продаж разъедутся).
//
// Всё здесь best-effort: ни одна функция не бросает — ни на записи (см.
// trade-journal), ни на сборке строки: кривой товар (custom без имени и т.п.)
// уходит в console.warn, а сделка игрока, которая уже прошла, не падает.
import type { MarketItem } from "@/lib/marketItem";
import type { PortalPrice } from "@/lib/portal";
import type { TownGood } from "@/lib/townConfig";
import type { EnergySpendReason } from "@/lib/econ/types";
import { raidOwner } from "../owner";
import { noteEnergySpend } from "./energy-note";
import { noteTrade, noteTrades, type TradeNote } from "./trade-journal";
import { priceCurOf, priceItemKey, stackItemKey } from "./trade-keys";
import { templateOf, townGoodKeyWith, townGoodName, townGoodNames } from "./town-good-key";
import { marketTradeKey } from "./canon-key";

export { marketItemKey, priceCurOf, priceItemKey, stackItemKey } from "./trade-keys";

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Сборка строки и запись — под одним колпаком: ни синхронный, ни асинхронный сбой не наружу. */
function safe(source: string, build: () => Promise<void>): Promise<void> {
  const warn = (e: unknown) =>
    console.warn("trade-journal", source, e instanceof Error ? e.message : String(e));
  try {
    return build().catch(warn);
  } catch (e) {
    warn(e);
    return Promise.resolve();
  }
}

/**
 * Сделка с витриной маркета. qty — в ЕДИНИЦАХ товара (giveAmount × штук):
 * позиция «100 золота за 50 Darai» в цепочке по resource:gold должна весить
 * сто, а не одну. Цена за единицу — соответственно. Ключ своего товара — по
 * имени канона, как у стека в рюкзаке (canon-key), а не по имени позиции.
 */
export function noteMarketTrade(opts: {
  item: MarketItem;
  account: string;
  mapId: string;
  side: "buy" | "sell";
  /** Штук позиции, реально выданных (покупка) или принятых (скупка). */
  units: number;
  ref: string;
}): Promise<void> {
  return safe("market", async () => {
    const { item, units } = opts;
    const give = item.giveAmount > 0 ? item.giveAmount : 1;
    return noteTrade({
      accountId: opts.account,
      counterparty: "shop",
      mapId: opts.mapId,
      q: item.q,
      r: item.r,
      source: opts.side === "buy" ? "market" : "market_sell",
      side: opts.side,
      itemKey: await marketTradeKey(item),
      itemName: item.name,
      qty: round3(give * units),
      priceUnit: round3(item.priceAmount / give),
      priceCur: priceCurOf(item.priceResource, item.priceToken),
      total: round3(item.priceAmount * units),
      ref: opts.ref,
    });
  });
}

/**
 * Сделка с ратушей: валюта всегда золото, цена — курса момента (townPriceFor).
 * Ключ товара — как у него же в маркете и на складе (town-good-key): иначе
 * турнир «Золото» не видит покупку и считает прибылью всю выручку.
 */
export function noteTownTrade(opts: {
  good: TownGood;
  account: string;
  mapId: string;
  q: number;
  r: number;
  side: "buy" | "sell";
  qty: number;
  unit: number;
  total: number;
  ref: string;
  /** Подпись позиции лавки — запасное имя шаблона, если справочник не ответил. */
  name?: string | null;
}): Promise<void> {
  return safe("town", async () => {
    const g = opts.good;
    const names = await townGoodNames([g]);
    const tpl = templateOf(g);
    const spare = opts.name?.trim();
    if (tpl && spare && spare !== tpl && !names.has(tpl)) names.set(tpl, spare);
    return noteTrade({
      accountId: opts.account,
      counterparty: "town",
      mapId: opts.mapId,
      q: opts.q,
      r: opts.r,
      source: "town",
      side: opts.side,
      itemKey: townGoodKeyWith(g, names) ?? `${g.kind}:${g.refId ?? g.id}`,
      // У custom — имя шаблона (у старых товаров без шаблона — id), у ресурса — ключ.
      itemName: g.kind === "custom" ? townGoodName(g, names) : (g.refId ?? g.kind),
      qty: opts.qty,
      priceUnit: opts.unit,
      priceCur: "gold",
      total: opts.total,
      ref: opts.ref,
    });
  });
}

/**
 * Полка склада: взял с общей (take) / положил на общую руками или с поля (put).
 * Без цены. side — только урожаю грядки в личные ячейки ('take': пришло на счёт).
 */
export function noteShelf(opts: {
  source: "wh_take" | "wh_put" | "field";
  side?: "take" | "put";
  account: string;
  mapId: string;
  q: number;
  r: number;
  stackKey: string;
  snap: { kind: string; refId: string | null; name: string };
  qty: number;
  ref: string;
}): Promise<void> {
  return safe(opts.source, () =>
    noteTrade({
      accountId: opts.account,
      counterparty: null,
      mapId: opts.mapId,
      q: opts.q,
      r: opts.r,
      source: opts.source,
      side: opts.side ?? (opts.source === "wh_take" ? "take" : "put"),
      itemKey: stackItemKey(opts.stackKey, opts.snap.kind, opts.snap.refId, opts.snap.name),
      itemName: opts.snap.name,
      qty: opts.qty,
      ref: opts.ref,
    }),
  );
}

/** Рынок фишек: две строки — покупатель и продавец, контрагент — аккаунт другой стороны. */
export function noteChipMarketSale(opts: {
  listingId: string;
  chipId: string;
  buyer: string;
  seller: string;
  price: number;
  sellerGot: number;
  /** Маркет фишек за золото с 21.10.2026; прежние сделки — билеты. */
  priceCur?: "gold" | "tickets";
}): Promise<void> {
  const base = {
    source: "chip_market" as const,
    itemKey: `chip:${opts.chipId}`,
    qty: 1,
    priceUnit: opts.price,
    priceCur: opts.priceCur ?? "tickets",
  };
  return noteTrades([
    {
      ...base,
      accountId: opts.buyer,
      counterparty: opts.seller,
      side: "buy",
      total: opts.price,
      ref: `listing:${opts.listingId}:buy`,
    },
    {
      ...base,
      accountId: opts.seller,
      counterparty: opts.buyer,
      side: "sell",
      total: opts.sellerGot,
      ref: `listing:${opts.listingId}:sell`,
    },
  ]);
}

/** Где заплатили ценой из строк: и вид сделки в журнале, и причина трат энергии. */
type PricePaidSource = "gate" | "portal" | "tour";

const energyOf = (prices: PortalPrice[]): number =>
  prices.filter((p) => p.resource === "energy").reduce((s, p) => s + (Number(p.amount) || 0), 0);

/**
 * Плата за ворота/портал/запись на турнир — по строке на каждую строку цены,
 * контрагент 'sink' (деньги никому). Ключ повтора — как у леджера
 * (resource-pay): ref:<№>:<ресурс>. Энергия среди строк заодно уходит в причины трат.
 */
export async function notePricesPaid(opts: {
  source: PricePaidSource;
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  prices: PortalPrice[];
  ref: string;
}): Promise<void> {
  const account = await raidOwner(opts.wallet).catch(() => null);
  if (!account) return;
  await safe(opts.source, () => notePricesRows(account, opts));
  await noteEnergySpend(account, energyOf(opts.prices), opts.source);
}

function notePricesRows(
  account: string,
  opts: Omit<Parameters<typeof notePricesPaid>[0], "wallet">,
): Promise<void> {
  const rows: TradeNote[] = opts.prices
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Number(p.amount) > 0)
    .map(({ p, i }) => ({
      accountId: account,
      counterparty: "sink",
      mapId: opts.mapId,
      q: opts.q,
      r: opts.r,
      source: opts.source,
      side: "pay" as const,
      itemKey: priceItemKey(p),
      // Чем платили — в подпись ленты: предмет по имени, ресурс/токен — символом.
      itemName: p.resource === "item" ? (p.itemName ?? null) : (p.token ?? p.resource),
      qty: Number(p.amount),
      ref: `${opts.ref}:${i}:${p.resource}`,
    }));
  return noteTrades(rows);
}

/** Энергия среди строк цены (стройка, заклинание, буст) — в причины трат. */
export async function noteEnergyInPrices(
  wallet: string,
  prices: PortalPrice[],
  reason: EnergySpendReason,
): Promise<void> {
  const energy = energyOf(prices);
  if (!(energy > 0)) return;
  const account = await raidOwner(wallet).catch(() => null);
  await noteEnergySpend(account, energy, reason);
}
