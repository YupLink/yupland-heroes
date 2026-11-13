// Цена шамана в settings.shaman_config: ровно один ресурс счёта и целая сумма
// 1…потолок; всё прочее — «не продаём» (окно: «Скоро в продаже»).
import { describe, expect, it } from "vitest";
import { SHAMAN_PRICE_MAX, parseShamanConfig, shamanConfigJson } from "./shamanHut";

describe("цена шамана", () => {
  it("нет строки, битая строка, пустая цена — не продаём", () => {
    for (const raw of [null, undefined, "", "{", "null", { price: null }, { price: {} }, []])
      expect(parseShamanConfig(raw)).toEqual({ price: null });
  });
  it("строка JSON и объект — одно и то же; золото по умолчанию не подставляем", () => {
    expect(parseShamanConfig('{"price":{"gold":500}}')).toEqual({
      price: { currency: "gold", amount: 500 },
    });
    expect(parseShamanConfig({ price: { diamonds: 3 } })).toEqual({
      price: { currency: "diamonds", amount: 3 },
    });
  });
  it("чужой ресурс, два ресурса, ноль, дробь, сверх потолка — не продаём", () => {
    for (const price of [
      { darai: 5 },
      { gold: 5, wood: 1 },
      { gold: 0 },
      { gold: 1.5 },
      { gold: SHAMAN_PRICE_MAX + 1 },
      { gold: "abc" },
    ])
      expect(parseShamanConfig({ price })).toEqual({ price: null });
  });
  it("запись и чтение сходятся", () => {
    const price = { currency: "stone" as const, amount: 1200 };
    expect(parseShamanConfig(shamanConfigJson(price))).toEqual({ price });
    expect(parseShamanConfig(shamanConfigJson(null))).toEqual({ price: null });
    expect(shamanConfigJson(price)).toBe('{"price":{"stone":1200}}');
  });
});
