// Разборка шахты (§8.70): нет энергии — отказ с ценой, ничего не разослано;
// повтор нажатия — прошлый ответ без второго вызова базы; ответ потерялся
// после коммита — судит ключ; клетка пустеет у всех, мешочек товаров — соседям
// (нет товаров — нет и события), шахта-блок — карта целиком; накопленное
// прежнему хозяину — в ачивку, начисленное разобравшему — нет.
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

beforeEach(resetFake);

describe("энергия, повтор, рассылка", () => {
  it("нет энергии — понятный отказ с ценой, ничего не разослано", async () => {
    s.dbError = "not_enough_energy:40.5:100";
    s.ops.clear();
    await expect(dismantle({ data })).rejects.toThrow('braid.need_energy|{"n":100}');
    expect(s.events).toEqual([]);
    expect(s.spends).toEqual([]);
  });

  it("повтор того же нажатия — прошлый ответ, второго вызова базы нет", async () => {
    await dismantle({ data });
    await expect(dismantle({ data })).resolves.toEqual({
      ok: true,
      bag: null,
      got: { wood: 90, stone: 15, gold: 45 },
    });
    expect(calls()).toBe(1);
    expect(s.spends).toEqual([["acc_me", 100, "build"]]);
  });

  it("ответ потерялся после коммита — судит ключ: успех без второго вызова", async () => {
    s.commitThenLose = true;
    await expect(dismantle({ data })).resolves.toEqual({
      ok: true,
      bag: null,
      got: { wood: 90, stone: 15, gold: 45 },
    });
    expect(calls()).toBe(1);
  });

  it("клетка пустеет у всех (дельта), флажки — событием; без товаров мешочка нет", async () => {
    await dismantle({ data });
    expect(s.journal).toEqual([
      {
        mapId: "rmap_1",
        change: {
          patches: [{ q: 1, r: 0, buildingId: null, buildingSkinId: null, buildingConfig: null }],
        },
      },
    ]);
    expect(s.events).toEqual([
      { mapId: "rmap_1", type: "built", mine: true, owner: true, cells: ["1,0"] },
    ]);
    expect(s.ops.get("mdis:acc_me:op_12345678")?.sent).toBe(true);
  });

  it("мешочек товаров — соседям событием 'bags'", async () => {
    s.bag = "lb_goods";
    await expect(dismantle({ data })).resolves.toMatchObject({ bag: "lb_goods" });
    expect(s.events).toContainEqual({ mapId: "rmap_1", type: "bags", cells: ["1,0"] });
  });

  it("шахта-блок — карта целиком; накопленное прежнему хозяину — в ачивку", async () => {
    s.block = true;
    s.credited = 3.5;
    await dismantle({ data });
    expect(s.journal).toEqual([{ mapId: "rmap_1", change: { full: true } }]);
    expect(s.bumps).toEqual([["acc_old", "minelord", 3.5]]);
  });

  it("возврат на счёт разобравшему — без ачивок (как прежний bag_take)", async () => {
    await dismantle({ data });
    expect(s.bumps.filter((x) => (x as unknown[])[0] === "acc_me")).toEqual([]);
  });
});
