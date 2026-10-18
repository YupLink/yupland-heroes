// Штучный учёт своего — для турнира рыбаков (владелец, 12.10.2026: «Турнир
// рыбаков. 1. Кто больше словит рыбы. 2. Кто больше продаст рыбы. 3. Кто
// больше выпьет зелий скорости (делается из рыбы)») в рамках турниров:
// «перекидывание через другие аккаунты — нельзя допускать».
//
// Та же модель, что у «Золота» (goldProfit.ts): журнал сделок по одному товару
// сразу у всех игроков и во всех хранилищах, по порядку; что делает строка —
// flowAct.ts, доли и их хозяева — goldLots.ts. Разница — в оценке:
//  • «Золото» отдаёт забравшему всё забранное (08.10: «давай дорогу и тем, кто
//    пробует перекидывать»), а здесь чужое остаётся ЧУЖИМ: штука помнит
//    хозяина, у забравшего она очков не даёт, а вернётся к хозяину — снова
//    его. Подкачка твинами через полку, сундук, мешочек — мимо;
//  • своё добытое на счёте записано явно (улов и урожай журнал видит),
//    поэтому то, что сверх известного журналу, — своё или нет по правилу
//    категории; сверх известного в ЧУЖОМ мешочке или чужой сети — ничьё.
//
// Своё — КОГДА БЫ НИ ПРИШЛО (владелец, 14.10.2026, на вопрос «засчитывать ли
// рыбу, купленную до старта и проданную в турнире дороже»: «да, засчитывай
// все»): пойманное, выращенное, купленное, сваренное до старта и до записи —
// тоже своё. Засчитывается только само событие (продажа, выпитое) — после
// оплаченной записи (joined) и не раньше старта; до этого оно лишь списывает
// штуки. Было (12.10): своё — только с момента записи — отменено.
//
// Событие категории (продажа рыбы, выпитое зелье) снимает со счёта своё
// засчитываемое первым (goldLots: dearFirst, minedFirst): купленное дешевле
// цены этой продажи (столько штук, сколько его есть — buyBook.bookDear; если
// плюс по купленному достижим) → своё добытое → прочее своё купленное → своё
// не в зачёт → чужое. Было «купленное → не в зачёт → чужое → добытое»:
// продажа пойманного «съедала» старую рыбу (жалоба 14.10: поймал и продал 9 —
// засчитано 3). Остальное, что
// уходит со счёта не событием категории (у рыбы — плата товаром за зелья и
// съеденное), берёт засчитываемое последним: купленное → не в зачёт → чужое →
// добытое (ревью 14.10: варка «съедала» улов, а купленное оставалось; у
// acc_-VomN… 266 вместо 280). Плата товаром у зелий — своё первым.
// Очков всё равно не больше, чем своего пришло.
//
// Правила категорий:
//  • продажа рыбы (fish_sell) — своё добытое: пойманное удочкой и выращенное
//    на своей грядке (в личные ячейки склада — строка 'field'/take, на общую
//    полку — 'field'/put). Купленное САМИМ (владелец, 12.10.2026: «Купленную
//    рыбу считаем, если что (но только в +)»), в том числе до старта, —
//    только купленное дешевле цены продажи в той же валюте (купил за золото —
//    продал за золото, за DARAI — за DARAI), каждая покупка — один раз, и
//    только в плюсе по купленному целиком: выручка против всего заплаченного
//    с мига записи — купленное раньше идёт туда по своей цене (buyBook.ts —
//    ревью 12.10 и 14.10.2026: круги через ратушу и выбор штуки полкой).
//    Купленное чужим аккаунтом — чужое, в его котле. Обмен (плата товаром),
//    приз бокса и сверх журнала очков не дают;
//  • выпитые зелья (potion_drink) — своё всё, что пришло к самому игроку
//    (куплено, сварено самим в маркете — из любой рыбы и вёдер, приз бокса,
//    добыто); не своё — зелье, полученное от другого аккаунта (владелец,
//    14.10.2026: ингредиенты сваренного не проверяем — pieceLink.ts).
import {
  addShare,
  boughtOf,
  fromPocket,
  lot,
  takeShares,
  toPocket,
  type Holder,
  type Lot,
} from "@/lib/tournament/goldLots";
import { actOf, byTime, pickOwners, type FlowRow } from "@/lib/tournament/flowAct";
import {
  bookBuy,
  bookDear,
  bookGone,
  bookOpen,
  bookPlus,
  bookSale,
  type BuyBook,
} from "@/lib/tournament/buyBook";

