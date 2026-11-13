// Подделка базы для тестов покупки на маркете фишек за золото
// (chips-market-gold-buy.test.ts) — память с той же семантикой, что у SQL
// yuplink.market_buy_batch (migrations/chipmkt-gold-01.sql) и res_move: сверка
// суммы, лоты по порядку id, «уже твой» / свой / ушёл, золото покупателя по ключу
// listing:<id>:<кошелёк>:b<op> (повтор ключа — откат всей пачки), захват, фишка,
// 91 % продавцу, журнал, аудит; «в минус» — откат всей транзакции. Тело функции —
// синхронно, без await посередине: так же, как под блокировкой строк лота.
// В приложение не импортируется.
export type FakeLot = {
  id: string;
  chip_id: string | null;
  status: string;
  seller_account: string | null;
  seller_wallet: string;
  buyer_account: string | null;
  price_tickets: number;
  price_gold: number | null;
};

export const db = {
  lots: new Map<string, FakeLot>(),
  gold: new Map<string, number>(),
  /** res_ledger: «вид|ключ». */
  keys: new Set<string>(),
  chips: new Map<string, string>(),
  ledger: [] as Array<{ kind: string; wallet: string; gold: number }>,
  audit: [] as Array<{ id: string; price: number; got: number; fee: number }>,
  rpcCalls: [] as Array<Record<string, unknown>>,
  /** Перед «транзакцией» — подменить состояние (гонка с другим списанием). */
  beforeRpc: null as null | (() => void),
};

export function resetDb() {
  db.lots = new Map();
  db.gold = new Map();
  db.keys = new Set();
  db.chips = new Map();
  db.ledger = [];
  db.audit = [];
  db.rpcCalls = [];
  db.beforeRpc = null;
}

function resMove(account: string, delta: number, kind: string, ref: string): boolean {
  if (db.keys.has(`${kind}|${ref}`)) return false;
  const next = (db.gold.get(account) ?? 0) + delta;
  if (next < 0) throw new Error("res_move: в минус");
  db.gold.set(account, next);
  db.keys.add(`${kind}|${ref}`);
  return true;
}

type Args = {
  p_buyer_account: string;
  p_buyer_wallet: string;
  p_ids: string[];
  p_expected: number;
  p_op: string;
  p_fee_pct: number;
};

function run(a: Args) {
  const found = a.p_ids.map((id) => db.lots.get(id)).filter((l): l is FakeLot => !!l);
  const shown = found.reduce((s, l) => s + (l.price_gold ?? 0), 0);
  if (found.length !== a.p_ids.length || Math.abs(shown - a.p_expected) > 0.005) throw new Error("market_batch_stale");
  const out = { bought: [] as unknown[], mine: [] as unknown[], failed: [] as unknown[], spent: 0 };
  for (const l of [...found].sort((x, y) => x.id.localeCompare(y.id))) {
    if (l.status === "sold" && l.buyer_account === a.p_buyer_account) {
      out.mine.push({ id: l.id, price: l.price_gold ?? 0 });
      continue;
    }
    if (l.seller_account === a.p_buyer_account) {
      out.failed.push({ id: l.id, reason: "own" });
      continue;
    }
    if (l.status !== "active" || !l.chip_id || !l.seller_account || l.price_gold == null) {
      out.failed.push({ id: l.id, reason: "gone" });
      continue;
    }
    const ref = `listing:${l.id}:${a.p_buyer_wallet}:b${a.p_op}`;
    if (!resMove(a.p_buyer_account, -l.price_gold, "chip_market_buy", ref)) throw new Error("market_batch_dup");
    Object.assign(l, { status: "sold", buyer_account: a.p_buyer_account });
    db.chips.set(l.chip_id, a.p_buyer_account);
    const fee = Math.round(l.price_gold * a.p_fee_pct) / 100;
    const get = l.price_gold - fee;
    db.ledger.push(
      { kind: "spend", wallet: a.p_buyer_wallet, gold: l.price_gold },
      { kind: "earned", wallet: l.seller_wallet, gold: get },
      { kind: "fee", wallet: "_market_fees", gold: fee },
    );
    resMove(l.seller_account, get, "chip_market_sale", `listing:${l.id}`);
    db.audit.push({ id: l.id, price: l.price_gold, got: get, fee });
    out.spent += l.price_gold;
    out.bought.push({
      id: l.id, price: l.price_gold, chipId: l.chip_id, seller: l.seller_account, sellerWallet: l.seller_wallet, sellerGot: get,
    });
  }
  return out;
}

/** sb.rpc("market_buy_batch", …): всё или ничего. */
export async function fakeRpc(fn: string, args: Record<string, unknown>) {
  db.rpcCalls.push({ fn, ...args });
  db.beforeRpc?.();
  db.beforeRpc = null;
  const snap = {
    lots: new Map([...db.lots].map(([k, v]) => [k, { ...v }])),
    gold: new Map(db.gold),
    keys: new Set(db.keys),
    chips: new Map(db.chips),
    ledger: [...db.ledger],
    audit: [...db.audit],
  };
  try {
    return { data: [{ result: run(args as unknown as Args) }], error: null };
  } catch (e) {
    Object.assign(db, snap);
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}
