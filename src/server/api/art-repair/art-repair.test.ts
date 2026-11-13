// Ремонт артефактов (§8.72): доступ (админ / флаг art_repair_open), позиция у
// кузницы (то же правило, что окно постройки: клетка или соседняя), список, сумма
// по редкостям, «все», повтор нажатия, нехватка, чужой/неизношенный/залоговый —
// отказ без списания. База — модель функции art_repair (art-repair.fake.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () => (await import("./art-repair.fake")).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import("./art-repair.fake")).mcp);
vi.mock("@/server/auth", async () => (await import("./art-repair.fake")).auth);
vi.mock("@/server/api/beta-raid/gate", async () => (await import("./art-repair.fake")).gate);
vi.mock("@/server/api/beta-raid/owner", async () => (await import("./art-repair.fake")).owner);
vi.mock("@/server/rateGate", async () => (await import("./art-repair.fake")).rate);
vi.mock("@/server/api/beta-raid/encounter-where", async (orig) => ({
  // Правило «рядом» — настоящее (requireAdjacent), подменены только карта и клетка.
  ...(await orig<typeof import("@/server/api/beta-raid/encounter-where")>()),
  ...(await import("./art-repair.fake")).where,
}));
vi.mock(
  "@/server/api/beta-raid/voidGate",
  async () => (await import("./art-repair.fake")).voidGate,
);
vi.mock(
  "@/server/api/beta-raid/building-action",
  async () => (await import("./art-repair.fake")).building,
);
vi.mock(
  "@/server/api/beta-raid/hero-power",
  async () => (await import("./art-repair.fake")).heroPower,
);

const { s, resetFake } = await import("./art-repair.fake");
const mod = await import("./art-repair");
const gateMod = await import("./art-repair-gate");
const { groupOfKind } = await import("@/server/api/beta-raid/econ/kinds");
const { FORGE_TEMPLATE_ID } = await import("@/lib/hero/artRepair");

type Call = (a?: { data: unknown }) => Promise<unknown>;
const list = mod.getArtRepairList as unknown as Call;
const repairFn = mod.repairArtifacts as unknown as Call;
const repair = (d: Record<string, unknown>) =>
  repairFn({
    data: { q: 1, r: 0, ids: [], expectGold: 0, expectDiamonds: 0, opId: "op_12345678", ...d },
  });

const put = (
  id: string,
  rarity: string | null,
  wear: number,
  account = "acc_me",
  kind = "artifact",
) => s.items.push({ id, rarity, wear, account, kind });

beforeEach(() => {
  resetFake();
  gateMod.dropArtRepairOpenCache();
  s.admin = true;
  s.res = { gold: 100, diamonds: 2 };
  put("a1", "common", 100);
  put("a2", "rare", 12.5);
  put("a3", "epic", 0.625);
  put("a4", "legendary", 0.5);
  put("a5", "common", 0);
  put("a6", "rare", 40, "acc_other");
  put("a7", "epic", 40, "_hero_market");
});

describe("доступ: пока не «запускаем» — только админы", () => {
  it("игрок без флага: список и починка — отказ, кнопки у кузницы нет", async () => {
    s.admin = false;
    await expect(list()).rejects.toThrow("artfix.closed");
    await expect(repair({ ids: ["a1"], expectGold: 5 })).rejects.toThrow("artfix.closed");
    expect(await gateMod.forgeRepairShown("w_me", FORGE_TEMPLATE_ID)).toBe(false);
    expect(s.res.gold).toBe(100);
  });
  it("флаг art_repair_open = true — открыто всем", async () => {
    s.admin = false;
    s.open = true;
    await expect(list()).resolves.toMatchObject({ items: expect.any(Array) });
    expect(await gateMod.forgeRepairShown("w_me", FORGE_TEMPLATE_ID)).toBe(true);
  });
  it("админ видит без флага; кнопка — только у кузницы", async () => {
    expect(await gateMod.forgeRepairShown("w_me", FORGE_TEMPLATE_ID)).toBe(true);
    expect(await gateMod.forgeRepairShown("w_me", "building_other")).toBe(false);
    expect(await gateMod.forgeRepairShown("w_me", null)).toBe(false);
  });
});

