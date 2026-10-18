// Правила набора: что админ может сохранить, когда игроку нельзя купить, цены
// в валютах (как у подписки) и имя на карточке.
import { describe, expect, it } from "vitest";
import { priceIn } from "./energySub";
import { kitBlock, kitError, kitLeft, kitPrices, kitTitle, type KitFields } from "./kits";

const ok: KitFields = {
  boxId: "cp_box1",
  boxCount: 1,
  priceUsd: 4.99,
  stock: null,
  perAccount: 1,
  active: true,
};

describe("kitError", () => {
  it("годный набор — без ошибки", () => {
    expect(kitError(ok)).toBeNull();
    expect(kitError({ ...ok, boxCount: 500, priceUsd: 100_000, stock: 100 })).toBeNull();
  });

  it("бокс обязателен", () => {
    expect(kitError({ ...ok, boxId: "  " })).toBe("kits.err_box");
  });

  it("боксов — целое от 1 до 500", () => {
    expect(kitError({ ...ok, boxCount: 0 })).toBe("kits.err_count");
    expect(kitError({ ...ok, boxCount: 1.5 })).toBe("kits.err_count");
    expect(kitError({ ...ok, boxCount: 501 })).toBe("kits.err_count");
    expect(kitError({ ...ok, boxCount: Number.NaN })).toBe("kits.err_count");
  });

  it("цена в $: больше нуля, до центов, не выше 100 000", () => {
    expect(kitError({ ...ok, priceUsd: 0 })).toBe("kits.err_price");
    expect(kitError({ ...ok, priceUsd: Number.NaN })).toBe("kits.err_price");
    expect(kitError({ ...ok, priceUsd: 4.999 })).toBe("kits.err_price");
    expect(kitError({ ...ok, priceUsd: 100_000.01 })).toBe("kits.err_price");
  });

  it("тираж и лимит — целые от 1 или пусто", () => {
    expect(kitError({ ...ok, stock: 0 })).toBe("kits.err_stock");
    expect(kitError({ ...ok, stock: 2.5 })).toBe("kits.err_stock");
    expect(kitError({ ...ok, perAccount: 0 })).toBe("kits.err_per_account");
    expect(kitError({ ...ok, perAccount: null, stock: null })).toBeNull();
  });
});

describe("цены", () => {
  it("те же, что у тарифа подписки: USDT, DARAI по курсу, Stars", () => {
    const p = kitPrices(10, 2_601_118);
    expect(p).toEqual({
      USDT: priceIn(10, "USDT", 2_601_118),
      Darai: priceIn(10, "Darai", 2_601_118),
      STARS: priceIn(10, "STARS", 2_601_118),
    });
    expect(p.USDT).toBe(10);
  });

  it("нет курса — DARAI без цены, USDT и Stars есть", () => {
    const p = kitPrices(10, null);
    expect(p.Darai).toBeNull();
    expect(p.USDT).toBe(10);
    expect(p.STARS).toBeGreaterThan(0);
  });
});

describe("витрина", () => {
  it("остаток тиража и почему нельзя купить", () => {
    expect(kitLeft(null, 5)).toBeNull();
    expect(kitLeft(10, 12)).toBe(0);
    expect(kitBlock({ left: 0, perAccount: null, mine: 0 })).toBe("sold_out");
    expect(kitBlock({ left: 3, perAccount: 1, mine: 1 })).toBe("limit");
    expect(kitBlock({ left: null, perAccount: 2, mine: 1 })).toBeNull();
  });

  it("имя — бокса, несколько штук — с «×N»", () => {
    expect(kitTitle({ boxName: "Dragon Pack", boxImage: null, boxCount: 1 })).toBe("Dragon Pack");
    expect(kitTitle({ boxName: "Dragon Pack", boxImage: null, boxCount: 3 })).toBe(
      "Dragon Pack ×3",
    );
  });
});
