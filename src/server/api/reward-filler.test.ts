// Разбор наполнителей: новые виды живут только со ссылкой, мусор не проходит.
import { describe, it, expect } from "vitest";
import { parseFiller, fillerRef, isExtraFiller } from "./reward-filler";
import { parseRewardConfig } from "./raid-shared";

const cfg = (fillers: unknown[]) => parseRewardConfig({ fillers, split: [50, 50] });

describe("наполнитель-ресурс", () => {
  it("живёт с кодом из белого списка", () => {
    const f = parseFiller({ kind: "resource", resource: "gold", amount: 100 });
    expect(f).toEqual({ kind: "resource", amount: 100, token: null, resource: "gold" });
    expect(fillerRef(f!)).toBe("gold");
    expect(isExtraFiller(f!)).toBe(true);
  });

  it("умирает на чужом коде", () => {
    for (const bad of ["ore", "likes", "tickets", "energy", "", null, 7]) {
      expect(parseFiller({ kind: "resource", resource: bad, amount: 10 })).toBeNull();
    }
  });

  it("не пускает к себе токен: Darai обязан идти видом token", () => {
    expect(parseFiller({ kind: "resource", resource: "Darai", amount: 10 })).toBeNull();
    expect(
      parseFiller({ kind: "resource", resource: "token", token: "Darai", amount: 10 }),
    ).toBeNull();
  });
});

describe("наполнитель-товар", () => {
  it("живёт с id справочника и своим «до места»", () => {
    const f = parseFiller({ kind: "custom", itemId: "cst_7ce4i4dx3oio", amount: 3, toPlace: 5 });
    expect(f).toEqual({
      kind: "custom",
      amount: 3,
      token: null,
      itemId: "cst_7ce4i4dx3oio",
      toPlace: 5,
    });
  });

  it("без места по умолчанию достаётся первому", () => {
    expect(parseFiller({ kind: "custom", itemId: "cst_x", amount: 1 })?.toPlace).toBe(1);
    expect(parseFiller({ kind: "custom", itemId: "cst_x", amount: 1, toPlace: 0 })?.toPlace).toBe(
      1,
    );
  });

  it("умирает без префикса cst_", () => {
    for (const bad of ["mkt_1", "pk_1", "cp_1", "wheat", "", null]) {
      expect(parseFiller({ kind: "custom", itemId: bad, amount: 1 })).toBeNull();
    }
  });
});

describe("старые виды не изменились", () => {
  it("токен несёт символ монеты и остаётся токеном", () => {
    const f = parseFiller({ kind: "token", token: "Darai", amount: 12.5 });
    expect(f).toEqual({ kind: "token", amount: 12.5, token: "Darai" });
    expect(fillerRef(f!)).toBeNull();
    expect(isExtraFiller(f!)).toBe(false);
  });

  it("лайки/билеты/энергия — как были", () => {
    expect(parseFiller({ kind: "likes", amount: 25 })).toEqual({
      kind: "likes",
      amount: 25,
      token: null,
    });
    expect(parseFiller({ amount: 5 })?.kind).toBe("likes");
  });
});

describe("конфиг целиком", () => {
  it("мусор выбрасывается, годное остаётся", () => {
    const c = cfg([
      { kind: "likes", amount: 10 },
      { kind: "resource", resource: "stone", amount: 40 },
      { kind: "resource", resource: "ore", amount: 40 },
      { kind: "custom", itemId: "cst_ok", amount: 2, toPlace: 3 },
      { kind: "custom", itemId: "mkt_no", amount: 2 },
      { kind: "token", token: "Darai", amount: 1 },
    ]);
    expect(c.fillers.map((f) => f.kind)).toEqual(["likes", "resource", "custom", "token"]);
    expect(c.fillers[1].resource).toBe("stone");
    expect(c.fillers[2].itemId).toBe("cst_ok");
    expect(c.fillers[3].token).toBe("Darai");
  });
});
