// Цена записи на турнир: проверка цены админа, разбор из базы, строка цены
// ru+en (с формами слова) и сравнение цен для письма.
import { describe, expect, it } from "vitest";
import {
  TOUR_ENTRY_RESOURCES,
  cleanEntryPrice,
  fmtEntryAmount,
  parseEntryPrice,
  sameEntryPrice,
  tourEntryPriceError,
  tourEntryPriceLabel,
} from "./entryPrice";
import { TOUR_DEFAULT_ENTRY_PRICE, type TourEntryPrice } from "./types";

const gold = (amount: number): TourEntryPrice => ({ resource: "gold", amount });
const darai = (amount: number): TourEntryPrice => ({ resource: "token", token: "Darai", amount });
const apple: TourEntryPrice = {
  resource: "item",
  itemKey: "custom:cst_apple",
  itemName: "Яблоко",
  amount: 2,
};

describe("tourEntryPriceError", () => {
  it("по умолчанию 5 золота; пусто — бесплатно; всё это годится", () => {
    expect(TOUR_DEFAULT_ENTRY_PRICE).toEqual([gold(5)]);
    expect(tourEntryPriceError(TOUR_DEFAULT_ENTRY_PRICE)).toBeNull();
    expect(tourEntryPriceError([])).toBeNull();
    expect(
      tourEntryPriceError([gold(5), darai(0.5), apple, { resource: "energy", amount: 1.5 }]),
    ).toBeNull();
  });

  it("не больше 4 строк", () => {
    expect(tourEntryPriceError([gold(1), gold(2), gold(3), gold(4), gold(5)])).toBe(
      "tour.err.price_rows",
    );
  });

  it("только то, что умеет списать resource-pay: пак, герой, артефакт, босс, свой товар — нет", () => {
    for (const r of ["pack", "hero", "art", "boss", "custom", "darai", ""]) {
      const p = { resource: r, amount: 1 } as unknown as TourEntryPrice;
      expect(tourEntryPriceError([p])).toBe("tour.err.price_resource");
    }
    expect(TOUR_ENTRY_RESOURCES).toEqual([
      "gold",
      "stone",
      "wood",
      "diamonds",
      "likes",
      "tickets",
      "energy",
      "token",
      "item",
    ]);
  });

  it("сумма больше нуля и конечная; дробная — только у токена и энергии", () => {
    for (const a of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(tourEntryPriceError([gold(a)])).toBe("tour.err.price_amount");
    }
    expect(tourEntryPriceError([gold(2.5)])).toBe("tour.err.price_amount");
    expect(tourEntryPriceError([{ ...apple, amount: 1.5 }])).toBe("tour.err.price_amount");
    expect(tourEntryPriceError([{ resource: "tickets", amount: 0.1 }])).toBe(
      "tour.err.price_amount",
    );
    expect(tourEntryPriceError([darai(0.25)])).toBeNull();
  });

  it("токену нужна монета, товару — ключ и имя", () => {
    expect(tourEntryPriceError([{ resource: "token", amount: 1 }])).toBe("tour.err.price_token");
    expect(tourEntryPriceError([{ resource: "token", token: "  ", amount: 1 }])).toBe(
      "tour.err.price_token",
    );
    expect(tourEntryPriceError([{ ...apple, itemName: null }])).toBe("tour.err.price_item");
    expect(tourEntryPriceError([{ ...apple, itemKey: "" }])).toBe("tour.err.price_item");
  });
});

describe("parseEntryPrice / cleanEntryPrice", () => {
  it("jsonb массивом и строкой; хвосты чужих ресурсов отброшены", () => {
    const raw = [{ resource: "gold", amount: 5, token: "Darai", itemKey: "x" }];
    expect(parseEntryPrice(raw)).toEqual([gold(5)]);
    expect(parseEntryPrice(JSON.stringify(raw))).toEqual([gold(5)]);
    expect(cleanEntryPrice([{ ...darai(3), itemName: "лишнее" }])).toEqual([darai(3)]);
  });

  it("битые строки и мусор — мимо, а не падение", () => {
    expect(parseEntryPrice(null)).toEqual([]);
    expect(parseEntryPrice("не json")).toEqual([]);
    expect(parseEntryPrice({ resource: "gold" })).toEqual([]);
    expect(parseEntryPrice([null, { resource: "pack", amount: 1 }, gold(0), gold(5)])).toEqual([
      gold(5),
    ]);
  });
});

describe("sameEntryPrice", () => {
  it("порядок строк не важен, сумма и монета — важны", () => {
    expect(sameEntryPrice([gold(5), darai(10)], [darai(10), gold(5)])).toBe(true);
    expect(sameEntryPrice([], [])).toBe(true);
    expect(sameEntryPrice([gold(5)], [gold(6)])).toBe(false);
    expect(sameEntryPrice([darai(5)], [{ ...darai(5), token: "USDT" }])).toBe(false);
    expect(sameEntryPrice([gold(5)], [gold(5), gold(5)])).toBe(false);
    expect(sameEntryPrice([gold(5)], [])).toBe(false);
  });
});

describe("tourEntryPriceLabel", () => {
  it("ru: формы слова как у владельца — «5 золота»", () => {
    expect(tourEntryPriceLabel([gold(5)], "ru")).toBe("5 золота");
    expect(tourEntryPriceLabel([gold(1)], "ru")).toBe("1 золото");
    expect(tourEntryPriceLabel([{ resource: "diamonds", amount: 1 }], "ru")).toBe("1 алмаз");
    expect(tourEntryPriceLabel([{ resource: "diamonds", amount: 3 }], "ru")).toBe("3 алмаза");
    // Билетов нет (§8.61): цена «в билетах» — золото ×500.
    expect(tourEntryPriceLabel([{ resource: "tickets", amount: 11 }], "ru")).toBe(
      `${fmtEntryAmount(5500, "ru")} золота`,
    );
    expect(tourEntryPriceLabel([{ resource: "stone", amount: 21 }], "ru")).toBe("21 камень");
    expect(tourEntryPriceLabel([{ resource: "energy", amount: 1.5 }], "ru")).toBe("1,5 энергии");
  });

  it("en: одно / много", () => {
    expect(tourEntryPriceLabel([gold(5)], "en")).toBe("5 gold");
    expect(tourEntryPriceLabel([{ resource: "diamonds", amount: 1 }], "en")).toBe("1 diamond");
    expect(tourEntryPriceLabel([{ resource: "likes", amount: 2 }], "en")).toBe("2 likes");
  });

  it("токен символом, товар именем, строки через «+», числа по языку", () => {
    expect(tourEntryPriceLabel([gold(5), darai(50000), apple], "ru")).toBe(
      "5 золота + 50 000 Darai + 2 × Яблоко",
    );
    expect(tourEntryPriceLabel([darai(50000)], "en")).toBe("50,000 Darai");
  });

  it("бесплатно — пустая строка (окно и письмо пишут своё)", () => {
    expect(tourEntryPriceLabel([], "ru")).toBe("");
  });
});
