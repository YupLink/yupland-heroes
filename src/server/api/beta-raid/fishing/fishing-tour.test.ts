// Турнир рыбаков на настоящем досчёте рыбалки (фейк базы — fishing.fake):
// пойманное — очко «Улова» с ключом выпадения и строка журнала «поймал»;
// не влезшее в рюкзак — тоже улов (строка «мешочком»); повтор чтения после
// конца заброса второй раз не выдаёт и не засчитывает.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx } from "@/server/api/beta-raid/fishing/fishing.fake";
import { fishKit, resetFishing } from "@/server/api/beta-raid/fishing/fishing.fake-mocks";

const M = vi.hoisted(() => "@/server/api/beta-raid/fishing/fishing.fake-mocks");
const t = vi.hoisted(() => ({
  points: [] as Array<[string, string, number, string]>,
  /** Время поимок, пришедшее с очком «Улова». */
  times: [] as Array<readonly number[] | undefined>,
  trades: [] as Array<Record<string, unknown>>,
  /** Сколько штук улова «не влезло» — легло мешочком. */
  bag: 0,
}));
vi.mock("@tanstack/react-start", async () => (await import(M)).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/auth", () => ({
  requireAdmin: () => "admin",
  requireWallet: () => "w1",
  isAdminWallet: () => true,
}));
vi.mock("@/server/api/beta-raid/gate", async () => (await import(M)).gate);
vi.mock("@/server/api/currency/move", async () => (await import(M)).move);
vi.mock("@/server/api/beta-raid/loot-bag/bag-actor", async () => (await import(M)).actor);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await import(M)).backpack);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await import(M)).where);
vi.mock("@/server/api/beta-raid/reward-queue", async () => (await import(M)).queue);
vi.mock("@/server/api/beta-raid/item-alias", async () => (await import(M)).alias);
vi.mock("@/server/api/beta-raid/loot-bag/bag-deliver", () => ({
  queueKey: (key: string, i: number) => `${key}:q${i}`,
  deliverOrDrop: async (o: { items: Array<{ itemId: string; amount: number }> }) => ({
    bagId: t.bag > 0 ? "bag1" : null,
    items: o.items.map((it) => ({
      itemId: it.itemId,
      toBackpack: it.amount - Math.min(t.bag, it.amount),
      dropped: Math.min(t.bag, it.amount),
      queued: 0,
    })),
  }),
}));
vi.mock("@/server/api/tournament/tour-note", () => ({
  noteTournament: async (
    acc: string,
    metric: string,
    qty: number,
    ref: string,
    times?: readonly number[],
  ) => {
    t.points.push([acc, metric, qty, ref]);
    t.times.push(times);
  },
}));
vi.mock("@/server/api/beta-raid/econ/trade-journal", () => ({
  noteTrades: async (rows: Array<Record<string, unknown>>) => void t.trades.push(...rows),
}));

const fish = fishKit(await import("@/server/api/beta-raid/fishing/fishing"));
const { dropFishingConfigCache } = await import("@/server/api/beta-raid/fishing/fishing-config");
const keyOf = (from: number) => `fish:acc1:${fx.fishing.get("acc1")?.op}:${from}`;

beforeEach(() => {
  resetFishing();
  dropFishingConfigCache();
  Object.assign(t, { points: [], times: [], trades: [], bag: 0 });
});

describe("турнир рыбаков: улов", () => {
  it("поймал — очко «Улова» ключом выпадения и строка журнала «поймал»", async () => {
    await fish.start();
    fish.wait(10);
    expect(await fish.get()).toMatchObject({ caught: 1, ended: "done" });
    expect(t.points).toEqual([["acc1", "fish_catch", 1, keyOf(1)]]);
    expect(t.trades).toEqual([
      expect.objectContaining({
        source: "fish",
        side: "take",
        itemKey: "custom:name:рыба",
        qty: 1,
        ref: `${keyOf(1)}:0`,
      }),
    ]);
    // Заброс отыгран: повтор чтения — ни второй выдачи, ни второго очка.
    await fish.get();
    expect(t.points).toHaveLength(1);
  });

  it("время поимки — миг попытки, а не выдачи: и у очка, и у строки журнала", async () => {
    const t0 = fx.now;
    await fish.start();
    // Игрок закрыл игру: выдача — позже поимки.
    fish.wait(20);
    await fish.get();
    const [at] = t.times[0] ?? [];
    expect(t.times[0]).toHaveLength(1);
    expect(at).toBeGreaterThan(t0);
    expect(at).toBeLessThan(fx.now);
    expect(t.trades[0]?.at).toBe(at);
  });

  it("не влезло в рюкзак — мешочком у рыбака, это тоже улов", async () => {
    t.bag = 1;
    await fish.start();
    fish.wait(10);
    await fish.get();
    expect(t.points).toEqual([["acc1", "fish_catch", 1, keyOf(1)]]);
    expect(t.trades).toEqual([
      expect.objectContaining({ source: "fish", side: "put", qty: 1, q: 0, r: 0, mapId: "map1" }),
    ]);
  });
});
