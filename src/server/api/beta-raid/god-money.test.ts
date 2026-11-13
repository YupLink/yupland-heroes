// Режим бога не-админа без денег (право island_god, владелец 04.11.2026):
// токены вычищаются из настроек, постройки-добытчики токенов не ставятся,
// награды в токенах с его острова не встают в очередь.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], right: true, tokenTpl: ["mine_darai"] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("'isle_demo'")) return [{ account_id: "acc_kai", demo: true }];
    if (sql.includes("FROM yuplink.raid_island")) return [{ account_id: "acc_kai" }];
    if (sql.includes("mystic_item_template")) return s.tokenTpl.map((id) => ({ id }));
    return [];
  },
}));
vi.mock("@/server/admin-rights", () => ({ accountHasRight: async () => s.right }));
// Бокс «box_darai» платит DARAI; права владельца нет (mystic-money).
vi.mock("@/server/api/mystic-money", () => ({
  packPaysMoney: async (id: string) => id === "box_darai",
  assertPackMoneyRight: async (id: string) => {
    if (id === "box_darai") throw new Error("только для владельца");
  },
}));

const {
  stripMoney,
  stripCellsMoney,
  isMoneyKind,
  isMoneyFreeMap,
  assertNoMarketTokens,
  assertMarketPacksRight,
} = await import("./god-money");
const { queueEncounterReward } = await import("./reward-queue");

beforeEach(() => Object.assign(s, { sql: [], right: true, tokenTpl: ["mine_darai"] }));

describe("stripMoney", () => {
  it("награды и цены в токенах — вон, ресурсы, лайки, товары — остаются", () => {
    const cfg = {
      maxHp: 50,
      usdt: 5,
      rewardConfig: {
        fillers: [
          { kind: "token", token: "Darai", amount: 100 },
          { kind: "resource", resource: "gold", amount: 10 },
          { kind: "likes", amount: 3 },
        ],
        packs: [{ packId: "mp_1" }],
      },
      prices: [
        { resource: "token", token: "Darai", amount: 1 },
        { resource: "wood", amount: 2 },
      ],
    };
    expect(stripMoney(cfg)).toEqual({
      maxHp: 50,
      rewardConfig: {
        fillers: [
          { kind: "resource", resource: "gold", amount: 10 },
          { kind: "likes", amount: 3 },
        ],
        packs: [{ packId: "mp_1" }],
      },
      prices: [{ resource: "wood", amount: 2 }],
    });
    expect(stripMoney({ resource: "token", token: "Darai", yield: 5 })).toBeNull();
  });

  it("постройка-добытчик токенов не ставится; прочая — с чистой настройкой", async () => {
    const out = await stripCellsMoney([
      { q: 0, r: 0, buildingId: "mine_darai", buildingConfig: { resource: "gold" } },
      {
        q: 1,
        r: 0,
        buildingId: "house",
        buildingConfig: { portal: { prices: [{ resource: "token", token: "X" }] } },
      },
    ] as never);
    expect(out).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0, buildingId: "house", buildingConfig: { portal: { prices: [] } } },
    ]);
  });
});

describe("остров без денег", () => {
  it("только остров владельца права; виды наград", async () => {
    expect(await isMoneyFreeMap("rmap_live")).toBe(false);
    expect(await isMoneyFreeMap("isle_kai1")).toBe(true);
    for (const k of ["likes", "energy", "resource", "custom", "item", "pack", "tickets"])
      expect(isMoneyKind(k)).toBe(false);
    expect(isMoneyKind("Darai")).toBe(true);
    expect(isMoneyKind("USDT")).toBe(true);
  });

  it("демо-остров — без денег всегда, даже без права island_god", async () => {
    s.right = false;
    expect(await isMoneyFreeMap("isle_demo")).toBe(true);
    expect(s.sql.at(-1)).toContain("raid_demo_island");
  });

  it("работа креатора (isle_cw_…) — без денег всегда, без запроса в базу", async () => {
    s.right = false;
    expect(await isMoneyFreeMap("isle_cw_work1")).toBe(true);
  });

  it("очередь наград: токен с её острова не встаёт, ресурс — встаёт, в мире — всё", async () => {
    const base = { account: "acc_kai", cycleNo: 0, sourceName: "Йети", amount: 10 };
    await queueEncounterReward({ ...base, mapId: "isle_kai2", kind: "Darai" });
    expect(s.sql.some((q) => q.includes("INSERT INTO yuplink.raid_reward"))).toBe(false);
    await queueEncounterReward({ ...base, mapId: "isle_kai2", kind: "resource", packId: "gold" });
    expect(s.sql.filter((q) => q.includes("INSERT INTO yuplink.raid_reward"))).toHaveLength(1);
    await queueEncounterReward({ ...base, mapId: "rmap_live", kind: "Darai" });
    expect(s.sql.filter((q) => q.includes("INSERT INTO yuplink.raid_reward"))).toHaveLength(2);
  });

  it("лавка: токены — только админу", () => {
    expect(() => assertNoMarketTokens({ priceResource: "gold" })).not.toThrow();
    expect(() => assertNoMarketTokens({ priceResource: "token" })).toThrow(/только админу/);
    expect(() => assertNoMarketTokens({ kind: "resource", refId: "token" })).toThrow();
    expect(() => assertNoMarketTokens({ priceMore: [{ resource: "token" }] })).toThrow();
  });

  it("лавка: бокс с DARAI отдаёт только админ выплат; платить им можно", async () => {
    const box = { kind: "pack", refId: "box_darai" };
    await expect(assertMarketPacksRight({ kind: "pack", refId: "box_gold" }, false)).resolves.toBe(
      undefined,
    );
    await expect(assertMarketPacksRight(box, false)).rejects.toThrow("Деньги в лавке");
    await expect(assertMarketPacksRight(box, true)).rejects.toThrow("владельца");
    const price = { priceResource: "pack", priceToken: "box_darai" };
    await expect(assertMarketPacksRight(price, false)).resolves.toBe(undefined);
    await expect(assertMarketPacksRight({ ...price, side: "sell" }, false)).rejects.toThrow();
    const outcomes = [{ id: "o_1", kind: "pack", refId: "box_darai", amount: 1, pct: 100 }];
    await expect(assertMarketPacksRight({ kind: "recipe", outcomes }, false)).rejects.toThrow();
  });
});
