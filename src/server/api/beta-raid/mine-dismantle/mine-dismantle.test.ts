// Разобрать сломанную шахту (§8.70): только шахта v2, сломанная или ничья, не
// гриб и не остров; 100 энергии и разборка — один вызов базы с ключом нажатия
// в пределах аккаунта; возврат — 30 % цены заготовки: ресурсы — сразу на счёт
// (ответ got), товары — мешочком; окно подтверждения берёт цену и возврат с
// сервера. Повтор и рассылка — mine-dismantle-flow.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () => (await import("./mine-dismantle.fake")).startFn);
vi.mock(
  "@/server/api/beta-raid/mine-v2",
  async () => (await import("./mine-dismantle.fake")).mineV2,
);
vi.mock("@/server/rateGate", async () => (await import("./mine-dismantle.fake")).rate);
vi.mock(
  "@/server/api/beta-raid/encounter-where",
  async () => (await import("./mine-dismantle.fake")).where,
);
vi.mock(
  "@/server/api/beta-raid/voidGate",
  async () => (await import("./mine-dismantle.fake")).voidGate,
);
vi.mock(
  "@/server/api/beta-raid/voidCells",
  async () => (await import("./mine-dismantle.fake")).voidCells,
);
vi.mock(
  "@/server/api/beta-raid/building-action",
  async () => (await import("./mine-dismantle.fake")).building,
);
vi.mock(
  "@/server/api/beta-raid/mine-v2-read",
  async () => (await import("./mine-dismantle.fake")).mineRead,
);
vi.mock(
  "@/server/api/castle-architect/architect-config",
  async () => (await import("./mine-dismantle.fake")).architect,
);
vi.mock("@/server/api/achievements/bump", async () => (await import("./mine-dismantle.fake")).bump);
vi.mock(
  "@/server/api/beta-raid/econ/energy-note",
  async () => (await import("./mine-dismantle.fake")).energyNote,
);
vi.mock(
  "@/server/api/beta-raid/map-journal",
  async () => (await import("./mine-dismantle.fake")).journal,
);
vi.mock("@/server/raidLive", async () => (await import("./mine-dismantle.fake")).live);
vi.mock("@/server/db/mcpClient", async () => (await import("./mine-dismantle.fake")).mcp);

const { s, resetFake, data, calls } = await import("./mine-dismantle.fake");
const mod = await import("./mine-dismantle");
const dismantle = mod.dismantleMine as unknown as import("./mine-dismantle.fake").DismantleFn;
const quote = mod.getMineDismantleQuote as unknown as import("./mine-dismantle.fake").QuoteFn;

beforeEach(resetFake);

describe("что можно разобрать", () => {
  it("сломанная/ничья шахта v2 — да: 100 энергии и ключ аккаунта в одном вызове базы", async () => {
    await expect(dismantle({ data })).resolves.toEqual({
      ok: true,
      bag: null,
      got: { wood: 90, stone: 15, gold: 45 },
    });
    const call = s.sql.find((x) => x.includes("raid_mine_dismantle(")) ?? "";
    expect(call).toContain("raid_mine_dismantle('mdis:acc_me:op_12345678', 'rmap_1',");
    expect(call).toContain("100::numeric");
    expect(call).toContain("'Лесопилка')");
  });

  it("возврат — 30 % цены заготовки: ресурсные порции (база кладёт их на счёт)", async () => {
    await dismantle({ data });
    const call = s.sql.find((x) => x.includes("raid_mine_dismantle(")) ?? "";
    const json = /'(\[.*\])'::jsonb/.exec(call)?.[1] ?? "[]";
    expect(JSON.parse(json)).toEqual([
      {
        k: "resource:wood",
        kind: "resource",
        ref: "wood",
        name: "Дерево",
        image: null,
        n: 90,
        h: 87600,
      },
      {
        k: "resource:stone",
        kind: "resource",
        ref: "stone",
        name: "Камень",
        image: null,
        n: 15,
        h: 87600,
      },
      {
        k: "resource:gold",
        kind: "resource",
        ref: "gold",
        name: "Золото",
        image: null,
        n: 45,
        h: 87600,
      },
    ]);
  });

  it("работающая — отказ до базы", async () => {
    s.owner = "acc_other";
    await expect(dismantle({ data })).rejects.toThrow("braid.mine_working");
    expect(calls()).toBe(0);
  });

  it("гриб, лесопилка с пределом часов, не шахта — не разбирают", async () => {
    for (const config of [
      { resource: "gold", mushroom: "gold" },
      { resource: "token", token: "DARAI" },
      { resource: "wood", maxHours: 168 },
    ]) {
      s.config = config;
      await expect(dismantle({ data })).rejects.toThrow("braid.mine_no_dismantle");
    }
    s.config = { resource: "wood" };
    s.effect = "market";
    await expect(dismantle({ data })).rejects.toThrow("braid.mine_no_dismantle");
    expect(calls()).toBe(0);
  });

  it("остров — ни по карте, ни по флагу клетки", async () => {
    s.mapId = "isle_abc";
    await expect(dismantle({ data })).rejects.toThrow("braid.mine_no_dismantle");
    s.mapId = "rmap_1";
    s.config = { resource: "wood", island: true };
    await expect(dismantle({ data })).rejects.toThrow("braid.mine_no_dismantle");
    expect(calls()).toBe(0);
  });

  it("далеко — «подойди», без базы", async () => {
    await expect(dismantle({ data: { ...data, q: 5 } })).rejects.toThrow("Подойди");
    expect(calls()).toBe(0);
  });
});

describe("окно подтверждения", () => {
  it("цена и возврат с сервера", async () => {
    await expect(quote({ data: { q: 1, r: 0 } })).resolves.toEqual({
      energy: 100,
      res: { wood: 90, stone: 15, gold: 45 },
      goods: [],
    });
  });
});
