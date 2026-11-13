// Фейк «забрать ресурс счёта» из мешочка (bag-take-res-sql, ПРАВИЛА §8.70) для
// тестов loot-bag/*: снятие из живых порций и начисление на счёт (модель
// res_move: счёт + журнал по ключу kind/ref) — одним шагом, как один оператор
// под локом мешочка. Счета и журнал — здесь, сброс — resetRes().
import { db, livePortion, round, type Cmd } from "@/server/api/beta-raid/loot-bag/bag.fake";

/** Счета ресурсов: «аккаунт|ресурс» → сколько. */
export const resBal = new Map<string, number>();
/** Журнал ресурсов (res_ledger): вид, ключ, сколько. */
export const resLedger: Array<{
  account: string;
  res: string;
  delta: number;
  kind: string;
  ref: string;
}> = [];

export function resetRes(): void {
  resBal.clear();
  resLedger.length = 0;
}

const row = (v: unknown) => [{ _row: v }];

/** Построитель SQL в тестах — команда фейку вместо текста. */
export const takeResSqlMod = {
  BAG_TAKE_RES_KIND: "bag_take",
  takeResSql: (o: object) => `FAKE:${JSON.stringify({ cmd: "takeRes", ...o })}`,
  takeResOpSql: (op: string) => `FAKE:${JSON.stringify({ cmd: "takeResOp", op })}`,
};

/** Снять ресурс из порций (от ранней к поздней, до 0,0001) и начислить на счёт. */
export function takeRes(c: Cmd): unknown[] {
  const op = String(c.op);
  const prior = db.ops.get(op);
  if (prior) return row({ prior: prior.state, qty: prior.qty });
  const bag = db.bags.get(String(c.bagId));
  const key = String(c.stackKey);
  const live = (bag && !bag.buried ? bag.items : [])
    .filter((p) => p.stackKey === key && livePortion(p))
    .sort((a, b) => a.expiresAt - b.expiresAt);
  if (!bag || live.length === 0) return row({ prior: null, qty: null });
  const total = round(live.reduce((s, p) => s + p.count, 0));
  let left = Math.min(total, Math.trunc(Number(c.qty) * 10_000) / 10_000);
  let moved = 0;
  for (const p of live) {
    if (!(left > 0)) break;
    const n = Math.min(p.count, left);
    p.count = round(p.count - n);
    left = round(left - n);
    moved = round(moved + n);
  }
  if (!(moved > 0)) return row({ prior: null, qty: null });
  const acc = String(c.account);
  const res = String(c.res);
  resBal.set(`${acc}|${res}`, round((resBal.get(`${acc}|${res}`) ?? 0) + moved));
  resLedger.push({ account: acc, res, delta: moved, kind: "bag_take", ref: op });
  bag.updatedAt = db.now;
  const zero = { mob: 0, mine: 0, field: 0, loot: 0 };
  db.ops.set(op, {
    bagId: bag.id,
    heroId: null,
    kind: "take",
    stackKey: key,
    qty: moved,
    marks: zero,
    state: "done",
    at: db.now,
  });
  return row({ prior: null, qty: moved });
}

/** Исход ключа нажатия свежим чтением. */
export function takeResOp(c: Cmd): unknown[] {
  const o = db.ops.get(String(c.op));
  return o ? row({ state: o.state, qty: o.qty }) : [];
}
