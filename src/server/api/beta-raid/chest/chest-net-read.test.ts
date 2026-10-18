// Окно сундука: сколько штук стопки можно положить. Правило владельца
// (29.09.2026): всё собранное — мобы, шахты, грядки, прочее (объекты карты,
// декор, награды, грабёж, возврат из сундука), кроме купленного; и без
// изношенной штуки инструмента (стык с износом, 28.09): сеть (storeSql)
// стопку с износом целиком не берёт (worn_all). Базы нет: формулу считает
// мини-вычислитель, как у фейков.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dec, decNum } from "@/test/numeric";
import { evalSql } from "@/test/sqlExpr";

const s = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[] }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  num: (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0),
}));

import { COLLECTED_MOVABLE_SQL, loadBag } from "@/server/api/beta-raid/chest/chest-net-read";

const WORN = "CASE WHEN b.wear > 0 THEN 1 ELSE 0 END";

type R = {
  count: string;
  mob?: string;
  mine?: string;
  field?: string;
  loot?: string;
  wear: number;
};

/** Сколько окно предложит положить: формула над строкой рюкзака. */
function offered(r: R): number {
  expect(COLLECTED_MOVABLE_SQL).toContain(WORN);
  const expr = COLLECTED_MOVABLE_SQL.replace(WORN, r.wear > 0 ? "1" : "0");
  return decNum(
    evalSql(expr, {
      "b.count": dec(r.count),
      "b.mob_count": dec(r.mob ?? "0"),
      "b.mine_count": dec(r.mine ?? "0"),
      "b.field_count": dec(r.field ?? "0"),
      "b.loot_count": dec(r.loot ?? "0"),
    }),
  );
}

beforeEach(() => {
  s.sql = [];
  s.rows = [];
});

describe("окно сундука: что можно положить", () => {
  it("рюкзак читает «собрано и не изношено» одной формулой", async () => {
    s.rows = [
      {
        stackKey: "custom:cst_axe",
        kind: "custom",
        name: "Топор",
        image: null,
        count: "3",
        movable: "2",
      },
    ];
    const bag = await loadBag("hero_1");
    const sql = s.sql[0].replace(/\s+/g, " ");
    expect(sql).toContain(`${COLLECTED_MOVABLE_SQL} AS movable`);
    expect(sql).toContain("WHERE b.hero_id = 'hero_1' AND b.count > 0");
    expect(bag[0]).toMatchObject({ stackKey: "custom:cst_axe", count: 3, movable: 2 });
  });

  it("любая метка собранного годится: объект карты, грядка, шахта, моб", () => {
    expect(offered({ count: "5", loot: "5", wear: 0 })).toBe(5);
    expect(offered({ count: "5", field: "5", wear: 0 })).toBe(5);
    expect(offered({ count: "5", mine: "5", wear: 0 })).toBe(5);
    expect(offered({ count: "5", mob: "5", wear: 0 })).toBe(5);
  });

  it("купленное — ноль: стопка неактивна", () => {
    expect(offered({ count: "20", wear: 0 })).toBe(0);
  });

  it("смешанная стопка: ровно собранное, купленное остаётся", () => {
    // 20 бананов: 6 с сундуков-объектов, 2 с грядки, 12 куплено.
    expect(offered({ count: "20", loot: "6", field: "2", wear: 0 })).toBe(8);
  });

  it("меток больше, чем штук (старые пути) — не больше count", () => {
    expect(offered({ count: "3", mob: "2", loot: "9", wear: 0 })).toBe(3);
  });
});

describe("окно сундука: изношенный инструмент", () => {
  it("стопка с износом: целые собранные — да, изношенная — нет", () => {
    // Три топора с объектов карты, текущий надрублен: положить можно два.
    expect(offered({ count: "3", loot: "3", wear: 40 })).toBe(2);
    // Одна штука, и та изношена — класть нечего (стек в окне приглушён).
    expect(offered({ count: "1", mob: "1", wear: 40 })).toBe(0);
    // Собранного меньше, чем целых, — предел ставит собранное.
    expect(offered({ count: "3", mob: "1", wear: 40 })).toBe(1);
    // Дробный хвост: изношенная штука остаётся целой штукой.
    expect(offered({ count: "1.5", field: "1.5", wear: 40 })).toBe(0.5);
  });

  it("предложенное сеть примет: у стопки с износом остаётся целая штука", () => {
    // storeSql: worn_all = wear > 0 AND mv >= count; CHECK worn_stays — count ≥ 1.
    for (const r of [
      { count: "3", loot: "3", wear: 40 },
      { count: "2", mob: "2", wear: 1 },
      { count: "1.5", mine: "1.5", wear: 99 },
    ]) {
      const left = Number(r.count) - offered(r);
      expect(left).toBeGreaterThanOrEqual(1);
    }
  });
});
