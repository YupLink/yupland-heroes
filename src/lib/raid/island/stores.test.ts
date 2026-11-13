// Лавки-магазины городов острова (владелец, 21.10.2026): удочки (10 в сутки) и
// еда за золото — в ближайшей к ратуше лавке каждого города, без склада ратуши.
import { describe, expect, it } from "vitest";
import { ISLAND_RECIPE_DAY_LIMIT, ISLAND_RECIPES } from "./catalog";
import { ISLAND_FOOD, splitStores } from "./stores";
import { storeSql } from "@/server/api/beta-raid/island/island-stores";

const shop = (q: number, r: number, hallQ: number, hallR: number) => ({ q, r, hallQ, hallR });

describe("лавки городов острова", () => {
  it("по одной на город — ближайшая к ратуше, остальные — как были", () => {
    const a1 = shop(5, 0, 0, 0);
    const a2 = shop(1, 0, 0, 0);
    const b1 = shop(20, 20, 18, 20);
    const { stores, rest } = splitStores([a1, a2, b1]);
    expect(stores).toEqual([a2, b1]);
    expect(rest).toEqual([a1]);
  });

  it("товары: удочка за 2 бревна, 10 в сутки; хлеб 10 и яблоко 2 золота; лавка без ратуши", () => {
    const sql = storeSql("isle_x", shop(3, 4, 0, 0), 1).join("\n");
    expect(sql).toContain("'isle_x_s1_rod'");
    expect(sql).toMatch(/'custom', 'cst_wtza7b6iq7va', 2, 'buy', 10/);
    expect(sql).toMatch(/'gold', NULL, 10, 'buy', NULL/);
    expect(sql).toMatch(/'gold', NULL, 2, 'buy', NULL/);
    expect(sql).not.toContain("town_q");
    expect(ISLAND_FOOD.map((f) => f.gold)).toEqual([10, 2]);
  });

  it("лимит рецептов — 10 в сутки у каждой лавки, удочки тоже (21.10, вечер)", () => {
    expect(ISLAND_RECIPE_DAY_LIMIT).toBe(10);
    expect(ISLAND_RECIPES.map((r) => r.id)).toContain("rod");
  });
});

describe("запись острова: магазин в каждом из трёх городов", () => {
  it("три лавки без ратуши с удочками, удочка мастерской — 10 в сутки", async () => {
    const { make } = await import("./island.fixture");
    const { islandSql } = await import("@/server/api/beta-raid/island/island-write");
    const island = make(11);
    const sql = islandSql({
      mapId: "isle_t",
      name: "t",
      account: "acc",
      seed: 11,
      island,
      by: "w",
    });
    const all = sql.join("\n");
    for (const k of [0, 1, 2]) expect(all).toContain(`'isle_t_s${k}_rod'`);
    expect(all).not.toContain("'isle_t_s3_rod'");
    expect(all).toMatch(/'isle_t_rod'[\s\S]*?'buy', 10/);
    expect(all).toMatch(/'isle_t_axe'[\s\S]*?'buy', 10/);
  });
});
