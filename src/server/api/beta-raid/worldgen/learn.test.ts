// Мир учится у образца: вода по имени, земли областей без городской земли и
// обрывков, соседка для пятен, доли из исходного квадрата или по заказу,
// объекты — с наградой без денег, ратуши — из настроенных.
import { describe, expect, it } from "vitest";
import { buildSpec, type LearnRows } from "./learn";
import { cleanObjectConfig } from "./sanitize";

const rows = (over: Partial<LearnRows> = {}): LearnRows => ({
  terrains: [
    { id: "w", name: "Вода" },
    { id: "o", name: "Океан" },
    { id: "g", name: "трава" },
    { id: "s", name: "Снег" },
    { id: "city", name: "Черная земля" },
    { id: "tiny", name: "Радуга" },
  ],
  stats: [
    { id: "w", n: 300, bld: 0, road: 0, free: 300, obj: 30 },
    { id: "o", n: 900, bld: 0, road: 0, free: 900, obj: 0 },
    { id: "g", n: 500, bld: 10, road: 20, free: 300, obj: 60 },
    { id: "s", n: 400, bld: 5, road: 5, free: 200, obj: 20 },
    { id: "city", n: 200, bld: 40, road: 100, free: 50, obj: 0 },
    { id: "tiny", n: 20, bld: 0, road: 0, free: 20, obj: 0 },
  ],
  core: [
    { id: "w", n: 200 },
    { id: "g", n: 500 },
    { id: "s", n: 300 },
    { id: "city", n: 150 },
    { id: "tiny", n: 20 },
  ],
  objects: [
    {
      terrain: "g",
      id: "boss:rbt_1",
      n: 50,
      cfg: {
        rewardConfig: {
          items: [{ id: "art" }],
          packs: [{ id: "pk" }],
          split: [100],
          fillers: [
            { kind: "likes", amount: 5 },
            { kind: "token", token: "Darai", amount: 100 },
          ],
        },
      },
    },
    { terrain: "g", id: "chest:c1", n: 10, cfg: { maxHp: 1 } },
    { terrain: "w", id: "boss:rbt_crab", n: 30, cfg: null },
  ],
  adjacency: [
    { a: "g", b: "s", n: 40 },
    { a: "s", b: "g", n: 10 },
    { a: "g", b: "w", n: 99 },
  ],
  towns: [
    { config: { name: "Дур-Бан", residents: 500, rules: { markupPct: 30 }, goods: [] } },
    {
      config: {
        name: "Ирий",
        residents: 200,
        goods: [
          {
            id: "g1",
            kind: "custom",
            refId: "cst_x",
            token: null,
            operation: "both",
            marketPrice: 2,
            consumePerResident: 0.1,
            producePerDay: 5,
          },
        ],
      },
    },
  ],
  walk: ["d_flower", "d_flower"],
  road: "road_main",
  affinity: {
    byTerrain: { g: { total: 500, decorated: 150, pool: [{ decorationId: "d_tree", n: 150 }] } },
    global: [{ decorationId: "d_tree", n: 150 }],
    decorTerrains: { d_tree: ["g"] },
  },
  ...over,
});

describe("buildSpec", () => {
  it("вода и океан — по имени; земли — без городской земли и обрывков", () => {
    const spec = buildSpec(rows(), { seed: 1 });
    expect(spec.water).toEqual({ shallow: "w", ocean: "o" });
    expect(spec.land.map((l) => l.id)).toEqual(["g", "s"]);
    expect(spec.pair).toEqual({ g: "s", s: "g" });
    expect(spec.towns.roadId).toBe("road_main");
    // Проходимый декор — не стена лабиринта; ячейка лабиринта — по умолчанию.
    expect(spec.walk).toEqual(["d_flower"]);
    expect(spec.maze).toBe(14);
  });

  it("доли — из исходного квадрата; «суша, %» — архипелаг с водой у берега по пропорции образца", () => {
    const core = buildSpec(rows(), { seed: 1 }).shares;
    expect(core.land).toBeCloseTo(970 / 1170, 3);
    expect(core.shallow).toBeCloseTo(200 / 1170, 3);
    const arch = buildSpec(rows(), { seed: 1, landPct: 30 }).shares;
    expect(arch.land).toBe(0.3);
    expect(arch.shallow).toBeCloseTo(0.3 * (300 / 1120), 3);
  });

  it("декор — только с метками своей земли; объекты — шанс на свободной клетке", () => {
    const spec = buildSpec(rows(), { seed: 1 });
    expect(spec.decor.g).toEqual({ p: 0.3, ids: ["d_tree"], w: [150] });
    expect(spec.decor.s).toBeUndefined();
    expect(spec.objects.g.p).toBeCloseTo(0.2, 4);
    expect(spec.objects.g.pool.map((p) => p.id)).toEqual(["boss:rbt_1", "chest:c1"]);
    expect(spec.objects.w.pool).toEqual([{ id: "boss:rbt_crab", w: 30, cfg: null }]);
  });

  it("награда объекта — без токенов, предметов и паков", () => {
    const boss = buildSpec(rows(), { seed: 1 }).objects.g.pool[0];
    expect(boss.cfg).toEqual({
      rewardConfig: { items: [], packs: [], split: [100], fillers: [{ kind: "likes", amount: 5 }] },
    });
    expect(cleanObjectConfig("мусор")).toBeNull();
  });

  it("ратуши — только настроенные (жители и товары); имя образца не берётся", () => {
    const t = buildSpec(rows(), { seed: 1 }).towns.templates;
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ residents: 200 });
    expect(JSON.stringify(t)).not.toContain("Ирий");
  });

  it("без воды на образце — отказ, а не мир из одной суши", () => {
    expect(() =>
      buildSpec(rows({ stats: rows().stats.filter((s) => s.id !== "w") }), { seed: 1 }),
    ).toThrow("worldgen.no_water");
  });
});
