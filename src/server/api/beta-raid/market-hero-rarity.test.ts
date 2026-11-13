// Редкость героя-товара на плитке витрины — по ярусу шаблона, одним запросом.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ sqls: [] as string[], rows: [] as unknown[], fail: false }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sqls.push(sql);
    if (st.fail) throw new Error("db down");
    return st.rows;
  },
}));

const { heroRarities } = await import("./market-hero-rarity");

beforeEach(() => {
  st.sqls = [];
  st.rows = [];
  st.fail = false;
});

describe("heroRarities", () => {
  it("ярус шаблона → редкость: 5 легендарный, 4 эпический, 3 редкий, ниже — обычный", async () => {
    st.rows = [
      { id: "hero_L", level: 5 },
      { id: "hero_E", level: 4 },
      { id: "hero_R", level: 3 },
      { id: "hero_C", level: 1 },
      { id: "hero_N", level: null },
    ];
    const m = await heroRarities(
      ["hero_L", "hero_E", "hero_R", "hero_C", "hero_N"].map((refId) => ({ kind: "hero", refId })),
    );
    expect(Object.fromEntries(m)).toEqual({
      hero_L: "legendary",
      hero_E: "epic",
      hero_R: "rare",
      hero_C: "common",
      hero_N: "common",
    });
  });

  it("спрашивает только героев-шаблоны, без дублей; «Любой … герой» и прочее — мимо", async () => {
    await heroRarities([
      { kind: "hero", refId: "hero_A" },
      { kind: "hero", refId: "hero_A" },
      { kind: "hero", refId: "hero_any_rare" },
      { kind: "art", refId: "art_X" },
      { kind: "hero", refId: null },
    ]);
    expect(st.sqls).toHaveLength(1);
    expect(st.sqls[0]).toContain("kind = 'hero' AND id IN ('hero_A')");
  });

  it("героев на витрине нет — в базу не ходим; сбой базы — витрина без плашек", async () => {
    expect((await heroRarities([{ kind: "art", refId: "art_X" }])).size).toBe(0);
    expect(st.sqls).toHaveLength(0);
    st.fail = true;
    expect((await heroRarities([{ kind: "hero", refId: "hero_A" }])).size).toBe(0);
  });
});
