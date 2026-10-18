// Модель «Выбросить в мешочек» (loot-bag/bag-discard-sql.ts) для тестов:
// стопки рюкзака, мешочки клетки, ключи нажатий. Остаток ROUND(count − n, 9),
// новые метки стопки и метки порции фейк берёт ИЗ САМОЙ строки SQL и считает
// мини-вычислителем (sqlExpr.ts) на numeric; ветки CTE (part, worn, put) и
// выбор мешочка повторены так же, как стоят в операторе (их текст держит
// bag-discard.test.ts). Оператор идёт под локами рюкзака и мешочка — фейк
// выполняет его целиком, как одну транзакцию.
import { createHash } from "node:crypto";
import { dec, decStr } from "@/test/numeric";
import { evalSql, splitTop, type SqlEnv } from "@/test/sqlExpr";

const MARKS = ["mob", "mine", "field", "loot"] as const;
type Marks = Record<(typeof MARKS)[number], bigint>;
export type Stack = Marks & { count: bigint; wear: bigint; name: string };
export type Portion = Marks & { k: string; n: bigint };
export type Bag = { id: string; cell: string; buried: boolean; items: Portion[] };

export const db = {
  pos: { q: 3, r: 4 } as { q: number; r: number } | null,
  rows: new Map<string, Stack>(),
  bags: [] as Bag[],
  ops: new Map<string, { qty: bigint; bag: string; key: string }>(),
  writes: 0,
  beforeWrite: null as null | (() => void),
  /** Ответ оператора теряется после коммита (мост оборвался). */
  lose: false,
};

export function resetDiscard(): void {
  Object.assign(db, { pos: { q: 3, r: 4 }, bags: [], writes: 0, beforeWrite: null, lose: false });
  db.rows = new Map();
  db.ops = new Map();
}

/** Стопка: count, метки и износ текущей штуки. */
export const stack = (count: string, m: Partial<Record<keyof Marks, string>> = {}, wear = "0"): Stack => ({
  count: dec(count),
  mob: dec(m.mob ?? "0"),
  mine: dec(m.mine ?? "0"),
  field: dec(m.field ?? "0"),
  loot: dec(m.loot ?? "0"),
  wear: dec(wear),
  name: "Товар",
});

const flat = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  if (i < 0) throw new Error(`нет «${a}» в SQL`);
  return s.slice(i + a.length, s.indexOf(b, i + a.length));
};
const aliased = (list: string) =>
  new Map(
    splitTop(list).map((p): [string, string] => {
      const m = /^(.*) AS (\w+)$/.exec(p);
      return m ? [m[2], m[1].trim()] : [p, p];
    }),
  );
const envOf = (p: string, r: Stack): SqlEnv => ({
  [`${p}.count`]: r.count,
  ...Object.fromEntries(MARKS.map((k) => [`${p}.${k}_count`, r[k]])),
});
const alive = (b: Bag) => !b.buried && b.items.some((i) => i.n > 0n);
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** Кандидат клетки: самый свежий живой незакопанный мешочек. */
function candidate(sql: string): unknown[] {
  const m = /b\.q = (-?\d+) AND b\.r = (-?\d+)/.exec(sql)!;
  const bag = [...db.bags].reverse().find((b) => b.cell === `${m[1]},${m[2]}` && alive(b));
  return bag ? [{ id: bag.id }] : [];
}

