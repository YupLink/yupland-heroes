// Карточка героя на повышенных уровнях: статы стоят на обычном потолке, сверху
// вложенные очки; заработано/свободно — по редкости и реальному уровню.
import { describe, expect, it } from "vitest";
import { heroCardStats, heroSkillCard } from "./heroes-skill-card";
import { heroStatsAt } from "@/lib/heroStats";

describe("heroSkillCard", () => {
  it("рар 30: потолок 20, 60 очков, свободно за вычетом вложенного", () => {
    expect(heroSkillCard("rare", 30, { atk: 5, trade: 2 })).toEqual({
      baseLevel: 20,
      skills: { atk: 5, trade: 2 },
      skillEarned: 60,
      skillFree: 53,
    });
  });

  it("обычный уровень и спящий — нули; мусор в jsonb не считается", () => {
    expect(heroSkillCard("epic", 30, "{}")).toMatchObject({ baseLevel: 30, skillEarned: 0 });
    expect(heroSkillCard("legendary", 0, null)).toEqual({
      baseLevel: 40,
      skills: {},
      skillEarned: 0,
      skillFree: 0,
    });
    expect(heroSkillCard("rare", 21, { atk: "x", foo: 3 }).skills).toEqual({});
  });
});

describe("heroCardStats", () => {
  it("эпик 36 = эпик 30 + очки", () => {
    const s = heroCardStats("Юпик", "Маг", "epic", 36, { int: 3 });
    const at30 = heroStatsAt("Юпик", "Маг", 30);
    expect(s).toEqual({ ...at30, int: at30.int + 3 });
  });

  it("следующий повышенный уровень статов не растит", () => {
    expect(heroCardStats("Кабан", "Воин", "rare", 23, {})).toEqual(
      heroCardStats("Кабан", "Воин", "rare", 24, {}),
    );
  });
});
