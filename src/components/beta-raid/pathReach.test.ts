import { describe, expect, it } from "vitest";
import { pathReach, walkEnergy } from "./pathReach";
import type { DoorTollMap } from "./pathTolls";

const path = (costs: number[]) => costs.map((cost, i) => ({ q: i + 1, r: 0, cost }));

describe("pathReach — докуда хватит энергии", () => {
  it("хватает на всё — весь путь", () => {
    expect(pathReach(path([1, 1, 1]), 3)).toBe(3);
  });

  it("не хватает — столько шагов, сколько оплачено", () => {
    expect(pathReach(path([1, 1, 1, 1]), 2.5)).toBe(2);
  });

  it("не хватает даже на первый — 0", () => {
    expect(pathReach(path([2, 1]), 1.5)).toBe(0);
  });

  it("дробные шаги не теряют последний из-за хвоста дроби", () => {
    expect(pathReach(path(Array(9).fill(0.92)), 8.28)).toBe(9);
  });

  it("энергия двери входит в шаг на её клетку", () => {
    const tolls = {
      "2,0": {
        prices: [
          { resource: "energy", amount: 5 },
          { resource: "gold", amount: 100 },
        ],
      },
    } as unknown as DoorTollMap;
    expect(pathReach(path([1, 1, 1]), 6, tolls)).toBe(1);
    expect(pathReach(path([1, 1, 1]), 7, tolls)).toBe(2);
  });

  it("пустой путь — 0", () => {
    expect(pathReach([], 10)).toBe(0);
  });
});

describe("walkEnergy — энергия на дорогу (плашка и окно рубки)", () => {
  it("сумма цен шагов", () => {
    expect(walkEnergy(path([0.5, 1, 0.25]))).toBeCloseTo(1.75);
  });

  it("энергия двери на пути входит, прочие ресурсы двери — нет", () => {
    const tolls = {
      "2,0": {
        prices: [
          { resource: "energy", amount: 5 },
          { resource: "gold", amount: 100 },
        ],
      },
    } as unknown as DoorTollMap;
    expect(walkEnergy(path([1, 1, 1]), tolls)).toBe(8);
  });

  it("пустой путь — 0", () => {
    expect(walkEnergy([])).toBe(0);
  });
});
