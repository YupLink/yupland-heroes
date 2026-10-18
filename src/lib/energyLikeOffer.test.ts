import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENERGY_LIKE_OFFER,
  formatLikeDaily,
  likeOfferView,
  parseEnergyLikeOffer,
  parseLikeDaily,
} from "@/lib/energyLikeOffer";
import { stepsNextPrice, stepsIndex, stepsTotal } from "@/lib/energySteps";

const TODAY = "2026-09-27";

describe("parseEnergyLikeOffer", () => {
  it("нет ключа → дефолт, равный прежнему поведению", () => {
    expect(parseEnergyLikeOffer(null)).toEqual({
      enabled: true,
      amount: 10,
      steps: [{ amount: 50, times: 1 }],
    });
    expect(parseEnergyLikeOffer(undefined)).toBe(DEFAULT_ENERGY_LIKE_OFFER);
  });

  it("битый JSON и не-объект → дефолт", () => {
    expect(parseEnergyLikeOffer("{oops")).toBe(DEFAULT_ENERGY_LIKE_OFFER);
    expect(parseEnergyLikeOffer("42")).toBe(DEFAULT_ENERGY_LIKE_OFFER);
    expect(parseEnergyLikeOffer("null")).toBe(DEFAULT_ENERGY_LIKE_OFFER);
  });

  it("читает валидную настройку", () => {
    const raw = JSON.stringify({
      enabled: false,
      amount: 15,
      steps: [
        { amount: 30, times: 2 },
        { amount: 80, times: 1 },
      ],
    });
    expect(parseEnergyLikeOffer(raw)).toEqual({
      enabled: false,
      amount: 15,
      steps: [
        { amount: 30, times: 2 },
        { amount: 80, times: 1 },
      ],
    });
  });

  it("мусор в полях → дефолт по полю, мусорные ступени отбрасываются", () => {
    const raw = JSON.stringify({
      enabled: "yes",
      amount: -3,
      steps: [{ amount: 0, times: 1 }, { amount: 40, times: 0 }, { amount: "x" }],
    });
    expect(parseEnergyLikeOffer(raw)).toEqual({
      enabled: true,
      amount: 10,
      steps: [{ amount: 40, times: 1 }],
    });
  });

  it("пустая лестница → дефолтная лестница; потолок энергии", () => {
    const r = parseEnergyLikeOffer(JSON.stringify({ enabled: true, amount: 99999, steps: [] }));
    expect(r.steps).toEqual(DEFAULT_ENERGY_LIKE_OFFER.steps);
    expect(r.amount).toBe(10);
  });
});

describe("parseLikeDaily / formatLikeDaily", () => {
  it("старый формат 'YYYY-MM-DD' = одна покупка сегодня", () => {
    expect(parseLikeDaily(TODAY, TODAY)).toBe(1);
  });
  it("новый формат 'YYYY-MM-DD:n'", () => {
    expect(parseLikeDaily(`${TODAY}:3`, TODAY)).toBe(3);
  });
  it("другой день, пусто, мусор → 0", () => {
    expect(parseLikeDaily("2026-09-26", TODAY)).toBe(0);
    expect(parseLikeDaily("2026-09-26:5", TODAY)).toBe(0);
    expect(parseLikeDaily("", TODAY)).toBe(0);
    expect(parseLikeDaily(null, TODAY)).toBe(0);
    expect(parseLikeDaily(`${TODAY}:abc`, TODAY)).toBe(0);
  });
  it("одна покупка пишется старым форматом, дальше — со счётчиком", () => {
    expect(formatLikeDaily(TODAY, 1)).toBe(TODAY);
    expect(formatLikeDaily(TODAY, 2)).toBe(`${TODAY}:2`);
    for (const n of [1, 2, 7]) expect(parseLikeDaily(formatLikeDaily(TODAY, n), TODAY)).toBe(n);
  });
  it("с меткой операции: n читается, метки двух покупок различаются", () => {
    expect(formatLikeDaily(TODAY, 1, "a1")).toBe(`${TODAY}:1:a1`);
    for (const n of [1, 2, 7])
      expect(parseLikeDaily(formatLikeDaily(TODAY, n, "zz9"), TODAY)).toBe(n);
    // Два параллельных нажатия от одного prev пишут РАЗНЫЕ значения —
    // проигравший не примет чужой слот за свой.
    expect(formatLikeDaily(TODAY, 2, "a")).not.toBe(formatLikeDaily(TODAY, 2, "b"));
    expect(parseLikeDaily(`2026-09-26:3:x`, TODAY)).toBe(0);
  });
});

describe("дефолт = старое поведение", () => {
  it("купивший до выката (старое значение) не купит второй раз", () => {
    const used = parseLikeDaily(TODAY, TODAY);
    expect(likeOfferView(parseEnergyLikeOffer(null), used).price).toBeNull();
  });
  it("вчерашняя метка не мешает купить сегодня", () => {
    expect(
      likeOfferView(parseEnergyLikeOffer(null), parseLikeDaily("2026-09-26", TODAY)).price,
    ).toBe(50);
  });
  it("админ урезал лестницу ниже уже купленного — дальше нельзя", () => {
    const offer = parseEnergyLikeOffer(
      JSON.stringify({ enabled: true, amount: 5, steps: [{ amount: 20, times: 1 }] }),
    );
    expect(likeOfferView(offer, parseLikeDaily(`${TODAY}:3:q`, TODAY)).price).toBeNull();
  });
});

describe("цена по счётчику", () => {
  const offer = {
    enabled: true,
    amount: 10,
    steps: [
      { amount: 50, times: 2 },
      { amount: 100, times: 1 },
    ],
  };
  it("ступени съедаются по порядку, потом null", () => {
    expect(likeOfferView(offer, 0)).toEqual({ price: 50, used: 0, total: 3 });
    expect(likeOfferView(offer, 1).price).toBe(50);
    expect(likeOfferView(offer, 2).price).toBe(100);
    expect(likeOfferView(offer, 3).price).toBeNull();
  });
  it("дефолт: одна покупка за 50, вторая недоступна", () => {
    expect(likeOfferView(DEFAULT_ENERGY_LIKE_OFFER, 0).price).toBe(50);
    expect(likeOfferView(DEFAULT_ENERGY_LIKE_OFFER, 1).price).toBeNull();
  });
  it("общие хелперы лестницы", () => {
    expect(stepsTotal(offer.steps)).toBe(3);
    expect(stepsIndex(offer.steps, 2)).toBe(1);
    expect(stepsIndex(offer.steps, 3)).toBe(2);
    expect(stepsNextPrice([], 0)).toBeNull();
  });
});
