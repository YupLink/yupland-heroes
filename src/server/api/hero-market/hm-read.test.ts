// Рынок героев: выдача лотов (фильтры, «мои», страницы), вид лота (статы карточкой,
// артефакты с местом и износом, итог продажи только своему) и подсказка «кого можно
// выставить» — в том же порядке причин, что у функции базы.
import { describe, expect, it } from "vitest";
import { lotSql, lotsInputSchema, lotsSql, lotsWhere } from "./hm-lots-sql";
import { lotView, type LotRow } from "./hm-view";
import { sellableReason, sellableSql, type SellableRow } from "./hm-sellable-sql";

describe("выдача лотов", () => {
  it("всем — только активные; фильтры имени, редкости, расы, спеца, уровня и цены", () => {
    const f = lotsInputSchema.parse({
      name: "Гро_м%",
      rarity: ["rare", "legendary"],
      race: "Юпик",
      specialization: "Маг",
      levelMin: 5,
      levelMax: 20,
      priceCurrency: "darai",
      priceMin: 100,
      priceMax: 500000,
    });
    const w = lotsWhere(f, "acc_me").join(" AND ");
    expect(w).toContain("l.status = 'active'");
    expect(w).toContain("l.name ILIKE '%Гро\\_м\\%%' ESCAPE '\\'");
    expect(w).toContain("l.rarity IN ('rare', 'legendary')");
    expect(w).toContain("l.race = 'Юпик'");
    expect(w).toContain("l.specialization = 'Маг'");
    expect(w).toContain("l.level >= 5");
    expect(w).toContain("l.level <= 20");
    expect(w).toContain("l.price_darai IS NOT NULL");
    expect(w).toContain("l.price_darai >= 100");
    expect(w).toContain("l.price_darai <= 500000");
    expect(w).not.toContain("seller_account");
  });

  it("«мои»: по аккаунту, по умолчанию активные, status=all — и закрытые", () => {
    expect(lotsWhere({ mine: true }, "acc_me")).toEqual([
      "l.seller_account = 'acc_me'",
      "l.status = 'active'",
    ]);
    expect(lotsWhere({ mine: true, status: "sold" }, "acc_me")).toContain("l.status = 'sold'");
    expect(lotsWhere({ mine: true, status: "all" }, "acc_me").join(" ")).not.toContain("l.status");
    // Чужое status без mine не открывает закрытые лоты.
    expect(lotsWhere({ status: "sold" }, "acc_me")).toEqual(["l.status = 'active'"]);
  });

  it("сортировки и страница: потолок 50, total по всей выдаче", () => {
    const sql = lotsSql(lotsInputSchema.parse({ sort: "price_asc", limit: 50, offset: 100 }), null);
    expect(sql).toContain("ORDER BY l.price_gold ASC NULLS LAST");
    expect(sql).toContain("LIMIT 50 OFFSET 100");
    expect(sql).toContain("count(*) OVER ()::int AS total");
    expect(lotsInputSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(lotsSql({ sort: "level_desc" }, null)).toContain("ORDER BY l.level DESC");
  });

  it("характеристики героя — только у активного лота из залога", () => {
    const sql = lotsSql({}, null);
    expect(sql).toContain("h.item_id = l.item_id AND h.account_id = '_hero_market'");
    expect(sql).toContain("a.id = ANY (l.arts) AND a.account_id = '_hero_market'");
  });

  it("один лот: закрытый — только продавцу и покупателю", () => {
    expect(lotSql("hml_1", "acc_me")).toContain(
      "(l.status = 'active' OR l.seller_account = 'acc_me' OR l.buyer_account = 'acc_me')",
    );
  });
});

const row = (extra: Partial<LotRow> = {}): LotRow => ({
  id: "hml_1",
  status: "active",
  itemId: "ugi_1",
  heroId: "hi_1",
  templateId: "hero_x",
  name: "Grom",
  imageUrl: null,
  race: "Юпик",
  specialization: "Воин",
  rarity: "epic",
  level: 9,
  priceGold: 2500,
  priceDarai: null,
  sellerAccount: "acc_S",
  buyerAccount: null,
  paidCurrency: null,
  paidAmount: null,
  fee: null,
  sellerGot: null,
  createdAt: "2026-10-22T10:00:00Z",
  closedAt: null,
  skills: { atk: 2 },
  satiety: 700,
  equipped: { Голова: "ugi_a1" },
  arts: [
    {
      itemId: "ugi_a1",
      templateId: "art_1",
      name: "Шлем",
      imageUrl: null,
      rarity: "rare",
      slotType: "Голова",
      wear: 12,
      statType: "arm",
      statAmount: 3,
    },
  ],
  spells: [{ id: "sp_1", name: "Огонь", image: null }],
  ...extra,
});

describe("вид лота", () => {
  it("статы карточкой, артефакты с местом и износом, имя продавца, не «мой»", () => {
    const v = lotView(row(), "acc_B", new Map([["acc_S", "@seller"]]));
    expect(v.mine).toBe(false);
    expect(v.sellerName).toBe("@seller");
    expect(v.hero).toMatchObject({ rarity: "epic", level: 9, satiety: 700, skills: { atk: 2 } });
    expect(Object.keys(v.hero.stats).sort()).toEqual(["arm", "atk", "hp", "int", "luck", "spd"]);
    expect(v.hero.artifacts[0]).toMatchObject({
      itemId: "ugi_a1",
      slot: "Голова",
      wear: 12,
      statAmount: 3,
    });
    expect(v.hero.spells).toEqual([{ id: "sp_1", name: "Огонь", image: null }]);
    expect(v.sale).toBeNull();
  });

  it("итог продажи — только продавцу в «моих» проданных", () => {
    const sold = row({
      status: "sold",
      buyerAccount: "acc_B",
      paidCurrency: "darai",
      paidAmount: 300000,
      fee: 27000,
      sellerGot: 273000,
    });
    const names = new Map([["acc_B", "@buyer"]]);
    expect(lotView(sold, "acc_S", names).sale).toEqual({
      currency: "darai",
      price: 300000,
      fee: 27000,
      sellerGot: 273000,
      buyerName: "@buyer",
    });
    expect(lotView(sold, "acc_X", names).sale).toBeNull();
  });
});

const srow = (extra: Partial<SellableRow> = {}): SellableRow => ({
  itemId: "ugi_1",
  heroId: "hi_1",
  templateId: "hero_x",
  name: "Grom",
  imageUrl: null,
  race: null,
  specialization: null,
  rarity: "rare",
  level: 3,
  pockets: 0,
  restUntil: null,
  active: false,
  resting: false,
  field: false,
  fishing: false,
  ...extra,
});

/** На карте, основной есть, всё влезает. */
const ok = { onMap: true, hasMain: true, drops: 0, mushrooms: false };

describe("кого можно выставить", () => {
  it("свободный — можно; дальше первая причина в порядке функции базы", () => {
    expect(sellableReason(srow(), ok)).toBeNull();
    expect(sellableReason(srow({ rarity: "common", active: true }), ok)).toBe("heromkt.common");
    expect(sellableReason(srow({ active: true, resting: true }), ok)).toBe("heromkt.active");
    expect(sellableReason(srow({ resting: true }), ok)).toBe("heromkt.resting");
    expect(sellableReason(srow({ field: true }), ok)).toBe("heromkt.field");
    expect(sellableReason(srow({ fishing: true }), ok)).toBe("heromkt.fishing");
  });

  it("грибы и начатые инструменты в карманах выставлению не мешают — едут основному", () => {
    expect(sellableReason(srow({ pockets: 3 }), ok)).toBeNull();
    // Что-то не влезает — можно, окно «выпадет в мешочек» покажет интерфейс по drops.
    expect(sellableReason(srow({ pockets: 3 }), { ...ok, drops: 2 })).toBeNull();
  });

  it("не влезает, а игрока нет на карте — некуда уронить; гриб без основного — некуда деть", () => {
    expect(sellableReason(srow({ pockets: 2 }), { ...ok, onMap: false, drops: 1 })).toBe(
      "heromkt.no_position",
    );
    // Основного нет — всё мешочком на клетку игрока: на карте — можно.
    expect(sellableReason(srow({ pockets: 2 }), { ...ok, hasMain: false, drops: 2 })).toBeNull();
    expect(
      sellableReason(srow({ pockets: 2 }), { ...ok, hasMain: false, drops: 2, mushrooms: true }),
    ).toBe("heromkt.dmine_no_main");
    // Всё влезает — позиция не нужна; карманы пусты — основной не нужен.
    expect(sellableReason(srow({ pockets: 2 }), { ...ok, onMap: false })).toBeNull();
    expect(
      sellableReason(srow({ pockets: 0 }), {
        onMap: false,
        hasMain: false,
        drops: 0,
        mushrooms: false,
      }),
    ).toBeNull();
  });

  it("SQL: свои герои аккаунта, редкость по ярусу шаблона", () => {
    const sql = sellableSql("acc_me");
    expect(sql).toContain("u.account_id = 'acc_me' AND u.kind = 'hero'");
    expect(sql).toContain("yuplink.hero_market_rarity(t.level)");
  });
});
