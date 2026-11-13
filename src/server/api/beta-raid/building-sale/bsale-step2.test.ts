// Продажа построек, шаг 2: шаблоны построек (товар — шаблон, настроенный на
// карте), таблицы клетки (витрина плавильни едет с постройкой), цена в чертеже,
// разбор своей за половину цены.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dismantleRefund } from "@/lib/buildingSale";

const s = vi.hoisted(() => ({
  preset: null as Record<string, unknown> | null,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("FROM yuplink.raid_building_preset p")) return s.preset ? [s.preset] : [];
    if (sql.includes("FROM yuplink.raid_map_cells c")) {
      return [{ building_config: { effect: "building_shop" }, meta: null, name: "Лавка" }];
    }
    return [];
  },
}));

const { blueprintIdOf } = await import("./bsale-blueprint");
const { applyBuildingGood, assertBuildingForSale } = await import("./bsale-admin");
const { captureCellsSql, putCellsCtes } = await import("./bsale-cells-sql");
const { placeBuildingSql } = await import("./bsale-place-sql");
const { dismantleSql, dismantleVerdict } = await import("./bsale-dismantle-sql");

const flat = (x: string) => x.replace(/\s+/g, " ");

const smelter = {
  id: "bpre_1",
  name: "Плавильня",
  image: "/s.png",
  building_id: "building_smelt",
  building_skin_id: null,
  building_config: { effect: "market" },
  cells: { market_item: [{ kind: "recipe", name: "Слиток" }], market_shop: [] },
  meta: null,
  tpl_name: "Плавильня",
};

beforeEach(() => {
  s.preset = { ...smelter };
});

describe("разбор: назад половина цены", () => {
  it("целые — вниз, токен — дробью; «любой артефакт» и пустое — мимо", () => {
    expect(
      dismantleRefund([
        { resource: "gold", token: null, amount: 500 },
        { resource: "diamonds", token: null, amount: 5 },
        { resource: "token", token: "Darai", amount: 1.5 },
        { resource: "diamonds", token: null, amount: 1 },
        { resource: "art", token: "art_any_rare", amount: 2 },
      ]),
    ).toEqual([
      { resource: "gold", token: null, amount: 250 },
      { resource: "diamonds", token: null, amount: 2 },
      { resource: "token", token: "Darai", amount: 0.75 },
    ]);
    expect(dismantleRefund(null)).toEqual([]);
  });
});

describe("чертёж несёт цену и таблицы клетки", () => {
  const item = (amount: number, cells: unknown = null) => ({
    kind: "building" as const,
    refId: "building_smelt",
    name: "Плавильня",
    image: null,
    building: { skinId: null, config: null, cells: cells as never },
    priceResource: "gold" as const,
    priceToken: null,
    priceAmount: amount,
    price2Resource: null,
    price2Token: null,
    price2Amount: null,
    priceMore: [],
  });

  it("другая цена или другая витрина — другой чертёж", () => {
    expect(blueprintIdOf(item(100))).not.toBe(blueprintIdOf(item(200)));
    expect(blueprintIdOf(item(100))).not.toBe(blueprintIdOf(item(100, smelter.cells)));
    expect(blueprintIdOf(item(100))).toBe(blueprintIdOf(item(100)));
  });
});

describe("товар на шаблоне постройки", () => {
  const form = (presetId: string) => ({
    kind: "building",
    side: "buy",
    q: 1,
    r: 2,
    refId: null as string | null,
    name: "",
    image: null as string | null,
    building: { skinId: null, config: null, presetId } as {
      skinId: string | null;
      config: Record<string, unknown> | null;
      presetId?: string | null;
    } | null,
  });

  it("шаблон даёт постройку, имя и картинку; товар хранит только ссылку", async () => {
    const d = form("bpre_1");
    await applyBuildingGood(d, "m");
    expect(d.refId).toBe("building_smelt");
    expect(d.name).toBe("Плавильня");
    expect(d.image).toBe("/s.png");
    expect(d.building).toEqual({ skinId: null, config: null, presetId: "bpre_1" });
  });

  it("плавильня (маркет) продаётся; лавка построек и удалённый шаблон — нет", async () => {
    s.preset = { ...smelter, building_config: { effect: "building_shop" } };
    await expect(applyBuildingGood(form("bpre_1"), "m")).rejects.toThrow(/не продаются/);
    s.preset = null;
    await expect(applyBuildingGood(form("bpre_1"), "m")).rejects.toThrow(/больше нет/);
  });

  it("покупка снимает текущий шаблон: настройку и витрину", async () => {
    const got = await assertBuildingForSale("building_old", {
      skinId: null,
      config: null,
      presetId: "bpre_1",
    });
    expect(got.refId).toBe("building_smelt");
    expect(got.building.cells).toEqual(smelter.cells);
    s.preset = null;
    await expect(
      assertBuildingForSale("x", { skinId: null, config: null, presetId: "bpre_1" }),
    ).rejects.toThrow("market.bad_item");
  });
});

