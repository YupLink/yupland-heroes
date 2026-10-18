// Карта мира на сервере: местность сеткой, «Разведанное» по туману, в ответе
// нет ни мобов, ни артефактов, ни сундуков — только местность и постройки
// (каждая — меткой своего поведения).
import { describe, expect, it } from "vitest";
import { decodeRuns, WORLD_MARK_KINDS } from "@/lib/raid/worldMapCodec";
import { islandsMask, packWorldMap, type WorldMark } from "./world-map-pack";

/** Клетка основы карты со всем, что в ней бывает (map-base.RawCell). */
const cell = (q: number, r: number, t: string, extra: Record<string, unknown> = {}) => ({
  q,
  r,
  terrain_id: t,
  road_id: null,
  object_id: null,
  decoration_id: null,
  building_id: null,
  void_fog: false,
  ...extra,
});

// Остров 3×3 вокруг (0,0): вода по краю строки r=1, на (1,0) — моб-босс,
// на (−1,1) — артефакт с декором, (1,1) — под куполом.
const CELLS = [
  cell(-1, -1, "grass"),
  cell(0, -1, "grass"),
  cell(1, -1, "grass"),
  cell(-1, 0, "sand"),
  cell(0, 0, "sand"),
  cell(1, 0, "sand", { object_id: "boss_wolf_secret" }),
  cell(-1, 1, "water", { object_id: "artifact_ring_secret", decoration_id: "decor_tree" }),
  cell(0, 1, "water"),
  cell(1, 1, "water", { void_fog: true }),
];
const TERRAINS = [
  { id: "grass", name: "Трава", image_url: "/uploads/g.png" },
  { id: "sand", name: "Песок", image_url: null },
  { id: "water", name: "Вода", image_url: "/uploads/w.png" },
];
const MARKS: WorldMark[] = [
  { kind: "mine", q: -1, r: -1, group: null },
  { kind: "town", q: 0, r: 0, group: "g1" },
  { kind: "town", q: 1, r: 0, group: "g1" },
  { kind: "town", q: 0, r: 1, group: "g1" },
  { kind: "shop", q: 1, r: 1, group: null },
];

const grid = (w: ReturnType<typeof packWorldMap>) => decodeRuns(w.runs, w.cols * w.rows)!;
const at = (w: ReturnType<typeof packWorldMap>, q: number, r: number) =>
  grid(w)[(r - w.r0) * w.cols + (q - w.q0)];
const name = (w: ReturnType<typeof packWorldMap>, v: number) => w.terrains[v - 1]?.name;

describe("packWorldMap", () => {
  it("«Вся карта»: каждая клетка своей местностью, купол — тоже (это админ)", () => {
    const w = packWorldMap({
      mode: "all",
      cells: CELLS,
      terrains: TERRAINS,
      marks: [],
      treasures: [],
      seen: null,
    });
    expect({ q0: w.q0, r0: w.r0, cols: w.cols, rows: w.rows }).toEqual({
      q0: -1,
      r0: -1,
      cols: 3,
      rows: 3,
    });
    expect(name(w, at(w, 0, -1))).toBe("Трава");
    expect(name(w, at(w, 1, 0))).toBe("Песок");
    expect(name(w, at(w, 1, 1))).toBe("Вода");
    expect(w.terrains.map((t) => t.img)).toEqual(["/uploads/g.png", null, "/uploads/w.png"]);
  });

  it("«Разведанное»: только клетки из тумана, рамка по ним, купол вычеркнут", () => {
    // Разведаны строка r=0 целиком и (0..1, r=1) — но (1,1) под куполом.
    const w = packWorldMap({
      mode: "seen",
      cells: CELLS,
      terrains: TERRAINS,
      marks: [],
      treasures: [],
      seen: "0,-1,3;1,0,2",
    });
    expect({ q0: w.q0, r0: w.r0, cols: w.cols, rows: w.rows }).toEqual({
      q0: -1,
      r0: 0,
      cols: 3,
      rows: 2,
    });
    expect(at(w, -1, 0)).toBeGreaterThan(0);
    expect(at(w, 0, 1)).toBeGreaterThan(0);
    expect(at(w, -1, 1)).toBe(0); // не разведана
    expect(at(w, 1, 1)).toBe(0); // купол: игрок его не видит никогда
    // Травы в разведанном нет — нет её и в словаре.
    expect(w.terrains.map((t) => t.name)).toEqual(["Песок", "Вода"]);
  });

  it("ничего не разведано — пустой ответ", () => {
    const w = packWorldMap({
      mode: "seen",
      cells: CELLS,
      terrains: TERRAINS,
      marks: MARKS,
      treasures: [],
      seen: "",
    });
    expect(w.cols * w.rows).toBe(0);
    expect(w.marks).toEqual([]);
    expect(w.terrains).toEqual([]);
  });

  it("мобов, боссов, артефактов и декора в ответе нет вовсе", () => {
    for (const mode of ["all", "seen"] as const) {
      const w = packWorldMap({
        mode,
        cells: CELLS,
        terrains: TERRAINS,
        marks: MARKS,
        treasures: [],
        seen: "-1,-1,3;0,-1,3;1,-1,3",
      });
      const json = JSON.stringify(w);
      expect(json).not.toContain("boss_wolf_secret");
      expect(json).not.toContain("artifact_ring_secret");
      expect(json).not.toContain("decor_tree");
      expect(Object.keys(w).sort()).toEqual(
        ["cols", "marks", "mode", "q0", "r0", "rows", "runs", "terrains"].sort(),
      );
    }
  });

  it("метки — только на показанных клетках; блок — одной меткой посередине", () => {
    const all = packWorldMap({
      mode: "all",
      cells: CELLS,
      terrains: TERRAINS,
      marks: MARKS,
      treasures: [],
      seen: null,
    });
    // шахта, лавка (купол админу виден), город одной меткой на (0,0) — середина блока.
    expect(all.marks).toEqual([0, -1, -1, 1, 1, 1, 2, 0, 0]);
    const seen = packWorldMap({
      mode: "seen",
      cells: CELLS,
      terrains: TERRAINS,
      marks: MARKS,
      treasures: [],
      seen: "0,-1,3;1,0,2",
    });
    // Шахта на неразведанной клетке и лавка под куполом пропали; город — на (0,0).
    expect(seen.marks).toEqual([2, 0, 0]);
  });
});

describe("islandsMask", () => {
  it("острова за рамкой карты обрезаются, мусор пропускается", () => {
    const box = { q0: 0, r0: 0, cols: 4, rows: 2 };
    const m = islandsMask("0,-2,4;1,3,10;5,0,1;x,1,1;1,0,0", box);
    expect(Array.from(m)).toEqual([1, 1, 0, 0, 0, 0, 0, 1]);
  });
});

describe("packWorldMap: блок режима бога", () => {
  it("постройка блока — одной меткой, разные блоки — своими", () => {
    const w = packWorldMap({
      mode: "all",
      cells: CELLS,
      terrains: TERRAINS,
      marks: [
        { kind: "portal", q: -1, r: -1, group: "b1" },
        { kind: "portal", q: 0, r: -1, group: "b1" },
        { kind: "portal", q: 1, r: -1, group: "b2" },
        { kind: "other", q: -1, r: 0, group: null },
      ],
      treasures: [],
      seen: null,
    });
    const P = WORLD_MARK_KINDS.indexOf("portal");
    const O = WORLD_MARK_KINDS.indexOf("other");
    expect(w.marks).toEqual([O, -1, 0, P, -1, -1, P, 1, -1]);
  });
});
