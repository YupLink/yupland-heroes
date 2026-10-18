// Метки происхождения: формулы SQL против независимой модели «тратим по
// очереди». SQL считаем мини-вычислителем на numeric (src/test/sqlExpr.ts) —
// ровно ту строку, что уйдёт в базу, а не её пересказ.
import { describe, expect, it } from "vitest";
import { dec, decNum } from "@/test/numeric";
import { evalSql, type SqlEnv } from "@/test/sqlExpr";
import { seeded } from "@/test/seeded";
import { OLD_COLS, mobAfterGrowSql } from "@/server/api/beta-raid/backpack-mob";
import {
  ORIGINS,
  collectedSql,
  originCols,
  originGrowSql,
  originLit,
  originReadSql,
  originStoreSql,
  originTakeSql,
  originTakenSql,
  type OriginSql,
} from "@/server/api/beta-raid/stack-origin";

type Row = { count: bigint; mob: bigint; mine: bigint; field: bigint; loot: bigint };
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);
const sum = (r: Row) => r.mob + r.mine + r.field + r.loot;

/** Модель: метки не больше count — мобы первыми, потом шахты, грядки, прочее. */
function norm(r: Row): Row {
  let room = r.count;
  const out = { ...r };
  for (const k of ORIGINS) {
    out[k] = min(max(r[k], 0n), max(room, 0n));
    room -= out[k];
  }
  return out;
}

/** Модель траты n штук: безымянное → прочее собранное → грядки → шахты → мобы. */
function spend(r: Row, n: bigint): Row {
  const x = norm(r);
  let left = n - min(n, x.count - sum(x));
  for (const k of ["loot", "field", "mine", "mob"] as const) {
    const t = min(left, x[k]);
    x[k] -= t;
    left -= t;
  }
  return { ...x, count: r.count - n };
}

/** Модель вклада n собранных штук в сундук: безымянное остаётся, прочее уходит первым. */
function store(r: Row, n: bigint): Row {
  const x = norm(r);
  let left = n;
  for (const k of ["loot", "field", "mine", "mob"] as const) {
    const t = min(left, x[k]);
    x[k] -= t;
    left -= t;
  }
  return { ...x, count: r.count - n };
}

const env = (r: Row, p = ""): SqlEnv => ({
  [`${p}count`]: r.count,
  [`${p}mob_count`]: r.mob,
  [`${p}mine_count`]: r.mine,
  [`${p}field_count`]: r.field,
  [`${p}loot_count`]: r.loot,
});
const run = (o: OriginSql, e: SqlEnv, count: bigint): Row => ({
  count,
  mob: evalSql(o.mob, e),
  mine: evalSql(o.mine, e),
  field: evalSql(o.field, e),
  loot: evalSql(o.loot, e),
});
const label = (r: Row) => ({ mob: r.mob, mine: r.mine, field: r.field, loot: r.loot });

/** Случайная строка: иногда с «забытыми» метками сверх count (старые пути). */
function randomRow(rnd: () => number): Row {
  const n = () => dec((Math.floor(rnd() * 30000) / 1000).toFixed(3));
  const count = n();
  const part = () => (rnd() < 0.2 ? 0n : min(n(), rnd() < 0.8 ? count : count * 2n));
  return { count, mob: part(), mine: part(), field: part(), loot: part() };
}

describe("формула мобов не изменилась (сундук читает её как прежде)", () => {
  it("чтение, списание и прирост мобов — те же строки, что в backpack-mob", () => {
    expect(originReadSql(originCols()).mob).toBe("LEAST(mob_count, count)");
    expect(originTakeSql(originCols("b."), "b.count - 3").mob).toBe(
      "LEAST(b.mob_count, b.count - 3)",
    );
    const grow = originGrowSql(originCols("yuplink.raid_hero_backpack."), originCols("EXCLUDED."));
    expect(grow.mob).toBe(mobAfterGrowSql(OLD_COLS, "EXCLUDED.mob_count"));
  });

  it("«собрано» — последний префикс: все четыре метки, не больше count", () => {
    expect(collectedSql(originCols("b."))).toBe(
      "LEAST(b.mob_count + b.mine_count + b.field_count + b.loot_count, b.count)",
    );
  });
});

