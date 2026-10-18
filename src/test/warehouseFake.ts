// Фейк базы для «положить на склад» и «забрать со склада» (warehouse-move.test).
//
// Строки рюкзака и полок — на numeric-BigInt (numeric.ts): разница double и
// numeric живёт в 16-м знаке, и тест на double её бы не увидел. Фейк читает из
// SQL те же условия, что выполнит Postgres, а присваивания SET и ушедшие метки
// RETURNING считает мини-вычислителем (sqlExpr.ts) — ровно ту строку, что уйдёт
// в базу. Знает только операторы переноса и его откатов; чужой — ошибка теста.
// Подменённые функции (upsertSlot, depositToBackpack, loadSlots) — в warehouseFakeOps.ts.
import { dec, decNum } from "@/test/numeric";
import { evalSql, returningOf, setsOf, type SqlEnv } from "@/test/sqlExpr";

/** Четыре метки происхождения строки (stack-origin). */
export type Marks = { mob: bigint; mine: bigint; field: bigint; loot: bigint };
export type Item = Marks & {
  count: bigint;
  kind: string;
  refId: string | null;
  name: string;
  image: null;
  /** Износ текущей штуки инструмента, % (tool-wear). Нет — все целые. */
  wear?: number;
};

/** CHECK raid_hero_backpack_worn_stays: стопка с износом не ниже одной штуки. */
const ONE = dec("1");
export type Shelf = Item & { scope: "own" | "shared"; owner: string | null; key: string };

/** Вид товара во всех проверках. */
export const K = "custom:soda";
export const LABELS = ["mob", "mine", "field", "loot"] as const;

/** Рюкзаки героев: у каждого свой (перенос между своими — через личную полку). */
const bags = new Map<string, Map<string, Item>>();
const bagOf = (hero: string): Map<string, Item> => {
  const got = bags.get(hero) ?? new Map<string, Item>();
  bags.set(hero, got);
  return got;
};
/** Все строки всех рюкзаков — для сверки «ни одна метка не родилась и не пропала». */
export const allBagRows = (): Item[] => [...bags.values()].flatMap((b) => [...b.values()]);

export const db = {
  /** Выбранный герой: его рюкзак — db.bp, его же отдаёт resolveBackpack. */
  hero: "h1",
  get bp(): Map<string, Item> {
    return bagOf(db.hero);
  },
  shelves: [] as Shelf[],
  /** Ячеек в рюкзаке героя. */
  capacity: 5,
  /** false — «место на полке ушло под локом» (upsertSlot ответил false). */
  upsertOk: true,
  /** Ответы upsertSlot по очереди: true/false или "throw"; кончились — upsertOk. */
  upsertPlan: [] as Array<boolean | "throw">,
  /** true — выдача в рюкзак сорвалась после списания с полки. */
  depositFails: false,
  /** Что успело случиться с базой между снятием с полки и сбоем выдачи. */
  beforeDepositFail: null as null | (() => void),
};

export function resetDb(): void {
  bags.clear();
  db.hero = "h1";
  db.shelves = [];
  db.capacity = 5;
  db.upsertOk = true;
  db.upsertPlan = [];
  db.depositFails = false;
  db.beforeDepositFail = null;
}

/** Строка рюкзака: count и, если нужно, метки. */
export const item = (count: string, marks: Partial<Record<keyof Marks, string>> = {}): Item => ({
  count: dec(count),
  mob: dec(marks.mob ?? "0"),
  mine: dec(marks.mine ?? "0"),
  field: dec(marks.field ?? "0"),
  loot: dec(marks.loot ?? "0"),
  kind: "custom",
  refId: "soda",
  name: "Газировка",
  image: null,
});

export const shelf = (
  scope: Shelf["scope"],
  owner: string | null,
  count: string,
  marks: Partial<Record<keyof Marks, string>> = {},
): Shelf => ({ ...item(count, marks), scope, owner, key: K });

