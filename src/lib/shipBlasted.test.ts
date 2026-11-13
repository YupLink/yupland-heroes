// Срок подбитого корабля: «исчезает через час» — сколько минут показать в окне.
import { describe, expect, it } from "vitest";
import { blastedLeftMin, SHIP_BLASTED_TTL_MIN } from "./shipBlasted";

const MIN = 60_000;
const at = Date.UTC(2026, 9, 30, 12, 0, 0);

describe("blastedLeftMin", () => {
  it("не подбит — null", () => {
    expect(blastedLeftMin(null, at)).toBeNull();
    expect(blastedLeftMin(undefined, at)).toBeNull();
    expect(blastedLeftMin(Number.NaN, at)).toBeNull();
  });

  it("только что подбит — целый час", () => {
    expect(blastedLeftMin(at, at)).toBe(SHIP_BLASTED_TTL_MIN);
  });

  it("минуты вверх: осталось 30 с — ещё «1 мин»", () => {
    expect(blastedLeftMin(at, at + 59 * MIN + 30_000)).toBe(1);
    expect(blastedLeftMin(at, at + 20 * MIN)).toBe(40);
  });

  it("час прошёл, уборки ещё не было — ноль, не минус", () => {
    expect(blastedLeftMin(at, at + 60 * MIN)).toBe(0);
    expect(blastedLeftMin(at, at + 90 * MIN)).toBe(0);
  });
});
