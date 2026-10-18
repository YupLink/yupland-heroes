// Заряды смены героя — у каждой таверны свои (владелец, 02.10.2026).
//
// Журнал смен общий, поэтому проверяем главное: и чтение, и заявка смотрят
// только на клетку своей таверны. Смена в одном трактире не закрывает другой.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sql: [] as string[],
  /** Свежие смены по клетке «q,r» — то, что вернула бы база. */
  log: new Map<string, string[]>(),
  nextId: 100,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    const cell = /AND q = (-?\d+) AND r = (-?\d+)/.exec(sql);
    const key = cell ? `${cell[1]},${cell[2]}` : "";
    if (sql.includes("INSERT INTO yuplink.hero_swap_log")) {
      const v = /,\s*(-?\d+), (-?\d+)\) RETURNING id/.exec(sql);
      const k = v ? `${v[1]},${v[2]}` : "?";
      state.log.set(k, [...(state.log.get(k) ?? []), new Date().toISOString()]);
      return [{ id: state.nextId++ }];
    }
    if (sql.includes("SELECT count(*)")) return [{ n: (state.log.get(key) ?? []).length }];
    if (sql.includes("SELECT at FROM")) return (state.log.get(key) ?? []).map((at) => ({ at }));
    return [];
  },
}));

import { claimSwap, tavernSwapState, NO_SWAPS_KEY } from "./tavern-limit";

const A = { mapId: "rmap_a", q: 3, r: -4 };
const B = { mapId: "rmap_a", q: 10, r: 7 };
const ONE_A_DAY = { charges: 1, refillMs: 24 * 3_600_000 };

beforeEach(() => {
  state.sql = [];
  state.log = new Map();
  state.nextId = 100;
});

describe("tavern-limit: заряды по каждой таверне", () => {
  it("заявка пишет клетку таверны в журнал", async () => {
    await claimSwap("'acc_1'", "w1", "hero_1", A, ONE_A_DAY);
    const insert = state.sql.find((s) => s.includes("INSERT INTO"));
    expect(insert).toContain("(wallet, hero_id, map_id, q, r)");
    expect(insert).toContain("'rmap_a',\n             3, -4)");
  });

  it("пересчёт и чтение фильтруют по клетке своей таверны", async () => {
    await claimSwap("'acc_1'", "w1", "hero_1", A, ONE_A_DAY);
    await tavernSwapState("'acc_1'", A, ONE_A_DAY);
    const reads = state.sql.filter(
      (s) => s.includes("FROM yuplink.hero_swap_log") && !s.includes("INSERT"),
    );
    expect(reads.length).toBe(2);
    for (const s of reads) expect(s).toContain("map_id = 'rmap_a' AND q = 3 AND r = -4");
  });

  it("смена в таверне A не закрывает таверну B", async () => {
    await claimSwap("'acc_1'", "w1", "hero_1", A, ONE_A_DAY);
    expect((await tavernSwapState("'acc_1'", A, ONE_A_DAY)).left).toBe(0);
    expect((await tavernSwapState("'acc_1'", B, ONE_A_DAY)).left).toBe(1);
    await expect(claimSwap("'acc_1'", "w1", "hero_2", B, ONE_A_DAY)).resolves.toEqual({ id: 101 });
  });

  it("второй заряд в той же таверне — отказ", async () => {
    await claimSwap("'acc_1'", "w1", "hero_1", A, ONE_A_DAY);
    await expect(claimSwap("'acc_1'", "w1", "hero_2", A, ONE_A_DAY)).rejects.toThrow(NO_SWAPS_KEY);
    expect(
      state.sql.some((s) => s.startsWith("DELETE FROM yuplink.hero_swap_log WHERE id = 101")),
    ).toBe(true);
  });
});
