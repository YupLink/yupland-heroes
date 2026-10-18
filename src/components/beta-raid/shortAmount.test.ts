// Короткая запись чисел в полосе ресурсов: игроки жаловались, что от пятизначных
// «разъезжаются перегородки». Правило одно — от тысячи пишем «к».
import { describe, it, expect } from "vitest";
import { shortAmount } from "./BetaRaidResourceBar";

describe("shortAmount", () => {
  it("до тысячи — как есть", () => {
    expect(shortAmount(0)).toBe("0");
    expect(shortAmount(999)).toBe("999");
  });

  it("от тысячи — в «к»", () => {
    expect(shortAmount(1000)).toBe("1к");
    expect(shortAmount(2288)).toBe("2.3к");
    expect(shortAmount(15_400)).toBe("15.4к");
  });

  it("сотни тысяч — без дробей, миллионы — в «М»", () => {
    expect(shortAmount(250_000)).toBe("250к");
    expect(shortAmount(1_240_000)).toBe("1.24М");
  });

  it("дробные знаки живут только ниже тысячи (энергия)", () => {
    expect(shortAmount(4.21, 2)).toBe("4.21");
  });

  it("минус не теряется", () => {
    expect(shortAmount(-1500)).toBe("-1.5к");
  });
});
