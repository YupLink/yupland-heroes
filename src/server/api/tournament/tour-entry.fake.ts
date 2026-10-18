// Подделка базы и платы для тестов записи на турнир (tour-entry*.test.ts):
// память с той же семантикой, что у операторов tour-entry-sql и у resource-pay.
// Ресурсы, билеты и токен проводятся по ключу один раз и оставляют след в
// журнале (res_ledger / ticket_ledger / acc_ledger) — как res_move, ticket_move
// и acc_move; энергия и товар при keyed — ключом операции `op|pay:<ключ>`
// (pay-once). Лайки следа не оставляют и ключа не помнят: второй вызов
// списывает (и возвращает) второй раз — ровно то, от чего защищается разбор
// зависших записей. В приложение не импортируется.
import type { TourEntryPrice } from "@/lib/tournament/types";

export type Row = {
  paid: boolean;
  at: number;
  price: TourEntryPrice[];
  ref: string;
  wallet: string;
};
export const MIN = 60_000;

export const db = {
  now: 0,
  open: true,
  /** Гонка: чужая вставка закоммитилась после снимка нашего оператора. */
  race: false,
  /** Вставка легла, ответ потерян, мост повторил: повтор видит «чужую» строку. */
  retryClaim: false,
  /** Отметка «оплачено» падает до записи (база моргнула после платы). */
  failPaid: 0,
  /** Отметка ложится, а ответ теряется. */
  losePaid: false,
  /** Снятие строки падает. */
  failDrop: false,
  /** Черновик удалили, пока шла плата: к отметке строки уже нет (каскад). */
  cascade: false,
  /** К отметке строку уже разобрали и записали другую попытку (свой ключ). */
  takenBy: null as Row | null,
  /** Очки участника (турнир|аккаунт → сумма): гашение плательщиком их снимает. */
  points: new Map<string, number>(),
  price: new Map<string, TourEntryPrice[]>(),
  entries: new Map<string, Row>(),
  bal: new Map<string, number>(),
  ledger: new Set<string>(),
  pays: [] as Array<{ ref: string; kinds: unknown }>,
};

export function resetDb(now: number): void {
  Object.assign(db, { now, open: true, race: false, retryClaim: false, failPaid: 0 });
  Object.assign(db, { losePaid: false, failDrop: false, cascade: false, takenBy: null });
  db.price = new Map();
  db.entries = new Map();
  db.ledger = new Set();
  db.pays = [];
  db.bal = new Map();
  db.points = new Map();
}

type Kinds = { kind: string; refundKind: string; keyed?: boolean };
type Tag = (key: string) => string;
const led =
  (kind: string): Tag =>
  (key) =>
    `${kind}|${key}`;
const op: Tag = (key) => `op|pay:${key}`;
/** След строки цены: запись списания и возврата (ключ возврата — `ключ:back`); null — следа нет. */
function trail(p: TourEntryPrice, k: Kinds): [Tag, Tag] | null {
  if (["gold", "stone", "wood", "diamonds"].includes(p.resource))
    return [led(k.kind), led(k.refundKind)];
  if (p.resource === "tickets") return [led("building"), led("raid_reward")];
  if (p.resource === "token") return [led("acc_spend"), led("acc_reward")];
  if (k.keyed && (p.resource === "energy" || p.resource === "item")) return [op, op];
  return null;
}
const balKey = (w: string, p: TourEntryPrice) => `${w}|${p.token ?? p.resource}`;
const add = (w: string, p: TourEntryPrice, d: number) =>
  db.bal.set(balKey(w, p), (db.bal.get(balKey(w, p)) ?? 0) + d);

function back(w: string, p: TourEntryPrice, key: string, k: Kinds): void {
  if (!(p.amount > 0)) return;
  const t = trail(p, k);
  if (t && db.ledger.has(t[1](`${key}:back`))) return;
  if (t) db.ledger.add(t[1](`${key}:back`));
  add(w, p, p.amount);
}

export const fakePay = {
  payResources: async (w: string, prices: TourEntryPrice[], ref: string, k: Kinds) => {
    db.pays.push({ ref, kinds: k });
    const done: Array<[TourEntryPrice, string]> = [];
    for (const [i, p] of prices.entries()) {
      const key = `${ref}:${i}:${p.resource}`;
      const t = trail(p, k);
      // Ключ уже проведён — «уже оплачено», без списания.
      if (t && db.ledger.has(t[0](key))) continue;
      if ((db.bal.get(balKey(w, p)) ?? 0) < p.amount) {
        for (const [q, kk] of done) back(w, q, kk, k);
        throw new Error("Не хватает ресурсов");
      }
      add(w, p, -p.amount);
      if (t) db.ledger.add(t[0](key));
      done.push([p, key]);
    }
  },
  refundResources: async (w: string, prices: TourEntryPrice[], ref: string, k: Kinds) => {
    for (const [i, p] of prices.entries()) back(w, p, `${ref}:${i}:${p.resource}`, k);
  },
};

