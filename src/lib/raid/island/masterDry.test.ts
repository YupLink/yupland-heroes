// Копия образца: сухопутные бойцы и клады не попадают в воду (владелец, 13.11.2026).
import { describe, expect, it } from "vitest";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import type { IslandPlaces } from "./steps";
import { keepOffWater, type DryBoss } from "./masterDry";

const W = "t_water";
const G = "t_grass";
const cell = (q: number, r: number, terrainId = G, extra: Partial<WorldCell> = {}): WorldCell =>
  ({ q, r, terrainId, roadId: null, objectId: null, objectConfig: null, decorationId: null, buildingId: null, mode: "built", ...extra }) as WorldCell;

// Ряд r=0: q 0..5 — суша, кроме воды на q=3 и q=4.
const cells = [0, 1, 2, 3, 4, 5].map((q) => cell(q, 0, q === 3 || q === 4 ? W : G));
const places = (over: Partial<IslandPlaces> = {}): IslandPlaces =>
  ({
    spawn: { q: 0, r: 0 }, chest: { q: 1, r: 0 }, workshop: { q: 1, r: 0 }, mine: { q: 1, r: 0 }, mines: [],
    trees: [], crystals: [], monsters: [], digs: [], treasure: { q: 1, r: 0 }, shipyard: null,
    artifact: null, pack: null, gift: false, portal: { q: 1, r: 0 }, hall: null, ...over,
  }) as IslandPlaces;
const boss = (q: number, r: number, cur: { q: number; r: number } | null = null, swims = false): DryBoss => ({ q, r, cur, swims });

describe("копия образца — не в воду", () => {
  it("сухопутный боец в воде, на образце стоит на суше — дом там, где стоит", () => {
    const r = keepOffWater(cells, [boss(3, 0, { q: 5, r: 0 })], places({ monsters: [{ q: 3, r: 0 }] }), new Set([W]));
    expect(r.bosses[0]).toMatchObject({ q: 5, r: 0, cur: null });
    expect(r.places.monsters).toEqual([{ q: 5, r: 0 }]);
  });

  it("сухопутный боец в воде без клетки на образце — ближайшая свободная суша", () => {
    const r = keepOffWater(cells, [boss(4, 0)], places({ monsters: [{ q: 4, r: 0 }] }), new Set([W]));
    expect(r.bosses[0]).toMatchObject({ q: 5, r: 0 });
    expect(r.places.monsters).toEqual([{ q: 5, r: 0 }]);
  });

  it("боец стоит в воде на образце — переезжает, клетку в воде очищают (cur)", () => {
    const r = keepOffWater(cells, [boss(4, 0, { q: 4, r: 0 })], places(), new Set([W]));
    expect(r.bosses[0]).toMatchObject({ q: 5, r: 0, cur: { q: 4, r: 0 } });
  });

  it("водный боец (краб, сирена) остаётся в воде", () => {
    const b = boss(3, 0, { q: 3, r: 0 }, true);
    const r = keepOffWater(cells, [b], places({ monsters: [{ q: 3, r: 0 }] }), new Set([W]));
    expect(r.bosses[0]).toBe(b);
    expect(r.places.monsters).toEqual([{ q: 3, r: 0 }]);
  });

  it("клад в воде — на сушу; на суше — на месте", () => {
    const r = keepOffWater(cells, [], places({ digs: [{ q: 2, r: 0 }, { q: 4, r: 0 }] }), new Set([W]));
    expect(r.places.digs).toEqual([{ q: 2, r: 0 }, { q: 5, r: 0 }]);
  });

  it("занятые клетки не берёт: два бойца — на разные клетки", () => {
    const r = keepOffWater(cells, [boss(3, 0), boss(4, 0)], places(), new Set([W]));
    const homes = r.bosses.map((b) => `${b.q},${b.r}`);
    expect(new Set(homes).size).toBe(2);
    expect(homes.every((h) => h !== "3,0" && h !== "4,0")).toBe(true);
  });

  it("горы — бойцам никому (и водным), и не цель переезда", () => {
    const hills = [0, 1, 2, 3].map((q) => cell(q, 1, q === 1 ? "t_hill" : G));
    const r = keepOffWater([...cells, ...hills], [boss(1, 1, null, true)], places(), new Set([W]), new Set(["t_hill"]));
    expect(r.bosses[0]).not.toMatchObject({ q: 1, r: 1 });
    const at = [...cells, ...hills].find((c) => c.q === r.bosses[0].q && c.r === r.bosses[0].r);
    expect(at?.terrainId).toBe(G);
  });

  it("боец без точки возрождения на горе — на сушу; водный без точки — в воде", () => {
    const grid = [...cells, cell(0, 1, "t_hill", { objectId: "boss:hamster" }), cell(1, 1), cell(4, 1, W, { objectId: "boss:crab" })];
    const r = keepOffWater(grid, [], places(), new Set([W]), new Set(["t_hill"]), new Set(["boss:crab"]));
    expect(r.loose.map((l) => `${l.from.q},${l.from.r}`)).toEqual(["0,1"]);
  });

  it("без воды — ничего не меняет", () => {
    const p = places({ digs: [{ q: 3, r: 0 }] });
    expect(keepOffWater(cells, [boss(3, 0)], p, new Set()).places).toBe(p);
  });
});