describe("таблицы клетки", () => {
  it("снимок — только таблицы поведения, без адреса и ратуши", () => {
    const market = flat(captureCellsSql("market", "m1", 3, 4));
    expect(market).toContain("FROM yuplink.raid_market_item x");
    expect(market).toContain("FROM yuplink.raid_market_shop x");
    expect(market).not.toContain("town_q");
    expect(market).not.toContain("raid_enchant_spell");
    expect(flat(captureCellsSql("enchant", "m1", 3, 4))).toContain("raid_enchant_spell");
    expect(captureCellsSql("field", "m1", 3, 4)).toBe("NULL::jsonb");
  });

  it("установка: новые id от ключа, умолчания базы, строка лавки заменяется", () => {
    const put = flat(putCellsCtes({ m: "'m1'", q: 3, r: 4, key: "'k1'" }).join(","));
    expect(put).toContain("'mkt_' || substr(md5('k1' || ':market_item:' || e.n), 1, 16)");
    expect(put).toContain("COALESCE(x.side, 'buy')");
    expect(put).toContain("ON CONFLICT (map_id, q, r) DO UPDATE SET");
    expect(put).toContain("town_q = NULL, town_r = NULL");
    expect(put).toMatch(/drop_market_shop AS \( DELETE FROM yuplink\.raid_market_shop/);
  });

  it("оператор установки кладёт витрину, цену и снимает прежнего хозяина", () => {
    const sql = flat(
      placeBuildingSql({
        mapId: "rmap_builders",
        q: 1,
        r: 2,
        account: "acc",
        heroId: "h",
        blueprintId: "bp_0123456789abcdef01234567",
        op: "bsale:acc:op",
      }),
    );
    expect(sql).toMatch(/wipe_market_item AS \( DELETE FROM yuplink\.raid_market_item x USING put/);
    expect(sql).toContain("put_market_item AS");
    expect(sql).toContain("retire AS ( UPDATE yuplink.raid_building_place_op x SET gone_at");
    expect(sql).toContain("plan.price FROM put, plan");
  });
});

describe("оператор разбора", () => {
  const sql = flat(
    dismantleSql({
      mapId: "rmap_builders",
      q: 5,
      r: 6,
      account: "acc",
      placeOp: "bsale:acc:op1",
      op: "bsdis:acc:op2",
      refund: [{ resource: "gold", token: null, amount: 250 }],
    }),
  );

  it("локи: карта, клетка, поле; своя — по ключу установки и аккаунту", () => {
    const keys = [...sql.slice(0, sql.indexOf("WITH")).matchAll(/hashtext\('([^']+)'\)/g)];
    expect(keys.map((k) => k[1])).toEqual([
      "godmove:rmap_builders",
      "chestcell:rmap_builders:5:6",
      "field:rmap_builders:5:6",
    ]);
    expect(sql).toContain("x.op = 'bsale:acc:op1' AND x.account_id = 'acc'");
    expect(sql).toContain("x.gone_at IS NULL");
  });

  it("ферма с героями/урожаем и полный склад — отказ; стирает всё по клетке", () => {
    expect(sql).toContain("w.hero_id IS NOT NULL OR COALESCE(w.accrued, 0) >= 1");
    expect(sql).toContain("s.count > 0");
    for (const t of [
      "raid_market_item",
      "raid_market_shop",
      "raid_enchant_spell",
      "raid_hero_rite",
    ])
      expect(sql).toContain(`DELETE FROM yuplink.${t} x USING clear`);
    expect(sql).toContain('\'[{"resource":"gold","token":null,"amount":250}]\'::jsonb');
  });

  it("ответ → ok / ключ отказа", () => {
    expect(dismantleVerdict({ done: true })).toBe("ok");
    expect(dismantleVerdict({ was: true })).toBe("ok");
    expect(dismantleVerdict({ own: false })).toBe("bsale.not_owner");
    expect(dismantleVerdict({ own: true, workers: true })).toBe("bsale.dis_workers");
    expect(dismantleVerdict({ own: true, goods: true })).toBe("bsale.dis_goods");
    expect(dismantleVerdict(null)).toBe("bsale.busy");
  });
});
