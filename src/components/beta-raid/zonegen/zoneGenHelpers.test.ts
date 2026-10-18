// Хелперы панели зоны: ключи → клетки, патчи → правки, случайный рецепт.
import { describe, expect, it } from "vitest";
import { defaultRecipe } from "@/lib/raid/zonegen/recipe";
import type { CellPatch } from "@/lib/raid/mapDelta";
import {
  busyFromDraft,
  cellsFromKeys,
  clampNum,
  clearPatches,
  nextLayer,
  randomRecipe,
  structureKeys,
  toCellPatches,
  toStructurePatches,
} from "./zoneGenHelpers";

describe("cellsFromKeys", () => {
  it("читает «q,r» и выбрасывает мусор", () => {
    expect(cellsFromKeys(new Set(["1,2", "-3,0", "x,1", ""]))).toEqual([
      { q: 1, r: 2 },
      { q: -3, r: 0 },
    ]);
  });
});

describe("toCellPatches", () => {
  it("несёт местность и декор как есть, null стирает декор", () => {
    expect(
      toCellPatches([
        { q: 0, r: 0, terrainId: "sand", decorationId: "palm" },
        { q: 1, r: 0, terrainId: "water", decorationId: null },
      ]),
    ).toEqual([
      { q: 0, r: 0, terrainId: "sand", decorationId: "palm" },
      { q: 1, r: 0, terrainId: "water", decorationId: null },
    ]);
  });
});

describe("toStructurePatches", () => {
  it("тир едет вместе с постройкой, дорога — как прислали", () => {
    expect(
      toStructurePatches([
        { q: 0, r: 0, buildingId: "hall", tier: 3 },
        { q: 1, r: 0, roadId: "road" },
      ]),
    ).toEqual([
      { q: 0, r: 0, buildingId: "hall", tier: 3 },
      { q: 1, r: 0, roadId: "road" },
    ]);
  });

  it("тир без постройки не ставится: очередь всё равно его сотрёт", () => {
    expect(toStructurePatches([{ q: 2, r: 2, tier: 2 }])).toEqual([{ q: 2, r: 2 }]);
  });

  it("снятие постройки едет как null, а не пропуском поля", () => {
    expect(toStructurePatches([{ q: 3, r: 3, buildingId: null }])).toEqual([
      { q: 3, r: 3, buildingId: null },
    ]);
  });
});

describe("toStructurePatches: декор под домом", () => {
  it("стирает декор вместе с постановкой дома", () => {
    expect(
      toStructurePatches([{ q: 4, r: 4, buildingId: "hall", tier: 2, decorationId: null }]),
    ).toEqual([{ q: 4, r: 4, buildingId: "hall", tier: 2, decorationId: null }]);
  });

  it("не трогает декор, если генератор о нём молчит", () => {
    expect(toStructurePatches([{ q: 5, r: 5, roadId: "road" }])).toEqual([
      { q: 5, r: 5, roadId: "road" },
    ]);
  });
});

describe("structureKeys", () => {
  it("помнит клетки прошлой генерации ключами «q,r»", () => {
    const keys = structureKeys([
      { q: 1, r: 2, buildingId: "hall" },
      { q: -1, r: 0, roadId: "road" },
    ]);
    expect([...keys].sort()).toEqual(["-1,0", "1,2"]);
  });
});

describe("clearPatches", () => {
  it("клетки в новом плане нет — снимает и дом, и дорогу", () => {
    const prev = [{ q: 3, r: 4, buildingId: "hall", roadId: "road" }];
    expect(clearPatches(prev, [])).toEqual([{ q: 3, r: 4, buildingId: null, roadId: null }]);
  });

  it("на месте прошлого двора новая улица — дом снимаем, дорогу нет", () => {
    // Ровно это и копилось: патч улицы не содержит buildingId, и дом прошлого
    // прогона оставался в очереди ПОД новой мостовой.
    const prev = [{ q: 1, r: 1, buildingId: "hall" }];
    const next = [{ q: 1, r: 1, roadId: "road" }];
    expect(clearPatches(prev, next)).toEqual([{ q: 1, r: 1, buildingId: null }]);
  });

  it("клетка не изменилась — правки нет: очередь не растёт на пустом месте", () => {
    const same = [{ q: 2, r: 2, buildingId: "hall", tier: 2 }];
    expect(clearPatches(same, same)).toEqual([]);
  });
});

