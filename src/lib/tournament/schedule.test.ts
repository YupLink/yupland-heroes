// Расписание турнира по UTC: проверки сохранения (adminTourSave).
import { describe, expect, it } from "vitest";
import { parseUtc, scheduleError } from "./schedule";

const NOW = Date.parse("2026-10-04T12:00:00.000Z");
const START = Date.parse("2026-10-05T00:00:00.000Z");
const END = Date.parse("2026-10-11T23:52:00.000Z");

describe("расписание", () => {
  it("пусто — старт кнопкой; ISO с Z читается как UTC", () => {
    expect(parseUtc("")).toBeNull();
    expect(parseUtc(null)).toBeNull();
    expect(parseUtc("2026-10-05T00:00:00.000Z")).toBe(START);
    expect(scheduleError({ startMs: null, endMs: null, nowMs: NOW })).toBeNull();
  });

  it("«9 королей»: понедельник 00:00 — воскресенье 23:52 UTC", () => {
    expect(scheduleError({ startMs: START, endMs: END, nowMs: NOW })).toBeNull();
    expect(scheduleError({ startMs: START, endMs: null, nowMs: NOW })).toBeNull();
  });

  it("ошибки ключами tour.err.*", () => {
    expect(scheduleError({ startMs: parseUtc("мусор"), endMs: null, nowMs: NOW })).toBe(
      "tour.err.time",
    );
    expect(scheduleError({ startMs: null, endMs: END, nowMs: NOW })).toBe("tour.err.end_no_start");
    expect(scheduleError({ startMs: NOW - 1, endMs: null, nowMs: NOW })).toBe(
      "tour.err.start_past",
    );
    expect(scheduleError({ startMs: END, endMs: START, nowMs: NOW })).toBe(
      "tour.err.end_before_start",
    );
    expect(scheduleError({ startMs: START, endMs: START, nowMs: NOW })).toBe(
      "tour.err.end_before_start",
    );
    expect(scheduleError({ startMs: START, endMs: START + 91 * 86_400_000, nowMs: NOW })).toBe(
      "tour.err.days",
    );
  });

  it("уже сохранённое начало можно оставить и в прошлом (правка после сбоя автостарта)", () => {
    const past = NOW - 60_000;
    expect(scheduleError({ startMs: past, endMs: null, nowMs: NOW, keepStartMs: past })).toBeNull();
    expect(scheduleError({ startMs: past - 1, endMs: null, nowMs: NOW, keepStartMs: past })).toBe(
      "tour.err.start_past",
    );
  });
});