const NOISE = dec("0.000000001");
const envOf = (r: Item, p = ""): SqlEnv => ({
  [`${p}count`]: r.count,
  [`${p}mob_count`]: r.mob,
  [`${p}mine_count`]: r.mine,
  [`${p}field_count`]: r.field,
  [`${p}loot_count`]: r.loot,
});
const oldEnv = (r: Item): SqlEnv => ({
  "o.old_count": r.count,
  "o.old_mob": r.mob,
  "o.old_mine": r.mine,
  "o.old_field": r.field,
  "o.old_loot": r.loot,
});
const COL = {
  count: "count",
  mob: "mob_count",
  mine: "mine_count",
  field: "field_count",
  loot: "loot_count",
};

/** Выполнить SET над строкой: все выражения видят прежние значения, как в Postgres. */
function applySets(r: Item, sql: string, env: SqlEnv): void {
  const sets = setsOf(sql);
  const next = { ...r };
  for (const [k, col] of Object.entries(COL) as Array<[keyof typeof COL, string]>) {
    const expr = sets.get(col);
    if (expr) next[k] = evalSql(expr, env);
  }
  Object.assign(r, next);
}

/** Ушедшие метки из RETURNING: было (o.old_*) против стало (alias.*). */
function takenOf(sql: string, was: Item, now: Item, alias: string) {
  const env = { ...oldEnv(was), ...envOf(now, `${alias}.`) };
  const ret = returningOf(sql);
  return Object.fromEntries(
    ["mobTaken", "mineTaken", "fieldTaken", "lootTaken"].map((k) => [
      k,
      decNum(evalSql(ret.get(k)!, env)),
    ]),
  );
}