/**
 * Откуда штука пришла к игроку: покупка за деньги (buy), обмен — плата
 * товаром (swap), приз бокса (prize), улов удочкой, грядка, сверх журнала.
 */
export type PieceGain = "buy" | "swap" | "prize" | "catch" | "grow" | "unknown";

/** Правило категории: что из пришедшего к самому игроку — своё и какое событие — очко. */
export type PieceRule = {
  /** Своё ли пришедшее так к самому игроку — когда бы ни пришло. */
  own: (how: PieceGain) => boolean;
  /** Купленное самим за деньги — своё, только если продано дороже и в плюсе (buyBook.ts). */
  dearer?: boolean;
  /** Очко — продажа (sell) или выпитое/съеденное (use). */
  count: "sell" | "use";
};

/** «Продажа рыбы»: своё — улов и своя грядка; купленное самим — только в плюс. */
export const FISH_SALE_RULE: PieceRule = {
  own: (how) => how === "catch" || how === "grow",
  dearer: true,
  count: "sell",
};

/** «Зелья скорости»: своё — всё, что пришло к самому игроку; чужое — нет. */
export const POTION_DRINK_RULE: PieceRule = { own: () => true, count: "use" };

/** Очко: строка журнала (продажа или выпитое) и сколько своих штук в ней. */
export type PiecePoint = { id: string; account: string; at: number; qty: number };

export type PieceOpts = {
  /** Старт турнира, мс. */
  start: number;
  /** Окно очков [since, till), мс. */
  since: number;
  till: number;
  rule: PieceRule;
  /**
   * Оплаченные записи: аккаунт → момент записи, мс. Событие раньше записи (или
   * старта) очка не даёт. Не задано — отсечка по старту для всех.
   */
  joined?: ReadonlyMap<string, number>;
  /** ref покупок, за которые отдавали товар (строки «заплатил»), — обмен. */
  swaps?: ReadonlySet<string>;
};

const EPS = 1e-6;
/** Очки — целые штуки. */
const whole = (n: number): number => Math.floor(n + EPS);

/**
 * Валюты-товары: плата ими — обмен (как GOODS обмена в маркете — exchange-note;
 * предметная цена — 'kind:<шаблон>').
 */
const GOODS_CUR = new Set(["stone", "wood", "diamonds"]);

/** Как пришла покупка: за деньги в маркете/ратуше, обмен или приз бокса. */
function buyHow(r: FlowRow, swaps: ReadonlySet<string> | undefined): PieceGain {
  if (r.source === "mystic") return "prize";
  if (r.source !== "market" && r.source !== "town") return "swap";
  const goods = !r.cur || r.cur.includes(":") || GOODS_CUR.has(r.cur);
  return goods || swaps?.has(r.ref ?? "") ? "swap" : "buy";
}

/**
 * Очки событий с at в [since, till). rows — ВСЯ история товара до till по всем
 * игрокам и хранилищам.
 */
