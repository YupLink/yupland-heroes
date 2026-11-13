// Отметка шахты по дельте карты (§8.59 п. 9): поставили шахту — стена сразу,
// без F5 и без перекачки снимка; сняли — проход открыт. Лестница та же, что у
// сервера: эффект клетки → эффект шаблона из словаря → имя.
import { describe, expect, it } from "vitest";
import { isMineEntry, mineAfterPatch, type BuildingEntry } from "./packedMines";
import { applyCellPatches, type MapLike } from "./patchMapCache";
import { changedRows } from "./packedDelta";
import type { PackedCells } from "./unpackMap";

const dict: Record<string, BuildingEntry> = {
  building_mill: { name: "Лесопилка", effect: "mine" },
  building_shop: { name: "Лавка Алхимика", effect: "market" },
  "skin:s1": { name: "Ворота", effect: "mine" },
};
const entryOf = (id: string) => dict[id];

describe("isMineEntry", () => {
  it("эффект шаблона из словаря; клетка главнее; без поля — по имени", () => {
    expect(isMineEntry(dict.building_mill, null)).toBe(true);
    expect(isMineEntry(dict.building_shop, null)).toBe(false);
    expect(isMineEntry(dict.building_shop, { effect: "mine" })).toBe(true);
    expect(isMineEntry(dict.building_mill, { effect: "field" })).toBe(false);
    // Запись снимка с effect: null — «эффекта нет», имя «Шахта» не угадываем.
    expect(isMineEntry({ name: "Шахта", effect: null }, null)).toBe(false);
    // Запись кисти админа (без поля effect) — по имени, как сервер.
    expect(isMineEntry({ name: "Каменная Шахта" }, null)).toBe(true);
    expect(isMineEntry(undefined, { effect: "mine" })).toBe(true);
    expect(isMineEntry(undefined, null)).toBe(false);
  });
});

describe("mineAfterPatch", () => {
  it("снятая постройка — не шахта; новая — по словарю", () => {
    expect(mineAfterPatch({ q: 0, r: 0, buildingId: null }, entryOf, "building_mill")).toBe(false);
    expect(mineAfterPatch({ q: 0, r: 0, buildingId: "building_mill" }, entryOf, null)).toBe(true);
    expect(mineAfterPatch({ q: 0, r: 0, buildingId: "building_shop" }, entryOf, null)).toBe(false);
  });

  it("та же постройка без настроек — прежняя отметка (эффект клетки правка не несёт)", () => {
    const same = { q: 0, r: 0, buildingId: "building_shop" };
    expect(mineAfterPatch(same, entryOf, "building_shop")).toBeUndefined();
  });

  it("только настройки — по постройке, что стояла; с облика — по его записи", () => {
    const cfg = { q: 0, r: 0, buildingConfig: { effect: "mine" } };
    expect(mineAfterPatch(cfg, entryOf, "building_shop")).toBe(true);
    expect(mineAfterPatch({ q: 0, r: 0, buildingConfig: {} }, entryOf, "skin:s1")).toBe(true);
    expect(mineAfterPatch(cfg, entryOf, null)).toBeUndefined();
  });

  it("дельта сервера: настройки урезаны до эффекта; {} и null — решает шаблон", () => {
    // Админ снял эффект «шахта» с лавки (admin-batch-journal шлёт {} без эффекта).
    expect(mineAfterPatch({ q: 0, r: 0, buildingConfig: {} }, entryOf, "building_shop")).toBe(
      false,
    );
    expect(mineAfterPatch({ q: 0, r: 0, buildingConfig: null }, entryOf, "building_mill")).toBe(
      true,
    );
    // Снятый купол (map-lifted): постройка, облик и эффект клетки разом.
    const lifted = {
      q: 0,
      r: 0,
      voidFog: false,
      buildingId: "building_shop",
      buildingSkinId: "s1",
      buildingConfig: { effect: "mine" },
    };
    expect(mineAfterPatch(lifted, entryOf, null)).toBe(true);
    expect(mineAfterPatch({ ...lifted, buildingConfig: null }, entryOf, null)).toBe(false);
  });

  it("правка без постройки (тир, объект, купол) отметку не трогает", () => {
    expect(mineAfterPatch({ q: 0, r: 0, tier: 2 }, entryOf, "building_mill")).toBeUndefined();
    expect(mineAfterPatch({ q: 0, r: 0, objectId: "boss:x" }, entryOf, null)).toBeUndefined();
  });
});

function line(): PackedCells {
  const none = [-1, -1, -1];
  return {
    terrainIds: ["grass"],
    roadIds: [],
    objectIds: [],
    decorationIds: [],
    buildingIds: ["building_shop"],
    q: [0, 1, 2],
    r: [0, 0, 0],
    t: [0, 0, 0],
    road: none,
    obj: none,
    dec: none,
    bld: [-1, -1, 0],
    defeated: [],
    runners: [],
    voidFog: [],
  };
}

const map = (): NonNullable<MapLike> => ({
  packed: line(),
  buildings: dict as Record<string, unknown>,
});

describe("applyCellPatches ведёт список шахт", () => {
  it("поставили шахту — в списке; сняли — нет", () => {
    const placed = applyCellPatches(map(), [{ q: 1, r: 0, buildingId: "building_mill" }]);
    expect(placed?.packed?.mines).toEqual([1]);
    const gone = applyCellPatches(placed, [{ q: 1, r: 0, buildingId: null }]);
    expect(gone?.packed?.mines).toEqual([]);
  });

  it("лавке назначили эффект шахты в режиме бога — стена", () => {
    const cfg = applyCellPatches(map(), [{ q: 2, r: 0, buildingConfig: { effect: "mine" } }]);
    expect(cfg?.packed?.mines).toEqual([2]);
  });

  it("без перемен в шахтах список не переписывается", () => {
    const before = map();
    const after = applyCellPatches(before, [{ q: 0, r: 0, tier: 1 }]);
    expect(after?.packed?.mines).toBeUndefined();
  });

  it("сменилась только отметка шахты — строка клетки перестраивается", () => {
    const prev = line();
    const next = { ...prev, mines: [2] };
    expect(changedRows(prev, next)).toEqual([2]);
  });
});
