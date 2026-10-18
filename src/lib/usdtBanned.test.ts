// USDT не настраивается наградой без предела (ПРАВИЛА §8.49а): общий помощник.
import { describe, expect, it } from "vitest";
import {
  assertNoUsdtCell,
  assertNoUsdtFillers,
  assertNotUsdt,
  isUsdt,
  usdtInBuildingConfig,
  usdtInFillers,
  USDT_BANNED_MSG,
  withoutUsdt,
} from "@/lib/usdtBanned";
import { prizeError } from "@/lib/tournament/prizeText";

describe("isUsdt", () => {
  it("регистр и пробелы по краям не важны; пусто и прочие токены — нет", () => {
    for (const s of ["USDT", "usdt", "Usdt", " USDT "]) expect(isUsdt(s)).toBe(true);
    for (const s of ["Darai", "STARS", "USDC", "usdt2", "", null, undefined])
      expect(isUsdt(s)).toBe(false);
  });

  it("assertNotUsdt бросает текст правила, прочее пропускает", () => {
    expect(() => assertNotUsdt("usdt")).toThrow(USDT_BANNED_MSG);
    expect(() => assertNotUsdt("Darai")).not.toThrow();
    expect(() => assertNotUsdt(null)).not.toThrow();
  });

  it("withoutUsdt убирает USDT из пикера, порядок прочих тот же", () => {
    expect(withoutUsdt(["Darai", "USDT", "STARS", "usdt"])).toEqual(["Darai", "STARS"]);
  });
});

describe("наполнители награды (босс, рейд, сундук)", () => {
  it("USDT — только у вида token", () => {
    expect(usdtInFillers({ fillers: [{ kind: "token", token: "usdt" }] })).toBe(true);
    expect(usdtInFillers({ fillers: [{ kind: "likes", token: "USDT" }] })).toBe(false);
    expect(usdtInFillers({ fillers: [{ kind: "token", token: "Darai" }] })).toBe(false);
    expect(usdtInFillers(undefined)).toBe(false);
  });

  it("assertNoUsdtFillers отказывает", () => {
    expect(() => assertNoUsdtFillers({ fillers: [{ kind: "token", token: "USDT" }] })).toThrow(
      USDT_BANNED_MSG,
    );
    expect(() => assertNoUsdtFillers({ fillers: [] })).not.toThrow();
  });
});

describe("постройка клетки: шахта и грядка", () => {
  it("шахта плоско и под mine, грядка — field.reward", () => {
    expect(usdtInBuildingConfig({ resource: "token", token: "USDT", yield: 5 })).toBe(true);
    expect(usdtInBuildingConfig({ mine: { resource: "token", token: "usdt" } })).toBe(true);
    expect(
      usdtInBuildingConfig({
        field: { reward: { kind: "resource", resource: "token", token: "USDT" } },
      }),
    ).toBe(true);
  });

  it("прочее не трогаем: другой токен, ресурс, товар, мусор", () => {
    expect(usdtInBuildingConfig({ resource: "token", token: "Darai" })).toBe(false);
    expect(usdtInBuildingConfig({ resource: "gold", token: "USDT" })).toBe(false);
    expect(usdtInBuildingConfig({ field: { reward: { kind: "item", itemId: "USDT" } } })).toBe(
      false,
    );
    expect(usdtInBuildingConfig({ text: "USDT" })).toBe(false);
    expect(usdtInBuildingConfig(null)).toBe(false);
    expect(usdtInBuildingConfig("USDT")).toBe(false);
  });

  it("отказ называет клетку", () => {
    expect(() => assertNoUsdtCell("3,-2", { resource: "token", token: "USDT" })).toThrow(
      `Клетка 3,-2: ${USDT_BANNED_MSG}`,
    );
    expect(assertNoUsdtCell("3,-2", { resource: "gold" })).toBe(true);
  });
});

describe("приз турнира", () => {
  it("токен USDT — ключ tour.err.usdt; DARAI и ресурсы — годны", () => {
    expect(prizeError({ kind: "token", amount: 5, refId: "USDT" })).toBe("tour.err.usdt");
    expect(prizeError({ kind: "token", amount: 5, refId: "usdt" })).toBe("tour.err.usdt");
    expect(prizeError({ kind: "token", amount: 5, refId: "Darai" })).toBeNull();
    expect(prizeError({ kind: "resource", amount: 5, refId: "gold" })).toBeNull();
  });
});
