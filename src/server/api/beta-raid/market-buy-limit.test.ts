// Лимит покупок на игрока В ДЕНЬ (задачник 23.09, владелец 04.10): резерв до
// денег одним оператором с проверкой лимита по (позиция, аккаунт, сутки UTC);
// сбой возвращает весь резерв в тот же день, частичная выдача — остаток;
// витрина показывает, сколько ещё можно купить сегодня, выбранный — замок.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketItem } from "@/lib/marketItem";

const sqls: string[] = [];
let reply: unknown[] = [];
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    return reply;
  },
}));
const { holdBuyerLimit, withBuyerLimit } = await import("./market-buy-limit");
const { limitItem } = await import("./market-limit-view");

const item = (o: Partial<MarketItem> = {}) =>
  ({ id: "mkt_1", side: "buy", perAccountLimit: 1, ...o }) as MarketItem;

beforeEach(() => {
  sqls.length = 0;
  reply = [{ bought: 1, day: "2026-10-04" }];
});

describe("holdBuyerLimit", () => {
  it("без лимита — покупка как раньше, в базу не ходим", async () => {
    expect(await holdBuyerLimit(item({ perAccountLimit: null }), "acc1", 3)).toBeNull();
    expect(await holdBuyerLimit(item({ side: "sell" }), "acc1", 3)).toBeNull();
    expect(sqls).toHaveLength(0);
  });

  it("больше лимита за раз — отказ до базы", async () => {
    await expect(holdBuyerLimit(item(), "acc1", 2)).rejects.toThrow("market.limit_reached");
    expect(sqls).toHaveLength(0);
  });

  it("резерв — одним оператором с проверкой лимита", async () => {
    const hold = await holdBuyerLimit(item({ perAccountLimit: 3 }), "acc1", 2);
    expect(hold).not.toBeNull();
    expect(sqls[0]).toContain("INSERT INTO yuplink.raid_market_buyer");
    expect(sqls[0]).toContain("ON CONFLICT (item_id, account_id, day)");
    expect(sqls[0]).toContain("(now() AT TIME ZONE 'UTC')::date");
    expect(sqls[0]).toContain("WHERE b.bought + EXCLUDED.bought <= 3");
  });

  it("возврат — в тот же день, в который заняли (покупка через полночь)", async () => {
    const hold = await holdBuyerLimit(item({ perAccountLimit: 3 }), "acc1", 2);
    await hold?.release(2);
    expect(sqls[1]).toContain("bought = GREATEST(0, bought - 2)");
    expect(sqls[1]).toContain("AND day = '2026-10-04'::date");
  });

  it("лимит выбран (база не подняла счётчик) — отказ", async () => {
    reply = [];
    await expect(holdBuyerLimit(item(), "acc1", 1)).rejects.toThrow("market.limit_reached");
  });
});

describe("withBuyerLimit", () => {
  const release = vi.fn(async () => {});
  beforeEach(() => release.mockClear());

  it("сбой покупки — резерв возвращается целиком", async () => {
    const run = () => Promise.reject(new Error("market.sold_out"));
    await expect(withBuyerLimit({ release }, 2, run)).rejects.toThrow("market.sold_out");
    expect(release).toHaveBeenCalledWith(2);
  });

  it("выдали часть — назад только недоданное", async () => {
    await withBuyerLimit({ release }, 3, async () => ({ qty: 1 }));
    expect(release).toHaveBeenCalledWith(2);
  });

  it("выдали всё — счётчик остаётся", async () => {
    await withBuyerLimit({ release }, 2, async () => ({ qty: 2 }));
    expect(release).not.toHaveBeenCalled();
  });
});

describe("limitItem — витрина игрока", () => {
  const shown = { id: "mkt_1", remaining: 10, buyable: true, lockKey: null };

  it("остаток — меньшее из запаса и лимита", () => {
    expect(limitItem(shown, 3, 1).remaining).toBe(2);
    expect(limitItem({ ...shown, remaining: null }, 3, 0).remaining).toBe(3);
  });

  it("лимит выбран — замок своей причиной, не «Распродано»", () => {
    const it2 = limitItem(shown, 1, 1);
    expect(it2.buyable).toBe(false);
    expect(it2.lockKey).toBe("market.limit_reached");
    expect(it2.remaining).toBe(10);
  });

  it("без лимита — позиция как была", () => {
    expect(limitItem(shown, null, 5)).toBe(shown);
  });
});
