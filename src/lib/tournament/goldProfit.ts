// Категория «Золото» — прибыль с продаж за золото (владелец, 03.10.2026,
// переписано 08.10.2026):
// «золото считаем не всё подряд, а только прибыль. Купил товар — потратил
// золото, это вложение; продал за золото — если получил больше, чем потратил на
// покупку, разница — прибыль. Добытое не покупкой (с боссов, полей и т. д.) —
// личное: его продажа — стопроцентная прибыль. Прибыли нет — не начисляется».
// И (04.10): «если товар был куплен за золото, после положен в сундук и после
// продан — не должно быть сброса происхождения». И (06.10): «перекидывание
// через другие аккаунты — нельзя допускать»: товар, положенный в хранилище
// ДРУГИМ аккаунтом, у забравшего — без прибыли.
//
// Считаем по журналу сделок (trade_journal) по одному товару сразу у всех
// игроков и во всех хранилищах, по порядку записей (что делает строка —
// flowAct.ts, общий с штучным учётом pieceFlow.ts). У штуки есть хозяин — кто
// её купил или добыл (goldLots.ts); прибыль даёт только своё:
//  • покупка за золото — своё купленное с ценой; покупка за другое (камень,
//    DARAI), приз бокса, полученное в обмен «товар за товар» — без прибыли;
//  • положил в общий склад, обычный сундук, мешочек — штуки едут со своими
//    хозяевами (сначала купленное — как рюкзак тратит купленное первым);
//  • забрал — всё забранное становится СВОИМ: своё купленное сохраняет свою
//    цену (иначе круг «купил дорого → положил → забрал» отмывал бы убыток),
//    чужое и неизвестное — как добытое, целиком в прибыль.
//    «Забрать сундук» с остатком в мешочек — штуки едут в мешочек с хозяевами;
//  • плата товаром (ворота, портал, обмен) и выпитое/съеденное (буст) —
//    купленное уходит первым. Улов удочкой и урожай грядки — своё добытое. Плата
//    товаром за покупку в маркете («Хлеб» за золото + «Пшеницу») переносит
//    цену своего купленного за золото в цену купленного (link, goldPayLink.ts);
//  • продажа — сначала своё купленное за золото (по средней цене), потом
//    добытое. Прибыль = выручка минус цена купленного; меньше нуля — ноль.
// Запасы до старта — тоже в зачёт (владелец, 03.11.2026: «и что что запасы —
// тоже нужно учитывать их — это же продажа»): купленное за золото до старта —
// сверх своей цены, пойманное и прочее — целиком. Было (08.10): пришедшее до
// старта прибыли не давало, и свежий улов тонул в старых запасах.
import {
  addShare,
  fromPocket,
  lot,
  sizeOf,
  takeShares,
  toPocket,
  type Holder,
} from "@/lib/tournament/goldLots";
import { actOf, byTime, pickOwners, type FlowRow } from "@/lib/tournament/flowAct";

export type { FlowRow } from "@/lib/tournament/flowAct";

export type ProfitPoint = { id: string; account: string; at: number; profit: number };

/**
 * Связь платы товаром с покупкой (goldPayLink.ts): extra — добавка к цене
 * строки «купил» по её ref; paid — сюда пишется цена в золоте, снятая каждой
 * строкой «заплатил» (по её ref).
 */
export type PayLink = { extra?: ReadonlyMap<string, number>; paid?: Map<string, number> };

const GOLD = "gold";
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Прибыль каждой продажи за золото с at в [since, till). rows — ВСЯ история
 * товара до till по всем игрокам и хранилищам (вложения бывают и до турнира).
 */
export function goldProfitFlow(
  rows: readonly FlowRow[],
  since: number,
  till: number,
  link: PayLink = {},
): ProfitPoint[] {
  const sorted = byTime(rows);
  const owners = pickOwners(sorted);
  const holders = new Map<string, Holder>();
  const of = (key: string): Holder => {
    let h = holders.get(key);
    if (!h) holders.set(key, (h = new Map()));
    return h;
  };
  const out: ProfitPoint[] = [];
  for (const r of sorted) {
    if (r.at >= till) break;
    const qty = Math.max(0, Number(r.qty) || 0);
    if (!(qty > 0)) continue;
    const who = r.account;
    const me = of(`acc:${who}`);
    const a = actOf(r, owners);
    // Улов удочкой и урожай в личные ячейки ('gain') — своё добытое: на счёте
    // оно неявное, всё сверх учтённого.
    if (a.k === "buy") {
      const paid = Math.max(0, Number(r.total) || 0) + (link.extra?.get(r.ref ?? "") ?? 0);
      // Подарок бокса и обмен — тоже прибыль: платили не золотом, вычитать
      // нечего, значит выручка целиком (владелец, 08.10.2026).
      addShare(me, who, r.cur === GOLD ? lot({ gold: qty, cost: paid }) : lot({ mined: qty }));
    } else if (a.k === "put") {
      const parts = a.fresh ? [{ owner: who, lot: lot({ mined: qty }) }] : fromPocket(me, who, qty).parts;
      for (const p of parts) addShare(of(a.store), p.owner, p.lot);
    } else if (a.k === "take") {
      const { parts, rest } = takeShares(of(a.store), qty, a.first ?? who, a.last ?? null);
      // Забранное — своё. Чужую цену не наследуем: подарок, добыча и чужое
      // идут целиком в прибыль, своё купленное остаётся со своей ценой.
      const mine = parts.map((p) =>
        p.owner === who ? p : { owner: who, lot: lot({ mined: sizeOf(p.lot) }) },
      );
      toPocket(me, who, [...mine, { owner: who, lot: lot({ mined: rest }) }]);
    } else if (a.k === "move") {
      const { parts, rest } = takeShares(of(a.from), qty, null);
      for (const p of [...parts, { owner: a.restOf, lot: lot({ mined: rest }) }])
        addShare(of(a.to), p.owner, p.lot);
    } else if (a.k === "pay" || a.k === "use") {
      const { own } = fromPocket(me, who, qty);
      if (link.paid && r.ref && own.cost > 0)
        link.paid.set(r.ref, (link.paid.get(r.ref) ?? 0) + own.cost);
    } else if (a.k === "sell") {
      const { own } = fromPocket(me, who, qty);
      if (r.cur !== GOLD || r.at < since) continue;
      const revenue = Math.max(0, Number(r.total) || 0);
      const profit = round(revenue * ((own.gold + own.mined) / qty) - own.cost);
      if (profit > 0) out.push({ id: r.id, account: who, at: r.at, profit });
    }
  }
  return out;
}