const one = (r: unknown) => [{ _row: r }];
/** К разбору: зависла дольше 2 минут или погашена (ключ `…:void`). */
const stale = (r: Row) => r.at < db.now - 2 * MIN || r.ref.endsWith(":void");

function claim(sql: string): unknown[] {
  const id = /WHERE t\.id = '([^']+)'/.exec(sql)?.[1] ?? "";
  const acc = /SELECT t\.id, '([^']+)', now\(\)/.exec(sql)?.[1] ?? "";
  const [, ref = "", wallet = ""] = /t\.entry_price, '([^']+)', '([^']+)' FROM t/.exec(sql) ?? [];
  const had = db.entries.get(`${id}|${acc}`);
  if (db.race) return one({ open: db.open, mine: false, stale: false, joined_ms: null });
  const seen = (r: Row) => ({
    open: db.open,
    mine: false,
    paid: r.paid,
    stale: stale(r),
    price: r.price,
    pay_ref: r.ref,
    pay_wallet: r.wallet,
    joined_ms: r.at,
  });
  if (had) return one(seen(had));
  if (!db.open) return one({ open: false, mine: false, stale: false, joined_ms: null });
  const price = db.price.get(id) ?? [{ resource: "gold", amount: 5 }];
  const row: Row = { paid: price.length === 0, at: db.now, price, ref, wallet };
  db.entries.set(`${id}|${acc}`, row);
  if (db.retryClaim) return one(seen(row));
  return one({ ...seen(row), mine: true });
}

/** Подделка mcpExec: разбирает операторы tour-entry-sql по их узнаваемым кускам. */
export async function fakeExec(sql: string): Promise<unknown[]> {
  if (sql.includes("INSERT INTO yuplink.tournament_entry")) return claim(sql);
  if (sql.includes("ORDER BY e.joined_at")) {
    const only = /AND e\.tournament_id = '([^']+)'/.exec(sql)?.[1];
    return [...db.entries]
      .filter(([k, r]) => !r.paid && (only ? k.startsWith(`${only}|`) : stale(r)))
      .map(([k, r]) => {
        const [id, account] = k.split("|");
        return { id, account, price: r.price, pay_ref: r.ref, pay_wallet: r.wallet, open: db.open };
      });
  }
  if (sql.includes("json_build_array")) {
    const re =
      /EXISTS \(SELECT 1 FROM yuplink\.\w+ WHERE (?:kind = '([^']+)' AND ref|op) = '([^']+)'\)|NULL::boolean/g;
    const flags = [...sql.matchAll(re)].map((m) =>
      m[2] ? db.ledger.has(`${m[1] ?? "op"}|${m[2]}`) : null,
    );
    const half = flags.length / 2;
    return one({ s: flags.slice(0, half), b: flags.slice(half) });
  }
  const m = /e\.tournament_id = '([^']+)' AND e\.account_id = '([^']+)'/.exec(sql);
  const key = `${m?.[1]}|${m?.[2]}`;
  const row = db.entries.get(key);
  const ref = /e\.pay_ref = '([^']+)'/.exec(sql)?.[1];
  if (sql.includes("SET paid = true")) {
    if (db.cascade) db.entries.delete(key);
    if (db.takenBy) db.entries.set(key, db.takenBy);
    if (db.failPaid > 0) {
      db.failPaid--;
      throw new Error("bridge: connection reset");
    }
    const cur = db.entries.get(key);
    if (!cur || cur !== row || row.paid || row.ref !== ref) return one({ joined_ms: null });
    Object.assign(row, { paid: true, at: db.now });
    if (db.losePaid) throw new Error("bridge: answer lost");
    return one({ joined_ms: db.now });
  }
  if (sql.includes("SET paid = false")) {
    // Гашение попытки: CAS по ключу; force — и оплаченную, вместе с очками.
    const [, voided = "", from = ""] =
      /pay_ref = '([^']+)'[\s\S]*?e\.pay_ref = '([^']+)'/.exec(sql) ?? [];
    const force = !sql.includes("AND NOT e.paid");
    const hit = !!row && row.ref === from && (force || !row.paid);
    if (hit) Object.assign(row, { paid: false, ref: voided });
    if (hit && force) db.points.delete(key);
    return one({ n: hit ? 1 : 0 });
  }
  if (sql.includes("DELETE FROM yuplink.tournament_entry")) {
    if (db.failDrop) throw new Error("bridge: connection reset");
    const hit = !!row && !row.paid && row.ref === ref;
    if (hit) db.entries.delete(key);
    return one({ n: hit ? 1 : 0 });
  }
  return row ? one({ paid: row.paid, pay_ref: row.ref, joined_ms: row.at }) : [];
}
