// Заготовка у Архитектора: товары цены уходят из того же рюкзака раньше выдачи,
// поэтому проверка места получает цену и считает рюкзак после списания (правило
// владельца 23.10). Порядок шагов — craft-core.test.ts; здесь — только место.
import { describe, expect, it, vi } from "vitest";
import { craftBlueprint, type CraftDeps } from "./craft-core";
import type { ArchitectCost } from "@/lib/castleArchitect";

const s = vi.hoisted(() => ({ rows: [] as Array<{ stackKey: string; count: number }> }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => (/FROM yuplink\.raid_hero_backpack/.test(sql) ? s.rows : []),
}));

const { assertBackpackRoomFor } = await import("@/server/api/beta-raid/market-backpack");

const BOARD = "custom:cst_board";
const BLUEPRINT = "custom:cst_bp_wood";
const COST: ArchitectCost = {
  wood: 300,
  stone: 0,
  gold: 0,
  diamonds: 0,
  goods: [{ key: BOARD, name: "Доска", qty: 2 }],
};

describe("место под заготовку", () => {
  it("проверка места получает цену вместе с товарами", async () => {
    const seen: ArchitectCost[] = [];
    const deps = {
      backpack: async () => ({ heroId: "h1", spec: null, capacity: 1, potionCapacity: 0 }),
      level: async () => 1,
      cost: async () => COST,
      assertRoom: async (_bag, cost) => {
        seen.push(cost);
      },
      assertGoods: async () => {},
      pay: async () => "paid",
      deposit: async () => {},
      undo: async () => "refunded",
      refunded: async () => false,
    } satisfies CraftDeps;
    await craftBlueprint("wood", deps);
    expect(seen).toEqual([COST]);
  });

  it("рюкзак 1/1 с двумя Досками, цена — две Доски: заготовка влезает", async () => {
    s.rows = [{ stackKey: BOARD, count: 2 }];
    const bag = { heroId: "h1", capacity: 1, potionCapacity: 0 };
    const want = [{ stackKey: BLUEPRINT, qty: 1 }];
    const pay = COST.goods!.map((g) => ({ stackKey: g.key, qty: g.qty }));
    await expect(assertBackpackRoomFor(bag, want, pay)).resolves.toBeUndefined();
    // Досок три — одна остаётся в ячейке, места нет.
    s.rows = [{ stackKey: BOARD, count: 3 }];
    await expect(assertBackpackRoomFor(bag, want, pay)).rejects.toThrow("market.backpack_need:1:0");
  });
});
