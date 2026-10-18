// Блок «Очки навыков»: когда он есть, сколько свободно, активна ли «+».
import { describe, expect, it } from "vitest";
import { canAddSkill, skillPointsView } from "@/components/heroes/heroSkillPointsView";

const rare25 = {
  id: "h1",
  level: 25,
  baseLevel: 20,
  skills: { trade: 2 },
  skillEarned: 7,
  skillFree: 5,
};

describe("skillPointsView", () => {
  it("старый ответ из кэша без полей очков — блока нет", () => {
    expect(skillPointsView({ id: "h1", level: 25 })).toBeNull();
  });

  it("обычный уровень без очков — блока нет", () => {
    expect(
      skillPointsView({
        id: "h1",
        level: 20,
        baseLevel: 20,
        skills: {},
        skillEarned: 0,
        skillFree: 0,
      }),
    ).toBeNull();
  });

  it("повышенный уровень: восемь строк, вложенное и свободное", () => {
    const v = skillPointsView(rare25)!;
    expect(v.rows.map((r) => r.key)).toEqual([
      "atk",
      "arm",
      "int",
      "spd",
      "hp",
      "luck",
      "trade",
      "alchemy",
    ]);
    expect(v.rows.find((r) => r.key === "trade")?.spent).toBe(2);
    expect(v.rows.find((r) => r.key === "atk")?.spent).toBe(0);
    expect(v).toMatchObject({ free: 5, earned: 7 });
  });

  it("всё вложено — блок есть, «+» неактивна", () => {
    const v = skillPointsView({ ...rare25, skills: { trade: 7 }, skillFree: 0 });
    expect(v?.free).toBe(0);
    expect(canAddSkill(v, false)).toBe(false);
  });

  it("ответ «+» свежее списка: второй тап идёт с новым from", () => {
    const v = skillPointsView(rare25, { heroId: "h1", skills: { trade: 3 }, earned: 7 })!;
    expect(v.rows.find((r) => r.key === "trade")?.spent).toBe(3);
    expect(v.free).toBe(4);
  });

  it("перечитанный список обогнал ответ — берём больше, а не старое", () => {
    const v = skillPointsView(
      { ...rare25, skills: { trade: 4, hp: 1 } },
      {
        heroId: "h1",
        skills: { trade: 3 },
        earned: 7,
      },
    )!;
    expect(v.rows.find((r) => r.key === "trade")?.spent).toBe(4);
    expect(v.free).toBe(2);
  });

  it("ответ про другого героя не подмешивается", () => {
    const v = skillPointsView(rare25, { heroId: "h2", skills: { atk: 5 }, earned: 17 })!;
    expect(v.rows.find((r) => r.key === "atk")?.spent).toBe(0);
    expect(v.earned).toBe(7);
  });
});

describe("canAddSkill", () => {
  it("есть свободные — активна; пока летит прошлый тап — нет", () => {
    const v = skillPointsView(rare25);
    expect(canAddSkill(v, false)).toBe(true);
    expect(canAddSkill(v, true)).toBe(false);
    expect(canAddSkill(null, false)).toBe(false);
  });
});
