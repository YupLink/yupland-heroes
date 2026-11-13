// Журнал сделок: обмен «товар за товар» в маркете — обе стороны (владелец,
// 06.10.2026: полученное в обмен — не добыча).
//
// Скупка, которая платит не золотом (артефакт → слитки, молоко → яблоки):
// отданное — «продал» (как и было), полученное — «купил» ключом выплаты, ценой
// — ключ отданного. Без второй строки турнир «Золото» считал слитки добытыми,
// и их продажа за золото шла в очки целиком.
// Покупка с ценой товаром (Дурман зелье за рыбу): полученное — «купил» (как и
// было), отданное — «заплатил» (pay) ключом отданного, как ворота: купленное
// за золото уходит из учёта первым, а не висит у держателя призраком.
// «Любой артефакт» — по шаблонам реально снятых (квитанция spend.paidArts):
// ключ art:art_any_* не совпадает с ключом покупки art:<шаблон>.
//
// Best-effort, как весь журнал: ничего не бросает, сделку не трогает.
import { allPrices } from "@/lib/marketPrices";
import type { MarketItem, MarketPriceResource } from "@/lib/marketItem";
import type { SpendReceipt } from "@/server/api/beta-raid/market-money";
import { isArtAny } from "@/server/api/beta-raid/art-rarity";
import { isHeroAny } from "@/server/api/beta-raid/hero-any";
import { payoutAsGood } from "@/server/api/beta-raid/market-sell-good";
import { payoutMeta, type Meta } from "@/server/api/beta-raid/market-payout-meta";
import { noteTrades, type TradeNote } from "@/server/api/beta-raid/econ/trade-journal";
import { priceCurOf } from "@/server/api/beta-raid/econ/trade-keys";
import { marketTradeKey } from "@/server/api/beta-raid/econ/canon-key";
import { noteMarketTrade } from "@/server/api/beta-raid/econ/trade-hooks";

/** Выплата скупки / строка цены покупки: чем и сколько (на всю сделку). */
export type GoodsLine = { res: MarketPriceResource; token: string | null; amount: number };

/** Товар, который перепродают за золото: предметы и ресурсы карты (не золото, не токены). */
const GOODS = new Set<MarketPriceResource>([
  "stone",
  "wood",
  "diamonds",
  "pack",
  "hero",
  "art",
  "boss",
  "custom",
]);

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

async function safe(build: () => Promise<TradeNote[]>): Promise<void> {
  try {
    await noteTrades(await build());
  } catch (e) {
    console.warn("trade-journal", "exchange", e instanceof Error ? e.message : String(e));
  }
}

