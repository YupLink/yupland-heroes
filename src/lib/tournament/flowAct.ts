// Что строка журнала сделок (trade_journal) делает со штуками товара: пришли
// на счёт игрока, ушли с него, легли в хранилище или вышли из него. Общее для
// всех журнальных категорий турниров с происхождением штук: «Золото»
// (goldProfit.ts — прибыль) и штучный учёт своего (pieceFlow.ts — продажа
// своего улова, выпитые свои зелья). Сами доли — goldLots.ts.
//
// Держатели: счёт игрока ('acc:<аккаунт>'), общий склад клетки ('wh:<место>'),
// обычный сундук ('plain_chest:<место>'), мешочки клетки ('loot_bag:<место>')
// и сеть магического сундука хозяина ('net:<аккаунт>').

/** Строка журнала по одному товару. */
export type FlowRow = {
  id: string;
  /** Время, мс. */
  at: number;
  account: string;
  source: string;
  side: string;
  qty: number;
  /** buy — сколько заплатил; sell — сколько получил. */
  total: number;
  /** buy — чем платил; sell — что получил. */
  cur: string;
  /** Место хранилища (склад, сундук, мешочек). */
  place: string | null;
  /** Вторая сторона: чей мешочек, хозяин сети магического сундука. */
  counterparty?: string | null;
  /** Ключ операции: по нему узнаём остаток «Забрать сундук», ушедший в мешочек. */
  ref?: string | null;
};

/**
 * Свежее в хранилище — пришло прямо туда, мимо счёта: урожай грядки на общую
 * полку склада (grow), улов, не влезший в рюкзак, — мешочком у рыбака
 * (catch). chest — «положил в магический сундук»: туда идёт только собранное,
 * у «Золота» это своё добытое (на счёте оно неявное), у штучного учёта —
 * снимается со счёта своим добытым первым.
 */
export type Fresh = false | "grow" | "catch" | "chest";

/** Что делает строка с долями. */
export type Act =
  /** use — выпил/съел (буст из рюкзака): штуки уходят со счёта, как плата. */
  | { k: "buy" | "sell" | "pay" | "use" | "noop" }
  /**
   * Своё добытое прямо на счёт: улов удочкой (catch) и урожай грядки в личные
   * ячейки склада (grow: личная полка — тот же счёт, её журнал не пишет).
   */
  | { k: "gain"; fresh: "catch" | "grow" }
  | { k: "put"; store: string; fresh: Fresh }
  /**
   * unknown — чьё то, что сверх известного журналу; first — чья доля
   * снимается первой (по умолчанию забирающего), last — чья последней.
   */
  | { k: "take"; store: string; unknown: string; first?: string; last?: string }
  /** Остаток снятого сундука — в мешочек на той же клетке. */
  | { k: "move"; from: string; to: string; restOf: string };

/** Хозяин неизвестен: «положил» не записано (до журнала, сбой) — ничьё. */
export const NOBODY = "?";

const at = (kind: string, place: string | null): string | null =>
  place ? `${kind}:${place}` : null;
const net = (owner: string | null | undefined): string => `net:${owner || NOBODY}`;
/** Ключ нажатия «Забрать сундук» из ref строки журнала (без хвоста :b0, :o1, :r2). */
const pickOp = (ref: string | null | undefined): string => (ref ?? "").replace(/:[bor]\d+$/, "");

/** Чья сеть ушла при «Забрать сундук» чужим: у хозяина строка «потерял» (pay). */
export function pickOwners(rows: readonly FlowRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.source === "chest_plunder" && r.side === "pay" && r.ref?.startsWith("chestpick:"))
      out.set(pickOp(r.ref), r.account);
  }
  return out;
}

function putAct(r: FlowRow, owners: Map<string, string>): Act {
  const s = r.source;
  const wh = at("wh", r.place);
  const pc = at("plain_chest", r.place);
  const bag = at("loot_bag", r.place);
  if ((s === "wh_put" || s === "field") && wh)
    return { k: "put", store: wh, fresh: s === "field" ? "grow" : false };
  if (s === "plain_chest" && pc) return { k: "put", store: pc, fresh: false };
  if (s === "chest") return { k: "put", store: net(r.counterparty ?? r.account), fresh: "chest" };
  if (s === "fish" && bag) return { k: "put", store: bag, fresh: "catch" };
  if (s === "loot_bag" && bag) {
    const ref = r.ref ?? "";
    if (ref.startsWith("pcpick:") && pc) return { k: "move", from: pc, to: bag, restOf: NOBODY };
    if (ref.startsWith("chestpick:")) {
      const owner = owners.get(pickOp(ref)) ?? r.account;
      return { k: "move", from: net(owner), to: bag, restOf: owner };
    }
    return { k: "put", store: bag, fresh: false };
  }
  return { k: "noop" };
}

function takeAct(r: FlowRow): Act {
  const s = r.source;
  const wh = at("wh", r.place);
  const pc = at("plain_chest", r.place);
  const bag = at("loot_bag", r.place);
  if (s === "fish") return { k: "gain", fresh: "catch" };
  if (s === "field") return { k: "gain", fresh: "grow" };
  if (s === "wh_take" && wh) return { k: "take", store: wh, unknown: r.account };
  if (s === "plain_chest" && pc) return { k: "take", store: pc, unknown: r.account };
  // Мешочек: контрагент — чья добыча выпала (свой — без него). Все мешочки
  // клетки — один держатель, а «положил» не говорит, в чей мешочек: забор из
  // ЧУЖОГО — сначала доля хозяина мешочка, потом прочие, доля забирающего
  // последней (она скорее в его мешочке, но и в чужой её могли положить),
  // остаток — хозяина мешочка.
  if (s === "loot_bag" && bag) {
    const other = r.counterparty && r.counterparty !== r.account ? r.counterparty : null;
    return other
      ? { k: "take", store: bag, unknown: other, first: other, last: r.account }
      : { k: "take", store: bag, unknown: r.account };
  }
  if (s === "chest") return { k: "take", store: net(r.account), unknown: r.account };
  if (s === "chest_plunder")
    return { k: "take", store: net(r.counterparty), unknown: r.counterparty || NOBODY };
  return { k: "noop" };
}

/** Что делает строка журнала; owners — из pickOwners по всей истории товара. */
export function actOf(r: FlowRow, owners: Map<string, string>): Act {
  const { source: s, side } = r;
  if (side === "buy" || side === "sell" || side === "use") return { k: side };
  if (side === "pay") return { k: s === "chest_plunder" ? "noop" : "pay" };
  if (side === "put") return putAct(r, owners);
  if (side === "take") return takeAct(r);
  return { k: "noop" };
}

/** Строки по порядку: время, при равенстве — id. */
export const byTime = (rows: readonly FlowRow[]): FlowRow[] =>
  [...rows].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
