// Доли товара у держателей для «Золота» (goldProfit.ts): у каждой штуки есть
// хозяин — кто её купил или добыл — и вид: куплено за золото (с ценой), без
// прибыли (куплено не за золото, приз бокса, обмен) или добыто.
//
// Прибыль при продаже даёт всё, что пришло к игроку, и до старта турнира тоже
// (03.11.2026): купленное за золото — сверх своей цены, остальное (добыча
// героев, подарок бокса, обмен, забранное из любого хранилища) — целиком
// (владелец, 08.10.2026: «давай дорогу и тем, кто пробует перекидывать между
// складами и акками», «из мистик бокса — это же подарок, 100 % прибыли»).
// «Без прибыли» (other) у «Золота» не бывает — он нужен штучному учёту.
//
// Хозяин всё так же едет вместе со штукой через полки, сундуки и мешочки —
// по нему забранное своё купленное сохраняет СВОЮ цену, а не превращается в
// подарок (иначе круг «купил дорого → положил → забрал» отмывал бы убыток).
//
// Держатель — счёт игрока или хранилище: доли по хозяину, в порядке очереди
// (раньше лёг — раньше ушёл). У «Золота» своё добытое счёт не пишет — это всё
// сверх учтённого (журнал его не видит), поэтому mined своей доли на счёте
// там всегда 0. Штучный учёт своего (pieceFlow.ts: свой улов, свои зелья)
// пишет его явно (explicit): улов журнал видит, а сверх учтённого — не своё.
// Ему же нужно купленное самим за деньги (buys): «Продажа рыбы» засчитывает
// его, только если продано дороже (владелец, 12.10.2026). Цена — не у штуки,
// а в общем котле покупок игрока (buyBook.ts): иначе полкой выбирали бы, какая
// покупка уйдёт с продажей (ревью 12.10.2026).

/** Купленное самим за деньги у штучного учёта: валюта покупки и сколько штук. */
export type Buy = { cur: string; n: number };
/**
 * Доля одного хозяина: куплено за золото (штуки и цена), без прибыли, добыто;
 * buys — купленное самим за деньги у штучного учёта («Золото» их не пишет).
 */
export type Lot = { gold: number; cost: number; other: number; mined: number; buys?: Buy[] };
/** Держатель: хозяин → доля. */
export type Holder = Map<string, Lot>;
export type Part = { owner: string; lot: Lot };

/** Хозяин неизвестен: «положил» не записано (до журнала, сбой) — ничьё, без прибыли. */
export { NOBODY } from "@/lib/tournament/flowAct";

const EPS = 1e-9;
export const lot = (o: Partial<Lot> = {}): Lot => ({ gold: 0, cost: 0, other: 0, mined: 0, ...o });
/** Сколько штук куплено самим за деньги. */
export const boughtOf = (buys: readonly Buy[] | undefined): number =>
  (buys ?? []).reduce((s, b) => s + b.n, 0);
export const sizeOf = (l: Lot): number => l.gold + boughtOf(l.buys) + l.other + l.mined;

/**
 * gold — купленное (за золото и самим за деньги): false — не трогать; prefer —
 * валюта продажи: купленное за неё уходит первым; only — только купленное
 * самим за эту валюту (без золота, без прочего).
 */
type Kinds = { gold?: boolean; other: boolean; mined: boolean; prefer?: string; only?: string };

/** Снять до qty купленного самим: сначала за валюту prefer, потом прочее (only — только за неё). */
function drainBuys(l: Lot, qty: number, prefer?: string, only?: string): Buy[] {
  const out: Buy[] = [];
  let left = qty;
  const list = l.buys ?? [];
  const order =
    only !== undefined
      ? list.filter((x) => x.cur === only)
      : [...list.filter((x) => x.cur === prefer), ...list.filter((x) => x.cur !== prefer)];
  for (const b of order) {
    if (!(left > EPS)) break;
    const n = Math.min(left, b.n);
    out.push({ ...b, n });
    b.n -= n;
    left -= n;
  }
  if (l.buys) l.buys = l.buys.filter((b) => b.n > EPS);
  return out;
}

/** Снять до qty из доли: золото (по средней цене) → купленное самим → без прибыли → добытое. */
function drain(l: Lot, qty: number, kinds: Kinds): Lot {
  const gold = kinds.gold === false || kinds.only !== undefined ? 0 : Math.min(qty, l.gold);
  const cost = l.gold > 0 ? (l.cost * gold) / l.gold : 0;
  l.gold -= gold;
  l.cost -= cost;
  const buys = kinds.gold === false ? [] : drainBuys(l, qty - gold, kinds.prefer, kinds.only);
  const took = gold + boughtOf(buys);
  const other = kinds.other ? Math.min(qty - took, l.other) : 0;
  l.other -= other;
  const mined = kinds.mined ? Math.min(qty - took - other, l.mined) : 0;
  l.mined -= mined;
  return { gold, cost, other, mined, ...(buys.length > 0 ? { buys } : {}) };
}

/** Прибавить долю m к to; купленное самим — к той же валюте. */
function addTo(to: Lot, m: Lot): void {
  to.gold += m.gold;
  to.cost += m.cost;
  to.other += m.other;
  to.mined += m.mined;
  for (const b of m.buys ?? []) {
    const same = to.buys?.find((x) => x.cur === b.cur);
    if (same) same.n += b.n;
    else to.buys = [...(to.buys ?? []), { ...b }];
  }
}

