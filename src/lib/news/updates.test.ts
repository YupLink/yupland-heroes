import { describe, expect, it } from "vitest";
import { NEWS_UPDATES, updatesSince } from "./updates";
import { clampNewsDays, daysOfRange } from "./types";

describe("NEWS_UPDATES", () => {
  it("у каждого дня строки ru и en поровну, без пустых", () => {
    for (const e of NEWS_UPDATES) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.ru.length).toBe(e.en.length);
      expect(e.ru.length).toBeGreaterThan(0);
      for (const s of [...e.ru, ...e.en]) expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("дни не повторяются", () => {
    const dates = NEWS_UPDATES.map((e) => e.date);
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe("updatesSince", () => {
  const list = [
    { date: "2026-10-27", ru: ["б"], en: ["b"] },
    { date: "2026-10-29", ru: ["а"], en: ["a"] },
    { date: "2026-10-20", ru: ["в"], en: ["c"] },
  ];
  it("с даты включительно, новые сверху, на нужном языке", () => {
    expect(updatesSince("2026-10-27", "ru", list)).toEqual([
      { date: "2026-10-29", items: ["а"] },
      { date: "2026-10-27", items: ["б"] },
    ]);
    expect(updatesSince("2026-10-28", "en", list)).toEqual([{ date: "2026-10-29", items: ["a"] }]);
  });
  it("окно выпуска: конец не входит; заголовок дня — на нужном языке", () => {
    expect(updatesSince("2026-10-20", "ru", list, "2026-10-28").map((d) => d.date)).toEqual([
      "2026-10-27",
      "2026-10-20",
    ]);
    const day = updatesSince("2026-10-29", "en", NEWS_UPDATES, "2026-10-30")[0];
    expect(day.headline?.title).toBe("Chop by hand, even with an axe");
    expect(day.headline?.images).toContain("/hero-actions/knight/hand/right-down.png@1");
  });
});

describe("окно в днях", () => {
  it("clampNewsDays: 1…30, мусор — неделя", () => {
    expect(clampNewsDays("1")).toBe(1);
    expect(clampNewsDays(90)).toBe(30);
    expect(clampNewsDays("abc")).toBe(7);
    expect(clampNewsDays(0)).toBe(7);
  });
  it("daysOfRange: пресеты панели", () => {
    expect(daysOfRange("2026-10-28T18:00:00Z", "2026-10-29T18:00:00Z")).toBe(1);
    expect(daysOfRange("2026-10-22T18:00:00Z", "2026-10-29T18:00:00Z")).toBe(7);
    expect(daysOfRange("2026-07-29T18:00:00Z", "2026-10-29T18:00:00Z")).toBe(30);
    expect(daysOfRange("x", "y")).toBe(7);
  });
});
