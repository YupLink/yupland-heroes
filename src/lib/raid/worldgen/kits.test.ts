// Город мира по набору (владелец, 07.10.2026: «у всех рас всё есть — и
// ратуши свои; если деревня единорогов — только постройки из их коллекции;
// у входа табличка "Город такой-то"»).
import { beforeAll, describe, expect, it } from "vitest";
import { generateArea } from "@/lib/raid/worldgen/area";
import { makeWorld, type World } from "@/lib/raid/worldgen/field";
import { chunksOfSize } from "@/lib/raid/worldgen/geo";
import { kitTowns } from "@/lib/raid/worldgen/kits";
import { townCatalog } from "@/lib/raid/worldgen/town";
import type { TownKit, WorldArea } from "@/lib/raid/worldgen/spec";
import { DIRS, hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import { toRoleOptions } from "@/lib/raid/zonegen/town/roles";
import { REAL_CATALOG } from "@/test/realCatalog";
import { testSpec } from "@/test/worldSpec";

const OPTIONS = toRoleOptions(REAL_CATALOG);
const tpl = (name: string, effect: string) => {
  const o = REAL_CATALOG.find((c) => c.name === name && c.effect === effect);
  if (!o) throw new Error(name);
  return o;
};
const skinOf = (name: string, effect: string, theme: string) =>
  (tpl(name, effect).skins ?? []).find((s) => s.name === theme)?.id ?? null;
const look = (name: string, effect: string, theme: string | null, own = true) => ({
  t: tpl(name, effect).id,
  s: theme === null ? null : skinOf(name, effect, theme),
  n: 1,
  own,
});

const DRAGON: TownKit = {
  id: "kit_dragon",
  race: "Дракон",
  label: "Город Драконов",
  hall: { t: tpl("Ратуша", "town_hall").id, s: skinOf("Ратуша", "town_hall", "Дракон") },
  sign: { t: tpl("Табличка", "sign").id, s: null },
  terrains: [],
  looks: [
    look("Таверна", "tavern", "Дракон"),
    look("Храм", "boost", "Дракон"),
    look("Покои", "chambers", "Дракон"),
    look("Продуктовый - Рынок", "market", null),
    look("Склад", "warehouse", "Дракон"),
    // Общий склад «как у всех» — запасной: свой драконий есть.
    look("Склад", "warehouse", "Юпик", false),
  ],
  towns: ["Куна"],
};

describe("набор → город для роста", () => {
  const [town] = kitTowns([DRAGON], REAL_CATALOG, OPTIONS);
  const byRole = (role: string) => town.options.filter((o) => o.role === role);

  it("ратуша в облике набора, подпись и табличка — с набора", () => {
    expect(byRole("town_hall")[0]?.skins?.map((s) => s.name)).toEqual(["Дракон"]);
    expect(town).toMatchObject({ race: "Дракон", label: "Город Драконов" });
  });

  it("по роли — свои облики; общий только когда своего нет", () => {
    expect(byRole("warehouse")[0]?.skins?.map((s) => s.name)).toEqual(["Дракон"]);
  });

  it("облика больше нет в справочнике — постройка не встаёт голой", () => {
    const gone = {
      ...DRAGON,
      looks: [...DRAGON.looks, { t: tpl("Музей", "museum").id, s: "gone", n: 1, own: true }],
    };
    expect(
      kitTowns([gone], REAL_CATALOG, OPTIONS)[0].options.some((o) => o.role === "museum"),
    ).toBe(false);
  });

  it("без лавки или без облика ратуши набор в мир не идёт", () => {
    const noShop = { ...DRAGON, looks: DRAGON.looks.filter((l) => l.s !== null) };
    expect(kitTowns([noShop], REAL_CATALOG, OPTIONS)).toEqual([]);
    const noHall = { ...DRAGON, hall: { ...DRAGON.hall, s: "gone" } };
    expect(kitTowns([noHall], REAL_CATALOG, OPTIONS)).toEqual([]);
  });
});

describe("города мира по набору", () => {
  let world: World;
  let area: WorldArea;
  beforeAll(() => {
    const base = testSpec(11);
    world = makeWorld({ ...base, towns: { ...base.towns, kits: [DRAGON] } });
    area = generateArea(world, {
      chunks: chunksOfSize(128),
      bounds: { size: 128 },
      catalog: townCatalog(OPTIONS, REAL_CATALOG, kitTowns([DRAGON], REAL_CATALOG, OPTIONS)),
    });
  });
  const allowed = new Set([DRAGON.hall, ...DRAGON.looks].map((l) => `${l.t}|${l.s ?? ""}`));
  const signTpl = DRAGON.sign?.t;

  it("все постройки города — из набора, в его обликах", () => {
    const towns = [...world.cache.towns.values()];
    expect(towns.length).toBeGreaterThan(0);
    for (const t of towns)
      for (const s of t.structures) {
        if (typeof s.buildingId !== "string" || s.buildingId === signTpl) continue;
        expect(allowed.has(`${s.buildingId}|${s.buildingSkinId ?? ""}`)).toBe(true);
      }
  });

  it("у въезда — табличка «Город Драконов - имя»", () => {
    const cells = new Map(area.cells.map((c) => [keyOf(c), c]));
    for (const t of world.cache.towns.values()) {
      const signs = t.structures.filter((s) => s.buildingId === signTpl);
      expect(signs).toHaveLength(1);
      const at = cells.get(keyOf(signs[0]));
      expect(at?.buildingConfig).toEqual({ text: `Город Драконов - ${t.name}`, effect: "sign" });
      // Рядом с воротами города: у табличек на образце — у въезда.
      const near = t.structures.some(
        (s) =>
          typeof s.roadId === "string" &&
          DIRS.some(([dq, dr]) => s.q === signs[0].q + dq && s.r === signs[0].r + dr),
      );
      expect(near).toBe(true);
      expect(hexDist(signs[0], t.site)).toBeGreaterThan(1);
    }
  });
});