export function addShare(h: Holder, owner: string, m: Lot): void {
  if (!(sizeOf(m) > EPS)) return;
  const cur = h.get(owner);
  if (cur) addTo(cur, m);
  else {
    const fresh = lot();
    addTo(fresh, m);
    h.set(owner, fresh);
  }
}

/** Пустая доля — долой: следующий вклад того же хозяина встанет в конец очереди. */
function tidy(h: Holder, owner: string): void {
  const l = h.get(owner);
  if (l && !(sizeOf(l) > EPS)) h.delete(owner);
}

/**
 * Снять qty из хранилища: сначала доля first (своё назад), потом чужие по
 * очереди, доля last — последней, перед rest (забор из ЧУЖОГО мешочка: своё
 * забирающего скорее лежит в его мешочке на той же клетке). Последней, а не
 * мимо: иначе своё положенное в чужой мешочек и забранное назад уходило бы
 * в rest и приписывалось хозяину мешочка (ревью 12.10: «купил → в чужой
 * мешочек → забрал» стирал цену у «Золота» и дарил твину зелья основы).
 * rest — сверх известного журналу.
 */
export function takeShares(
  h: Holder,
  qty: number,
  first: string | null,
  last: string | null = null,
): { parts: Part[]; rest: number } {
  const parts: Part[] = [];
  let left = qty;
  const rank = (o: string): number => (o === first ? 0 : o === last ? 2 : 1);
  // sort устойчивый: внутри ранга — очередь «раньше лёг — раньше ушёл».
  const order = [...h.keys()].sort((a, b) => rank(a) - rank(b));
  for (const owner of order) {
    if (!(left > EPS)) break;
    const got = drain(h.get(owner)!, left, { other: true, mined: true });
    left -= sizeOf(got);
    if (sizeOf(got) > 0) parts.push({ owner, lot: got });
    tidy(h, owner);
  }
  return { parts, rest: Math.max(0, left) };
}

/**
 * Как снимать со счёта: explicit — своё добытое записано явно (штучный учёт),
 * иначе оно — всё сверх учтённого; minedFirst — своё добытое первым (в
 * магический сундук идёт только собранное; у штучного учёта продажа и
 * выпитое снимают своё засчитываемое первым — pieceFlow.ts); prefer —
 * валюта продажи (купленное за неё уходит первым); dearFirst — у явного учёта
 * купленное самим за эту валюту — раньше всего, и добытого тоже, но не больше
 * dearMax штук (сколько его куплено дешевле цены продажи — buyBook.bookDear:
 * оно здесь засчитываемое).
 */
export type PocketWay = {
  explicit?: boolean;
  minedFirst?: boolean;
  prefer?: string;
  dearFirst?: string;
  dearMax?: number;
};

/**
 * Снять qty со счёта игрока me — порядок продажи: (dearFirst — купленное за
 * эту валюту, до dearMax штук) → (minedFirst — своё добытое) → своё
 * купленное (за золото, самим за деньги) → своё без прибыли → чужое по
 * очереди → своё добытое. own — что снято из
 * своей доли (у «Золота» добытое — всё сверх учтённого). rest — у явного учёта
 * то, что сверх известного журналу (чьё — решает вызывающий); иначе 0.
 */
export function fromPocket(
  h: Holder,
  me: string,
  qty: number,
  way: PocketWay = {},
): { parts: Part[]; own: Lot; rest: number } {
  const mine = h.get(me) ?? lot();
  const own = lot();
  let left = qty;
  const fromMine = (kinds: Kinds, cap = Infinity): void => {
    if (!(left > EPS) || !(cap > EPS)) return;
    const got = drain(mine, Math.min(left, cap), { ...kinds, prefer: way.prefer });
    addTo(own, got);
    left -= sizeOf(got);
  };
  if (way.explicit && way.dearFirst !== undefined)
    fromMine({ other: false, mined: false, only: way.dearFirst }, way.dearMax);
  if (way.explicit && way.minedFirst) fromMine({ gold: false, other: false, mined: true });
  fromMine({ other: false, mined: false });
  fromMine({ other: true, mined: false });
  const parts: Part[] = [];
  for (const owner of [...h.keys()]) {
    if (owner === me || !(left > EPS)) continue;
    const got = drain(h.get(owner)!, left, { other: true, mined: true });
    left -= sizeOf(got);
    if (sizeOf(got) > 0) parts.push({ owner, lot: got });
    tidy(h, owner);
  }
  if (way.explicit) fromMine({ other: false, mined: true });
  tidy(h, me);
  const rest = Math.max(0, left);
  if (!way.explicit) own.mined += rest;
  parts.unshift({ owner: me, lot: { ...own } });
  return { parts, own, rest: way.explicit ? rest : 0 };
}

/**
 * Положить на счёт игрока me: своё — как было (у «Золота» добытое — снова
 * неявное, у явного учёта — как есть), чужое — с хозяином.
 */
export function toPocket(h: Holder, me: string, parts: readonly Part[], explicit = false): void {
  for (const { owner, lot: l } of parts) {
    if (owner === me) addShare(h, me, explicit ? l : { ...l, mined: 0 });
    else addShare(h, owner, l);
  }
}
