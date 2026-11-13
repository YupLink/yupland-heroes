// «Телепорт в замок» ведёт к ОСНОВНОМУ замку игрока и из любого мира
// (владелец, 09–10.10.2026): выбрал ратушу основной — к ней, а с другого этажа
// — в главный мир, как портал между этажами (судно остаётся у входа).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  moves: [] as Array<{ mapId: string; q: number; r: number; ship: unknown }>,
  events: [] as Array<{ mapId: string; type: string }>,
  /** Второй аргумент publishRaid (автор), как передан: [] — не передан. */
  bys: [] as unknown[][],
  left: 0,
  floor: "map_1",
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    // Свободная суша у ратуши (40,10) — соседняя клетка.
    return sql.includes("FROM yuplink.raid_map_cells c") ? [{ q: 41, r: 10 }] : [];
  },
}));
vi.mock("../../raidLive", () => ({
  publishRaid: (e: { mapId: string; type: string }, ...by: unknown[]) => {
    s.events.push(e);
    s.bys.push(by);
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => s.floor,
  activeBetaMapId: async () => "map_1",
  ownCell: async () => ({ q: 5, r: 5 }),
}));
vi.mock("./home-castle-core", () => ({
  homePlace: async (_a: string, mapId: string) =>
    mapId === "map_1" ? { kind: "town", q: 40, r: 10, name: "Ратуша" } : null,
}));
vi.mock("./ships", () => ({ blockedSql: () => "false", freeWaterAround: async () => null }));
vi.mock("./ship-rescue", () => ({ nearestLand: async () => null }));
vi.mock("./ship-crew", () => ({
  myShip: async () => null,
  releaseShip: async () => {},
  seatOnShip: async () => null,
}));
vi.mock("./spell-ship-spots", () => ({ freeShipsNear: async () => [] }));
vi.mock("./portal-ship", () => ({
  leaveShipBehind: async () => {
    s.left++;
    return true;
  },
  movePlayerThroughPortal: async (
    _w: string,
    mapId: string,
    target: { q: number; r: number },
    ctx: { ship: unknown },
  ) => {
    s.moves.push({ mapId, ...target, ship: ctx.ship });
    return { moved: true, mode: "none" };
  },
  portalShipContext: async () => ({ exitWater: false, ship: { id: "sh_1" } }),
}));
vi.mock("./spell-create-ship", () => ({ createShipNearHero: async () => null }));
vi.mock("./spell-repair-ship", () => ({ repairShipNearHero: async () => null }));
vi.mock("./hero-buff", () => ({ applyBoostRoll: async () => {} }));
vi.mock("@/lib/hero/boost", () => ({ rollBoostEffect: (e: unknown) => e }));

import { applySpellEffects } from "./spell-effects";
import { teleportHome } from "./spell-teleport-home";
import type { SpellTpl } from "./spell-tpl";

const tpl = { id: "spell_home", kind: "teleport_town", effects: [] } as unknown as SpellTpl;

describe("телепорт в замок", () => {
  beforeEach(() => {
    s.sql = [];
    s.moves = [];
    s.events = [];
    s.bys = [];
    s.left = 0;
  });

  it("в главном мире — к основной ратуше, а не в центр", async () => {
    s.floor = "map_1";
    const res = await applySpellEffects("w.near", tpl);
    expect(res).toMatchObject({ ok: true, moved: { q: 41, r: 10 }, map: null });
    expect(s.moves).toEqual([{ mapId: "map_1", q: 41, r: 10, ship: { id: "sh_1" } }]);
    // Сушу ищем вокруг ратуши (40,10), а не вокруг центра карты.
    expect(s.sql.some((q) => q.includes("c.q BETWEEN 38 AND 42"))).toBe(true);
    expect(s.left).toBe(0);
  });

  it("с другого этажа — в главный мир к основной ратуше, судно остаётся", async () => {
    s.floor = "floor_2";
    const res = await applySpellEffects("w.near", tpl);
    expect(res).toMatchObject({ ok: true, moved: { q: 41, r: 10 }, map: "map_1" });
    expect(s.moves).toEqual([{ mapId: "map_1", q: 41, r: 10, ship: null }]);
    expect(s.left).toBe(1);
    expect(s.events).toEqual(
      expect.arrayContaining([
        { mapId: "floor_2", type: "moved" },
        { mapId: "map_1", type: "moved" },
      ]),
    );
  });

  it("экипаж под синим динамитом (§8.75а): события ничьи; у заклинания — автор запроса", async () => {
    s.floor = "map_1";
    const res = await teleportHome("acc_cap", { by: null });
    expect(res).toMatchObject({ ok: true, moved: { q: 41, r: 10 }, map: null });
    expect(s.bys.length).toBeGreaterThan(0);
    expect(s.bys.every((b) => b.length === 1 && b[0] === null)).toBe(true);
    s.bys = [];
    await applySpellEffects("w.near", tpl);
    expect(s.bys.every((b) => b[0] === undefined)).toBe(true);
  });
});