describe("busyFromDraft", () => {
  const queue: Record<string, CellPatch> = {
    "0,0": { q: 0, r: 0, buildingId: "hand-made" },
    "1,1": { q: 1, r: 1, buildingId: "mine-from-last-run" },
    "2,2": { q: 2, r: 2, terrainId: "sand" },
    "3,3": { q: 3, r: 3, buildingId: null },
    "4,4": { q: 4, r: 4, objectId: "chest" },
  };

  it("берёт постройки и объекты и не берёт свои же прошлые", () => {
    expect(busyFromDraft(queue, new Set(["1,1"]), 100)).toEqual([
      { q: 0, r: 0 },
      { q: 4, r: 4 },
    ]);
  });

  it("не отдаёт больше потолка: сервер столько не примет", () => {
    expect(busyFromDraft(queue, new Set(), 1)).toHaveLength(1);
  });

  it("берёт только клетки выделения: чужая очередь места в потолке не занимает", () => {
    expect(busyFromDraft(queue, new Set(), 100, new Set(["4,4"]))).toEqual([{ q: 4, r: 4 }]);
  });
});

describe("randomRecipe", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const prev = { ...defaultRecipe("a", 7), scale: 33, decorRate: 0.5 };

  it("берёт 2–4 разных местности, веса 10–60, сохраняет ручки", () => {
    for (let i = 0; i < 50; i++) {
      const r = randomRecipe(ids, prev);
      expect(r.layers.length).toBeGreaterThanOrEqual(2);
      expect(r.layers.length).toBeLessThanOrEqual(4);
      expect(new Set(r.layers.map((l) => l.terrainId)).size).toBe(r.layers.length);
      for (const l of r.layers) {
        expect(ids).toContain(l.terrainId);
        expect(l.weight).toBeGreaterThanOrEqual(10);
        expect(l.weight).toBeLessThanOrEqual(60);
      }
      expect(r.scale).toBe(33);
      expect(r.decorRate).toBe(0.5);
    }
  });

  it("справочник из одной местности — один слой; пустой — прежний рецепт", () => {
    expect(randomRecipe(["only"], prev).layers).toEqual([
      { terrainId: "only", weight: expect.any(Number) as number },
    ]);
    expect(randomRecipe([], prev)).toBe(prev);
  });

  it("детерминирован при заданном rnd", () => {
    const rnd = () => 0.5;
    expect(randomRecipe(ids, prev, rnd).layers).toEqual(randomRecipe(ids, prev, rnd).layers);
  });
});

describe("nextLayer", () => {
  it("первая незанятая местность, потом первая по кругу", () => {
    expect(nextLayer(["a", "b"], [{ terrainId: "a", weight: 1 }])).toEqual({
      terrainId: "b",
      weight: 20,
    });
    expect(
      nextLayer(
        ["a", "b"],
        [
          { terrainId: "a", weight: 1 },
          { terrainId: "b", weight: 1 },
        ],
      ),
    ).toEqual({ terrainId: "a", weight: 20 });
    expect(nextLayer([], [])).toBeNull();
  });
});

describe("clampNum", () => {
  it("режет в границы, мусор → нижняя", () => {
    expect(clampNum("150", 0, 100)).toBe(100);
    expect(clampNum(-5, 0, 100)).toBe(0);
    expect(clampNum("abc", 2, 80)).toBe(2);
    expect(clampNum("1.5", 0, 3)).toBe(1.5);
  });
});

describe("облик темы в правках", () => {
  it("облик едет в том же патче, что и постройка", () => {
    expect(
      toStructurePatches([{ q: 0, r: 1, buildingId: "tavern", tier: 2, buildingSkinId: "boar" }]),
    ).toEqual([{ q: 0, r: 1, buildingId: "tavern", tier: 2, buildingSkinId: "boar" }]);
  });

  it("облик без постройки не едет — картинка-призрак без механики", () => {
    expect(toStructurePatches([{ q: 0, r: 2, roadId: "road", buildingSkinId: "boar" }])).toEqual([
      { q: 0, r: 2, roadId: "road" },
    ]);
  });

  it("дом с обликом ушёл — облик снимается отдельной правкой перед домом", () => {
    const prev = [{ q: 1, r: 1, buildingId: "tavern", buildingSkinId: "boar" }];
    expect(clearPatches(prev, [])).toEqual([
      { q: 1, r: 1, buildingSkinId: null },
      { q: 1, r: 1, buildingId: null },
    ]);
  });

  it("на клетке новый дом без облика — снимаем только облик", () => {
    const prev = [{ q: 2, r: 1, buildingId: "tavern", buildingSkinId: "boar" }];
    const next = [{ q: 2, r: 1, buildingId: "warehouse" }];
    expect(clearPatches(prev, next)).toEqual([{ q: 2, r: 1, buildingSkinId: null }]);
  });

  it("новый дом со своим обликом — снимать нечего, его правка перепишет", () => {
    const prev = [{ q: 3, r: 1, buildingId: "tavern", buildingSkinId: "boar" }];
    const next = [{ q: 3, r: 1, buildingId: "tavern", buildingSkinId: "dragon" }];
    expect(clearPatches(prev, next)).toEqual([]);
  });
});
