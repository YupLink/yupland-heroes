// Предпроверка места под покупку и скупку с оплатой товаром из рюкзака (правило
// владельца 23.10: «если у меня одна ячейка, но этот ресурс я трачу — должно
// давать купить»). Настоящие assertBuyRoom/assertTradeRoom и канон ключей;
// базы нет — стопки рюкзака подменены заглушкой.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketItem } from "@/lib/marketItem";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

const s = vi.hoisted(() => ({
  rows: [] as Array<{ stackKey: string; count: number; potion?: boolean }>,
  capacity: 1,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => (/FROM yuplink\.raid_hero_backpack/.test(sql) ? s.rows : []),
}));
vi.mock("@/server/api/beta-raid/market-backpack", async (orig) => ({
  ...(await orig<typeof import("@/server/api/beta-raid/market-backpack")>()),
  resolveBackpack: async () => ({ heroId: "h1", capacity: s.capacity, potionCapacity: 1 }),
}));

const { assertBuyRoom } = await import("./market-buy-room");
const { assertTradeRoom } = await import("./market-backpack");

const CHIP = "cst_fkehwvvgzpw1"; // «Щепа мертвого дерева»
const ROD = "cst_rew3z8sxs897"; // «Удочка»

/** Позиция с прода (mkt_jowo7bub4t3d): Удочка за 5 дерева + 1 Щепу. */
const rod = {
  id: "mkt_jowo7bub4t3d",
  side: "buy",
  kind: "custom",
  refId: ROD,
  name: "Удочка",
  giveAmount: 1,
  priceResource: "wood",
  priceToken: null,
  priceAmount: 5,
  price2Resource: "custom",
  price2Token: CHIP,
  price2Amount: 1,
} as MarketItem;

beforeEach(() => {
  s.rows = [];
  s.capacity = 1;
});

describe("покупка: цена товаром из рюкзака освобождает место", () => {
  it("рюкзак 1/1 с единственной Щепой — Удочку купить можно", async () => {
    s.rows = [{ stackKey: `custom:${CHIP}`, count: 1 }];
    await expect(assertBuyRoom("w1", rod, 1, false)).resolves.toBeUndefined();
  });

  it("Щеп две — одна остаётся в ячейке, отказ числами", async () => {
    s.rows = [{ stackKey: `custom:${CHIP}`, count: 2 }];
    await expect(assertBuyRoom("w1", rod, 1, false)).rejects.toThrow("market.backpack_need:1:0");
  });

  it("пачка: 3 удочки за 3 Щепы проходят, 2 из 3 — нет", async () => {
    s.rows = [{ stackKey: `custom:${CHIP}`, count: 3 }];
    await expect(assertBuyRoom("w1", rod, 3, false)).resolves.toBeUndefined();
    await expect(assertBuyRoom("w1", rod, 2, false)).rejects.toThrow("market.backpack_need:1:0");
  });

  it(`плата той же стопкой, что товар: ${CELL_SIZE} удочек и одна за одну — без новой ячейки`, async () => {
    s.rows = [{ stackKey: `custom:${ROD}`, count: CELL_SIZE }];
    const swap = { ...rod, priceResource: "custom", priceToken: ROD, priceAmount: 1 } as MarketItem;
    await expect(assertBuyRoom("w1", { ...swap, price2Resource: null }, 1, false)).resolves.toBe(
      undefined,
    );
    // Цена золотом — та же удочка сверх полной ячейки требует вторую.
    const gold = { ...swap, priceResource: "gold", priceToken: null, price2Resource: null };
    await expect(assertBuyRoom("w1", gold as MarketItem, 1, false)).rejects.toThrow(
      "market.backpack_need:1:0",
    );
  });

  it("лавка города платит золотом — Щепа остаётся, отказ", async () => {
    s.rows = [{ stackKey: `custom:${CHIP}`, count: 1 }];
    await expect(assertBuyRoom("w1", rod, 1, true)).rejects.toThrow("market.backpack_need:1:0");
  });

  it("цена артефактом (инвентарь) рюкзак не освобождает", async () => {
    s.rows = [{ stackKey: `custom:${CHIP}`, count: 1 }];
    const art = { ...rod, price2Resource: "art", price2Token: "art_x" } as MarketItem;
    await expect(assertBuyRoom("w1", art, 1, false)).rejects.toThrow("market.backpack_need:1:0");
  });
});

describe("скупка: отданный товар освобождает место под выплату", () => {
  it("сдаю единственную Щепу за Удочку при рюкзаке 1/1 — проходит", async () => {
    s.rows = [{ stackKey: `custom:${CHIP}`, count: 1 }];
    const bp = { heroId: "h1", capacity: 1, potionCapacity: 1 };
    const want = [{ stackKey: `custom:${ROD}`, qty: 1 }];
    await expect(
      assertTradeRoom(bp, want, [{ res: "custom", token: CHIP, amount: 1 }]),
    ).resolves.toBeUndefined();
    await expect(assertTradeRoom(bp, want, [])).rejects.toThrow("market.backpack_need:1:0");
  });
});
