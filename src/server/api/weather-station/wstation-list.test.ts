// «Метеостанция»: список миров — тот же отбор, что у обхода погоды базы
// (raid_weather_tick: открытые и главный мир, без островов), погода и шансы —
// прогнозом сервера; мира без погоды в окне нет; шансы — без нулевых, уровень
// ясно → шторм, температура по возрастанию; миры — по названию.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeatherForecast } from "@/server/api/beta-raid/weather/weather-odds";
import type { RaidWeather } from "@/server/api/beta-raid/weather/weather-get";

const s = vi.hoisted(() => ({
  maps: [] as Array<{ id: string; name: string | null; hidden?: boolean }>,
  forecasts: {} as Record<string, unknown>,
  asked: [] as string[],
  sql: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/auth", () => ({
  isAdminWallet: (w: string) => w === "w_admin",
  requireAdmin: () => "w_me",
}));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: true }];
    if (/FROM yuplink.raid_maps/.test(sql)) return s.maps;
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/weather/weather-odds", () => ({
  readWeatherOdds: async () => ({}),
  weatherForecastOf: async (mapId: string) => {
    s.asked.push(mapId);
    return s.forecasts[mapId] ?? null;
  },
}));

const { stationWorld, stationWorlds, weatherWorldsSql, getWeatherStation } =
  await import("./wstation-list");

const NEXT = Date.parse("2026-10-28T15:00:00Z");
const now = (o: Partial<RaidWeather> = {}): RaidWeather => ({
  mapId: "map_a",
  kind: "rain",
  level: "overcast",
  temperatureC: 10,
  worldName: null,
  slotAt: NEXT - 3 * 3_600_000,
  nextAt: NEXT,
  coefs: { fish: 1, mine: 1, farm: 1, step: 1, ship: 1 },
  effectsOn: false,
  ...o,
});
const forecast = (o: Partial<WeatherForecast> = {}): WeatherForecast => ({
  now: now(),
  levels: [
    { value: "clear", p: 25 },
    { value: "storm", p: 25 },
    { value: "overcast", p: 50 },
  ],
  temps: [
    { value: 0, p: 30 },
    { value: 10, p: 40 },
    { value: 20, p: 30 },
  ],
  ...o,
});

beforeEach(() => {
  Object.assign(s, { maps: [], forecasts: {}, asked: [], sql: [] });
});

describe("отбор миров", () => {
  it("тот же, что в raid_weather_tick: открытые и главный мир, без островов", () => {
    expect(weatherWorldsSql).toContain("rm.active OR rm.id = (SELECT (s.value::jsonb)->>'mapId'");
    expect(weatherWorldsSql).toContain("s.key = 'beta_raid_map'");
    expect(weatherWorldsSql).toContain("left(rm.id, 5) <> 'isle_'");
    expect(weatherWorldsSql).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.raid_island i WHERE i.map_id = rm.id)",
    );
  });
});

describe("блок мира", () => {
  it("погода сейчас, смена и шансы: уровень ясно → шторм, температура по возрастанию", () => {
    const f = forecast({
      temps: [
        { value: 20, p: 30 },
        { value: 0, p: 30 },
        { value: 10, p: 40 },
      ],
    });
    expect(stationWorld({ id: "map_a", name: "Мир Альфа" }, f)).toEqual({
      mapId: "map_a",
      name: "Мир Альфа",
      kind: "rain",
      temperatureC: 10,
      nextAt: NEXT,
      levels: [
        { value: "clear", p: 25 },
        { value: "overcast", p: 50 },
        { value: "storm", p: 25 },
      ],
      temps: [
        { value: 0, p: 30 },
        { value: 10, p: 40 },
        { value: 20, p: 30 },
      ],
      votes: {},
      targets: ["clear", "overcast", "storm", "warmer", "colder"],
      hidden: false,
    });
  });
  it("голоса шаманов уже в шансах: 5 за ясно — +15 %, у остальных пропорционально", () => {
    const w = stationWorld({ id: "map_a", name: "Мир Альфа" }, forecast(), { clear: 5 });
    expect(w.levels.map((c) => [c.value, Math.round(c.p * 100) / 100])).toEqual([
      ["clear", 40],
      ["overcast", 40],
      ["storm", 20],
    ]);
    expect(w.votes).toEqual({ clear: 5 });
  });
  it("скрытый админом мир игрок не видит, админ — видит с пометкой", async () => {
    s.maps = [
      { id: "map_a", name: "Мир Альфа", hidden: false },
      { id: "map_t", name: "Генерация 128", hidden: true },
    ];
    s.forecasts = { map_a: forecast(), map_t: forecast() };
    expect((await stationWorlds(NEXT - 1000)).map((w) => w.mapId)).toEqual(["map_a"]);
    const all = await stationWorlds(NEXT - 1000, {}, true);
    expect(all.map((w) => [w.mapId, w.hidden])).toEqual([
      ["map_t", true],
      ["map_a", false],
    ]);
  });
  it("нулевые шансы убраны; нет названия — id карты", () => {
    const f = forecast({
      levels: [
        { value: "overcast", p: 0 },
        { value: "clear", p: 100 },
      ],
      temps: [
        { value: 30, p: 0 },
        { value: 40, p: 100 },
      ],
    });
    const w = stationWorld({ id: "map_z", name: null }, f);
    expect(w.name).toBe("map_z");
    expect(w.levels).toEqual([{ value: "clear", p: 100 }]);
    expect(w.temps).toEqual([{ value: 40, p: 100 }]);
  });
});

describe("все миры", () => {
  it("прогноз по каждому миру; без погоды — мимо; порядок — по названию", async () => {
    s.maps = [
      { id: "map_b", name: "Мир Бета" },
      { id: "map_a", name: "Мир Альфа" },
      { id: "map_x", name: "Без погоды" },
    ];
    s.forecasts = {
      map_a: forecast(),
      map_b: forecast({
        now: now({ mapId: "map_b", kind: "clear", level: "clear", temperatureC: -10 }),
      }),
    };
    const list = await stationWorlds(NEXT - 60_000);
    expect(s.asked.sort()).toEqual(["map_a", "map_b", "map_x"]);
    expect(list.map((w) => `${w.name}:${w.kind}:${w.temperatureC}`)).toEqual([
      "Мир Альфа:rain:10",
      "Мир Бета:clear:-10",
    ]);
  });
  it("миров нет — пусто", async () => {
    expect(await stationWorlds()).toEqual([]);
    expect(s.asked).toEqual([]);
  });
  it("окно — миры и часы сервера", async () => {
    s.maps = [{ id: "map_a", name: "Мир Альфа" }];
    s.forecasts = { map_a: forecast() };
    const v = await (
      getWeatherStation as unknown as () => Promise<{ worlds: unknown[]; serverNow: number }>
    )();
    expect(v.worlds).toHaveLength(1);
    expect(v.serverNow).toBeGreaterThan(0);
    expect(s.sql.some((q) => /kind = 'weather_station'/.test(q))).toBe(true);
  });
});
