// Маршрут «сошёл с борта, шагнул дальше — и вернулся к своему судну».
//
// Жалоба 20.09: «была на корабле, сделала ход на 2 шага вперёд, теперь не могу
// двигаться — пишет, что до свободного корабля не добраться». Сервер после
// схода оставляет судно СВОБОДНЫМ на воде, а шаг на свободное судно = посадка.
// Поэтому по свежим причалам путь обратно есть всегда; отказ рождается только
// из протухшего кэша, где своё судно ещё «занято» (busy 1, mine true). Этот
// тест фиксирует обе половины — чтобы правка useCellTap (перечитать причалы
// на отказе) опиралась на проверенную семантику поиска.
import { describe, expect, it } from "vitest";
import { findWalkablePath, type ShipMap } from "./usePathfinding";
import type { CellInfo, TerrainInfo } from "./hexStepCost";
import type { ShipMark } from "./drawShips";

const terrains: Record<string, TerrainInfo> = {
  land: { id: "land", name: "Трава", imageUrl: null, cost: 1 },
  water: { id: "water", name: "Вода", imageUrl: null, cost: 1 },
};

/** Прямая: B(0,0) суша ← герой, A(1,0) суша, W(2,0) вода с судном, X(3,0) и Y(4,0) вода. */
const line = (): Record<string, CellInfo> => ({
  "0,0": { terrainId: "land" },
  "1,0": { terrainId: "land" },
  "2,0": { terrainId: "water" },
  "3,0": { terrainId: "water" },
  "4,0": { terrainId: "water" },
});

const mark = (free: number, busy: number, mine: boolean): ShipMark => ({
  total: 1,
  busy,
  free,
  mine,
  big: false,
  mineBig: false,
  broken: 0,
  hp: 700,
  hpMax: 1000,
});

const path = (cells: Record<string, CellInfo>, ships: ShipMap, toQ: number) =>
  findWalkablePath(0, 0, toQ, 0, cells, terrains, undefined, false, ships);

describe("возврат к судну после «сход + шаг»", () => {
  it("свежие причалы (судно свободно): путь к судну и дальше в море есть", () => {
    const ships: ShipMap = new Map([["2,0", mark(1, 0, false)]]);
    const cells = line();
    expect(path(cells, ships, 2)?.map((s) => `${s.q},${s.r}`)).toEqual(["1,0", "2,0"]);
    // Сел на свободное судно — дальше плывём: X и Y достижимы.
    expect(path(cells, ships, 4)?.map((s) => `${s.q},${s.r}`)).toEqual([
      "1,0",
      "2,0",
      "3,0",
      "4,0",
    ]);
  });

  it("протухший кэш (своё судно ещё «занято»): пути нет — ровно тупик из жалобы", () => {
    const ships: ShipMap = new Map([["2,0", mark(0, 1, true)]]);
    const cells = line();
    expect(path(cells, ships, 2)).toBeNull();
    expect(path(cells, ships, 4)).toBeNull();
  });

  it("без причалов вода непроходима пешком", () => {
    expect(path(line(), new Map(), 3)).toBeNull();
  });
});
