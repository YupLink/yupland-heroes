// Откуда везём: здание и декор в блоке — от клетки, где они стоят, где бы ни
// тапнули (вектор = цель − ведущая); клетки блока — все, цели — сдвиг всех.
// Окно клетки по пустому члену декоративного блока — окно декора.
import { describe, expect, it } from "vitest";
import type { PackedCells } from "@/components/beta-raid/unpackMap";
import type { MapLike } from "@/components/beta-raid/patchMapCache";
import { leadOf, unitCells, unitTargets } from "@/components/beta-raid/god-move/godMoveLead";
import { blockInspectCell } from "@/components/beta-raid/mergeSelect";

function synth(size: number): PackedCells {
  const q: number[] = [];
  const r: number[] = [];
  for (let rr = 0; rr < size; rr++)
    for (let qq = 0; qq < size; qq++) {
      q.push(qq);
      r.push(rr);
    }
  const n = q.length;
  return {
    terrainIds: ["grass"],
    roadIds: [],
    objectIds: [],
    decorationIds: ["oak"],
    buildingIds: ["town_hall"],
    q,
    r,
    t: new Array(n).fill(0),
    road: new Array(n).fill(-1),
    obj: new Array(n).fill(-1),
    dec: new Array(n).fill(-1),
    bld: new Array(n).fill(-1),
    defeated: [],
    runners: [],
    voidFog: [],
  };
}

const idx = (q: number, r: number) => r * 6 + q;

/** Блок (3,2)+(3,3)+(4,3): постройка на (3,2), декор на (4,3). */
function town(): MapLike {
  const p = synth(6);
  p.bld[idx(3, 2)] = 0;
  p.dec[idx(4, 3)] = 0;
  p.groupIds = ["g_town"];
  p.groups = [idx(3, 2), 0, 120, idx(3, 3), 0, 120, idx(4, 3), 0, 120];
  return {
    packed: p,
    terrains: {},
    roads: {},
    objects: {},
    decorations: {},
    buildings: {},
  } as MapLike;
}

describe("перенос: ведущая клетка и клетки блока", () => {
  it("здание блока — от клетки постройки, декор блока — от клетки декора, где бы ни взяли", () => {
    const map = town();
    const b = leadOf(map, { q: 3, r: 3, kind: "building" as const });
    expect(b).toMatchObject({ q: 3, r: 2, block: true });
    expect(leadOf(map, { q: 3, r: 2, kind: "decor" as const })).toMatchObject({
      q: 4,
      r: 3,
      block: true,
    });
  });

  it("вне блока и для объекта, сундука, мешочков — своя клетка, не блок", () => {
    const map = town();
    expect(leadOf(map, { q: 0, r: 0, kind: "building" as const })).toEqual({
      q: 0,
      r: 0,
      kind: "building",
    });
    expect(leadOf(map, { q: 3, r: 3, kind: "object" as const })).toEqual({
      q: 3,
      r: 3,
      kind: "object",
    });
  });

  it("клетки и цели блока: вектор = цель − ведущая", () => {
    const map = town();
    const f = leadOf(map, { q: 3, r: 3, kind: "building" as const });
    expect(unitCells(map, f)).toEqual([
      { q: 3, r: 2 },
      { q: 3, r: 3 },
      { q: 4, r: 3 },
    ]);
    expect(unitTargets(map, f, { q: 4, r: 2 })).toEqual([
      { q: 4, r: 2 },
      { q: 4, r: 3 },
      { q: 5, r: 3 },
    ]);
    expect(unitTargets(map, { q: 0, r: 0, kind: "chest" }, { q: 1, r: 1 })).toEqual([
      { q: 1, r: 1 },
    ]);
  });

  it("окно по пустому члену декоративного блока — окно декора", () => {
    const map = town();
    const p = (map as { packed: PackedCells }).packed;
    p.bld[idx(3, 2)] = -1;
    expect(blockInspectCell(map, 3, 2)).toEqual({ q: 4, r: 3 });
    expect(blockInspectCell(map, 4, 3)).toEqual({ q: 4, r: 3 });
  });
});
