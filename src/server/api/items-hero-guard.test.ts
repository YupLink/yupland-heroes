// Гард шаблона героя: то, что пропустило конструктор 15.09.2026 (герой с расой
// и прочерком в спеце), теперь отбивается на сервере; артефакты не трогаем.
import { describe, expect, it } from "vitest";
import { HERO_RACE_SPEC_ERROR, assertHeroRaceSpec } from "@/server/api/items-hero-guard";

describe("assertHeroRaceSpec", () => {
  it("create: герой с расой, но без спеца — отказ (сам инцидент)", () => {
    expect(() => assertHeroRaceSpec("hero", { race: "Дракон" }, "create")).toThrow(
      HERO_RACE_SPEC_ERROR,
    );
    expect(() =>
      assertHeroRaceSpec("hero", { race: "Дракон", specialization: "" }, "create"),
    ).toThrow();
    expect(() => assertHeroRaceSpec("hero", { specialization: "Маг" }, "create")).toThrow();
    expect(() =>
      assertHeroRaceSpec("hero", { race: "Гоблин", specialization: "Маг" }, "create"),
    ).toThrow();
    expect(() =>
      assertHeroRaceSpec("hero", { race: "Пчела", specialization: "Жрец" }, "create"),
    ).toThrow();
  });

  it("create: полная пара из таблицы проходит", () => {
    expect(() =>
      assertHeroRaceSpec("hero", { race: "Пчела", specialization: "Маг" }, "create"),
    ).not.toThrow();
    expect(() =>
      assertHeroRaceSpec("hero", { race: " Дракон ", specialization: "Путешественник" }, "create"),
    ).not.toThrow();
  });

  it("update: обнулить спец у героя нельзя, а патч без расы/спеца (active, картинка) проходит", () => {
    expect(() => assertHeroRaceSpec("hero", { specialization: null }, "update")).toThrow(
      HERO_RACE_SPEC_ERROR,
    );
    expect(() => assertHeroRaceSpec("hero", { race: null }, "update")).toThrow();
    expect(() => assertHeroRaceSpec("hero", { specialization: "Маг" }, "update")).not.toThrow();
    expect(() => assertHeroRaceSpec("hero", {}, "update")).not.toThrow();
  });

  it("артефакт и прочие виды: пустые раса/спец законны", () => {
    expect(() =>
      assertHeroRaceSpec("artifact", { race: null, specialization: null }, "update"),
    ).not.toThrow();
    expect(() => assertHeroRaceSpec("boss", { race: "Дракон" }, "create")).not.toThrow();
  });
});
