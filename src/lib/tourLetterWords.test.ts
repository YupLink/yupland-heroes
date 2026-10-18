// Письмо о турнирах — слова: числа ru/en, срок по UTC, призы и цена записи
// (tourLetterText, tourLetterPrizes). Сборка письма целиком — tourLetter.test.ts.
import { describe, expect, it } from "vitest";
import { letterNum, termText } from "./tourLetterText";
import { letterPrice, letterPrize } from "./tourLetterPrizes";

describe("письмо о турнирах — слова", () => {
  it("составная цена — все строки разом", () => {
    const price = [
      { resource: "gold" as const, amount: 5 },
      { resource: "token" as const, token: "USDT", amount: 1.5 },
      { resource: "item" as const, itemKey: "custom:t", itemName: "Бочки", amount: 2 },
    ];
    expect(letterPrice(price, "ru")).toBe("5 золота, 1,5 USDT и Бочки ×2");
    expect(letterPrice(price, "en")).toBe("5 gold, 1.5 USDT and Barrels ×2");
    expect(letterPrice([{ resource: "gold", amount: 0 }], "ru")).toBeNull();
  });

  it("числа: ru «27,3 млн», «50 000»; en «27.3M», «50,000»", () => {
    expect(letterNum(27_272_727, "ru")).toBe("27,3 млн");
    expect(letterNum(27_272_727, "en")).toBe("27.3M");
    expect(letterNum(50_000, "ru")).toBe("50 000");
    expect(letterNum(50_000, "en")).toBe("50,000");
    expect(letterNum(1_140_000_000, "ru")).toBe("1,1 млрд");
    expect(letterNum(1_140_000_000, "en")).toBe("1.1B");
  });

  it("срок: без конца — «на N дней», без начала — «На N дней», по UTC", () => {
    const t = { startAt: "2026-10-06T21:30:00.000Z", endAt: null, days: 1 };
    expect(termText(t, "ru")).toBe("Со вторника 6 октября 21:30 (UTC), на 1 день.");
    expect(termText(t, "en")).toBe("From Tuesday, October 6, 21:30 (UTC), for 1 day.");
    expect(termText({ startAt: null, endAt: null, days: 5 }, "ru")).toBe("На 5 дней.");
    expect(termText({ startAt: "мусор", endAt: null, days: 2 }, "en")).toBe("For 2 days.");
  });

  it("призы: склонения, артефакт по редкости, штучное по имени", () => {
    expect(letterPrize({ kind: "likes", amount: 21 }, "ru")).toBe("21 лайк");
    expect(letterPrize({ kind: "tickets", amount: 3 }, "ru")).toBe("3 билета");
    expect(letterPrize({ kind: "resource", amount: 1, refId: "diamonds" }, "en")).toBe("1 diamond");
    expect(letterPrize({ kind: "art", amount: 2, refId: "rarity:epic" }, "ru")).toBe(
      "2 эпических артефакта",
    );
    expect(letterPrize({ kind: "art", amount: 21, refId: "rarity:rare" }, "ru")).toBe(
      "21 редкий артефакт",
    );
    expect(letterPrize({ kind: "art", amount: 1, refId: "art_1", title: "Меч" }, "ru")).toBe("Меч");
    expect(letterPrize({ kind: "pack", amount: 2, refId: "pk_1", title: "Пак Лес" }, "ru")).toBe(
      "Пак Лес ×2",
    );
    expect(letterPrize({ kind: "hero", amount: 1, refId: "h_1" }, "en")).toBe("h_1");
    expect(letterPrize({ kind: "custom", amount: 1, refId: "" }, "ru")).toBe("товар");
  });
});
