// Погода в показе добычи (weather-02): строки «Добычи» и «Управления шахтами», окно
// шахты и грядки берут слоты/секунды погоды из базы и считают тем же счётом, что
// выплата; без погоды (NULL / 0) строки ровно прежние. База подменена.
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 26, 0, 0, 0);

const s = vi.hoisted(() => ({
  sql: [] as string[],
  weather: null as unknown,
  sinceSec: 0 as number | string,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink.raid_mine_state s/.test(sql))
      return [
        {
          q: 1,
          r: 2,
          claimed_hours: 1,
          cap: T0,
          mushroom_config: { resource: "gold" },
          mushroom_image: null,
          resource: "gold",
          token: null,
          yield: null,
          max_hours: null,
          island: false,
          v2_std: 5,
          v2_mode: "base",
          v2_life_left: 1,
          v2_life_at: T0,
          v2_accrue: T0,
          v2_weather: s.weather,
        },
      ];
    if (/FROM yuplink.raid_field_worker w/.test(sql))
      return [
        {
          q: 3,
          r: 4,
          hero_id: "h1",
          hero_name: "Герой",
          accrued: 0.5,
          since_sec: s.sinceSec,
          workers: 2,
          cfg: { field: { yield: 4, reward: { kind: "resource", resource: "gold" } } },
        },
      ];
    return [];
  },
}));

const { ownedMineRows } = await import("./mine-pendings");
const { v2ColsSql } = await import("./mine-v2-sql");
const { mineCellState } = await import("./mine-v2-read");
const { mineRowReady } = await import("@/lib/mineLost");
const { officeMine } = await import("@/server/api/mine-office/mine-office-list");

const flat = (x: string) => x.replace(/\s+/g, " ").trim();

beforeEach(() => {
  s.sql = [];
  s.weather = null;
  s.sinceSec = 0;
});

describe("слоты погоды в строке шахты v2", () => {
  it("SQL: от первого несобранного часа до сейчас или поломки", () => {
    const cols = flat(v2ColsSql("s", "c.cfg"));
    expect(cols).toContain(
      "yuplink.raid_mine_weather_slots(s.map_id, s.accrue_from + make_interval(secs => (COALESCE(s.claimed_hours, 0) * 3600)::float8), LEAST(now(), yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at))) END AS v2_weather",
    );
  });

  it("без погоды (NULL) — строка прежняя, поля weather нет", async () => {
    const [row] = await ownedMineRows("alpha", "acc");
    expect(row).not.toHaveProperty("weather");
    expect(mineRowReady(row, T0 + 4 * H + 1)).toBe(15); // 3 часа × 5
  });

  it("слоты есть — «к сбору» с погодой; «Управление шахтами» несёт их же", async () => {
    s.weather = [
      [T0, 0.5],
      [T0 + 3 * H, 3],
    ];
    const [row] = await ownedMineRows("alpha", "acc");
    expect(row.weather).toEqual(s.weather);
    // Несобранные часы 01:00, 02:00 (слот 00–03, ×0,5) и 03:00 (03–06, ×3): 2,5 + 2,5 + 15.
    expect(mineRowReady(row, T0 + 4 * H + 1)).toBe(20);
    expect(mineRowReady(row, T0 + 3 * H + 1)).toBe(5);
    const office = officeMine(row, { map_id: "alpha", q: 1, r: 2, place: null, level: 1 });
    expect(office && mineRowReady(office, T0 + 3 * H + 1)).toBe(5);
  });

  it("окно шахты: слоты — в view (MineAction считает с ними)", () => {
    const base = {
      cell_std: 5,
      resource: "gold",
      owner_account: "acc",
      claimed_hours: 0,
      cap: T0,
      pending: 0,
      v2_std: 5,
      v2_mode: "base",
      v2_life_left: 1,
      v2_life_at: T0,
      v2_accrue: T0,
    };
    expect(mineCellState({ ...base, v2_weather: null }, T0 + H).view).not.toHaveProperty("weather");
    const st = mineCellState({ ...base, v2_weather: "[[" + T0 + ", 0.055]]" }, T0 + H);
    expect(st.view?.weather).toEqual([[T0, 0.055]]);
  });
});

describe("грядки: открытый отрезок с погодой", () => {
  it("SQL — секунды отрезка + Σ(коэф − 1) × секунды; число из базы идёт в «зреет»", async () => {
    const { myHarvestFields } = await import("./harvest-fields");
    s.sinceSec = 1800; // 1 час × 0,5 (погода) — то, что вернёт база
    const [f] = await myHarvestFields("alpha", "acc");
    expect(flat(s.sql.find((x) => /raid_field_worker w/.test(x)) ?? "")).toContain(
      "extract(epoch from (now() - w.since)) + yuplink.raid_field_weather_dsec(w.map_id, w.since, now()) AS since_sec",
    );
    // 0,5 + 0,5 ч × (4 / 2) = 1,5.
    expect(f.pending).toBe(1.5);
    expect(f.ready).toBe(1);
  });
});
