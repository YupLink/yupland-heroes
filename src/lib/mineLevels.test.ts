// Уровни шахт v2 (§8.74): добыча и цена по уровням, предел вида, уровень из
// настройки клетки (как SQL raid_mine_level), стандарт и конфиг клетки с уровнем,
// остров — без уровней, живой пендинг по стандарту базы.
import { describe, expect, it } from "vitest";
import {
  MINE_LEVEL_YIELD,
  mineLevelOf,
  mineLevelYield,
  mineMaxLevel,
  mineUpgradeCost,
} from "./mineLevels";
import { mineStdYield } from "./mineV2";
import { cellMineConfig } from "./mineConfig";
import { mineV2PendingArgs } from "./mineV2Row";

describe("mineLevels", () => {
  it("добыча в час по уровням — слово владельца 23.10, золото — 26.10", () => {
    expect(MINE_LEVEL_YIELD).toEqual({
      wood: [10, 20, 30, 50],
      stone: [1, 5, 10, 20],
      gold: [5, 10, 25, 50],
      diamonds: [1, 2, 3, 5],
    });
  });

  it("цена шага: дерево/камень/золото 1/2/5 алмазов, алмаз 1000/5000/10000 золота", () => {
    expect([1, 2, 3].map((l) => mineUpgradeCost("gold", l))).toEqual([
      { diamonds: 1 },
      { diamonds: 2 },
      { diamonds: 5 },
    ]);
    expect([1, 2, 3].map((l) => mineUpgradeCost("wood", l))).toEqual([
      { diamonds: 1 },
      { diamonds: 2 },
      { diamonds: 5 },
    ]);
    expect([1, 2, 3].map((l) => mineUpgradeCost("stone", l))).toEqual([
      { diamonds: 1 },
      { diamonds: 2 },
      { diamonds: 5 },
    ]);
    expect([1, 2, 3].map((l) => mineUpgradeCost("diamonds", l))).toEqual([
      { gold: 1000 },
      { gold: 5000 },
      { gold: 10000 },
    ]);
    expect(mineUpgradeCost("wood", 4)).toBeNull();
  });

  it("предел — 4 уровня у всех видов", () => {
    for (const k of ["wood", "stone", "gold", "diamonds"] as const) expect(mineMaxLevel(k)).toBe(4);
    expect(mineUpgradeCost("gold", 4)).toBeNull();
  });

  it("уровень из настройки: целое 1..99, иначе 1", () => {
    expect(mineLevelOf({ mineLevel: 3 })).toBe(3);
    expect(mineLevelOf({ mineLevel: "2" })).toBe(2);
    for (const bad of [
      null,
      {},
      { mineLevel: 0 },
      { mineLevel: 1.5 },
      { mineLevel: "x" },
      { mineLevel: 100 },
    ]) {
      expect(mineLevelOf(bad)).toBe(1);
    }
  });

  it("выше предела — последний уровень (как SQL)", () => {
    expect(mineLevelYield("stone", 9)).toBe(20);
    expect(mineLevelYield("gold", 3)).toBe(25);
    expect(mineLevelYield("gold", 9)).toBe(50);
    expect(mineLevelYield("diamonds", 0)).toBe(1);
  });

  it("стандарт и конфиг клетки — по уровню; остров — без уровней", () => {
    expect(mineStdYield("wood", false, 3)).toBe(30);
    expect(mineStdYield("wood", true, 3)).toBe(1);
    expect(cellMineConfig({ resource: "stone", mineLevel: 2, captureCost: 10 }, null)?.yield).toBe(
      5,
    );
    expect(cellMineConfig({ resource: "gold", captureCost: 10 }, null)?.yield).toBe(5);
    expect(cellMineConfig({ resource: "gold", mineLevel: 4, captureCost: 10 }, null)?.yield).toBe(
      50,
    );
  });

  it("живой пендинг — по стандарту базы, если он есть", () => {
    const base = {
      resource: "wood" as const,
      mode: "mid" as const,
      accrueFromMs: 0,
      breakAt: 3_600_000 * 10,
    };
    expect(mineV2PendingArgs({ ...base, std: 30 }).yield).toBe(60);
    expect(mineV2PendingArgs({ ...base, std: null }).yield).toBe(20);
    expect(mineV2PendingArgs(base).yield).toBe(20);
  });
});
