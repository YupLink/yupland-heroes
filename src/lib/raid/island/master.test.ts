// Остров-образец (владелец, 04.11.2026; 05.11: «реально унифицированным — где она
// что поставит — должно появляться у новичков»): копия образца — та же земля,
// дороги, постройки, цели обучения, бойцы, дубы, камни и клады на тех же местах;
// сундук — по подарку аккаунта; урок у озера — только короткому.
import { describe, expect, it } from "vitest";
import { hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import {
  ISLAND_DECOR,
  ISLAND_MINES,
  ISLAND_OBJECTS,
  islandMineConfig,
} from "@/lib/raid/island/catalog";
import { islandFromMaster, type MasterIsland } from "@/lib/raid/island/master";
import { isWater, make, reach } from "@/lib/raid/island/island.fixture";

const src = make(11);
const master: MasterIsland = {
  mapId: "isle_master",
  name: src.townName,
  cells: src.cells.map((c) => ({ ...c })),
  places: src.places,
  halls: src.halls,
};
const copy = islandFromMaster(master, 777, { gift: true });
const by = (cells: typeof copy.cells) => new Map(cells.map((c) => [keyOf(c), c]));
const was = by(master.cells);

describe("остров по образцу", () => {
  it("земля, дороги, постройки и цели обучения — как у образца", () => {
    expect(copy.cells).toHaveLength(master.cells.length);
    for (const c of copy.cells) {
      const m = was.get(keyOf(c))!;
      expect([c.terrainId, c.roadId, c.buildingId, c.tier]).toEqual([
        m.terrainId,
        m.roadId,
        m.buildingId,
        m.tier,
      ]);
    }
    const p = copy.places;
    for (const k of ["spawn", "chest", "workshop", "mine", "treasure", "portal", "hall"] as const)
      expect(p[k]).toEqual(src.places[k]);
    expect(p.mines).toEqual(src.places.mines);
    expect(copy.halls).toBe(master.halls);
    expect(copy.townName).toBe(src.townName);
  });

  it("клетки — как у образца (кроме сундука); бойцы и клады — на своих местах", () => {
    const p = copy.places;
    expect(p.monsters).toEqual(src.places.monsters);
    expect(p.digs).toEqual(src.places.digs);
    const cells = by(copy.cells);
    for (const c of master.cells) {
      if (keyOf(c) === keyOf(p.chest)) continue;
      const n = cells.get(keyOf(c))!;
      expect([n.objectId, n.decorationId, n.roadId, n.buildingId]).toEqual([
        c.objectId,
        c.decorationId,
        c.roadId,
        c.buildingId,
      ]);
    }
    expect(cells.get(keyOf(p.chest))!.objectId).toBe(ISLAND_OBJECTS.chest);
  });

  it("дубы и камни задания — те, что стоят у образца, ближние к старту первыми", () => {
    const oaks = master.cells.filter((c) => c.decorationId === ISLAND_DECOR.oak).map(keyOf);
    const stones = master.cells.filter((c) => c.decorationId === ISLAND_DECOR.stone).map(keyOf);
    expect(copy.places.trees.map(keyOf).sort()).toEqual([...oaks].sort());
    expect(copy.places.crystals.map(keyOf).sort()).toEqual([...stones].sort());
    const d = copy.places.trees.map((t) => hexDist(t, copy.places.spawn));
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });

  it("дуб, убранный с образца, не возвращается; дорога на его месте цела", () => {
    const [gone] = master.places.trees;
    const redrawn: MasterIsland = {
      ...master,
      cells: master.cells.map((c) =>
        keyOf(c) === keyOf(gone) ? { ...c, decorationId: null, roadId: "road_kai" } : c,
      ),
    };
    const out = islandFromMaster(redrawn, 777, { gift: true });
    const cell = by(out.cells).get(keyOf(gone))!;
    expect([cell.decorationId, cell.roadId]).toEqual([null, "road_kai"]);
    expect(out.places.trees.some((t) => keyOf(t) === keyOf(gone))).toBe(false);
  });

  it("боец — по точке возрождения: тот, что поставили, на своей клетке; сошедший — не копия", () => {
    const [home, other] = master.places.monsters;
    const stray = master.cells.find(
      (c) => !c.objectId && !c.buildingId && !c.roadId && !c.decorationId && !isWater(c.terrainId),
    )!;
    const moved: MasterIsland = {
      ...master,
      // Боец первой точки ушёл на чужую клетку, второй убит (клетка пуста).
      cells: master.cells.map((c) =>
        keyOf(c) === keyOf(home) || keyOf(c) === keyOf(other)
          ? { ...c, objectId: null, objectConfig: null }
          : c === stray
            ? { ...c, objectId: "boss:rbt_custom", objectConfig: { maxHp: 5 } }
            : c,
      ),
      bosses: [
        { ...home, cur: stray, objectId: "boss:rbt_custom", objectConfig: { maxHp: 5 } },
        { ...other, cur: other, objectId: "boss:rbt_second", objectConfig: { maxHp: 7 } },
      ],
    };
    const out = by(islandFromMaster(moved, 777, { gift: true }).cells);
    expect(out.get(keyOf(home))!.objectId).toBe("boss:rbt_custom");
    expect(out.get(keyOf(other))!.objectConfig).toEqual({ maxHp: 7 });
    expect(out.get(keyOf(stray))!.objectId).toBeNull();
  });

  it("шахта, переставленная на образце, — цель задания там, где стоит, с настройкой острова", () => {
    const old = master.places.mine;
    const spot = master.cells.find(
      (c) => !c.objectId && !c.buildingId && !c.roadId && !c.decorationId && !isWater(c.terrainId),
    )!;
    const moved: MasterIsland = {
      ...master,
      cells: master.cells.map((c) =>
        keyOf(c) === keyOf(old)
          ? { ...c, buildingId: null, buildingConfig: null }
          : c === spot
            ? {
                ...c,
                buildingId: ISLAND_MINES.wood,
                buildingConfig: { yield: 1, resource: "wood" },
              }
            : c,
      ),
    };
    const out = islandFromMaster(moved, 777, { gift: true });
    expect(out.places.mine).toEqual({ q: spot.q, r: spot.r });
    expect(by(out.cells).get(keyOf(spot))!.buildingConfig).toEqual(islandMineConfig("wood"));
  });

  it("убитый боец без точки возрождения — встаёт, клетка не меняется", () => {
    const [boss] = master.places.monsters;
    const bare: MasterIsland = {
      ...master,
      cells: master.cells.map((c) =>
        keyOf(c) === keyOf(boss) ? { ...c, objectId: null, objectConfig: null } : c,
      ),
    };
    const out = by(islandFromMaster(bare, 777, { gift: true }).cells);
    expect(out.get(keyOf(boss))!.objectId?.startsWith("boss:")).toBe(true);
  });

  it("боец, поставленный вне задания без точки возрождения, — копируется", () => {
    const spot = master.cells.find(
      (c) => !c.objectId && !c.buildingId && !c.roadId && !c.decorationId && !isWater(c.terrainId),
    )!;
    const extra: MasterIsland = {
      ...master,
      cells: master.cells.map((c) =>
        c === spot ? { ...c, objectId: "boss:rbt_extra", objectConfig: { maxHp: 9 } } : c,
      ),
    };
    const out = by(islandFromMaster(extra, 777, { gift: true }).cells);
    expect(out.get(keyOf(spot))!.objectId).toBe("boss:rbt_extra");
  });

  it("до каждой цели можно дойти (боссы, сундук, дубы и камни — проходимы на время)", () => {
    const seen = reach(copy, true);
    const p = copy.places;
    for (const c of [p.chest, p.workshop, p.portal, ...p.monsters, ...p.trees, ...p.crystals])
      expect(seen.has(keyOf(c)) || [...seen].some((k) => adjacent(k, c))).toBe(true);
  });

  it("тот же сид — тот же остров; подарок и урок — по аккаунту", () => {
    const again = islandFromMaster(master, 777, { gift: true });
    expect(again.places).toEqual(copy.places);
    // Другой сид — тот же остров: от сида ничего не зависит.
    expect(islandFromMaster(master, 4242, { gift: true }).places).toEqual(copy.places);
    const noGift = islandFromMaster(master, 777, { gift: false });
    expect(noGift.places.gift).toBe(false);
    expect(copy.places.lesson).toBeUndefined();
  });
});

function adjacent(k: string, c: { q: number; r: number }): boolean {
  const [q, r] = k.split(",").map(Number);
  const dq = q - c.q;
  const dr = r - c.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1;
}
