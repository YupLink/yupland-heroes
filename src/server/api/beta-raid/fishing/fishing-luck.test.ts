// «Зелье удачи действует только пока действует» (владелец, 14.10.2026, вечер):
// заброс на час, бафф удачи кончается через 4 минуты — попытки до срока идут с
// бонусом, с мига срока — с шансом без него. Так же считает досчёт «Улова» на
// финише. Ручки, досчёт и хвост настоящие; база — fishing.fake, план бонуса
// героя подменён (его считает fishing-bonus, см. fishing-bonus.test).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fishHit } from "@/lib/raid/fishing";
import { fishSeed } from "@/server/api/beta-raid/fishing/fishing-seed";
import { fishKit, resetFishing, ROD } from "./fishing.fake-mocks";
import { fx, packOf, saltOf } from "./fishing.fake";

const M = vi.hoisted(() => "@/server/api/beta-raid/fishing/fishing.fake-mocks");
const b = vi.hoisted(() => ({
  plan: { bonusPct: 0, steps: [] as Array<{ at: number; bonusPct: number }> },
  points: [] as number[],
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
vi.mock("@/server/api/tournament/tour-note", () => ({
  noteTournament: async (_a: string, _m: string, _q: number, _r: string, times?: number[]) =>
    void b.points.push(...(times ?? [])),
}));
vi.mock("@/server/api/beta-raid/fishing/fishing-bonus", () => ({
  fishBonusOf: async () => ({ bonusPct: b.plan.bonusPct, addPct: 0 }),
  fishBonusPlan: async () => ({ ...b.plan, addPct: 0 }),
}));

const fish = fishKit(await import("./fishing"));
const { dropFishingConfigCache } = await import("./fishing-config");
const { settleFishTail } = await import("./fishing-tail-run");

const MIN = 60_000;
let T0 = 0;

/** Зелье: бонус +900 % (база 10 % → 100 %) до мига T0 + endMin минут, дальше ноль. */
function potion(endMin: number): void {
  b.plan = { bonusPct: 900, steps: [{ at: T0 + endMin * MIN, bonusPct: 0 }] };
}

/** Попытки 1…n с рыбой по правилу «удача до срока»: до endMin — все, дальше — 10 %. */
function expected(op: string, n: number, endMin: number): number[] {
  const seed = fishSeed("acc1", op, saltOf(op));
  const out: number[] = [];
  for (let i = 1; i <= n; i++) if (i < endMin || fishHit(seed, i, 10)) out.push(T0 + i * MIN);
  return out;
}

const tailTimes = (): number[] => {
  const sql = fx.sql.find((s) => s.includes("INSERT INTO yuplink.tournament_point")) ?? "";
  return [...sql.matchAll(/'tail:fish:acc1:[^']+', to_timestamp\((\d+) \/ 1000\.0\)\)/g)].map((m) =>
    Number(m[1]),
  );
};

beforeEach(() => {
  resetFishing();
  dropFishingConfigCache();
  fx.cfg = { intervalMin: 1, chancePct: 10, items: [{ id: "cst_fish", pct: 100 }] };
  packOf("h1").set(ROD, { count: 50, wear: 0 });
  b.points = [];
  T0 = fx.now;
  b.plan = { bonusPct: 0, steps: [] };
});

describe("удача на рыбалке — только пока действует", () => {
  it("заброс пишет шанс с зельем и ступень на срок зелья", async () => {
    potion(4);
    await fish.start("luck-a-x", 60);
    const row = fx.fishing.get("acc1");
    expect(row?.chancePct).toBe(100);
    expect(JSON.parse(row?.chanceSteps ?? "null")).toEqual([{ at: T0 + 4 * MIN, pct: 10 }]);
  });

  it("час ловли, зелье на 4 минуты: с бонусом только попытки до срока", async () => {
    potion(4);
    await fish.start("luck-b-x", 60);
    fish.wait(61);
    const v = await fish.get();
    const want = expected("luck-b-x", 60, 4);
    expect(v).toMatchObject({ tries: 60, caught: want.length });
    // Без правила было бы 60 рыб из 60: шанс 100 % на весь заброс.
    expect(want.length).toBeLessThan(30);
    expect(b.points).toEqual(want);
  });

  it("отыгранное до срока не переигрывается: досчёт кусками — тот же улов", async () => {
    potion(4);
    await fish.start("luck-c-x", 60);
    fish.wait(2);
    expect(await fish.get()).toMatchObject({ tries: 2, caught: 2 });
    for (let m = 0; m < 6; m++) {
      fish.wait(10);
      await fish.get();
    }
    expect(b.points).toEqual(expected("luck-c-x", 60, 4));
  });

  it("без баффов ступеней нет — шанс заброса один на весь час", async () => {
    b.plan = { bonusPct: 900, steps: [] };
    await fish.start("luck-d-x", 60);
    expect(fx.fishing.get("acc1")?.chanceSteps).toBeNull();
    fish.wait(61);
    expect(await fish.get()).toMatchObject({ tries: 60, caught: 60 });
  });

  it("досчёт «Улова» на финише — по тем же ступеням, что и выдача", async () => {
    potion(4);
    await fish.start("luck-e-x", 60);
    fish.wait(45);
    await settleFishTail({
      id: "t1",
      metric: "fish_catch",
      startedMs: T0,
      endsMs: T0 + 30.5 * MIN,
    });
    expect(tailTimes()).toEqual(expected("luck-e-x", 30, 4));
    fish.wait(30);
    await fish.get();
    expect(b.points.filter((at) => at < T0 + 30.5 * MIN)).toEqual(tailTimes());
  });
});
