import { describe, expect, it } from "vitest";
import { prizeItemId } from "./TourPrizeList";

describe("приз-предмет открывает карточку", () => {
  it("конкретный артефакт (корона) — да", () => {
    expect(prizeItemId({ kind: "art", amount: 1, refId: "artifact_cJK-_0WCqW" })).toBe(
      "artifact_cJK-_0WCqW",
    );
  });
  it("артефакт по редкости — нет: какой выпадет, неизвестно", () => {
    expect(prizeItemId({ kind: "art", amount: 1, refId: "rarity:legendary" })).toBeNull();
  });
  it("токены и ресурсы — нет", () => {
    expect(prizeItemId({ kind: "token", amount: 5, refId: "Darai" })).toBeNull();
    expect(prizeItemId({ kind: "resource", amount: 5, refId: "gold" })).toBeNull();
  });
  it("герой из справочника — да; пустая ссылка — нет", () => {
    expect(prizeItemId({ kind: "hero", amount: 1, refId: "hero_x" })).toBe("hero_x");
    expect(prizeItemId({ kind: "art", amount: 1, refId: " " })).toBeNull();
  });
});
