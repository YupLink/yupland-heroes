// Закладки героев таверны: правка списка, щелчок и разовый перенос со
// старого устройства (жалоба 04.11.2026: закреплённое не ехало на другое).
import { describe, expect, it } from "vitest";
import {
  MAX_TAVERN_PINS,
  applyPinsPatch,
  legacyPinsToImport,
  pinKeys,
  togglePinPatch,
} from "./tavernPins";

describe("applyPinsPatch", () => {
  it("дописывает новые в конец и снимает открепленные", () => {
    expect(applyPinsPatch(["item:a", "hero:b"], { add: ["item:c"], remove: ["item:a"] })).toEqual([
      "hero:b",
      "item:c",
    ]);
  });

  it("не задваивает уже закреплённого", () => {
    expect(applyPinsPatch(["item:a"], { add: ["item:a", "item:a"], remove: [] })).toEqual([
      "item:a",
    ]);
  });

  it("не выходит за потолок: сверх него новые не встают", () => {
    expect(applyPinsPatch(["item:a", "item:b"], { add: ["item:c"], remove: [] }, 2)).toEqual([
      "item:a",
      "item:b",
    ]);
  });
});

describe("togglePinPatch", () => {
  it("незакреплённого закрепляет, закреплённого открепляет", () => {
    expect(togglePinPatch(["item:a"], "hero:b")).toEqual({ add: ["hero:b"], remove: [] });
    expect(togglePinPatch(["item:a"], "item:a")).toEqual({ add: [], remove: ["item:a"] });
  });
});

describe("pinKeys", () => {
  it("берёт только ключи героев, без повторов", () => {
    expect(pinKeys(["item:a", "item:a", "template:t", 5, "hero:x'y", "hero:b"])).toEqual([
      "item:a",
      "hero:b",
    ]);
  });

  it("не массив — пусто", () => {
    expect(pinKeys(null)).toEqual([]);
    expect(pinKeys({ 0: "item:a" })).toEqual([]);
  });
});

describe("legacyPinsToImport", () => {
  it("переносит то, чего нет на аккаунте", () => {
    const raw = JSON.stringify(["item:a", "hero:b", "template:t"]);
    expect(legacyPinsToImport(raw, ["item:a"])).toEqual(["hero:b"]);
  });

  it("пустое, битое или чужое по форме устройство — переносить нечего", () => {
    expect(legacyPinsToImport(null, [])).toEqual([]);
    expect(legacyPinsToImport("{oops", [])).toEqual([]);
    expect(legacyPinsToImport(JSON.stringify({ a: 1 }), [])).toEqual([]);
  });

  it("не шлёт больше потолка", () => {
    const raw = JSON.stringify(
      Array.from({ length: MAX_TAVERN_PINS + 30 }, (_, i) => `item:h${i}`),
    );
    expect(legacyPinsToImport(raw, [])).toHaveLength(MAX_TAVERN_PINS);
  });
});
