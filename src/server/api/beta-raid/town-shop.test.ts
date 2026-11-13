// Лавка города: что видно, чего не видно, и голод (владелец, 03.10.2026).
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));

import { cityLine, cityShopView, townGoodFor, type CityShop } from "./town-shop";
import { decideStarving, townFed } from "./town-state";
import { defaultTownRules } from "@/lib/townRules";
import type { TownGood } from "@/lib/townConfig";
import type { MarketItemView } from "@/lib/marketItemView";

const good = (over: Partial<TownGood>): TownGood => ({
  id: "tg_x",
  kind: "resource",
  refId: "wood",
  token: null,
  operation: "both",
  marketPrice: 10,
  consumePerResident: 0,
  producePerDay: 0,
  ...over,
});

const bread = good({ id: "tg_bread", kind: "custom", refId: "cst_bread", consumePerResident: 0.1 });
const wood = good({ id: "tg_wood", operation: "sell" });
const shop = (starving = false): CityShop => ({
  town: { mapId: "m", q: 0, r: 0 },
  cfg: { name: "", residents: 100, rules: defaultTownRules(), goods: [bread, wood] },
  stock: { tg_bread: 100, tg_wood: 100 },
  starving,
});

const view = (over: Partial<MarketItemView>): MarketItemView => ({
  id: "mkt_1",
  side: "buy",
  kind: "custom",
  refId: "cst_bread",
  name: "Хлеб",
  image: null,
  giveAmount: 1,
  giveToken: null,
  priceResource: "likes",
  priceToken: null,
  priceAmount: 999,
  priceName: null,
  priceImage: null,
  price2Resource: null,
  price2Token: null,
  price2Amount: null,
  price2Name: null,
  price2Image: null,
  stock: 5,
  sold: 0,
  remaining: 5,
  buyable: true,
  lockKey: null,
  ...over,
});

describe("лавка города", () => {
  it("позиция находит свой товар ратуши; чужое — не находит", () => {
    expect(
      townGoodFor(shop().cfg, { kind: "custom", refId: "cst_bread", giveToken: null })?.id,
    ).toBe("tg_bread");
    expect(
      townGoodFor(shop().cfg, { kind: "custom", refId: "cst_milk", giveToken: null }),
    ).toBeNull();
  });

  it("товар ратуши — в обе стороны; чего нет в ратуше — не видно", () => {
    expect(
      cityLine(shop(), { side: "sell", kind: "resource", refId: "wood", giveToken: null }),
    ).not.toBeNull();
    expect(
      cityLine(shop(), { side: "buy", kind: "resource", refId: "wood", giveToken: null }),
    ).not.toBeNull();
    expect(
      cityLine(shop(), { side: "buy", kind: "resource", refId: "stone", giveToken: null }),
    ).toBeNull();
  });

  it("голод: продажа закрыта, приём — только еды", () => {
    const s = shop(true);
    expect(
      cityLine(s, { side: "buy", kind: "custom", refId: "cst_bread", giveToken: null }),
    ).toBeNull();
    expect(
      cityLine(s, { side: "sell", kind: "custom", refId: "cst_bread", giveToken: null }),
    ).not.toBeNull();
    expect(
      cityLine(s, { side: "sell", kind: "resource", refId: "wood", giveToken: null }),
    ).toBeNull();
  });

  it("голод на острове: ресурсы портала продаются, остальное — как в мире (06.11.2026)", () => {
    const isle: CityShop = { ...shop(true), town: { mapId: "isle_t", q: 0, r: 0 } };
    const wood = { kind: "resource", refId: "wood", giveToken: null } as const;
    expect(cityLine(isle, { side: "buy", ...wood })).not.toBeNull();
    expect(cityLine(isle, { side: "sell", ...wood })).toBeNull();
    expect(
      cityLine(isle, { side: "buy", kind: "custom", refId: "cst_bread", giveToken: null }),
    ).toBeNull();
    expect(
      cityLine(isle, { side: "sell", kind: "custom", refId: "cst_bread", giveToken: null }),
    ).not.toBeNull();
    // Большой мир: голодный город дерево не продаёт.
    expect(cityLine(shop(true), { side: "buy", ...wood })).toBeNull();
  });

  it("витрина: цена в золоте по кривой, лишние позиции скрыты, остаток выше НЗ", () => {
    const items = cityShopView(
      [view({}), view({ id: "mkt_2", refId: "cst_milk" }), view({ id: "mkt_3", side: "sell" })],
      shop(),
      true,
    );
    expect(items.map((i) => i.id)).toEqual(["mkt_1", "mkt_3"]);
    const buy = items[0];
    expect(buy.priceResource).toBe("gold");
    // Штука на норме: база 10 + 20% наценки, чуть дороже — цена растёт по ходу.
    expect(buy.priceAmount).toBeGreaterThan(12);
    expect(buy.priceAmount).toBeLessThan(12.2);
    // Норма хлеба — 100 жителей × 1 на жителя = 100; НЗ 10% — 10 город не продаёт.
    expect(buy.remaining).toBe(90);
    expect(buy.town?.stock).toBe(100);
    // Скупка без лимита.
    expect(items[1].remaining).toBeNull();
  });
});

describe("голод", () => {
  it("не хватило — голод сразу; голодал и наелся — снят; иначе как было", () => {
    expect(decideStarving({ short: true, wasStarving: false, fed: true })).toBe(true);
    expect(decideStarving({ short: false, wasStarving: true, fed: true })).toBe(false);
    expect(decideStarving({ short: false, wasStarving: true, fed: false })).toBe(true);
    expect(decideStarving({ short: false, wasStarving: false, fed: false })).toBe(false);
  });

  it("наелся — когда КАЖДОЙ еды на сутки (100% суточной нормы)", () => {
    const cfg = shop().cfg;
    // 100 жителей × 0,1 = 10 хлеба в день.
    expect(townFed(cfg, { tg_bread: 10 })).toBe(true);
    expect(townFed(cfg, { tg_bread: 9 })).toBe(false);
    // Дерево не еда — его запас голоду безразличен.
    expect(townFed(cfg, { tg_bread: 10, tg_wood: 0 })).toBe(true);
  });

  it("особый спрос: сутки на НЗ и ниже — скупка ×4 и метка на плитке", () => {
    const old = new Date(Date.now() - 25 * 3600_000).toISOString();
    const fresh = new Date(Date.now() - 2 * 3600_000).toISOString();
    // Норма хлеба в фикстуре — 100 (0,1 × 100 жителей × 10 дней), НЗ 10 %: 5 — ниже НЗ.
    const s = (since: string | null): CityShop => ({
      ...shop(),
      stock: { tg_bread: 5, tg_wood: 100 },
      lowSince: { tg_bread: since },
    });
    const it = { side: "sell" as const, kind: "custom" as const, refId: "cst_bread", giveToken: null };
    expect(cityLine(s(old), it)?.curve.lowX).toBe(4);
    expect(cityLine(s(fresh), it)?.curve.lowX).toBeUndefined();
    expect(cityLine(s(null), it)?.curve.lowX).toBeUndefined();
    const tile = (since: string | null) =>
      cityShopView([view({ side: "sell" })], s(since), true)[0];
    expect(tile(old).town?.rush).toBe(true);
    expect(tile(old).priceAmount).toBe(2 * (tile(fresh).priceAmount ?? 0));
    expect(tile(fresh).town?.rush).toBe(false);
  });
});
