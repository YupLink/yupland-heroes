// Город мира целиком (владелец, 07.10.2026: «постройки в диком разнобое, нет
// ратуш, нет смысловой состыковки; фонари посреди леса»): у каждого города
// ратуша, все постройки — в обликах одной расы, все рынки привязаны к ратуше,
// храм и покои с настройкой образца, городской декор — только у улиц.
import { beforeAll, describe, expect, it } from "vitest";
import { racesFromName } from "@/lib/raid/assetTags";
import { generateArea } from "@/lib/raid/worldgen/area";
import { raceTowns } from "@/lib/raid/worldgen/collections";
import { makeWorld, type World } from "@/lib/raid/worldgen/field";
import { chunksOfSize } from "@/lib/raid/worldgen/geo";
import { townCatalog } from "@/lib/raid/worldgen/town";
import type { WorldArea, WorldSpec } from "@/lib/raid/worldgen/spec";
import { DIRS, keyOf } from "@/lib/raid/zonegen/town/hex";
import { toRoleOptions } from "@/lib/raid/zonegen/town/roles";
import { REAL_CATALOG } from "@/test/realCatalog";
import { testSpec } from "@/test/worldSpec";

// Облики живого справочника с метками расы — как их ставит автоматика меток.
const TAGGED = REAL_CATALOG.map((o) => ({
  ...o,
  skins: (o.skins ?? []).map((s) => ({ ...s, races: racesFromName(s.name) })),
}));
const OPTIONS = toRoleOptions(TAGGED);
const CATALOG = townCatalog(
  OPTIONS,
  TAGGED,
  raceTowns(OPTIONS, new Map(OPTIONS.map((o) => [o.id, 10]))),
);
const BOOST = { boost: { effects: [{ stat: "attack", min: 1, max: 2, minutes: 60 }] } };
const REST = { chambersPrices: [{ kind: "tickets", amount: 1 }] };

let world: World;
let area: WorldArea;
beforeAll(() => {
  const base = testSpec(11);
  const spec: WorldSpec = {
    ...base,
    towns: {
      ...base.towns,
      configs: { boost: [BOOST], chambers: [REST] },
      decor: { p: 0.6, ids: ["d_lamp"], w: [1] },
    },
  };
  world = makeWorld(spec);
  area = generateArea(world, {
    chunks: chunksOfSize(128),
    bounds: { size: 128 },
    catalog: CATALOG,
  });
});

const skinRace = new Map(
  TAGGED.flatMap((o) => (o.skins ?? []).map((s) => [s.id, s.races ?? []] as const)),
);
const effectOf = new Map(TAGGED.map((o) => [o.id, o.effect]));

describe("город мира по расе", () => {
  it("коллекции рас собраны, у каждого города — ратуша", () => {
    expect(CATALOG.races.length).toBeGreaterThan(1);
    expect(area.towns.length).toBeGreaterThan(0);
    expect(area.towns.every((t) => t.hall)).toBe(true);
  });

  it("все постройки города — в обликах его расы (кроме ратуши без расовой)", () => {
    const towns = [...world.cache.towns.values()].filter((t) => t.race !== null);
    expect(towns.length).toBeGreaterThan(0);
    for (const t of towns) {
      for (const s of t.structures) {
        if (typeof s.buildingId !== "string") continue;
        if (s.buildingSkinId) expect(skinRace.get(s.buildingSkinId)).toContain(t.race);
        else expect(effectOf.get(s.buildingId)).toBe("town_hall");
      }
    }
  });

  it("каждый рынок города привязан к ратуше", () => {
    const shops = new Set(area.shops.map(keyOf));
    const markets = area.cells.filter(
      (c) => c.buildingId && effectOf.get(c.buildingId) === "market",
    );
    expect(markets.length).toBeGreaterThan(0);
    for (const m of markets) expect(shops.has(keyOf(m))).toBe(true);
  });

  it("храм и покои — с настройкой образца", () => {
    const own = area.cells.filter((c) => {
      const e = c.buildingId ? effectOf.get(c.buildingId) : null;
      return e === "boost" || e === "chambers";
    });
    expect(own.length).toBeGreaterThan(0);
    for (const c of own) {
      const e = effectOf.get(c.buildingId as string);
      expect(c.buildingConfig).toEqual(e === "boost" ? BOOST : REST);
    }
  });

  it("городской декор — только у улиц и домов", () => {
    const busy = new Set(area.cells.filter((c) => c.roadId || c.buildingId).map(keyOf));
    const lamps = area.cells.filter((c) => c.decorationId === "d_lamp");
    expect(lamps.length).toBeGreaterThan(0);
    for (const c of lamps) {
      expect(DIRS.some(([dq, dr]) => busy.has(keyOf({ q: c.q + dq, r: c.r + dr })))).toBe(true);
    }
  });
});