function write(sql: string): unknown[] {
  db.beforeWrite?.();
  db.beforeWrite = null;
  const op = /WHERE o\.op = '([^']+)'/.exec(sql)![1];
  const key = /h\.stack_key = '([^']+)' AND h\.count > 0/.exec(sql)![1];
  const nExpr = /ROUND\(h\.count - (.+?), 9\) AS rest/.exec(sql)![1];
  const cand = /ORDER BY \(b\.id = (?:'([^']+)'|NULL)\)/.exec(sql)![1] ?? null;
  const cell = /b\.q = (-?\d+) AND b\.r = (-?\d+)/.exec(sql)!;
  const newKey = /SELECT \('lb_' \|\| md5\('([^']+)'\)\), 'rmap/.exec(sql)![1];
  const prior = db.ops.get(op);
  const r = db.rows.get(key);
  const out = { was: !!prior, prior_qty: prior ? decStr(prior.qty) : null, prior_bag: prior?.bag ?? null };
  if (prior || !r) {
    return [{ _row: { ...out, here: false, worn: null, put: null, gone: null, rest: r ? decStr(r.count) : null } }];
  }
  const rest = evalSql(`ROUND(h.count - ${nExpr}, 9)`, envOf("h", r));
  const part = rest > 0n;
  const worn = part && r.wear > 0n && rest < dec("1");
  if (worn) return [{ _row: { ...out, here: true, worn: true, put: null, gone: null, rest: decStr(r.count) } }];
  // Целиком — целые штуки: изношенная сгорает (GREATEST(0, count − 1)).
  const whole = r.count - (r.wear > 0n ? dec("1") : 0n);
  const put = part ? r.count - rest : whole > 0n ? whole : 0n;
  const c = { ...envOf("c", r), "c.rest": rest, "c.put": put };
  const marks = {} as Marks;
  if (part) {
    const sets = new Map(
      splitTop(between(sql, "UPDATE yuplink.raid_hero_backpack h SET ", " FROM calc c")).map(
        (p): [string, string] => [p.slice(0, p.indexOf("=")).trim(), p.slice(p.indexOf("=") + 1).trim()],
      ),
    );
    const next = { ...r, count: evalSql(sets.get("count")!, { ...c, ...envOf("h", r) }) };
    for (const k of MARKS) next[k] = evalSql(sets.get(`${k}_count`)!, { ...c, ...envOf("h", r) });
    const ret = aliased(between(sql, "AND c.part AND NOT c.worn RETURNING ", " ), del AS"));
    for (const k of MARKS) marks[k] = evalSql(ret.get(k)!, { ...c, ...envOf("h", next) });
    db.rows.set(key, next);
  } else {
    const ret = aliased(between(sql, "AND NOT c.part RETURNING ", " ), moved AS"));
    for (const k of MARKS) marks[k] = evalSql(ret.get(k)!, c);
    db.rows.delete(key);
  }
  // Кандидат, если жив, иначе самый свежий живой незакопанный на клетке.
  const alives = db.bags.filter((b) => b.cell === `${cell[1]},${cell[2]}` && alive(b));
  let bag = alives.find((b) => b.id === cand) ?? alives[alives.length - 1];
  let fresh = false;
  if (put > 0n) {
    if (!bag) {
      bag = { id: `lb_${md5(newKey)}`, cell: `${cell[1]},${cell[2]}`, buried: false, items: [] };
      db.bags.push(bag);
      fresh = true;
    }
    bag.items.push({ k: key, n: put, ...marks });
  }
  const bagId = put > 0n && bag ? bag.id : null;
  db.ops.set(op, { qty: put, bag: bagId ?? "", key });
  db.writes++;
  if (db.lose) throw new Error("fetch failed");
  const gone = decStr(part ? r.count - rest : r.count);
  const row = { ...out, here: true, worn: false, put: decStr(put), gone, bag_id: bagId, fresh_bag: fresh };
  return [{ _row: { ...row, rest: decStr(part ? rest : 0n), kind: "custom", ref_id: null, name: r.name } }];
}

/** Ключ прошлого нажатия (priorOf). */
function priorRow(sql: string): unknown[] {
  const op = /WHERE o\.op = '([^']+)'/.exec(sql)![1];
  const p = db.ops.get(op);
  if (!p) return [];
  const left = db.rows.get(p.key)?.count;
  return [{ qty: decStr(p.qty), bag_id: p.bag, rest: left == null ? null : decStr(left) }];
}

export const mcp = {
  mcpExec: async (raw: string) => {
    const sql = flat(raw);
    if (sql.includes("ORDER BY b.created_at DESC LIMIT 1")) return candidate(sql);
    if (sql.includes("WITH prior AS")) return write(sql);
    if (sql.includes("FROM yuplink.raid_loot_bag_op o WHERE o.op =")) return priorRow(sql);
    throw new Error(`неожиданный SQL: ${sql.slice(0, 80)}`);
  },
};

/** Сколько штук вида лежит в мешочках клетки. */
export const inBags = (key: string, cell = "3,4") =>
  db.bags
    .filter((b) => b.cell === cell)
    .flatMap((b) => b.items)
    .filter((i) => i.k === key)
    .reduce((n, i) => n + i.n, 0n);
