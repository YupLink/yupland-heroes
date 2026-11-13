// Продажа построек (lib/buildingSale): чертёж по содержимому, стопка рюкзака,
// оператор установки (локи, ключ нажатия, правила клетки, постройка с настройкой
// чертежа) и проверки товара в лавке построек.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILDING_REFUSALS,
  blueprintOfStack,
  buildingCellReason,
  buildingFactsReason,
  buildingStackKey,
  canonJson,
  parseBuildingGood,
} from "@/lib/buildingSale";

const s = vi.hoisted(() => ({
  shopEffect: "building_shop" as string | null,
  tpl: { name: "Площадка", meta: { effect: "field", tiers: [{ imageUrl: "/t.png" }] } } as {
    name: string;
    meta: unknown;
  } | null,
  skin: null as { name: string; image: string } | null,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("FROM yuplink.raid_map_cells c")) {
      return [{ building_config: { effect: s.shopEffect }, meta: null, name: "Лавка" }];
    }
    if (sql.includes("FROM yuplink.mystic_item_template")) {
      return s.tpl ? [{ name: s.tpl.name, meta: s.tpl.meta, image_url: null }] : [];
    }
    if (sql.includes("FROM yuplink.raid_building_skin")) return s.skin ? [s.skin] : [];
    return [];
  },
}));

const { blueprintIdOf, forBackpack } = await import("./bsale-blueprint");
const { applyBuildingGood, assertBuildingForSale } = await import("./bsale-admin");
const { placeBuildingSql, buildingPlaceVerdict } = await import("./bsale-place-sql");
const { factCol } = await import("./bsale-rules-sql");

const flat = (x: string) => x.replace(/\s+/g, " ");

beforeEach(() => {
  s.shopEffect = "building_shop";
  s.tpl = { name: "Площадка", meta: { effect: "field", tiers: [{ imageUrl: "/t.png" }] } };
  s.skin = null;
});

