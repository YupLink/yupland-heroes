import { describe, expect, it } from "vitest";
import {
  HERO_ABILITIES,
  assertHeroAbility,
  heroAbilityLabel,
  heroAbilityOf,
} from "./heroAbilities";

describe("способность героя", () => {
  it("девять способностей из списка владельца, ru и en", () => {
    expect(HERO_ABILITIES.map((a) => a.ru)).toEqual([
      "Животновод",
      "Рыбак",
      "Владелец казино",
      "Дипломат",
      "Искатель кладов",
      "Владелец рынков",
      "Фермер",
      "Киллер",
      "Шахтёр",
    ]);
    expect(HERO_ABILITIES.every((a) => a.en.length > 0)).toBe(true);
  });

  it("читается из meta; нет или чужое слово — null", () => {
    expect(heroAbilityOf({ ability: "fisher", unique: true })).toBe("fisher");
    expect(heroAbilityOf({ ability: "Рыбак" })).toBeNull();
    expect(heroAbilityOf(null)).toBeNull();
    expect(heroAbilityLabel("fisher", "ru")).toBe("Рыбак");
    expect(heroAbilityLabel("fisher", "en")).toBe("Fisherman");
    expect(heroAbilityLabel(null, "ru")).toBe("");
  });

  it("сервер пускает пусто и из списка, остальное — отказ", () => {
    expect(() => assertHeroAbility({})).not.toThrow();
    expect(() => assertHeroAbility({ ability: "" })).not.toThrow();
    expect(() => assertHeroAbility({ ability: "killer" })).not.toThrow();
    expect(() => assertHeroAbility({ ability: "god" })).toThrow(/только из списка/);
  });
});
