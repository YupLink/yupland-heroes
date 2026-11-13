// Модель вклада в сеть сундука (storeSql, chest-net-sql.ts) для тестов: рюкзак
// героя, сеть хозяина и ключи операций. Выражения «сколько собрано» и «сколько
// снимаем» и присваивания меток фейк берёт ИЗ САМОЙ строки SQL и считает
// мини-вычислителем (sqlExpr.ts) на numeric; условия CTE (here, chk, upd, del)
// повторены здесь так же, как они стоят в операторе (их текст держит
// chest-sql.test.ts). Операторы одной строки идут под локами сети и рюкзака —
// фейк выполняет их по одному, как их выстроит Postgres. Сундук клетки (via:
// стоит, не закопан, чей; живая охрана) — cs.chest и cs.guard.
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { dec, decNum } from "@/test/numeric";
import { evalSql, setsOf, type SqlEnv } from "@/test/sqlExpr";

export type BagRow = {
  count: bigint;
  mob: bigint;
  mine: bigint;
  field: bigint;
  loot: bigint;
  wear: bigint;
};

export const cs = {
  bag: new Map<string, BagRow>(),
  net: new Map<string, bigint>(),
  ops: new Set<string>(),
  /** Мост повторил запрос вслепую: первый ответ потерян после коммита. */
  retry: false,
  /** Сундук на клетке вклада: чей и закопан ли; null — забрали. */
  chest: { owner: "acc_o", buried: false } as { owner: string; buried: boolean } | null,
  /** На клетке живая охрана. */
  guard: false,
  /** Тексты операторов вклада: чья сеть, чьи локи. */
  sql: [] as string[],
};

export function resetStore(): void {
  cs.bag.clear();
  cs.net.clear();
  cs.ops.clear();
  cs.retry = false;
  cs.chest = { owner: "acc_o", buried: false };
  cs.guard = false;
  cs.sql = [];
}

/**
 * here: сундук, через который кладут, на клетке стоит, не закопан и того
 * хозяина, в чью сеть кладут; у чужого ещё и живой охраны нет.
 */
function hereOf(sql: string): boolean {
  const cte = /here AS \(SELECT 1 WHERE true(.*?)\), src AS/.exec(sql)?.[1] ?? "";
  if (cte.includes("raid_magic_chest mc")) {
    const owner = /mc\.owner_account = '([^']+)' AND mc\.buried_at IS NULL/.exec(cte)?.[1];
    if (!cs.chest || cs.chest.buried || cs.chest.owner !== owner) return false;
  }
  return !(cte.includes("raid_mine_guard g") && cs.guard);
}

/** Стопка рюкзака: count, метки и износ текущей штуки. */
export const bagRow = (
  count: string,
  m: Partial<Record<"mob" | "mine" | "field" | "loot", string>> = {},
  wear = "0",
): BagRow => ({
  count: dec(count),
  mob: dec(m.mob ?? "0"),
  mine: dec(m.mine ?? "0"),
  field: dec(m.field ?? "0"),
  loot: dec(m.loot ?? "0"),
  wear: dec(wear),
});

const envOf = (r: BagRow): SqlEnv => ({
  "b.count": r.count,
  "b.mob_count": r.mob,
  "b.mine_count": r.mine,
  "b.field_count": r.field,
  "b.loot_count": r.loot,
  "b.wear": r.wear,
});
const cells = (c: bigint): number => Math.ceil(decNum(c) / CELL_SIZE);
const COLS = ["count", "mob", "mine", "field", "loot"] as const;
const colOf = (k: (typeof COLS)[number]) => (k === "count" ? "count" : `${k}_count`);

/** Один прогон storeSql: как ответит Postgres (_row). */
export function runStore(raw: string): unknown[] {
  const sql = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
  cs.sql.push(sql);
  const op = /WHERE op = '([^']+)'/.exec(sql)![1];
  const key = /b\.stack_key = '([^']+)'/.exec(sql)![1];
  const src =
    /SELECT b\.kind, b\.ref_id, b\.item_id, b\.name, b\.image, (.+?) AS got, (.+?) AS mv, b\.count AS cnt/.exec(
      sql,
    )!;
  const was = cs.ops.has(op);
  const here = hereOf(sql);
  // Запись держит here, только если ключ операции берётся «FROM chk, prior, here».
  const gate = here || !/FROM chk, prior, here WHERE/.test(sql);
  const r = cs.bag.get(key);
  if (!r) {
    return [{ _row: { was, here, moved: false, mv: null, got: null, fits: null, worn: null } }];
  }
  const env = envOf(r);
  const got = evalSql(src[1], env);
  const mv = evalSql(src[2], env);
  const worn = r.wear > 0n && mv >= r.count;
  const used = [...cs.net.values()].filter((c) => c > 0n).reduce((n, c) => n + cells(c), 0);
  const same = cs.net.get(key) ?? 0n;
  const fits = cells(same + mv) - cells(same) <= Math.max(10, used) - used;
  let moved = false;
  if (!was && gate && mv > 0n && got >= mv && fits && !worn) {
    cs.ops.add(op);
    if (r.count > mv && got >= mv) {
      const sets = setsOf(sql.slice(sql.indexOf("upd AS ("), sql.indexOf("del AS (")));
      const e = { ...env, "chk.mv": mv };
      const next = { ...r };
      for (const k of COLS) next[k] = evalSql(sets.get(colOf(k))!, e);
      Object.assign(r, next);
      moved = true;
    } else if (r.count === mv && got >= mv && r.wear === 0n) {
      cs.bag.delete(key);
      moved = true;
    }
    if (moved) cs.net.set(key, same + mv);
  }
  return [
    {
      _row: {
        was,
        here,
        moved,
        mv: decNum(mv),
        got: decNum(got),
        fits,
        worn,
        kind: "custom",
        ref_id: key.split(":")[1],
        name: key,
      },
    },
  ];
}

/** mcpExec теста: повтор моста — тот же оператор дважды, ответ второго. */
export const mcp = {
  mcpExec: async (sql: string) => {
    const first = runStore(sql);
    return cs.retry ? runStore(sql) : first;
  },
};
