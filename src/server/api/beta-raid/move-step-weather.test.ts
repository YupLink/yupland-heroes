// Погода и списание за ход (26.10.2026): шаг героя × «ход героя», посадка и гребок ×
// «ход корабля» — последним, после скорости и замедления; коэффициенты 1 — прежние
// числа. Шаг (move-step), посадка и сход (ship-ride) — настоящие, база и погода подменены.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  w: { fish: 1, mine: 1, farm: 1, step: 1, ship: 1 },
  maps: [] as string[],
  water: false,
  slow: 0,
  discount: 0 as number | null,
  spends: [] as number[],
  rpc: [] as number[],
}));

vi.mock("./weather/weather-read", () => ({
  mapWeatherCoefs: async (mapId: string) => {
    s.maps.push(mapId);
    return { ...s.w };
  },
}));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));
vi.mock("../../db/pg", () => ({
  sb: {
    rpc: async (_name: string, args?: { p_spend?: number }) => {
      if (args?.p_spend != null) s.rpc.push(args.p_spend);
      return { data: [{ energy_now: 100 }], error: null };
    },
  },
}));
vi.mock("../../perf/trace", () => ({ stopwatch: () => ({ lap: () => {}, done: () => {} }) }));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));
vi.mock("../../rateGate", () => ({ rateGate: async () => {} }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  playerMapId: async () => "map_1",
  ownCell: async () => ({ q: 0, r: 0 }),
}));
vi.mock("./castle", () => ({ mapSizeOf: async () => 128 }));
vi.mock("./castle-door", () => ({ startCell: async () => ({ q: 32, r: 64 }) }));
vi.mock("./encounter-effects", () => ({ slowExtraCost: async () => s.slow }));
vi.mock("./hero-power", () => ({
  loadHeroPower: async () =>
    s.discount == null
      ? null
      : {
          heroId: "h1",
          field: { stepDiscountPct: s.discount },
          satiety: { now: 10, max: 10, hungry: false },
        },
  invalidateHeroPower: () => {},
}));
vi.mock("./flee-move", () => ({ fleeAroundStep: async () => [] }));
vi.mock("./step-object", () => ({ objectInfoOf: async () => null }));
vi.mock("./econ/energy-note", () => ({ noteEnergySpend: async () => {} }));
vi.mock("./move-energy-spent", () => ({ bumpMoveEnergy: async () => {} }));
vi.mock("./gate-toll", () => ({ chargeGateOnStep: async () => null }));
vi.mock("../tournament/tour-note", () => ({ noteTournament: async () => {} }));
vi.mock("./voidGate", () => ({ canIgnoreVoid: () => false }));
vi.mock("./step-facts", () => ({
  stepBlockedReason: () => null,
  loadStepFacts: async () => ({
    terrainId: "grass",
    decorationId: null,
    decorationBlocks: false,
    objectId: null,
    objectKnown: false,
    voidFog: false,
    hpFound: false,
    hpValue: null,
    water: s.water,
    ocean: false,
    cost: 2,
    berth: s.water ? { ships: 1, busy: 0 } : null,
    gate: null,
  }),
}));
vi.mock("./ship-move", () => ({
  loadRide: async () => ({ cell: { q: 0, r: 0 }, ship: null }),
  isWaterCell: async () => false,
}));
vi.mock("./ship-ashore", () => ({
  loadAshore: async () => ({
    cell: { q: 0, r: 0 },
    ship: { id: "ship_1" },
    land: { q: 1, r: 0, cost: 2 },
  }),
}));
vi.mock("./ship-crew", () => ({
  releaseShip: async () => {},
  seatOnShip: async () => ({ id: "ship_1", big: false }),
  myShip: async () => null,
  chargeShipHp: async () => {},
  stepOpDone: async () => false,
  seatRefusal: () => "Все корабли здесь заняты",
  applyStep: async (
    _w: string,
    _m: string,
    _q: number,
    _r: number,
    _mode: string,
    guard?: { cost: number },
  ) => {
    if (guard) s.spends.push(guard.cost);
    return { ships: 0, moved: 1, energy: 50, satiety: null };
  },
}));

import { performStep } from "@/server/api/beta-raid/move-step";
import { boardShipCore, leaveShipCore } from "@/server/api/beta-raid/ship-ride";

beforeEach(() => {
  s.w = { fish: 1, mine: 1, farm: 1, step: 1, ship: 1 };
  s.maps = [];
  s.water = false;
  s.slow = 0;
  s.discount = null;
  s.spends = [];
  s.rpc = [];
});

describe("шаг героя (move-step) и погода", () => {
  it("коэффициенты 1 — прежняя цена: суша 2, посадка 3", async () => {
    expect((await performStep("w.near", { q: 1, r: 0 })).moveCost).toBe(2);
    s.water = true;
    expect((await performStep("w.near", { q: 1, r: 0 })).moveCost).toBe(3);
    expect(s.spends).toEqual([2, 3]);
    expect(s.maps).toEqual(["map_1", "map_1"]);
  });

  it("суша × step последним: (2 + 1) × (1 − 50 %) = 1,5 → × 2 = 3", async () => {
    s.w = { ...s.w, step: 2, ship: 10 };
    s.slow = 1;
    s.discount = 50;
    expect((await performStep("w.near", { q: 1, r: 0 })).moveCost).toBe(3);
    expect(s.spends).toEqual([3]);
  });

  it("посадка × ship: (3 + 1) × 4 = 16; step её не трогает", async () => {
    s.w = { ...s.w, step: 2, ship: 4 };
    s.slow = 1;
    s.water = true;
    expect((await performStep("w.near", { q: 1, r: 0 })).moveCost).toBe(16);
  });
});

describe("посадка и сход (ship-ride) и погода", () => {
  it("коэффициенты 1 — посадка 3, сход по клетке берега 2", async () => {
    s.water = true;
    expect((await boardShipCore("w.near", "acc_me", "map_1", 1, 0)).spent).toBe(3);
    expect((await leaveShipCore("w.near", "acc_me", "map_1")).spent).toBe(2);
    expect(s.rpc).toEqual([3, 2]);
  });

  it("посадка × ship, сход (шаг ногами) × step", async () => {
    s.w = { ...s.w, step: 1.5, ship: 5.5 };
    s.water = true;
    expect((await boardShipCore("w.near", "acc_me", "map_1", 1, 0)).spent).toBe(16.5);
    expect((await leaveShipCore("w.near", "acc_me", "map_1")).spent).toBe(3);
    expect(s.rpc).toEqual([16.5, 3]);
  });
});
