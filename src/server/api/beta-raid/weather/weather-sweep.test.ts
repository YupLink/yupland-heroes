// Обход погоды: раз за слот в процессе, одна функция базы; сбой — повтор.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[], fail: false }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (s.fail) throw new Error("db down");
    return [{ maps: 5 }];
  },
}));

const { sweepWeather, resetWeatherSweep, weatherTickSql } = await import("./weather-sweep");

const T0 = Date.parse("2026-10-26T21:00:05Z");
const HOUR = 3600_000;

beforeEach(() => {
  resetWeatherSweep();
  Object.assign(s, { sql: [], fail: false });
});

describe("обход погоды", () => {
  it("SQL — raid_weather_tick на момент", () => {
    expect(weatherTickSql(new Date(T0))).toBe(
      "SELECT yuplink.raid_weather_tick('2026-10-26T21:00:05.000Z'::timestamptz) AS maps",
    );
  });

  it("раз за слот: в том же слоте — без базы, новый слот — снова", async () => {
    await expect(sweepWeather(T0)).resolves.toBe(true);
    // 00:00 Мск — ночной слот до 04:00.
    await expect(sweepWeather(T0 + 3 * HOUR)).resolves.toBe(false);
    await expect(sweepWeather(T0 + 4 * HOUR)).resolves.toBe(true);
    expect(s.sql).toHaveLength(2);
  });

  it("сбой — слот не засчитан, следующий проход пробует снова", async () => {
    s.fail = true;
    await expect(sweepWeather(T0)).rejects.toThrow("db down");
    s.fail = false;
    await expect(sweepWeather(T0 + 60_000)).resolves.toBe(true);
  });
});
