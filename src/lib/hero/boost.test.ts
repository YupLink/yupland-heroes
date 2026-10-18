// Эффекты буста: разбор (старые записи обязаны читаться как раньше), броски,
// сведение нескольких штук и подписи — для Торговли/Алхимии и иммунитета.
import { describe, expect, it } from "vitest";
import {
  boostEffectText,
  boostStatLabel,
  parseBoostEffects,
  rollBoostEffect,
  rollBoostQty,
  withBoosts,
  type BoostEffect,
  type BoostRoll,
} from "./boost";

describe("parseBoostEffects — обратная совместимость", () => {
  it("старая запись {stat, value, minutes} читается как раньше", () => {
    expect(parseBoostEffects([{ stat: "spd", value: "1-10", minutes: "30" }])).toEqual([
      { stat: "spd", value: "1-10", minutes: "30" },
    ]);
  });

  it("совсем старая одиночная {stat, min, max, minutes} склеивается в диапазон", () => {
    expect(parseBoostEffects({ stat: "atk", min: 2, max: 5, minutes: 15 })).toEqual([
      { stat: "atk", value: "2-5", minutes: "15" },
    ]);
  });

  it("неизвестное не роняет разбор, а выпадает", () => {
    const raw = [
      { stat: "mana", value: "3", minutes: "10" },
      { stat: "immune", ability: "teleport", minutes: "10" },
      { stat: "immune", minutes: "10" },
      null,
      "мусор",
      { stat: "luck", value: "2", minutes: "5" },
    ];
    expect(parseBoostEffects(raw)).toEqual([{ stat: "luck", value: "2", minutes: "5" }]);
  });
});

describe("parseBoostEffects — новые эффекты", () => {
  it("Торговля и Алхимия — обычные прибавки", () => {
    expect(
      parseBoostEffects([
        { stat: "trade", value: "10", minutes: "60" },
        { stat: "alchemy", value: "5-20", minutes: "30" },
      ]),
    ).toEqual([
      { stat: "trade", value: "10", minutes: "60" },
      { stat: "alchemy", value: "5-20", minutes: "30" },
    ]);
  });

  it("иммунитет хранит вид дебаффа, value всегда «1»", () => {
    expect(
      parseBoostEffects([{ stat: "immune", ability: "poison", value: "", minutes: "30" }]),
    ).toEqual([{ stat: "immune", value: "1", minutes: "30", ability: "poison" }]);
    expect(parseBoostEffects([{ stat: "immune", ability: "all", minutes: "10-20" }])).toEqual([
      { stat: "immune", value: "1", minutes: "10-20", ability: "all" },
    ]);
  });

  it("к «удару по всем» иммунитета нет — это урон, не дебафф", () => {
    expect(parseBoostEffects([{ stat: "immune", ability: "cleave", minutes: "30" }])).toEqual([]);
  });
});

describe("rollBoostEffect", () => {
  it("иммунитет: сила 1, вид сохраняется, минуты в диапазоне", () => {
    const e: BoostEffect = { stat: "immune", value: "1", minutes: "10-20", ability: "stun" };
    for (let i = 0; i < 50; i++) {
      const r = rollBoostEffect(e);
      expect(r.stat).toBe("immune");
      expect(r.ability).toBe("stun");
      expect(r.amount).toBe(1);
      expect(r.minutes).toBeGreaterThanOrEqual(10);
      expect(r.minutes).toBeLessThanOrEqual(20);
    }
  });

  it("Торговля бросается как любой стат", () => {
    const r = rollBoostEffect({ stat: "trade", value: "7", minutes: "30" });
    expect(r).toEqual({ stat: "trade", amount: 7, minutes: 30 });
  });
});

describe("rollBoostQty — несколько штук разом", () => {
  const fixed = (e: BoostEffect): BoostRoll => ({
    stat: e.stat,
    amount: Number(e.value),
    minutes: Number(e.minutes),
    ability: e.ability,
  });

  it("прибавки одного стата и срока складываются по пунктам", () => {
    const rolls = rollBoostQty([{ stat: "trade", value: "5", minutes: "30" }], 3, fixed);
    expect(rolls).toEqual([{ stat: "trade", amount: 15, minutes: 30, ability: undefined }]);
  });

  it("иммунитет одного вида складывается по МИНУТАМ, а не по силе", () => {
    const e: BoostEffect = { stat: "immune", value: "1", minutes: "30", ability: "poison" };
    expect(rollBoostQty([e], 3, fixed)).toEqual([
      { stat: "immune", amount: 1, minutes: 90, ability: "poison" },
    ]);
  });

  it("иммунитеты разных видов не сливаются", () => {
    const list: BoostEffect[] = [
      { stat: "immune", value: "1", minutes: "30", ability: "poison" },
      { stat: "immune", value: "1", minutes: "30", ability: "slow" },
    ];
    const rolls = rollBoostQty(list, 2, fixed);
    expect(rolls).toHaveLength(2);
    expect(rolls.map((r) => [r.ability, r.minutes])).toEqual([
      ["poison", 60],
      ["slow", 60],
    ]);
  });
});

describe("boostEffectText", () => {
  it("Торговля — по-русски и по-английски", () => {
    const e: BoostEffect = { stat: "trade", value: "10", minutes: "60" };
    expect(boostEffectText(e, "ru")).toBe("+10 к «Торговля» на 60 мин");
    expect(boostEffectText(e, "en")).toBe("+10 Trade for 60 min");
  });

  it("иммунитет называет дебафф, «все» — отдельной подписью", () => {
    const e: BoostEffect = { stat: "immune", value: "1", minutes: "30", ability: "poison" };
    expect(boostEffectText(e, "ru")).toBe("Иммунитет: Яд на 30 мин");
    expect(boostEffectText(e, "en")).toBe("Immunity: Poison for 30 min");
    expect(boostEffectText({ ...e, ability: "all" }, "ru")).toBe(
      "Иммунитет: все дебаффы на 30 мин",
    );
  });
});

describe("подпись неизвестного стата не роняет экран", () => {
  it("стат из будущей сборки — подписью служит сам ключ", () => {
    const e = { stat: "mana", value: "3", minutes: "10" } as unknown as BoostEffect;
    expect(boostEffectText(e, "ru")).toBe("+3 к «mana» на 10 мин");
    expect(boostStatLabel("mana", "en")).toBe("mana");
  });

  it("иммунитет к неизвестному виду — просто «Иммунитет»", () => {
    const e = {
      stat: "immune",
      value: "1",
      minutes: "5",
      ability: "teleport",
    } as unknown as BoostEffect;
    expect(boostEffectText(e, "ru")).toBe("Иммунитет на 5 мин");
    expect(boostEffectText({ ...e, ability: undefined }, "en")).toBe("Immunity for 5 min");
  });
});

describe("withBoosts — небоевые статы в характеристики не текут", () => {
  it("Торговля и Алхимия не меняют HeroStats", () => {
    const stats = { atk: 1, arm: 1, int: 1, spd: 1, hp: 1, luck: 1 };
    const out = withBoosts(stats, { trade: 50, alchemy: 50, atk: 2 });
    expect(out).toEqual({ ...stats, atk: 3 });
    expect(Object.keys(out).sort()).toEqual(Object.keys(stats).sort());
  });
});
