// Подделка базы и счёта для тестов покупки набора (kit-buy*.test.ts) — память
// с той же семантикой, что у SQL: kit_reserve под замком набора (сверяет цену
// в $, бокс и количество; пишет снимок: валюта, сумма, бокс), kit_pay под
// замком брони (снятую не оплачивает, повтор по ключу второй раз не списывает,
// после возврата ключ не принимает), выдача — CAS только при живой оплате,
// kit_release — снятие брони с возвратом списанного в одной «транзакции».
// Проверка и запись каждой «функции» — синхронно, без await посередине, как
// под замком. В приложение не импортируется.
type Order = {
  id: string;
  account: string;
  status: string;
  payRef: string;
  token: string;
  amount: number;
  priceUsd: number;
  boxId: string;
  boxCount: number;
};

export const db = {
  kit: {
    exists: true,
    active: true,
    priceUsd: 10,
    boxId: "cp_box",
    boxCount: 3,
    stock: null as number | null,
    per: null as number | null,
    sold: 0,
  },
  orders: new Map<string, Order>(),
  spent: new Map<string, { token: string; amount: number }>(),
  refunded: new Set<string>(),
  /** Баланс счёта: ключ — «аккаунт:токен». */
  balance: new Map<string, number>(),
  /** Сколько следующих выдач упадёт до записи. */
  failGrant: 0,
  /** Выдача записывается, но ответ теряется (слепой обрыв моста). */
  loseGrantAnswer: false,
  /** Оплата отвечает таймаутом, а сама доезжает до базы позже — `inflight()`. */
  payTimeout: false,
  inflight: null as null | (() => Promise<{ applied: boolean }>),
  /** Админ меняет цену в $ сразу после того, как сервер её прочитал. */
  priceBumpTo: null as number | null,
};

export const bal = (account: string, token: string): number =>
  db.balance.get(`${account}:${token}`) ?? 0;
const setBal = (account: string, token: string, v: number) =>
  db.balance.set(`${account}:${token}`, v);

export function resetDb(): void {
  Object.assign(db.kit, {
    exists: true,
    active: true,
    priceUsd: 10,
    boxId: "cp_box",
    boxCount: 3,
    stock: null,
    per: null,
    sold: 0,
  });
  db.orders.clear();
  db.spent.clear();
  db.refunded.clear();
  db.balance = new Map([
    ["acc_A:USDT", 100],
    ["acc_A:Darai", 100_000_000],
    ["acc_A:STARS", 5000],
  ]);
  db.failGrant = 0;
  db.loseGrantAnswer = false;
  db.payTimeout = false;
  db.inflight = null;
  db.priceBumpTo = null;
}

export const granted = (): Order[] => [...db.orders.values()].filter((x) => x.status === "granted");

const tick = () => new Promise((r) => setTimeout(r, 0));

const view = (x: Order) => ({ ...x });

/** kit_pay: под замком брони, только пока она «reserved»; сумма — из снимка. */
async function kitPay(id: string): Promise<{ applied: boolean }> {
  await tick();
  const x = db.orders.get(id)!;
  if (x.status === "released") throw new Error("kit_released");
  if (x.status === "granted") return { applied: false };
  if (db.refunded.has(x.payRef)) throw new Error(`ref_refunded:${x.payRef}`);
  if (db.spent.has(x.payRef)) return { applied: false };
  const have = bal(x.account, x.token);
  if (have < x.amount) throw new Error(`not_enough_currency:${x.token}:${have}:${x.amount}`);
  setBal(x.account, x.token, have - x.amount);
  db.spent.set(x.payRef, { token: x.token, amount: x.amount });
  return { applied: true };
}

export const fakeOrder = {
  kitPriceUsd: async () => {
    await tick();
    const v = db.kit.exists ? db.kit.priceUsd : null;
    if (db.priceBumpTo != null) db.kit.priceUsd = db.priceBumpTo;
    return v;
  },
  reserveKit: async (o: {
    account: string;
    payRef: string;
    token: string;
    amount: number;
    priceUsd: number;
    boxId: string;
    boxCount: number;
  }) => {
    await tick();
    const k = db.kit;
    const old = [...db.orders.values()].find((x) => x.payRef === o.payRef);
    if (old) return view(old);
    if (!k.active) throw new Error("kits.err_off");
    if (k.priceUsd !== o.priceUsd) throw new Error("kits.err_price_changed");
    if (k.boxId !== o.boxId || k.boxCount !== o.boxCount) throw new Error("kits.err_changed");
    if (k.stock !== null && k.sold >= k.stock) throw new Error("kits.err_sold_out");
    const mine = [...db.orders.values()].filter(
      (x) => x.account === o.account && x.status !== "released",
    );
    if (k.per !== null && mine.length >= k.per) throw new Error("kits.err_limit");
    const x: Order = {
      id: `ko_${db.orders.size + 1}`,
      account: o.account,
      status: "reserved",
      payRef: o.payRef,
      token: o.token,
      amount: o.amount,
      priceUsd: k.priceUsd,
      boxId: k.boxId,
      boxCount: k.boxCount,
    };
    db.orders.set(x.id, x);
    k.sold++;
    return view(x);
  },
  payOrder: async (id: string) => {
    if (db.payTimeout) {
      // Запрос ушёл в базу, ответ потерялся: сама оплата случится позже.
      db.inflight = () => kitPay(id);
      throw new Error("MCP timeout");
    }
    return kitPay(id);
  },
  grantOrder: async (o: { id: string }) => {
    await tick();
    const x = db.orders.get(o.id)!;
    if (db.failGrant > 0) {
      db.failGrant--;
      throw new Error("MCP timeout");
    }
    if (x.status === "reserved" && db.spent.has(x.payRef) && !db.refunded.has(x.payRef)) {
      x.status = "granted";
      if (db.loseGrantAnswer) throw new Error("MCP timeout");
      return;
    }
    if (x.status === "granted") return;
    throw new Error("kits.err_retry");
  },
  releaseOrder: async (id: string) => {
    await tick();
    const x = db.orders.get(id)!;
    if (x.status === "granted") return "granted";
    if (x.status === "reserved") {
      x.status = "released";
      db.kit.sold--;
    }
    const paid = db.spent.get(x.payRef);
    if (paid && !db.refunded.has(x.payRef)) {
      db.refunded.add(x.payRef);
      setBal(x.account, paid.token, bal(x.account, paid.token) + paid.amount);
    }
    return "released";
  },
};
