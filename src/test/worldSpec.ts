// Спецификация мира для тестов worldgen: три земли, вода и океан, декор и
// объекты по местности, один шаблон ратуши; справочник построек — живой
// (realCatalog), чтобы города росли как на карте.
import { computeLevels } from "@/lib/raid/worldgen/field";
import { WORLD_VERSION, type WorldSpec } from "@/lib/raid/worldgen/spec";
import { townCatalog } from "@/lib/raid/worldgen/town";
import { toRoleOptions } from "@/lib/raid/zonegen/town/roles";
import { REAL_CATALOG } from "@/test/realCatalog";

export const WATER = "t_water";
export const OCEAN = "t_ocean";
export const LANDS = ["t_grass", "t_snow", "t_sand"] as const;

export const GOODS = [
  {
    id: "g1",
    kind: "custom",
    refId: "cst_bread",
    token: null,
    operation: "both",
    marketPrice: 10,
    consumePerResident: 0.02,
    producePerDay: 5,
  },
];

export function testSpec(seed = 7, shares = { land: 0.8, shallow: 0.2 }): WorldSpec {
  return {
    v: WORLD_VERSION,
    seed,
    water: { shallow: WATER, ocean: OCEAN },
    land: [
      { id: "t_grass", w: 50 },
      { id: "t_snow", w: 30 },
      { id: "t_sand", w: 20 },
    ],
    pair: { t_grass: "t_sand", t_snow: "t_grass" },
    shares,
    levels: computeLevels(seed, shares),
    decor: {
      t_grass: { p: 0.3, ids: ["d_tree", "d_bush"], w: [3, 1] },
      t_snow: { p: 0.4, ids: ["d_fir"], w: [1] },
    },
    objects: {
      t_grass: {
        p: 0.2,
        pool: [
          { id: "boss:rbt_wolf", w: 3, cfg: { rewardConfig: { fillers: [] } } },
          { id: "chest:chest_a", w: 1, cfg: { maxHp: 1 } },
        ],
      },
      [WATER]: { p: 0.1, pool: [{ id: "boss:rbt_crab", w: 1, cfg: null }] },
    },
    walk: ["d_bush"],
    maze: 14,
    towns: {
      spacing: 30,
      roadId: "road_main",
      templates: [{ residents: 200, rules: { markupPct: 30 }, goods: GOODS }],
      configs: {},
      decor: null,
      kits: [],
    },
    decorRaces: {},
  };
}

export const TEST_CATALOG = townCatalog(toRoleOptions(REAL_CATALOG), REAL_CATALOG);
