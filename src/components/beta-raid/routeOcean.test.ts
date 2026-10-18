// Океан и размер судна (жалоба 03.10): на причале большой и малый, большой
// занят — маршрут через океан не строится, а отказ говорит «Нет подходящего
// корабля». Свободный большой — маршрут через океан есть. Проводка маршрута:
// за посадкой океан — садимся только в большой, его нет — встаём до траты.
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { toast } = await import("sonner");
const { routeTo, needsBigShip, sayNeedBig } = await import("./routeSearch");
const { makeRoutePilot } = await import("./routeFleet");
const { SHIPS_KEY } = await import("./patchShipsCache");
import type { CellInfo, TerrainInfo } from "./hexStepCost";
import type { ShipMark } from "./drawShips";
import type { RouteSearchOpts } from "./routeSearch";

const terrains: Record<string, TerrainInfo> = {
  grass: { id: "grass", name: "Трава", imageUrl: null, cost: 1 },
  water: { id: "water", name: "Вода", imageUrl: null, cost: 1 },
  ocean: { id: "ocean", name: "Океан", imageUrl: null, cost: 1 },
};

/** Берег (0,0) → причал на воде (1,0) → океан (2,0)…(4,0) → остров (5,0). */
const cells: Record<string, CellInfo> = {
  "0,0": { terrainId: "grass" },
  "1,0": { terrainId: "water" },
  "2,0": { terrainId: "ocean" },
  "3,0": { terrainId: "ocean" },
  "4,0": { terrainId: "ocean" },
  "5,0": { terrainId: "grass" },
};

const berth = (o: Partial<ShipMark>): ShipMark => ({
  total: 2,
  busy: 1,
  free: 1,
  mine: false,
  big: true,
  mineBig: false,
  broken: 0,
  hp: 1000,
  hpMax: 1000,
  ...o,
});

const opts = (mark: ShipMark): RouteSearchOpts => ({
  playerPos: { q: 0, r: 0 },
  cells,
  terrains,
  ships: new Map([["1,0", mark]]),
});

describe("маршрут через океан", () => {
  it("большой на причале занят, свободен малый — пути нет, «Нет подходящего корабля»", () => {
    const o = opts(berth({ freeBig: false }));
    expect(routeTo(o, 5, 0)).toBeNull();
    expect(needsBigShip(o, [{ q: 5, r: 0 }])).toBe(true);
    expect(sayNeedBig(o, [{ q: 5, r: 0 }], (k) => k)).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("braid.ship_need_big");
  });

  it("свободный большой — маршрут через океан есть", () => {
    const path = routeTo(opts(berth({ freeBig: true })), 5, 0);
    expect(path?.map((s) => `${s.q},${s.r}`)).toEqual(["1,0", "2,0", "3,0", "4,0", "5,0"]);
  });

  it("пути нет вовсе (кораблей нет) — это не про размер судна", () => {
    const o: RouteSearchOpts = { ...opts(berth({})), ships: new Map() };
    expect(routeTo(o, 5, 0)).toBeNull();
    expect(needsBigShip(o, [{ q: 5, r: 0 }])).toBe(false);
  });
});

describe("проводка маршрута: посадка перед океаном", () => {
  const path = [
    { q: 1, r: 0 },
    { q: 2, r: 0 },
    { q: 3, r: 0 },
  ];
  const qcWith = (cell: Record<string, unknown>) => {
    const qc = new QueryClient();
    qc.setQueryData(SHIPS_KEY, {
      ships: [
        {
          q: 1,
          r: 0,
          total: 2,
          busy: 1,
          free: 1,
          mine: false,
          big: true,
          mineBig: false,
          broken: 0,
          hp: 1000,
          hpMax: 1000,
          ...cell,
        },
      ],
    });
    return qc;
  };

  it("свободный большой — садимся с пометкой «только в большой»", () => {
    const pilot = makeRoutePilot(
      qcWith({ freeBig: true }),
      { q: 0, r: 0 },
      { path, cells, terrains },
    );
    const s = pilot.step(path[0], true);
    expect(s).toMatchObject({ blocked: false, bigOnly: true });
  });

  it("большой заняли, пока шли, — встаём до посадки и траты", () => {
    const pilot = makeRoutePilot(
      qcWith({ freeBig: false }),
      { q: 0, r: 0 },
      { path, cells, terrains },
    );
    expect(pilot.step(path[0], true)).toEqual({ blocked: true, needBig: true });
  });

  it("за посадкой океана нет — малый годится, пометки нет", () => {
    const calm = { ...cells, "2,0": { terrainId: "water" }, "3,0": { terrainId: "water" } };
    const pilot = makeRoutePilot(
      qcWith({ freeBig: false }),
      { q: 0, r: 0 },
      { path, cells: calm, terrains },
    );
    expect(pilot.step(path[0], true)).toMatchObject({ blocked: false, bigOnly: false });
  });
});