/** mcpExec: строки уходят так, как их развернул бы wrapJson — числа double. */
export function fakeDb(raw: string): unknown[] {
  const s = raw.replace(/\s+/g, " ").trim();
  const key = /stack_key ?= ?'([^']+)'/.exec(s)?.[1] ?? "";
  const shelves = () => {
    const scope = /scope = '(own|shared)'/.exec(s)?.[1];
    const owner = /owner_account = '([^']+)'/.exec(s)?.[1];
    return db.shelves.filter(
      (x) => x.key === key && x.scope === scope && (!owner || x.owner === owner),
    );
  };
  const out = (r: Item) => ({ kind: r.kind, refId: r.refId, name: r.name, image: r.image });

  if (s.startsWith("SELECT count FROM yuplink.raid_hero_backpack")) {
    const r = db.bp.get(key);
    return r && r.count > 0n ? [{ count: decNum(r.count) }] : [];
  }
  // movableStackCount: изношенная штука в счёт не идёт.
  if (s.startsWith("SELECT GREATEST(0, count - CASE WHEN wear > 0 THEN 1 ELSE 0 END)")) {
    const r = db.bp.get(key);
    if (!r || r.count <= 0n) return [];
    const worn = (r.wear ?? 0) > 0;
    const left = r.count - (worn ? ONE : 0n);
    return [{ count: decNum(left > 0n ? left : 0n), worn }];
  }
  if (s.startsWith('SELECT b.stack_key AS "stackKey"')) {
    return [...db.bp].map(([stackKey, r]) => ({ stackKey, count: decNum(r.count), potion: false }));
  }
  if (s.startsWith("UPDATE yuplink.raid_hero_backpack b")) {
    const n = dec(/ROUND\(b\.count - ([^,]+), 9\)/.exec(s)![1]);
    const r = db.bp.get(key);
    if (!r || r.count - n <= -NOISE) return [];
    // Перенос на склад (withWear): уходит вся стопка — износ уходит с ней.
    if (s.includes('"wearTaken"')) {
      const was = { ...r };
      applySets(r, s, envOf(was, "b."));
      const wearTaken = r.count < ONE ? (was.wear ?? 0) : 0;
      if (wearTaken > 0) r.wear = 0;
      return [{ ...out(r), count: decNum(r.count), ...takenOf(s, was, r, "b"), wearTaken }];
    }
    // База отказывает ограничением: изношенная штука из рюкзака не уходит.
    if ((r.wear ?? 0) > 0 && r.count - n < ONE) {
      throw new Error(
        'new row for relation "raid_hero_backpack" violates check constraint "raid_hero_backpack_worn_stays"',
      );
    }
    const was = { ...r };
    applySets(r, s, envOf(was, "b."));
    return [{ ...out(r), count: decNum(r.count), ...takenOf(s, was, r, "b") }];
  }
  if (s.startsWith("DELETE FROM yuplink.raid_hero_backpack")) {
    if ((db.bp.get(key)?.count ?? 1n) <= 0n) db.bp.delete(key);
    return [];
  }
  if (s.startsWith("UPDATE yuplink.raid_hero_backpack SET count = count +")) {
    const r = db.bp.get(key);
    if (!r) return [];
    applySets(r, s, envOf({ ...r }));
    return [{ id: "bp_1" }];
  }
  if (s.startsWith("INSERT INTO yuplink.raid_hero_backpack")) {
    const k = /VALUES \((?:'[^']*', ){4}(?:'[^']*'|NULL), '([^']+)'/.exec(s)![1];
    // count и четыре метки — последние пять чисел строки VALUES.
    const NUM = "([-\\d.e+]+)";
    const v = new RegExp(`, ${NUM}, ${NUM}, ${NUM}, ${NUM}, ${NUM}\\) ON CONFLICT`).exec(s)!;
    const add = { ...item(v[1], { mob: v[2], mine: v[3], field: v[4], loot: v[5] }) };
    const r = db.bp.get(k);
    if (!r) db.bp.set(k, add);
    else
      applySets(r, s, {
        ...envOf({ ...r }, "yuplink.raid_hero_backpack."),
        ...envOf(add, "EXCLUDED."),
      });
    return [];
  }
  if (s.startsWith("SELECT count FROM yuplink.raid_warehouse_slot")) {
    const x = shelves().find((r) => r.count > 0n);
    return x ? [{ count: decNum(x.count) }] : [];
  }
  if (s.startsWith("UPDATE yuplink.raid_warehouse_slot w SET count = GREATEST")) {
    const f = dec(/ROUND\(w\.count - ([^,]+), 9\)/.exec(s)![1]);
    const x = shelves()[0];
    if (!x || x.count - f <= -NOISE) return [];
    const was = { ...x };
    applySets(x, s, envOf(was, "w."));
    const wearTaken = x.count < ONE ? (was.wear ?? 0) : 0;
    if (wearTaken > 0) x.wear = 0;
    return [{ ...out(x), ...takenOf(s, was, x, "w"), wearTaken }];
  }
  // tool-wear-move.addWearSql: проценты складываются, 100 — одна штука доломана.
  const addWear =
    /^UPDATE yuplink\.(raid_hero_backpack|raid_warehouse_slot) SET wear = CASE WHEN \(wear \+ ([\d.]+)\)/.exec(
      s,
    );
  if (addWear) {
    const rows = addWear[1] === "raid_hero_backpack" ? [db.bp.get(key)] : shelves();
    for (const r of rows) {
      if (!r || r.count < ONE) continue;
      const raw = (r.wear ?? 0) + Number(addWear[2]);
      if (raw >= 100) r.count -= ONE;
      r.wear = raw >= 100 ? raw - 100 : raw;
      for (const k of LABELS) if (r[k] > r.count) r[k] = r.count;
    }
    return [];
  }
  if (s.startsWith("UPDATE yuplink.raid_warehouse_slot SET count = count +")) {
    for (const x of shelves()) applySets(x, s, envOf({ ...x }));
    return [];
  }
  throw new Error(`неожиданный SQL: ${s}`);
}