describe("чертёж и стопка", () => {
  const item = (config: Record<string, unknown> | null) => ({
    kind: "building" as const,
    refId: "building_x",
    name: "Ферма",
    image: null,
    building: { skinId: "sk1", config: config as never },
    priceResource: "gold" as const,
    priceToken: null,
    priceAmount: 500,
    price2Resource: "diamonds" as const,
    price2Token: null,
    price2Amount: 5,
    priceMore: [],
  });

  it("id — от содержимого: порядок ключей не важен, другая настройка — другой чертёж", () => {
    const a = blueprintIdOf(item({ effect: "field", field: { yield: 5, maxHeroes: 3 } }));
    const b = blueprintIdOf(item({ field: { maxHeroes: 3, yield: 5 }, effect: "field" }));
    const c = blueprintIdOf(item({ effect: "field", field: { yield: 6, maxHeroes: 3 } }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^bp_[0-9a-f]{24}$/);
  });

  it("в рюкзак — стопкой чертежа, прочие товары как есть", () => {
    const it = item({ effect: "field" });
    expect(forBackpack(it).refId).toBe(blueprintIdOf(it));
    const custom = { ...it, kind: "custom" as const };
    expect(forBackpack(custom).refId).toBe("building_x");
    const key = buildingStackKey(blueprintIdOf(it));
    expect(blueprintOfStack(key)).toBe(blueprintIdOf(it));
    expect(blueprintOfStack("building:../x")).toBeNull();
    expect(blueprintOfStack("vein:gold")).toBeNull();
  });

  it("canonJson сортирует ключи и пропускает undefined", () => {
    expect(canonJson({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe('{"a":{"c":[2,1]},"b":1}');
    expect(parseBuildingGood('{"skinId":" s ","config":[1]}')).toEqual({
      skinId: "s",
      config: null,
    });
  });
});

describe("правила клетки", () => {
  it("первая причина по порядку; дальше трёх клеток — far", () => {
    expect(buildingFactsReason(null)).toBe("bsale.no_cell");
    expect(buildingFactsReason({ "bsale.decor": true, "bsale.road": true })).toBe("bsale.road");
    expect(buildingFactsReason({})).toBeNull();
    expect(buildingCellReason({ dq: 4, dr: 0, facts: {} })).toBe("bsale.far");
    expect(buildingCellReason({ dq: 1, dr: 1, facts: {} })).toBeNull();
  });
});

describe("оператор установки", () => {
  const sql = flat(
    placeBuildingSql({
      mapId: "rmap_builders",
      q: 17,
      r: 33,
      account: "acc_1",
      heroId: "hero_1",
      blueprintId: "bp_0123456789abcdef01234567",
      op: "bsale:acc_1:op123456",
    }),
  );

  it("локи до WITH: карта, рюкзак, клетка и шахта", () => {
    const locks = sql.slice(0, sql.indexOf("WITH prior"));
    const keys = [...locks.matchAll(/hashtext\('([^']+)'\)/g)].map((m) => m[1]);
    expect(keys).toEqual([
      "godmove:rmap_builders",
      "bp:hero_1",
      "chestcell:rmap_builders:17:33",
      "mine:rmap_builders:17:33",
    ]);
  });

  it("постройка из чертежа — только на пустую клетку и вместе со штукой и ключом", () => {
    expect(sql).toContain("raid_building_place_op WHERE op = 'bsale:acc_1:op123456'");
    expect(sql).toContain("stack_key = 'building:bp_0123456789abcdef01234567'");
    expect(sql).toContain("SET building_id = plan.building_id");
    expect(sql).toContain("building_config = plan.building_config");
    expect(sql).toContain("AND c.building_id IS NULL");
    // Первым тиром (владелец: «сразу улучшенные — так нельзя») и с ростом edit_seq.
    expect(sql).toContain("INSERT INTO yuplink.beta_raid_building_state");
    expect(sql).toContain("SELECT 'rmap_builders', 17, 33, 0, now(), 'bsale' FROM put");
    expect(sql).toContain("SET edit_seq = COALESCE(mp.edit_seq, 0) + 1 FROM put");
    expect(sql).toContain("JOIN yuplink.mystic_item_template t ON t.id = p.building_id");
    expect(sql).toMatch(/dec AS \(.*FROM item, put/);
    expect(sql).toMatch(/mark AS \(.*FROM put/);
    for (const k of BUILDING_REFUSALS) expect(sql).toContain(`AS ${factCol(k)}`);
  });

  it("ответ → ок / отказ по признаку", () => {
    expect(buildingPlaceVerdict({ was: true })).toBe("ok");
    expect(buildingPlaceVerdict(null)).toBe("bsale.busy");
    expect(buildingPlaceVerdict({ box: false })).toBe("bsale.no_item");
    expect(buildingPlaceVerdict({ box: true, [factCol("bsale.hero")]: true })).toBe("bsale.hero");
  });
});

describe("товар в лавке построек", () => {
  const form = (o: Record<string, unknown> = {}) => ({
    kind: "building",
    side: "buy",
    q: 1,
    r: 2,
    refId: "building_x" as string | null,
    name: "",
    image: null as string | null,
    building: { skinId: null, config: { effect: "field" } } as {
      skinId: string | null;
      config: Record<string, unknown> | null;
    } | null,
    ...o,
  });

  it("имя и картинка — шаблона, если своих нет", async () => {
    const d = form();
    await applyBuildingGood(d, "m");
    expect(d.name).toBe("Площадка");
    expect(d.image).toBe("/t.png");
  });

  it("постройку продаёт только лавка построек, а лавка построек — только постройки", async () => {
    s.shopEffect = "market";
    await expect(applyBuildingGood(form(), "m")).rejects.toThrow(/Продажа построек/);
    s.shopEffect = "building_shop";
    await expect(applyBuildingGood(form({ kind: "custom" }), "m")).rejects.toThrow(
      /только постройки/,
    );
  });

  it("шахта и скупка — отказ; облик проверяется", async () => {
    await expect(
      applyBuildingGood(form({ building: { skinId: null, config: { effect: "mine" } } }), "m"),
    ).rejects.toThrow(/Архитектор/);
    await expect(applyBuildingGood(form({ side: "sell" }), "m")).rejects.toThrow(/покупки/);
    for (const effect of ["portal", "town_hall", "building_shop"]) {
      await expect(
        applyBuildingGood(form({ building: { skinId: null, config: { effect } } }), "m"),
      ).rejects.toThrow(/не продаются/);
    }
    await expect(
      applyBuildingGood(form({ building: { skinId: "nope", config: null } }), "m"),
    ).rejects.toThrow(/облика/);
    await expect(
      assertBuildingForSale("building_x", { skinId: null, config: { effect: "mine" } }),
    ).rejects.toThrow("market.bad_item");
  });
});
