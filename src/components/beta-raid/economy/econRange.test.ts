// Окно отчёта Экономики: пресеты от «сейчас», свой период из date-input.
import { describe, expect, it } from "vitest";
import { ECON_MAX_DAYS } from "@/lib/econ/types";
import { customRange, dayKey, defaultCustomDays, presetRange } from "./econRange";

const DAY = 24 * 60 * 60 * 1000;

describe("presetRange", () => {
  it("считает окно от момента вызова, «to» округлено вверх до минуты", () => {
    const now = Date.UTC(2026, 8, 22, 12, 34, 56, 789);
    const r = presetRange("24h", now);
    expect(r.to).toBe("2026-09-22T12:35:00.000Z");
    expect(Date.parse(r.to) - Date.parse(r.from)).toBe(DAY);
  });

  it("7d и 30d — ровно столько суток", () => {
    const now = Date.UTC(2026, 8, 22, 0, 0, 0);
    expect(Date.parse(presetRange("7d", now).to) - Date.parse(presetRange("7d", now).from)).toBe(
      7 * DAY,
    );
    expect(Date.parse(presetRange("30d", now).to) - Date.parse(presetRange("30d", now).from)).toBe(
      30 * DAY,
    );
  });

  it("в пределах одной минуты ключ не меняется", () => {
    const a = presetRange("7d", Date.UTC(2026, 8, 22, 10, 0, 1));
    const b = presetRange("7d", Date.UTC(2026, 8, 22, 10, 0, 59));
    expect(a).toEqual(b);
  });
});

describe("customRange", () => {
  it("с начала первого дня по конец второго", () => {
    const r = customRange("2026-09-01", "2026-09-03");
    expect(r).not.toBeNull();
    const from = new Date(r!.from);
    const to = new Date(r!.to);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    // Три полных дня минус миллисекунда.
    expect(to.getTime() - from.getTime()).toBe(3 * DAY - 1);
  });

  it("перепутанный порядок переворачивает, а не даёт пустое окно", () => {
    const straight = customRange("2026-09-01", "2026-09-03");
    const flipped = customRange("2026-09-03", "2026-09-01");
    expect(flipped).toEqual(straight);
  });

  it("окно длиннее ECON_MAX_DAYS подрезается с начала", () => {
    const r = customRange("2025-01-01", "2026-09-01");
    expect(r).not.toBeNull();
    const span = Date.parse(r!.to) - Date.parse(r!.from);
    expect(span).toBe(ECON_MAX_DAYS * DAY);
    expect(new Date(r!.to).getHours()).toBe(23);
  });

  it("пустое или битое поле → null", () => {
    expect(customRange("", "2026-09-01")).toBeNull();
    expect(customRange("2026-09-01", "abc")).toBeNull();
    expect(customRange("2026-13-45", "2026-09-01")).toBeNull();
  });
});

describe("dayKey / defaultCustomDays", () => {
  it("dayKey — локальная дата с ведущими нулями", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("по умолчанию — неделя по сегодня", () => {
    const now = new Date(2026, 8, 22, 15, 0, 0).getTime();
    const d = defaultCustomDays(now);
    expect(d.to).toBe("2026-09-22");
    expect(d.from).toBe("2026-09-15");
  });
});
