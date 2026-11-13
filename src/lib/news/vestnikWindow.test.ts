import { describe, expect, it } from "vitest";
import {
  dayWindow,
  dueIssues,
  issueKey,
  parseDay,
  parseVariant,
  recentWeek,
  weekWindow,
} from "./vestnikWindow";

const at = (iso: string) => Date.parse(iso);

describe("окна «Вестника героев»", () => {
  it("день — сутки UTC, номер от первого выпуска", () => {
    const w = dayWindow(at("2026-10-31T15:00:00Z"));
    expect(w).toMatchObject({ kind: "day", date: "2026-10-31", number: 3 });
    expect(w.from).toBe("2026-10-31T00:00:00.000Z");
    expect(w.to).toBe("2026-11-01T00:00:00.000Z");
    expect(dayWindow(at("2026-10-29T00:00:00Z")).number).toBe(1);
    expect(issueKey(w)).toBe("day_2026-10-31");
  });

  it("неделя — с понедельника по воскресенье", () => {
    const w = weekWindow(at("2026-11-01T23:59:00Z")); // воскресенье
    expect(w.date).toBe("2026-10-26");
    expect(w.to).toBe("2026-11-02T00:00:00.000Z");
    expect(w.number).toBe(1);
    expect(weekWindow(at("2026-11-02T08:00:00Z")).number).toBe(2);
  });

  it("сводка по кнопке — последние 7 дней по сегодня", () => {
    const w = recentWeek(at("2026-10-29T18:00:00Z"));
    expect(w.from).toBe("2026-10-23T00:00:00.000Z");
    expect(w.to).toBe("2026-10-30T00:00:00.000Z");
  });

  it("расписание: до 07:00 UTC — ничего, после — газета за вчера, в понедельник — и неделя", () => {
    expect(dueIssues(at("2026-10-31T06:59:00Z"))).toEqual([]);
    expect(dueIssues(at("2026-10-31T07:00:00Z")).map(issueKey)).toEqual(["day_2026-10-30"]);
    expect(dueIssues(at("2026-11-02T09:00:00Z")).map(issueKey)).toEqual([
      "day_2026-11-01",
      "week_2026-10-26",
    ]);
  });

  it("дни до первого выпуска не выходят", () => {
    expect(dueIssues(at("2026-10-29T10:00:00Z"))).toEqual([]);
    expect(dueIssues(at("2026-10-30T10:00:00Z")).map(issueKey)).toEqual(["day_2026-10-29"]);
  });

  it("parseDay: только YYYY-MM-DD", () => {
    expect(parseDay("2026-10-29")).toBe(at("2026-10-29T00:00:00Z"));
    expect(parseDay("29.10.2026")).toBeNull();
    expect(parseDay(null)).toBeNull();
  });

  it("вариант картинки из адреса: 0…99", () => {
    expect(parseVariant("3")).toBe(3);
    expect(parseVariant("500")).toBe(99);
    expect(parseVariant("-2")).toBe(0);
    expect(parseVariant(null)).toBe(0);
  });
});
