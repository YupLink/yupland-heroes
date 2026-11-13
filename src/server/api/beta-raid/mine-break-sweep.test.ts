// Обход поломок шахт v2 (§8.59): ломает база (raid_mine_break_due), клетки
// уходят игрокам событием шахты — по картам; много поломок — несколько вызовов;
// начисленное хозяевам — в ачивку «Хозяин шахт».
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  events: [] as Array<{ mapId: string | null; type: string; mine?: boolean; cells?: string[] }>,
  due: [] as Array<Array<{ map_id: string; q: number; r: number }>>,
  broke: [] as Array<Array<{ owner: string | null; amount: number | string | null }>>,
  bumps: [] as string[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("account_achievement")) {
      s.bumps.push(sql.replace(/\s+/g, " "));
      return [];
    }
    s.sql.push(sql);
    if (sql.includes("raid_mine_break_due")) return s.broke.shift() ?? [];
    return s.due.shift() ?? [];
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: (typeof s.events)[number]) => void s.events.push(e),
}));

const { sweepMineBreaks, cellsByMap, creditsByOwner } = await import("./mine-break-sweep");

/** n сломанных без начисления. */
const empty = (n: number) => Array.from({ length: n }, () => ({ owner: "x", amount: 0 }));

beforeEach(() => {
  s.sql = [];
  s.events = [];
  s.due = [];
  s.broke = [];
  s.bumps = [];
});

describe("обход поломок", () => {
  it("ломать нечего — обход базы не зовём", async () => {
    expect(await sweepMineBreaks()).toBe(0);
    expect(s.sql).toHaveLength(1);
    expect(s.events).toEqual([]);
  });

  it("сломанные — событие шахты каждой карте", async () => {
    s.due = [
      [
        { map_id: "m1", q: 1, r: 2 },
        { map_id: "m2", q: -3, r: 0 },
        { map_id: "m1", q: 5, r: 5 },
      ],
    ];
    s.broke = [
      [
        { owner: "acc_a", amount: "420.0000" },
        { owner: "acc_b", amount: 0 },
        { owner: "acc_a", amount: 18 },
      ],
    ];
    expect(await sweepMineBreaks()).toBe(3);
    expect(s.sql[1]).toContain("FROM yuplink.raid_mine_break_due(100) b;");
    expect(s.events).toEqual([
      { mapId: "m1", type: "built", mine: true, owner: true, cells: ["1,2", "5,5"] },
      { mapId: "m2", type: "built", mine: true, owner: true, cells: ["-3,0"] },
    ]);
    // Ачивка — по хозяину суммой за проход; без начисления — мимо.
    expect(s.bumps).toHaveLength(1);
    expect(s.bumps[0]).toContain("SELECT 'acc_a', 'minelord', (438)::bigint");
  });

  it("дробные хвосты (камень «База» и т. п.) — в ачивку суммой за проход", async () => {
    s.due = [
      [
        { map_id: "m", q: 0, r: 0 },
        { map_id: "m", q: 1, r: 0 },
      ],
    ];
    s.broke = [
      [
        { owner: "acc_c", amount: "0.7500" },
        { owner: "acc_c", amount: "68.7500" },
      ],
    ];
    expect(await sweepMineBreaks()).toBe(2);
    expect(s.bumps).toHaveLength(1);
    expect(s.bumps[0]).toContain("SELECT 'acc_c', 'minelord', (69)::bigint");
  });

  it("полная пачка — ещё вызов в том же проходе", async () => {
    s.due = [[{ map_id: "m", q: 0, r: 0 }], [{ map_id: "m", q: 1, r: 1 }]];
    s.broke = [empty(100), empty(7)];
    expect(await sweepMineBreaks()).toBe(107);
    expect(s.sql.filter((x) => x.includes("raid_mine_break_due"))).toHaveLength(2);
  });

  it("клетки по картам", () => {
    expect([...cellsByMap([{ map_id: "a", q: "1", r: "-2" }])]).toEqual([["a", ["1,-2"]]]);
  });

  it("начисленное по хозяевам: суммы, нули и ничьи — мимо", () => {
    const m = creditsByOwner([
      { owner: "a", amount: "10.5" },
      { owner: null, amount: 5 },
      { owner: "b", amount: null },
      { owner: "a", amount: 2 },
    ]);
    expect([...m]).toEqual([["a", 12.5]]);
  });
});