describe("список", () => {
  it("только свои изношенные артефакты: цена по редкости, на ком надет", async () => {
    s.heroes.set("a2", "Эльф");
    const { items } = (await list()) as { items: Array<Record<string, unknown>> };
    expect(items.map((i) => i.id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(items[0]).toMatchObject({
      rarity: "common",
      durability: 0,
      price: { gold: 5, diamonds: 0 },
    });
    expect(items[1]).toMatchObject({ heroName: "Эльф", durability: 87.5, price: { gold: 20 } });
    expect(items[3]).toMatchObject({ rarity: "legendary", price: { gold: 0, diamonds: 1 } });
    const sql = s.sql.find((x) => x.includes("u.wear > 0")) ?? "";
    expect(sql).toContain("u.account_id = 'acc_me' AND u.kind = 'artifact' AND u.wear > 0");
    expect(sql).toContain("WHERE h.account_id = 'acc_me'");
  });
});

describe("позиция: у кузницы — на клетке или рядом", () => {
  it("соседняя клетка — можно; своя клетка — можно", async () => {
    await expect(repair({ ids: ["a1"], expectGold: 5 })).resolves.toMatchObject({ ok: true });
    s.pos = { q: 1, r: 0 };
    await expect(
      repair({ ids: ["a2"], expectGold: 20, opId: "op_22222222" }),
    ).resolves.toMatchObject({ ok: true });
  });
  it("далеко, не на карте, не кузница, под куполом — отказ до базы", async () => {
    s.pos = { q: 5, r: 5 };
    await expect(repair({ ids: ["a1"], expectGold: 5 })).rejects.toThrow("artfix.far");
    s.pos = null;
    await expect(repair({ ids: ["a1"], expectGold: 5 })).rejects.toThrow("artfix.far");
    s.pos = { q: 0, r: 0 };
    await expect(repair({ q: 0, r: 1, ids: ["a1"], expectGold: 5 })).rejects.toThrow(
      "artfix.no_forge",
    );
    s.voidCells.add("1,0");
    await expect(repair({ ids: ["a1"], expectGold: 5 })).rejects.toThrow("braid.void_blocked");
    expect(s.sql.some((x) => x.includes("yuplink.art_repair("))).toBe(false);
    expect(s.res.gold).toBe(100);
  });
});

describe("починка", () => {
  it("выбранные: сумма по редкостям, износ в ноль, сток art_repair", async () => {
    const r = await repair({ ids: ["a1", "a2", "a4"], expectGold: 25, expectDiamonds: 1 });
    expect(r).toEqual({
      ok: true,
      fresh: true,
      count: 3,
      gold: 25,
      diamonds: 1,
      ids: ["a1", "a2", "a4"],
    });
    expect(s.res).toEqual({ gold: 75, diamonds: 1 });
    expect(s.items.filter((i) => ["a1", "a2", "a4"].includes(i.id)).map((i) => i.wear)).toEqual([
      0, 0, 0,
    ]);
    expect(s.items.find((i) => i.id === "a3")?.wear).toBe(0.625);
    expect(s.ledger.map((l) => l.kind)).toEqual(["art_repair", "art_repair"]);
    expect(groupOfKind("res", "art_repair", null)).toBe("sink");
    expect(s.powerDrops).toBe(1);
  });
  it("цены уходят в базу с сервера, ключ нажатия — в пределах аккаунта", async () => {
    await repair({ ids: ["a1"], expectGold: 5 });
    const call = s.sql.find((x) => x.includes("yuplink.art_repair(")) ?? "";
    expect(call).toContain("art_repair('op_12345678', 'acc_me', ARRAY['a1']::text[]");
    expect(call).toContain('"common":{"gold":5,"diamonds":0}');
    expect(call).toContain('"legendary":{"gold":0,"diamonds":1}');
  });
  it("«все»: все свои изношенные, чужие и залоговые — нет", async () => {
    const r = await repair({ all: true, expectGold: 75, expectDiamonds: 1 });
    expect(r).toMatchObject({ count: 4, gold: 75, diamonds: 1, ids: ["a1", "a2", "a3", "a4"] });
    expect(s.items.find((i) => i.id === "a6")?.wear).toBe(40);
    expect(s.items.find((i) => i.id === "a7")?.wear).toBe(40);
    await expect(repair({ all: true, opId: "op_33333333" })).rejects.toThrow("artfix.nothing");
  });
  it("повтор того же нажатия — тот же итог, второй раз не списывает", async () => {
    await repair({ ids: ["a2"], expectGold: 20 });
    const again = await repair({ ids: ["a2"], expectGold: 20 });
    expect(again).toMatchObject({ ok: true, fresh: false, count: 1, gold: 20 });
    expect(s.res.gold).toBe(80);
    expect(s.ledger).toHaveLength(1);
  });
  it("нехватка — отказ с числами «нужно/есть», ничего не тронуто", async () => {
    s.res = { gold: 10, diamonds: 0 };
    await expect(repair({ ids: ["a1", "a2"], expectGold: 25 })).rejects.toThrow(
      'artfix.short_gold|{"need":25,"have":10}',
    );
    await expect(repair({ ids: ["a4"], expectDiamonds: 1 })).rejects.toThrow(
      'artfix.short_diamonds|{"need":1,"have":0}',
    );
    await expect(repair({ ids: ["a2", "a4"], expectGold: 20, expectDiamonds: 1 })).rejects.toThrow(
      'artfix.short_both|{"g":20,"gh":10,"d":1,"dh":0}',
    );
    expect(s.items.find((i) => i.id === "a1")?.wear).toBe(100);
    expect(s.ledger).toHaveLength(0);
  });
  it("чужой, залоговый, неизношенный, герой — отказ всего нажатия", async () => {
    put("h1", "rare", 0, "acc_me", "hero");
    await expect(repair({ ids: ["a1", "a6"], expectGold: 25 })).rejects.toThrow("artfix.not_yours");
    await expect(repair({ ids: ["a7"], expectGold: 50 })).rejects.toThrow("artfix.not_yours");
    await expect(repair({ ids: ["a1", "a5"], expectGold: 10 })).rejects.toThrow("artfix.not_worn");
    await expect(repair({ ids: ["h1"], expectGold: 20 })).rejects.toThrow("artfix.not_yours");
    expect(s.items.find((i) => i.id === "a1")?.wear).toBe(100);
    expect(s.res.gold).toBe(100);
  });
  it("сумма разошлась с показанной — отказ, платишь показанное", async () => {
    await expect(repair({ ids: ["a1", "a2"], expectGold: 5 })).rejects.toThrow(
      "artfix.price_moved",
    );
    expect(s.res.gold).toBe(100);
  });
  it("пустой выбор и кривой ключ — отказ на входе", async () => {
    await expect(repair({ ids: [] })).rejects.toThrow();
    await expect(repair({ ids: ["a1"], opId: "x" })).rejects.toThrow();
  });
  it("сбой базы → ключ словаря", async () => {
    s.dbError = "canceling statement due to lock timeout";
    await expect(repair({ ids: ["a1"], expectGold: 5 })).rejects.toThrow("artfix.busy");
    s.dbError = "res_move: в минус";
    await expect(repair({ ids: ["a1"], expectGold: 5 })).rejects.toThrow("artfix.short");
    s.dbError = "что-то странное";
    await expect(repair({ ids: ["a1"], expectGold: 5 })).rejects.toThrow("artfix.failed");
  });
});