/** Снятые артефакты по шаблонам: шаблон → штук, по порядку id (как бэкфилл — номер в ref тот же). */
function artsByTemplate(receipt: SpendReceipt | undefined, heroes = false): Map<string, number> {
  const by = new Map<string, number>();
  const list = heroes ? (receipt?.paidHeroes ?? []) : (receipt?.paidArts ?? []);
  for (const a of list) by.set(a.templateId, (by.get(a.templateId) ?? 0) + 1);
  return new Map([...by].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * Ключи и штуки товара строки цены/выплаты. «Любой артефакт» с квитанцией —
 * по снятым шаблонам (доля share — сколько от квитанции реально осталось).
 */
async function goodsOf(
  item: MarketItem,
  g: GoodsLine,
  share: number,
  receipt?: SpendReceipt,
): Promise<Array<{ key: string; name: string; qty: number }>> {
  const arts =
    g.res === "art" && isArtAny(g.token) ? artsByTemplate(receipt) : new Map<string, number>();
  if (arts.size > 0) {
    const out: Array<{ key: string; name: string; qty: number }> = [];
    for (const [tpl, n] of arts) {
      const name = (await payoutMeta("art", tpl).catch(() => null))?.name ?? tpl;
      out.push({ key: `art:${tpl}`, name, qty: round3(n * share) });
    }
    return out;
  }
  const meta: Meta | null = await payoutMeta(g.res, g.token).catch(() => null);
  const good = payoutAsGood(item, g.res, g.token, meta);
  return [{ key: await marketTradeKey(good), name: good.name, qty: round3(g.amount * share) }];
}

const at = (o: { item: MarketItem; account: string; mapId: string }) => ({
  accountId: o.account,
  counterparty: "shop",
  mapId: o.mapId,
  q: o.item.q,
  r: o.item.r,
});

/**
 * Скупка: отданное — «продал» (у «любого артефакта» — по снятым шаблонам),
 * полученное товаром — «купил» ценой отданного. ratio — доля реально
 * доставленного (недодача бывает только у паков).
 */
export function noteMarketSell(o: {
  item: MarketItem;
  account: string;
  mapId: string;
  qty: number;
  ratio: number;
  payouts: readonly GoodsLine[];
  receipt: SpendReceipt;
  ref: string;
}): Promise<void> {
  const { item } = o;
  const give = item.giveAmount > 0 ? item.giveAmount : 1;
  const units = o.qty * o.ratio;
  // «Любой герой» ломбарда — так же, по шаблонам сданных копий (paidHeroes).
  const hero = item.kind === "hero" && isHeroAny(item.refId);
  const arts =
    (item.kind === "art" && isArtAny(item.refId)) || hero
      ? artsByTemplate(o.receipt, hero)
      : new Map<string, number>();
  const given =
    arts.size > 0
      ? Promise.resolve()
      : noteMarketTrade({
          item,
          account: o.account,
          mapId: o.mapId,
          side: "sell",
          units,
          ref: o.ref,
        });
  return given.then(() =>
    safe(async () => {
      const rows: TradeNote[] = [];
      // «Любой артефакт» — строка «продал» на каждый снятый шаблон.
      const all = [...arts.values()].reduce((s, n) => s + n, 0);
      for (const [i, [tpl, n]] of [...arts].entries()) {
        rows.push({
          ...at(o),
          source: "market_sell",
          side: "sell",
          itemKey: `${hero ? "hero" : "art"}:${tpl}`,
          itemName: item.name,
          qty: round3(n * o.ratio),
          priceUnit: round3(item.priceAmount / give),
          priceCur: priceCurOf(item.priceResource, item.priceToken),
          total: round3((item.priceAmount * units * n) / all),
          ref: `${o.ref}:a${i}`,
        });
      }
      const givenKey = await marketTradeKey(item);
      for (const [i, p] of o.payouts.entries()) {
        if (!GOODS.has(p.res)) continue;
        for (const g of await goodsOf(item, p, o.ratio)) {
          rows.push({
            ...at(o),
            source: "market_sell",
            side: "buy",
            itemKey: g.key,
            itemName: g.name,
            qty: g.qty,
            priceCur: givenKey,
            total: round3(give * units),
            ref: `${o.ref}:got${i}`,
          });
        }
      }
      return rows;
    }),
  );
}

/** Покупка: полученное — «купил» (как и было), отданный товар цены — «заплатил». */
export function noteMarketBuy(o: {
  item: MarketItem;
  account: string;
  mapId: string;
  /** Сколько оплачено штук позиции и сколько из них выдано. */
  qty: number;
  delivered: number;
  /** Квитанции по строкам цены — в порядке allPrices (до пяти ингредиентов). */
  receipts: readonly SpendReceipt[];
  ref: string;
}): Promise<void> {
  const { item } = o;
  const units = o.delivered;
  const got = noteMarketTrade({
    item,
    account: o.account,
    mapId: o.mapId,
    side: "buy",
    units,
    ref: o.ref,
  });
  const lines: Array<GoodsLine | null> = allPrices(item).map((l) => ({
    res: l.resource,
    token: l.token,
    amount: l.amount * units,
  }));
  const share = o.qty > 0 ? units / o.qty : 1;
  return got.then(() =>
    safe(async () => {
      const rows: TradeNote[] = [];
      for (const [i, p] of lines.entries()) {
        if (!p || !GOODS.has(p.res)) continue;
        const goods = await goodsOf(item, p, 1, o.receipts[i]);
        for (const [k, g] of goods.entries()) {
          // Квитанция «любого артефакта» — на всё оплаченное; недодачу (паки) — долей.
          const qty = p.res === "art" && isArtAny(p.token) ? round3(g.qty * share) : g.qty;
          rows.push({
            ...at(o),
            source: "market",
            side: "pay",
            itemKey: g.key,
            itemName: g.name,
            qty,
            ref: `${o.ref}:pay${i}:${k}`,
          });
        }
      }
      return rows;
    }),
  );
}
