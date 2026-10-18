// Цепочки «купил → продал» по журналу сделок: чистая свёртка строк одного
// игрока по одному товару. Нужна и вкладке сделок, и охотнику за лазейками
// (арбитраж), поэтому не знает ни про SQL, ни про имена.
import type { ChainLeg, ChainRow, TradeRow } from "@/lib/econ/types";

type Acc = {
  leg: ChainLeg;
  curs: Set<string | null>;
  places: Map<string, ChainLeg["places"][number]>;
};

const newAcc = (): Acc => ({
  leg: { qty: 0, total: 0, cur: null, places: [] },
  curs: new Set(),
  places: new Map(),
});

function push(a: Acc, t: TradeRow): void {
  a.leg.qty += t.qty;
  a.leg.total += t.total ?? 0;
  a.curs.add(t.priceCur);
  const key = `${t.mapId ?? ""}|${t.q ?? ""}|${t.r ?? ""}|${t.counterparty ?? ""}`;
  const p = a.places.get(key) ?? {
    mapId: t.mapId,
    q: t.q,
    r: t.r,
    n: 0,
    counterparty: t.counterparty,
  };
  p.n += 1;
  a.places.set(key, p);
}

function finish(a: Acc): ChainLeg {
  // Валюта плеча — одна на все строки, иначе суммировать total нечестно.
  const cur = a.curs.size === 1 ? [...a.curs][0] : null;
  const places = [...a.places.values()].sort((x, y) => y.n - x.n);
  return { ...a.leg, cur, places };
}

/**
 * Свернуть сделки в цепочки по (игрок, товар). В цепочку попадают только
 * покупки и продажи (полка и ворота — не торговля; приз бокса — «купил» без
 * цены, но не сделка), и только пары, где есть обе ноги: одни покупки — ещё не
 * цепочка. Сортировка: навар по убыванию,
 * без навара — в конец, внутри — свежие выше.
 */
export function buildChains(rows: TradeRow[]): ChainRow[] {
  type G = { first: TradeRow; buys: Acc; sells: Acc; from: string; to: string };
  const groups = new Map<string, G>();
  for (const t of rows) {
    if ((t.side !== "buy" && t.side !== "sell") || t.source === "mystic") continue;
    const key = `${t.accountId}|${t.itemKey}`;
    const g = groups.get(key) ?? {
      first: t,
      buys: newAcc(),
      sells: newAcc(),
      from: t.at,
      to: t.at,
    };
    push(t.side === "buy" ? g.buys : g.sells, t);
    if (t.at < g.from) g.from = t.at;
    if (t.at > g.to) g.to = t.at;
    groups.set(key, g);
  }

  const out: ChainRow[] = [];
  for (const g of groups.values()) {
    if (g.buys.leg.qty <= 0 || g.sells.leg.qty <= 0) continue;
    const buys = finish(g.buys);
    const sells = finish(g.sells);
    const sameCur = buys.cur != null && buys.cur === sells.cur;
    out.push({
      accountId: g.first.accountId,
      displayName: g.first.displayName,
      itemKey: g.first.itemKey,
      itemName: g.first.itemName,
      buys,
      sells,
      margin: sameCur ? sells.total - buys.total : null,
      marginCur: sameCur ? buys.cur : null,
      first: g.from,
      last: g.to,
    });
  }
  return out.sort((a, b) => {
    if (a.margin == null && b.margin == null) return a.last < b.last ? 1 : -1;
    if (a.margin == null) return 1;
    if (b.margin == null) return -1;
    return b.margin - a.margin || (a.last < b.last ? 1 : -1);
  });
}
