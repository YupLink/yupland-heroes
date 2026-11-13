// Клад дня (§8.117): слот 09:00 МСК (с 08.11.2026), приз из фонда, подписи.
import { describe, expect, it } from "vitest";
import { mskText, prizeProblem, prizeText, treasureSlot } from "./treasure";

describe("слот клада — 09:00 по Москве (06:00 UTC)", () => {
  it("после 06:00 UTC — сегодняшний, до — вчерашний", () => {
    expect(treasureSlot(Date.UTC(2026, 10, 7, 6, 0))).toEqual({
      day: "2026-11-07",
      startMs: Date.UTC(2026, 10, 7, 6),
    });
    expect(treasureSlot(Date.UTC(2026, 10, 7, 5, 59)).day).toBe("2026-11-06");
    expect(treasureSlot(Date.UTC(2026, 11, 1, 3)).day).toBe("2026-11-30");
  });

  it("время — по Москве", () => {
    expect(mskText(Date.UTC(2026, 10, 8, 9))).toBe("08.11 12:00 МСК");
    expect(mskText(Date.UTC(2026, 10, 8, 9), "en")).toBe("08.11 12:00 MSK");
  });
});

describe("приз фонда", () => {
  it("только целые; предмет и токен — с выбором", () => {
    expect(prizeProblem({ resource: "gold", token: null, amount: 500 })).toBeNull();
    expect(prizeProblem({ resource: "token", token: "Darai", amount: 5_000_000 })).toBeNull();
    // Дробный токен счёт не примет (fractional_not_allowed) — клад не выдался бы.
    expect(prizeProblem({ resource: "token", token: "Darai", amount: 0.5 })).toBe(
      "treasure.bad_amount",
    );
    expect(prizeProblem({ resource: "gold", token: null, amount: 0.5 })).toBe(
      "treasure.bad_amount",
    );
    expect(prizeProblem({ resource: "gold", token: null, amount: 0 })).toBe("treasure.bad_amount");
    expect(prizeProblem({ resource: "token", token: null, amount: 5 })).toBe("treasure.bad_ref");
    expect(prizeProblem({ resource: "art", token: "art_1", amount: 1 })).toBeNull();
  });

  it("«любой артефакт», герой, босс и билеты кладом не бывают", () => {
    expect(prizeProblem({ resource: "art", token: "art_any_rare", amount: 1 })).toBe(
      "treasure.bad_ref",
    );
    expect(prizeProblem({ resource: "hero", token: "h", amount: 1 })).toBe("treasure.bad_kind");
    expect(prizeProblem({ resource: "boss", token: "b", amount: 1 })).toBe("treasure.bad_kind");
    expect(prizeProblem({ resource: "tickets", token: null, amount: 1 })).toBe("treasure.bad_kind");
  });

  it("подпись: токен символом, предмет именем, ресурс словом", () => {
    expect(prizeText({ resource: "token", token: "Darai", amount: 5_000_000, name: null })).toBe(
      "5 000 000 Darai",
    );
    expect(prizeText({ resource: "art", token: "art_1", amount: 1, name: "Меч" })).toBe("1 Меч");
    expect(prizeText({ resource: "gold", token: null, amount: 500, name: null })).toBe(
      "500 Золото",
    );
  });

  it("по-английски — английские слова", () => {
    expect(prizeText({ resource: "gold", token: null, amount: 1500, name: null }, "en")).toBe(
      "1,500 Gold",
    );
  });
});
