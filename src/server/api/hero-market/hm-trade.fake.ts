// Подделка базы для тестов покупки/снятия: hero_market_buy / hero_market_withdraw
// в памяти с той же семантикой, что у функций migrations/hero-market-01.sql —
// замок строки лота (очередь), повтор по ключу, отказы до записей, деньги
// ключуются лотом (kind|ref, как res_move/acc_move), «в минус» — исключение.
// Между проверкой и записью — пауза: без замка гонки в тестах были бы видны.

export type FakeLot = {
  id: string;
  item: string;
  seller: string;
  sellerWallet: string;
  priceGold: number | null;
  priceDarai: number | null;
  status: "active" | "sold" | "withdrawn";
  buyOp?: string;
  withdrawOp?: string;
  buyer?: string;
  currency?: "gold" | "darai";
  paid?: number;
  fee?: number;
  got?: number;
};

export const db = {
  lots: new Map<string, FakeLot>(),
  gold: new Map<string, number>(),
  darai: new Map<string, number>(),
  /** Проведённые движения kind|ref (повтор не двигает). */
  moves: new Map<string, { account: string; delta: number; res: string }>(),
  /** Владелец копии героя (залог — '_hero_market'). */
  owner: new Map<string, string>(),
  buckets: new Map<string, number>(),
  /** Исключение базы на первом движении денег (гонка баланса, таймаут замка). */
  failMove: null as string | null,
};

export function resetDb(): void {
  db.lots.clear();
  db.gold.clear();
  db.darai.clear();
  db.moves.clear();
  db.owner.clear();
  db.buckets.clear();
  db.failMove = null;
}

const queues = new Map<string, Promise<void>>();
async function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  let release = () => {};
  const mine = new Promise<void>((r) => (release = r));
  queues.set(
    key,
    prev.then(() => mine),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}
const tick = () => new Promise((r) => setTimeout(r, 1));

function move(
  res: "gold" | "darai",
  account: string,
  delta: number,
  kind: string,
  ref: string,
): void {
  const key = `${kind}|${ref}`;
  if (db.failMove) throw new Error(db.failMove);
  if (db.moves.has(key)) return;
  const bal = res === "gold" ? db.gold : db.darai;
  const next = Math.round(((bal.get(account) ?? 0) + delta) * 1e8) / 1e8;
  if (next < 0)
    throw new Error(
      res === "gold"
        ? "res_move: в минус"
        : `not_enough_currency:Darai:${bal.get(account) ?? 0}:${-delta}`,
    );
  bal.set(account, next);
  db.moves.set(key, { account, delta, res });
}

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;
const args = (sql: string): string[] =>
  [...sql.matchAll(/'([^']*)'|(-?\d+(?:\.\d+)?|NULL)/g)].map((m) => m[1] ?? m[2]);

function buy(a: string[]): Promise<Record<string, unknown>> {
  const [op, account, wallet, lotId, currency, expect, feePct, mapShare, burnShare] = a;
  return locked(`lot:${lotId}`, async () => {
    const l = db.lots.get(lotId);
    if (!l) return { ok: false, error: "lot_none" };
    if (l.buyOp === op)
      return {
        ok: true,
        fresh: false,
        lotId,
        itemId: l.item,
        heroId: null,
        currency: l.currency,
        price: l.paid,
        fee: l.fee,
        sellerGot: l.got,
      };
    if (l.status === "sold") return { ok: false, error: "lot_sold" };
    if (l.status !== "active") return { ok: false, error: "lot_withdrawn" };
    if (l.seller === account) return { ok: false, error: "own_lot" };
    const price = currency === "gold" ? l.priceGold : l.priceDarai;
    if (price == null) return { ok: false, error: `${currency}_off` };
    if (expect !== "NULL" && Number(expect) !== price)
      return { ok: false, error: "price_changed", price };
    const gold = currency === "gold";
    const fee = round((price * Number(feePct)) / 100, gold ? 2 : 8);
    const got = round(price - fee, 8); // numeric в базе точен, здесь — до 8 знаков
    const have = (gold ? db.gold : db.darai).get(account) ?? 0;
    if (have < price)
      return { ok: false, error: `${currency}_short`, need: price, have: Math.floor(have) };
    await tick();
    if (gold) {
      move("gold", account, -got, "hero_market_buy", `hmkt:${lotId}`);
      move("gold", account, -fee, "hero_market_fee", `hmkt:${lotId}`);
      move("gold", l.seller, got, "hero_market_sale", `hmkt-sell:${lotId}`);
    } else {
      move("darai", account, -price, "acc_spend", `hmkt:${lotId}`);
      move("darai", l.seller, got, "acc_refund", `hmkt-sell:${lotId}`);
      const map = round(fee * Number(mapShare), 8);
      const burn = round(fee * Number(burnShare), 8);
      db.buckets.set("map", (db.buckets.get("map") ?? 0) + map);
      db.buckets.set("sub_burn", (db.buckets.get("sub_burn") ?? 0) + burn);
      db.buckets.set("sub_dev", (db.buckets.get("sub_dev") ?? 0) + round(fee - map - burn, 8));
    }
    if (db.owner.get(l.item) !== "_hero_market") throw new Error("heromkt: залог героя не найден");
    db.owner.set(l.item, account);
    Object.assign(l, {
      status: "sold",
      buyOp: op,
      buyer: account,
      currency,
      paid: price,
      fee,
      got,
    });
    void wallet;
    return {
      ok: true,
      fresh: true,
      lotId,
      itemId: l.item,
      heroId: `hi_${l.item}`,
      currency,
      price,
      fee,
      sellerGot: got,
    };
  });
}

function withdraw(a: string[]): Promise<Record<string, unknown>> {
  const [op, account, lotId] = a;
  return locked(`lot:${lotId}`, async () => {
    const l = db.lots.get(lotId);
    if (!l) return { ok: false, error: "lot_none" };
    if (l.withdrawOp === op) return { ok: true, fresh: false, lotId, itemId: l.item };
    if (l.seller !== account) return { ok: false, error: "not_seller" };
    if (l.status === "sold") return { ok: false, error: "lot_sold" };
    if (l.status !== "active") return { ok: false, error: "lot_withdrawn" };
    await tick();
    db.owner.set(l.item, l.seller);
    Object.assign(l, { status: "withdrawn", withdrawOp: op });
    return { ok: true, fresh: true, lotId, itemId: l.item };
  });
}

/** Подмена mcpExec: разбирает вызов функции и отвечает строкой { r }. */
export async function fakeExec(sql: string): Promise<unknown[]> {
  const fn = /yuplink\.(hero_market_buy|hero_market_withdraw)\(([\s\S]*)\) AS r/.exec(sql);
  if (!fn) return [];
  const a = args(fn[2]);
  const r = fn[1] === "hero_market_buy" ? await buy(a) : await withdraw(a);
  return [{ r }];
}

export function putLot(l: Partial<FakeLot> & { id: string }): FakeLot {
  const lot: FakeLot = {
    item: `ugi_${l.id}`,
    seller: "acc_S",
    sellerWallet: "s.near",
    priceGold: 1500,
    priceDarai: null,
    status: "active",
    ...l,
  };
  db.lots.set(lot.id, lot);
  db.owner.set(lot.item, "_hero_market");
  return lot;
}
