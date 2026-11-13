// Ломбард героев: сданный в «Любой … герой» встаёт на витрину покупки той же
// лавки по цене выплата × наценка ГЕРОЕВ (своя колонка, по умолчанию ×5);
// наценка артефактов — прежняя и героев не касается.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketItem } from "@/lib/marketItem";

const st = vi.hoisted(() => ({
  sqls: [] as string[],
  markup: null as number | null,
  paid: [] as string[][],
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sqls.push(sql);
    return sql.includes("AS markup") && st.markup != null ? [{ markup: st.markup }] : [];
  },
}));
vi.mock("./market-payout-meta", () => ({
  payoutMeta: async (_res: string, t: string) => ({ name: `Герой ${t}`, image: `/img/${t}` }),
}));
vi.mock("./god-map", () => ({ godMapId: async () => "map1" }));
vi.mock("../../auth", () => ({ getCurrentWallet: () => null, isAdminWallet: () => false }));
vi.mock("./hero-pawn-drop", () => ({
  payPawnHeroes: async (o: { heroes: Array<{ op: string }>; shop: { q: number; r: number } }) => {
    st.paid.push(o.heroes.map((x) => x.op));
    return { ...o.shop, items: [{ name: "Яблоко", image: null, count: 3 }], arts: 1 };
  },
}));

const { relistPawned, pawnMarkupFor, savePawnMarkup, isPawnBuyout, pawnKindOf, settlePawn } =
  await import("./market-pawn");

const item = (o: Partial<MarketItem> = {}) =>
  ({
    id: "mkt_h",
    q: 3,
    r: 4,
    side: "sell",
    kind: "hero",
    refId: "hero_any_rare",
    name: "Любой редкий герой",
    priceResource: "gold",
    priceToken: null,
    priceAmount: 100,
    ...o,
  }) as MarketItem;

beforeEach(() => {
  st.sqls = [];
  st.markup = null;
  st.paid = [];
});

describe("какие скупки перепродаются", () => {
  it("«Любой … герой» на скупке — ломбард героев; именной герой и витрина покупки — нет", () => {
    expect(pawnKindOf(item())).toBe("hero");
    expect(isPawnBuyout(item())).toBe(true);
    expect(isPawnBuyout(item({ refId: "hero_tpl" }))).toBe(false);
    expect(isPawnBuyout(item({ side: "buy" }))).toBe(false);
    expect(pawnKindOf(item({ kind: "art", refId: "art_any_rare" }))).toBe("art");
  });
});

describe("наценка героев", () => {
  it("читается из своей колонки; нет строки — ×5", async () => {
    expect(await pawnMarkupFor("map1", 3, 4, "hero")).toBe(5);
    expect(st.sqls[0]).toContain("SELECT pawn_hero_markup AS markup");
    await pawnMarkupFor("map1", 3, 4);
    expect(st.sqls[1]).toContain("SELECT pawn_markup AS markup");
  });

  it("не ниже ×1: запись ниже — отказ, мусор в базе ниже ×1 — читается как ×5", async () => {
    await expect(savePawnMarkup("map1", 3, 4, 0.5, "hero")).rejects.toThrow(/не меньше ×1/);
    await expect(savePawnMarkup("map1", 3, 4, 0.5)).rejects.toThrow(/не меньше ×1/);
    expect(st.sqls).toHaveLength(0);
    await savePawnMarkup("map1", 3, 4, 1, "hero");
    expect(st.sqls).toHaveLength(1);
    st.markup = 0.5;
    expect(await pawnMarkupFor("map1", 3, 4, "hero")).toBe(5);
    st.markup = 1;
    expect(await pawnMarkupFor("map1", 3, 4)).toBe(1);
  });

  it("запись — в свою колонку, наценку артефактов не трогает", async () => {
    await savePawnMarkup("map1", 3, 4, 7, "hero");
    expect(st.sqls[0]).toContain(", pawn_hero_markup, updated_at)");
    expect(st.sqls[0]).toContain("SET pawn_hero_markup = EXCLUDED.pawn_hero_markup");
    expect(st.sqls[0]).not.toContain("pawn_markup =");
  });
});

describe("перепродажа сданного героя", () => {
  it("тот же шаблон на витрине покупки: цена = выплата × наценка героев, вид hero", async () => {
    st.markup = 3;
    await relistPawned({ mapId: "map1", item: item(), templateIds: ["hero_A"] });
    const sql = st.sqls.find((s) => s.includes("INSERT INTO yuplink.raid_market_item")) ?? "";
    expect(sql).toContain("side='buy' AND kind='hero' AND ref_id='hero_A'");
    expect(sql).toContain("price_amount=300");
    expect(sql).toContain("'hero', 'hero_A', 1, 'Герой hero_A'");
    expect(sql).toContain("id LIKE 'pawn\\_%'");
  });

  it("по умолчанию ×5; два одинаковых — запас 2 одной позицией", async () => {
    await relistPawned({ mapId: "map1", item: item(), templateIds: ["hero_A", "hero_A"] });
    const ins = st.sqls.filter((s) => s.includes("INSERT INTO yuplink.raid_market_item"));
    expect(ins).toHaveLength(1);
    expect(ins[0]).toContain("price_amount=500");
    expect(ins[0]).toContain("SET stock = COALESCE(stock, 0) + 2");
  });

  it("обычная скупка героя не перепродаётся", async () => {
    await relistPawned({ mapId: "map1", item: item({ refId: "hero_A" }), templateIds: ["hero_A"] });
    expect(st.sqls).toHaveLength(0);
  });
});

describe("после выплаты (settlePawn)", () => {
  const hero = { op: "mkt-sell:1", itemId: "ugi_1", templateId: "hero_A" };
  const relists = () => st.sqls.filter((x) => x.includes("INSERT INTO yuplink.raid_market_item"));

  const who = { wallet: "w1", account: "acc1" };

  it("сделка целиком — снимок героя закрыт, рюкзак высыпан, герой на витрине", async () => {
    const drop = await settlePawn({
      ...who,
      mapId: "map1",
      item: item(),
      receipt: { paidHeroes: [hero] },
      minRatio: 1,
    });
    expect(st.paid).toEqual([["mkt-sell:1"]]);
    expect(relists()).toHaveLength(1);
    expect(drop).toEqual({ q: 3, r: 4, items: [{ name: "Яблоко", image: null, count: 3 }], arts: 1 });
  });

  it("выплата дошла не целиком — снимок закрыт, но не перепродаём", async () => {
    await settlePawn({
      ...who,
      mapId: "map1",
      item: item(),
      receipt: { paidHeroes: [hero] },
      minRatio: 0,
    });
    expect(st.paid).toEqual([["mkt-sell:1"]]);
    expect(relists()).toHaveLength(0);
  });

  it("артефакт — без отметки героев, перепродажа как раньше", async () => {
    const art = item({ kind: "art", refId: "art_any_rare" });
    const receipt = { paidArts: [{ id: "ugi_a", templateId: "art_A" }] };
    expect(await settlePawn({ ...who, mapId: "map1", item: art, receipt, minRatio: 1 })).toBeNull();
    expect(st.paid).toEqual([]);
    expect(relists()[0]).toContain("kind='art' AND ref_id='art_A'");
  });
});
