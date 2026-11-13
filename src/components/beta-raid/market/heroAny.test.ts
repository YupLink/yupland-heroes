// Скупка «Любой … герой» на витрине игрока: плитка требует выбрать героя
// (одна копия — одна единица сделки), подпись — на языке игрока, картинка —
// корзина ломбарда цветом редкости.
import { describe, expect, it } from "vitest";
import type { MarketItemView } from "@/lib/buildingEffect";
import { artPayNeed, artPickMax } from "./artPay";
import { goodEntry } from "./exchange";
import { heroAnyIconSrc, heroAnyRarity } from "./heroAny";

const view = (o: Partial<MarketItemView> = {}) =>
  ({
    id: "mkt_h",
    side: "sell",
    kind: "hero",
    refId: "hero_any_epic",
    name: "Любой эпический герой",
    image: null,
    giveAmount: 1,
    giveToken: null,
    priceResource: "gold",
    priceToken: null,
    priceAmount: 500,
    ...o,
  }) as MarketItemView;

describe("heroAny", () => {
  it("редкость и картинка только у псевдо-шаблона", () => {
    expect(heroAnyRarity("hero_any_legendary")).toBe("legendary");
    expect(heroAnyRarity("hero_tpl")).toBeNull();
    expect(heroAnyIconSrc("hero_any_rare")).toBe("/market/pawn-hero-rare.webp");
    expect(heroAnyIconSrc("art_any_rare")).toBeNull();
  });
});

describe("плитка скупки героя", () => {
  it("нужен выбор героя: what='hero', потолок — одна копия", () => {
    const need = artPayNeed(view());
    expect(need).toEqual({ rarity: "epic", perUnit: 1, what: "hero" });
    expect(artPickMax(view(), 1)).toBe(1);
  });

  it("именной герой и витрина покупки — выбора нет", () => {
    expect(artPayNeed(view({ refId: "hero_tpl" }))).toBeNull();
    expect(artPayNeed(view({ side: "buy" }))).toBeNull();
  });

  it("«любой артефакт» — как раньше, what='art'", () => {
    expect(artPayNeed(view({ kind: "art", refId: "art_any_rare" }))?.what).toBe("art");
  });

  it("подпись — из словаря, картинка — ломбард", () => {
    const t = (k: string) => `T:${k}`;
    const g = goodEntry(view(), t);
    expect(g.label).toBe("T:market.hero_any.epic");
    // Своя корзина «HEROES» — и поверх картинки, записанной в строке товара раньше.
    expect(g.image).toBe("/market/pawn-hero-epic.webp");
    expect(goodEntry(view()).label).toBe("Любой эпический герой");
  });
});
