// Маленькая карта для тестов слоя беглецов и дельт: колонки как у настоящей
// (packCells), но на десяток клеток, чтобы applyCellPatches/readCellDetails
// работали по-боевому, а не через заглушки.
import type { MapDataV } from "@/components/beta-raid/mapBlob";
import type { PackedCells } from "@/components/beta-raid/unpackMap";

export type FixtureCell = {
  q: number;
  r: number;
  objectId?: string;
  runner?: boolean;
  defeated?: boolean;
};

/** Карта из перечисленных клеток (все с местностью «grass»). */
export function synthMap(cells: FixtureCell[], revision = 100, mapId = "rmap_t"): MapDataV {
  const objectIds: string[] = [];
  const idOf = (id: string) => {
    let i = objectIds.indexOf(id);
    if (i < 0) i = objectIds.push(id) - 1;
    return i;
  };
  const packed: PackedCells = {
    terrainIds: ["grass"],
    roadIds: [],
    objectIds,
    decorationIds: [],
    buildingIds: [],
    q: cells.map((c) => c.q),
    r: cells.map((c) => c.r),
    t: cells.map(() => 0),
    road: cells.map(() => -1),
    obj: cells.map((c) => (c.objectId ? idOf(c.objectId) : -1)),
    dec: cells.map(() => -1),
    bld: cells.map(() => -1),
    defeated: cells.flatMap((c, i) => (c.defeated ? [i] : [])),
    runners: cells.flatMap((c, i) => (c.runner ? [i] : [])),
    voidFog: [],
  };
  return {
    map: { id: mapId, name: "t", size: 8 },
    packed,
    terrains: {},
    objects: {},
    decorations: {},
    roads: {},
    revision,
    mapId,
  };
}
