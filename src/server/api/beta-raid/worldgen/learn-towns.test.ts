// Город мира с образца (владелец, 07.10.2026: «фонари посреди леса»): декор,
// что на образце стоит в городе, — городской, природа его не ставит; храмы и
// покои берут настройку с образца — только ключ своей функции.
import { describe, expect, it } from "vitest";
import { WORLD_VERSION } from "@/lib/raid/worldgen/spec";
import { buildSpec, type LearnRows } from "./learn";
import { townConfigs, townDecorIds, townDecorPlan, withoutTownDecor } from "./learn-towns";

const NEAR = [
  // Фонарь у ратуш на 67 % клеток — городской.
  { id: "d_lamp", n: 27, town: 16, hall: 18 },
  // «Мёд ель» — в основном в природе: остаётся лесом.
  { id: "d_honey_fir", n: 86, town: 19, hall: 4 },
  { id: "d_well", n: 3, town: 2, hall: 2 },
  // Две клетки — о декоре ничего не сказать.
  { id: "d_rare", n: 2, town: 2, hall: 2 },
];

describe("городской декор", () => {
  it("городской — тот, что в городе на образце не реже 60 % своих клеток", () => {
    expect([...townDecorIds(NEAR)].sort()).toEqual(["d_lamp", "d_well"]);
  });

  it("природа его больше не ставит, а густота леса считается без него", () => {
    const a = withoutTownDecor(
      {
        byTerrain: {
          forest: {
            total: 100,
            decorated: 40,
            pool: [
              { decorationId: "d_fir", n: 35 },
              { decorationId: "d_lamp", n: 5 },
            ],
          },
        },
        global: [
          { decorationId: "d_fir", n: 35 },
          { decorationId: "d_lamp", n: 5 },
        ],
      },
      new Set(["d_lamp"]),
    );
    expect(a.byTerrain.forest).toEqual({
      total: 100,
      decorated: 35,
      pool: [{ decorationId: "d_fir", n: 35 }],
    });
    expect(a.global.map((g) => g.decorationId)).toEqual(["d_fir"]);
  });

  it("у улиц — с густотой городов образца", () => {
    const plan = townDecorPlan(NEAR, 100, new Set(["d_lamp", "d_well"]));
    expect(plan).toEqual({ p: 0.18, ids: ["d_lamp", "d_well"], w: [18, 2] });
    expect(townDecorPlan(NEAR, 0, new Set(["d_lamp"]))).toBeNull();
  });
});

describe("настройки храмов и покоев", () => {
  it("только ключ своей функции, без повторов", () => {
    const out = townConfigs([
      { effect: "boost", cfg: { boost: { a: 1 }, portal: { group: 3 } } },
      { effect: "boost", cfg: { boost: { a: 1 } } },
      { effect: "chambers", cfg: { chambersPrices: [{ kind: "tickets", amount: 1 }] } },
      { effect: "spellbook", cfg: { boost: { a: 2 } } },
    ]);
    expect(out).toEqual({
      boost: [{ boost: { a: 1 } }],
      chambers: [{ chambersPrices: [{ kind: "tickets", amount: 1 }] }],
    });
  });
});

describe("выбор земель мира", () => {
  const rows: LearnRows = {
    terrains: [
      { id: "w", name: "Вода" },
      { id: "g", name: "трава" },
      { id: "s", name: "Снег" },
    ],
    stats: [
      { id: "w", n: 300, bld: 0, road: 0, free: 300, obj: 0 },
      { id: "g", n: 500, bld: 0, road: 0, free: 500, obj: 0 },
      { id: "s", n: 400, bld: 0, road: 0, free: 400, obj: 0 },
    ],
    core: [],
    objects: [],
    adjacency: [],
    towns: [],
    walk: [],
    road: null,
    affinity: { byTerrain: {}, global: [] },
    decorNear: NEAR,
    townFree: 100,
    configs: [{ effect: "boost", cfg: { boost: { a: 1 } } }],
  };

  it("из земель образца остаются отмеченные; пусто — все", () => {
    expect(buildSpec(rows, { seed: 1, lands: ["s"] }).land.map((l) => l.id)).toEqual(["s"]);
    expect(buildSpec(rows, { seed: 1, lands: null }).land.map((l) => l.id)).toEqual(["g", "s"]);
    expect(() => buildSpec(rows, { seed: 1, lands: ["w"] })).toThrow("worldgen.no_land");
  });

  it("в описании мира — городской декор и настройки с образца", () => {
    const spec = buildSpec(rows, { seed: 1 });
    expect(spec.v).toBe(WORLD_VERSION);
    expect(spec.towns.kits).toEqual([]);
    expect(spec.towns.decor?.ids).toEqual(["d_lamp", "d_well"]);
    expect(spec.towns.configs).toEqual({ boost: [{ boost: { a: 1 } }] });
  });
});
