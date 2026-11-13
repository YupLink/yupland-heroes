// Погода карты на сервере: слот из базы одной функцией, кэш до конца слота,
// влияние — fx слота (settings не читаются), остров — без базы, сбой — все 1.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  row: null as Record<string, unknown> | null,
  fail: false,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (s.fail) throw new Error("db down");
    if (sql.includes("raid_weather_ensure")) return s.row ? [s.row] : [];
    return [];
  },
}));

const { appliedCoefs, ensureWeatherSql, mapWeatherCoefs, mapWeatherNow, resetWeatherCache } =
  await import("./weather-read");

const T0 = Date.parse("2026-10-26T21:10:00Z");
const SLOT = Date.parse("2026-10-26T21:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const ONES = { fish: 1, mine: 1, farm: 1, step: 1, ship: 1 };
const storm40 = {
  slot_at: "2026-10-26T21:00:00+00:00",
  temp_c: 40,
  level: "storm",
  kind: "storm",
  fx: false,
};
const ensures = () => s.sql.filter((x) => x.includes("raid_weather_ensure")).length;

beforeEach(() => {
  resetWeatherCache();
  Object.assign(s, { sql: [], row: storm40, fail: false });
});

describe("слот карты", () => {
  it("одна функция базы с картой и моментом (кавычки экранированы), с fx слота", () => {
    const sql = ensureWeatherSql("m'1", new Date(T0));
    expect(sql).toContain(
      "yuplink.raid_weather_ensure('m''1', '2026-10-26T21:10:00.000Z'::timestamptz) w",
    );
    expect(sql).toContain("SELECT w.slot_at, w.temp_c, w.level, w.kind, w.fx");
    expect(sql).toContain("WHERE w.map_id IS NOT NULL");
    expect(sql).not.toContain("settings");
  });

  it("строка → погода; кэш до конца слота, новый слот — снова в базу", async () => {
    await expect(mapWeatherNow("rmap_a", T0)).resolves.toEqual({
      mapId: "rmap_a",
      slotAt: SLOT,
      tempC: 40,
      level: "storm",
      kind: "storm",
      fx: false,
    });
    await mapWeatherNow("rmap_a", T0 + 2 * HOUR + 49 * MIN);
    expect(ensures()).toBe(1);
    // 00:10 Мск — ночной слот 00–04: следующий в 04:00 Мск (01:00 UTC).
    await mapWeatherNow("rmap_a", SLOT + 3 * HOUR);
    expect(ensures()).toBe(1);
    await mapWeatherNow("rmap_a", SLOT + 4 * HOUR);
    expect(ensures()).toBe(2);
    expect(s.sql.at(-1)).toContain("'2026-10-27T01:00:00.000Z'::timestamptz");
  });

  it("у каждой карты свой кэш", async () => {
    await mapWeatherNow("rmap_a", T0);
    await mapWeatherNow("rmap_b", T0);
    expect(ensures()).toBe(2);
  });

  it("остров новичка — null без базы", async () => {
    await expect(mapWeatherNow("isle_abc", T0)).resolves.toBeNull();
    expect(s.sql).toEqual([]);
  });

  it("неизвестная карта (нет строки) — null, минуту не спрашиваем", async () => {
    s.row = null;
    await expect(mapWeatherNow("rmap_x", T0)).resolves.toBeNull();
    await mapWeatherNow("rmap_x", T0 + 59_000);
    expect(ensures()).toBe(1);
    await mapWeatherNow("rmap_x", T0 + MIN);
    expect(ensures()).toBe(2);
  });

  it("битая строка — null; fx — только true из базы", async () => {
    s.row = { ...storm40, kind: "cloudy" };
    await expect(mapWeatherNow("rmap_a", T0)).resolves.toBeNull();
    resetWeatherCache();
    s.row = { ...storm40, fx: "true" };
    await expect(mapWeatherNow("rmap_a", T0)).resolves.toMatchObject({ fx: false });
  });
});

describe("mapWeatherCoefs — влияние по fx слота", () => {
  it("fx false — все 1 (даже при шторме)", async () => {
    await expect(mapWeatherCoefs("rmap_a", T0)).resolves.toEqual(ONES);
  });

  it("fx true: шторм и +40 — рыба (0 + 4) / 2 = 2, стандарт 1 не в среднем; шаг в слоте — без базы", async () => {
    s.row = { ...storm40, fx: true };
    await expect(mapWeatherCoefs("rmap_a", T0)).resolves.toEqual({
      fish: 2,
      mine: 0.01,
      farm: 1.005,
      step: 5,
      ship: 10,
    });
    const before = s.sql.length;
    await mapWeatherCoefs("rmap_a", T0 + 30_000);
    expect(s.sql.length).toBe(before);
  });

  it("включили посреди слота — до смены погоды прежний fx; новый слот — новый fx", async () => {
    await expect(mapWeatherCoefs("rmap_a", T0)).resolves.toEqual(ONES);
    s.row = { ...storm40, fx: true };
    await expect(mapWeatherCoefs("rmap_a", T0 + HOUR)).resolves.toEqual(ONES);
    s.row = { ...storm40, slot_at: "2026-10-27T01:00:00+00:00", fx: true };
    await expect(mapWeatherCoefs("rmap_a", SLOT + 4 * HOUR)).resolves.toMatchObject({ fish: 2 });
  });

  it("остров — все 1 без базы", async () => {
    s.row = { ...storm40, fx: true };
    await expect(mapWeatherCoefs("isle_x", T0)).resolves.toEqual(ONES);
    expect(s.sql).toEqual([]);
  });

  it("погоды у карты нет — все 1", async () => {
    s.row = null;
    await expect(mapWeatherCoefs("rmap_x", T0)).resolves.toEqual(ONES);
  });

  it("сбой базы — все 1, в кэш не кладём", async () => {
    s.row = { ...storm40, fx: true };
    s.fail = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(mapWeatherCoefs("rmap_a", T0)).resolves.toEqual(ONES);
    s.fail = false;
    await expect(mapWeatherCoefs("rmap_a", T0 + 1000)).resolves.toMatchObject({ fish: 2 });
    warn.mockRestore();
  });

  it("каждый вызов — свой объект (правка у вызывающего не портит соседей)", async () => {
    const a = await mapWeatherCoefs("isle_x", T0);
    a.fish = 9;
    await expect(mapWeatherCoefs("isle_x", T0)).resolves.toMatchObject({ fish: 1 });
    expect(appliedCoefs(null)).toEqual(ONES);
  });
});
