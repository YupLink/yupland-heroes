// Регрессия на жалобу владельца 24.09.2026: «здание на здание прям закидывает,
// приходилось удалять, удалять, удалять».
//
// Проверяем не куски, а связку целиком: планировщик зоны → правки очереди
// кисти → повторный прогон. Городок нарочно тесный (13×13 при поперечнике 11),
// чтобы два прогона с разными сидами легли друг на друга — именно так владелец
// и получил кашу.
import { describe, expect, it } from "vitest";
import { planSettlements } from "@/lib/raid/zonegen/settlement";
import { queueCellsDraft } from "@/components/beta-raid/queueCells";
import type { CellDetails, DraftState } from "@/components/beta-raid/patchMapCache";
import type { ZoneStructure } from "@/lib/raid/zonegen/settlement-types";
import { field, input, key } from "@/test/settlementFixture";
import { clearPatches, toStructurePatches } from "./zoneGenHelpers";

/** Пустая карта: до генерации на клетках нет ничего. */
const BLANK: CellDetails = {
  terrainId: "grass",
  roadId: null,
  decorationId: null,
  objectId: null,
  buildingId: null,
  tier: 0,
  defeated: false,
  runner: false,
  voidFog: false,
  groupId: null,
  iconScale: null,
};

const town = (seed: number): ZoneStructure[] => {
  const inp = input(
    { layout: "ring", size: 11, density: 0.35, roadId: "r_road" },
    { cells: field(13, 13) },
  );
  return planSettlements({ ...inp, recipe: { ...inp.recipe, seed } }).structures;
};

/** Очередь кисти после пачки правок — тем же кодом, что и панель. */
const push = (draft: DraftState, patches: ReturnType<typeof toStructurePatches>): DraftState =>
  queueCellsDraft(
    draft,
    patches,
    () => BLANK,
    (p) => p,
  ).next;

describe("повторная генерация города", () => {
  it("не копит постройки: в очереди остаются дома только нового плана", () => {
    const one = town(1);
    const two = town(777);
    let draft: DraftState = { queue: {}, base: {} };
    // Первый прогон — как «Сгенерировать».
    draft = push(draft, toStructurePatches(one));
    // Второй — как «Перегенерировать»: снятие и постройка ОДНОЙ пачкой.
    draft = push(draft, [...clearPatches(one, two), ...toStructurePatches(two)]);

    const planned = new Set(two.filter((s) => s.buildingId).map(key));
    const inQueue = Object.keys(draft.queue).filter((k) => draft.queue[k].buildingId != null);
    expect(inQueue.sort()).toEqual([...planned].sort());
  });

  it("дом первого прогона не остаётся под улицей второго", () => {
    const one = town(1);
    const two = town(777);
    const streets = new Set(two.filter((s) => s.roadId).map(key));
    const buried = one.filter((s) => s.buildingId && streets.has(key(s)));
    // Если бы такие клетки не находились, тест ничего не проверял бы.
    expect(buried.length).toBeGreaterThan(0);
    const cleared = new Map(clearPatches(one, two).map((p) => [`${p.q},${p.r}`, p]));
    for (const s of buried) expect(cleared.get(key(s))?.buildingId).toBeNull();
  });

  it("под домом и под улицей декора не остаётся", () => {
    for (const s of town(1)) {
      if (s.buildingId != null || s.roadId != null) expect(s.decorationId).toBeNull();
    }
  });
});

describe("повторная генерация с обликами", () => {
  const one: ZoneStructure[] = [
    { q: 0, r: 0, buildingId: "tavern", tier: 3, buildingSkinId: "boar", decorationId: null },
    { q: 1, r: 0, buildingId: "hall", tier: 2, buildingSkinId: "boar", decorationId: null },
  ];
  // Второй прогон: на первой клетке улица, на второй другой дом без облика.
  const two: ZoneStructure[] = [
    { q: 0, r: 0, roadId: "r_road" },
    { q: 1, r: 0, buildingId: "warehouse", tier: 1, decorationId: null },
  ];

  const run = (): DraftState => {
    let draft: DraftState = { queue: {}, base: {} };
    draft = push(draft, toStructurePatches(one));
    return push(draft, [...clearPatches(one, two), ...toStructurePatches(two)]);
  };

  it("облик не переживает свой дом и не остаётся с его тиром", () => {
    const cell = run().queue["0,0"];
    expect(cell.buildingId).toBeNull();
    expect(cell.buildingSkinId).toBeNull();
    expect(cell.tier).toBeUndefined();
  });

  it("облик прошлого дома не переходит на новый дом", () => {
    const cell = run().queue["1,0"];
    expect(cell.buildingId).toBe("warehouse");
    expect(cell.buildingSkinId).toBeNull();
    expect(cell.tier).toBe(1);
  });
});