describe("SQL против модели на numeric", () => {
  const rnd = seeded(29_09_2026);
  const rows = Array.from({ length: 400 }, () => randomRow(rnd));

  it("чтение: не больше count, мобы первыми; старые строки (без loot) — как раньше", () => {
    for (const r of rows) {
      const got = run(originReadSql(originCols()), env(r), r.count);
      expect(label(got)).toEqual(label(norm(r)));
      expect(evalSql(collectedSql(originCols()), env(r))).toBe(sum(norm(r)));
    }
    const old = { count: dec("7"), mob: dec("9"), mine: 0n, field: 0n, loot: 0n };
    expect(label(run(originReadSql(originCols()), env(old), old.count))).toEqual({
      mob: dec("7"),
      mine: 0n,
      field: 0n,
      loot: 0n,
    });
  });

  it("списание: сначала безымянное, собранное последним; ушедшее = было − стало", () => {
    for (const r of rows) {
      const n = (r.count * BigInt(Math.floor(rnd() * 1001))) / 1000n;
      const left = `b.count - ${decNum(n)}`;
      const e = env(r, "b.");
      const want = spend(r, dec(decNum(n)));
      const got = run(originTakeSql(originCols("b."), left), e, want.count);
      expect(label(got)).toEqual(label(want));
      const taken = originTakenSql(
        {
          count: "o.count",
          mob: "o.mob_count",
          mine: "o.mine_count",
          field: "o.field_count",
          loot: "o.loot_count",
        },
        originCols("b."),
      );
      const both = { ...env(r, "o."), ...env(got, "b.") };
      const was = norm(r);
      for (const k of ORIGINS) expect(evalSql(taken[k], both)).toBe(was[k] - got[k]);
      // Меток ушло не больше, чем штук.
      const out = ORIGINS.reduce((s, k) => s + (was[k] - got[k]), 0n);
      expect(out <= r.count - want.count).toBe(true);
    }
  });

  it("вклад в сундук: уходит ровно n собранных, безымянное остаётся целиком", () => {
    for (const r of rows) {
      const got0 = sum(norm(r));
      const n = (got0 * BigInt(Math.floor(rnd() * 1001))) / 1000n;
      const lit = decNum(n);
      const want = store(r, dec(lit));
      const e = { ...env(r, "b."), "chk.mv": dec(lit) };
      const after = run(originStoreSql(originCols("b."), "chk.mv"), e, want.count);
      expect(label(after)).toEqual(label(want));
      // Безымянное до и после — одно и то же: купленное в сундук не уехало.
      expect(r.count - got0).toBe(after.count - sum(after));
      expect(sum(after)).toBe(got0 - dec(lit));
    }
  });

  it("прирост: прежние (не больше count) плюс добавленные; потолок — новый count", () => {
    for (const r of rows) {
      const q = dec((Math.floor(rnd() * 10000) / 1000).toFixed(3));
      const add = { mob: q / 3n, mine: q / 4n, field: q / 5n, loot: q / 7n };
      const lit = {
        mob: decNum(add.mob),
        mine: decNum(add.mine),
        field: decNum(add.field),
        loot: decNum(add.loot),
      };
      const got = run(originGrowSql(originCols(), originLit(lit)), env(r), r.count + q);
      const was = norm(r);
      for (const k of ORIGINS) expect(got[k]).toBe(was[k] + dec(lit[k]));
      // С потолком лишнее срезается в порядке «беречь».
      const big = { mob: 99, mine: 99, field: 99, loot: 99 };
      const capped = run(
        originGrowSql(originCols(), originLit(big), `count + 1`),
        env(r),
        r.count + dec("1"),
      );
      expect(label(capped)).toEqual(
        label(
          norm({
            count: r.count + dec("1"),
            mob: was.mob + dec("99"),
            mine: was.mine + dec("99"),
            field: was.field + dec("99"),
            loot: was.loot + dec("99"),
          }),
        ),
      );
    }
  });

  it("инвариант: метки не отрицательны и в сумме не больше count — после любого шага", () => {
    for (const r of rows) {
      const e = env(r);
      const n = r.count / 2n;
      const steps = [
        run(originReadSql(originCols()), e, r.count),
        run(originTakeSql(originCols(), `count - ${decNum(n)}`), e, r.count - n),
        run(
          originGrowSql(
            originCols(),
            originLit({ mob: 1, mine: 2, field: 3, loot: 4 }),
            "count + 10",
          ),
          e,
          r.count + dec("10"),
        ),
      ];
      for (const s of steps) {
        for (const k of ORIGINS) expect(s[k] >= 0n).toBe(true);
        expect(sum(s) <= s.count).toBe(true);
      }
    }
  });
});