export function pieceFlow(rows: readonly FlowRow[], o: PieceOpts): PiecePoint[] {
  const sorted = byTime(rows);
  const owners = pickOwners(sorted);
  const holders = new Map<string, Holder>();
  const of = (key: string): Holder => {
    let h = holders.get(key);
    if (!h) holders.set(key, (h = new Map()));
    return h;
  };
  // С какого мига события игрока — очки: запись (не раньше старта); не записан — никогда.
  const cut = (acc: string): number =>
    o.joined ? Math.max(o.start, o.joined.get(acc) ?? Infinity) : o.start;
  const book: BuyBook = new Map();
  // Плюс по купленному — с того же мига (buyBook.bookOpen): по порядку времени.
  const opens: Array<{ acc: string | null; at: number }> = o.joined
    ? [...o.joined.keys()].map((acc) => ({ acc, at: cut(acc) }))
    : [{ acc: null, at: o.start }];
  opens.sort((x, y) => x.at - y.at);
  let k = 0;
  const out: PiecePoint[] = [];
  for (const r of sorted) {
    if (r.at >= o.till) break;
    while (k < opens.length && opens[k].at <= r.at) bookOpen(book, opens[k++].acc);
    const qty = Math.max(0, Number(r.qty) || 0);
    if (!(qty > 0)) continue;
    const who = r.account;
    const me = of(`acc:${who}`);
    const a = actOf(r, owners);
    const share = (how: PieceGain, n: number): Lot =>
      o.rule.own(how) ? lot({ mined: n }) : lot({ other: n });
    if (a.k === "buy") {
      const how = buyHow(r, o.swaps);
      // Купил сам за деньги (и до старта) — своим станет, если продано дороже и в плюсе.
      if (how === "buy" && o.rule.dearer) {
        addShare(me, who, lot({ buys: [{ cur: r.cur, n: qty }] }));
        bookBuy(book, who, r.cur, qty, Math.max(0, Number(r.total) || 0));
      } else addShare(me, who, share(how, qty));
    } else if (a.k === "gain") addShare(me, who, share(a.fresh, qty));
    else if (a.k === "put" && (a.fresh === "grow" || a.fresh === "catch")) {
      addShare(of(a.store), who, share(a.fresh, qty));
    } else if (a.k === "put") {
      // В магический сундук идёт только собранное — своё добытое первым.
      const way = { explicit: true, minedFirst: a.fresh === "chest" };
      const { parts, rest } = fromPocket(me, who, qty, way);
      for (const p of parts) addShare(of(a.store), p.owner, p.lot);
      addShare(of(a.store), who, share("unknown", rest));
    } else if (a.k === "take") {
      // Своё — назад своим, чужое — с хозяином: забравшему очков не даёт.
      // Сверх известного из чужого мешочка/сети — ничьё: иначе «положил своё в
      // чужой мешочек и забрал» дарило бы хозяину мешочка своё.
      const { parts, rest } = takeShares(of(a.store), qty, a.first ?? who, a.last ?? null);
      const left = a.unknown === who ? share("unknown", rest) : lot({ other: rest });
      toPocket(me, who, [...parts, { owner: a.unknown, lot: left }], true);
    } else if (a.k === "move") {
      const { parts, rest } = takeShares(of(a.from), qty, null);
      for (const p of parts) addShare(of(a.to), p.owner, p.lot);
      addShare(
        of(a.to),
        a.restOf,
        a.restOf === who ? share("unknown", rest) : lot({ other: rest }),
      );
    } else if (a.k === "pay" || a.k === "use" || a.k === "sell") {
      const sell = a.k === "sell";
      const price = Math.max(0, Number(r.total) || 0) / qty;
      // Продажа: своё засчитываемое — первым. Купленное дешевле цены продажи
      // (не больше, чем его есть) идёт раньше добытого, если плюс достижим —
      // продав по этой цене всё такое купленное, игрок будет в плюсе: иначе
      // оно осталось бы непроданным, держало бы в минусе, и честная
      // перепродажа между ратушами не засчитывалась бы (acc_-VomN… 14.10).
      // Плюс недостижим — первым добытое: оно засчитывается сразу, а
      // купленное только ждало бы плюса (acc__xADt…: дорогой запас держит в
      // минусе, и ждущие «съедали» бы улов — 77 очков вместо 109). Купленное
      // — только на руках (аудит 14.10: дешёвое в сундуках держало плюс
      // «достижимым», улов из рюкзака уходил в ожидание — acc_1-AzQ… 36 вместо
      // 80). Плата и съеденное у рыбы — засчитываемое последним (см. выше).
      const hand = sell ? boughtOf(me.get(who)?.buys?.filter((b) => b.cur === r.cur)) : 0;
      const dearN = o.rule.dearer ? Math.min(bookDear(book, who, r.cur, price), hand) : 0;
      const dearMax = bookPlus(book, who, r.cur, price * dearN) ? dearN : 0;
      const way = {
        explicit: true,
        minedFirst: sell || o.rule.dearer !== true,
        prefer: sell ? r.cur : undefined,
        dearFirst: dearMax > 0 ? r.cur : undefined,
        dearMax,
      };
      const { parts, own, rest } = fromPocket(me, who, qty, way);
      // Купленное другими ушло из их котлов, своё — продажей или мимо неё.
      for (const p of parts) if (p.owner !== who) bookGone(book, p.owner, p.lot.buys);
      // Событие до записи (до старта) — не очко: штуки списывает, «дороже» не копит.
      const counts = a.k === o.rule.count && r.at >= cut(who);
      const dear = sell ? bookSale(book, who, r.cur, price, own.buys, counts) : 0;
      if (!sell) bookGone(book, who, own.buys);
      const mine = own.mined + (o.rule.own("unknown") ? rest : 0);
      if (!counts || r.at < o.since) continue;
      const n = whole(mine + dear);
      if (n > 0) out.push({ id: r.id, account: who, at: r.at, qty: n });
    }
  }
  return out;
}
