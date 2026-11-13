// Погода и рыбалка (26.10.2026): шанс заброса × коэффициент «рыба» карты, где идёт
// заброс, — последним, с обрезкой на 100 %; ноль — не клюёт. Коэффициент 1 —
// заброс ровно прежний. Ручки, досчёт настоящие; база — fishing.fake, погода подменена.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fishKit, resetFishing, ROD } from "./fishing.fake-mocks";
import { fx, packOf } from "./fishing.fake";

const M = vi.hoisted(() => "@/server/api/beta-raid/fishing/fishing.fake-mocks");
const b = vi.hoisted(() => ({
  plan: { bonusPct: 0, steps: [] as Array<{ at: number; bonusPct: number }> },
  addPct: 0,
  fish: 1,
  maps: [] as string[],
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
vi.mock("@/server/api/beta-raid/loot-bag/bag-deliver", async () => (await import(M)).deliver);
vi.mock("@/server/api/beta-raid/reward-queue", async () => (await import(M)).queue);
vi.mock("@/server/api/beta-raid/item-alias", async () => (await import(M)).alias);
vi.mock("@/server/api/beta-raid/econ/trade-journal", () => ({ noteTrades: async () => {} }));
vi.mock("@/server/api/tournament/tour-note", () => ({ noteTournament: async () => {} }));
vi.mock("@/server/api/beta-raid/fishing/fishing-bonus", () => ({
  fishBonusOf: async () => ({ bonusPct: b.plan.bonusPct, addPct: b.addPct }),
  fishBonusPlan: async () => ({ ...b.plan, addPct: b.addPct }),
}));
vi.mock("@/server/api/beta-raid/weather/weather-read", () => ({
  mapWeatherCoefs: async (mapId: string) => {
    b.maps.push(mapId);
    return { fish: b.fish, mine: 1, farm: 1, step: 1, ship: 1 };
  },
}));

const fish = fishKit(await import("./fishing"));
const { dropFishingConfigCache } = await import("./fishing-config");

const MIN = 60_000;

beforeEach(() => {
  resetFishing();
  dropFishingConfigCache();
  fx.cfg = { intervalMin: 1, chancePct: 10, items: [{ id: "cst_fish", pct: 100 }] };
  packOf("h1").set(ROD, { count: 50, wear: 0 });
  b.plan = { bonusPct: 0, steps: [] };
  b.addPct = 0;
  b.fish = 1;
  b.maps = [];
});

describe("рыбак (09.11.2026): +3 к базе мира, бонусы — от неё", () => {
  it("база 7 — с рыбаком 10; артефакт +60 % — 16", async () => {
    fx.cfg = { intervalMin: 1, chancePct: 7, items: [{ id: "cst_fish", pct: 100 }] };
    b.addPct = 3;
    await fish.start("fisher-a", 5);
    expect(fx.fishing.get("acc1")?.chancePct).toBe(10);
    resetFishing();
    packOf("h1").set(ROD, { count: 50, wear: 0 });
    b.plan = { bonusPct: 60, steps: [] };
    await fish.start("fisher-b", 5);
    expect(fx.fishing.get("acc1")?.chancePct).toBe(16);
  });
});

describe("рыбалка и погода", () => {
  it("коэффициент 1 — шанс и ступени заброса прежние; погода — карты заброса", async () => {
    b.plan = { bonusPct: 60, steps: [{ at: fx.now + 4 * MIN, bonusPct: 0 }] };
    await fish.start("wx-a-x", 10);
    const row = fx.fishing.get("acc1");
    expect(row?.chancePct).toBe(16);
    expect(JSON.parse(row?.chanceSteps ?? "null")).toEqual([{ at: fx.now + 4 * MIN, pct: 10 }]);
    expect(b.maps).toEqual(["map1"]);
  });

  it("×2 — шанс и ступени вдвое", async () => {
    b.fish = 2;
    b.plan = { bonusPct: 60, steps: [{ at: fx.now + 4 * MIN, bonusPct: 0 }] };
    await fish.start("wx-b-x", 10);
    const row = fx.fishing.get("acc1");
    expect(row?.chancePct).toBe(32);
    expect(JSON.parse(row?.chanceSteps ?? "null")).toEqual([{ at: fx.now + 4 * MIN, pct: 20 }]);
  });

  it("шанс — вероятность: ×4 к 30 % — 100 %, каждый раз рыба", async () => {
    b.fish = 4;
    fx.cfg = { intervalMin: 1, chancePct: 30, items: [{ id: "cst_fish", pct: 100 }] };
    await fish.start("wx-c-x", 5);
    expect(fx.fishing.get("acc1")?.chancePct).toBe(100);
    fish.wait(6);
    expect(await fish.get()).toMatchObject({ tries: 5, caught: 5 });
  });

  it("ноль — не клюёт: попытки отыграны, рыбы нет", async () => {
    b.fish = 0;
    fx.cfg = { intervalMin: 1, chancePct: 100, items: [{ id: "cst_fish", pct: 100 }] };
    await fish.start("wx-d-x", 5);
    expect(fx.fishing.get("acc1")?.chancePct).toBe(0);
    fish.wait(6);
    expect(await fish.get()).toMatchObject({ tries: 5, caught: 0 });
  });
});
