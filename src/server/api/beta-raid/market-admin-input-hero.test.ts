// Форма админа: «Любой герой редкости» — только товаром скупки и по одному;
// ни товаром покупки, ни ценой/выплатой его не поставить.
import { describe, expect, it, vi } from "vitest";

const town = vi.hoisted(() => ({ bound: false, asked: [] as string[] }));
vi.mock("./town-binding", () => ({
  shopTown: async (mapId: string, q: number, r: number) => {
    town.asked.push(`${mapId}:${q}:${r}`);
    return town.bound ? { mapId, q: 9, r: 9 } : null;
  },
}));

const { assertHeroAnyPlace, assertUpsertSane, upsertMarketInput } =
  await import("./market-admin-input");

const base = (o: Record<string, unknown> = {}) =>
  upsertMarketInput.parse({
    q: 0,
    r: 0,
    side: "sell",
    kind: "hero",
    refId: "hero_any_legendary",
    giveAmount: 1,
    priceResource: "gold",
    priceAmount: 1000,
    stock: 3,
    ...o,
  });

describe("«Любой герой редкости» в форме маркета", () => {
  it("скупка за золото, по одному, с лимитом — можно", () => {
    expect(() => assertUpsertSane(base())).not.toThrow();
  });

  it("товаром покупки — нельзя", () => {
    expect(() => assertUpsertSane(base({ side: "buy" }))).toThrow(/только в скупку/);
  });

  it("не по одному — нельзя", () => {
    expect(() => assertUpsertSane(base({ giveAmount: 2 }))).toThrow(/по одному/);
  });

  it("ценой или выплатой — нельзя", () => {
    const asPrice = base({ kind: "resource", refId: "gold", priceResource: "hero" });
    expect(() => assertUpsertSane({ ...asPrice, priceToken: "hero_any_rare" })).toThrow(
      /не бывает ценой/,
    );
    expect(() =>
      assertUpsertSane(
        base({ refId: "hero_tpl", price2Resource: "hero", price2Token: "hero_any_rare" }),
      ),
    ).toThrow(/не бывает ценой/);
  });

  it("именной герой в скупке — как раньше", () => {
    expect(() => assertUpsertSane(base({ refId: "hero_tpl", giveAmount: 2 }))).not.toThrow();
  });
});

describe("«Любой герой редкости» и лавка при ратуше", () => {
  it("лавка при ратуше — отказ при сохранении", async () => {
    town.bound = true;
    await expect(assertHeroAnyPlace(base({ q: 2, r: 3 }), "map1")).rejects.toThrow(
      /лавку при ратуше/,
    );
    expect(town.asked).toContain("map1:2:3");
  });

  it("обычная лавка — можно; другие позиции ратушу не спрашивают", async () => {
    town.bound = false;
    await expect(assertHeroAnyPlace(base(), "map1")).resolves.toBeUndefined();
    town.bound = true;
    town.asked = [];
    await expect(assertHeroAnyPlace(base({ refId: "hero_tpl" }), "map1")).resolves.toBeUndefined();
    expect(town.asked).toHaveLength(0);
  });
});
