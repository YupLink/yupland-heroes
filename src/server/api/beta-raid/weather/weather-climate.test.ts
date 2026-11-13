// Климат мира на сервере (05.11.2026): чтение тем же, чем бросает база (сбой — как всегда,
// в кэш не кладём), запись админом (проверка как у клиента и базы, «как всегда» не
// хранится, только админ, только мир с погодой), прогноз метеостанции и обряд — по климату.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeatherClimate } from "@/lib/raid/weatherClimate";
import type { RaidWeather } from "@/server/api/beta-raid/weather/weather-get";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  climate: null as unknown,
  stored: null as unknown,
  fail: false,
  admin: true,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((fn.validate = v), fn),
      handler: (h: unknown) => ({ h, validate: fn.validate }),
      validate: null as unknown,
    };
    return fn;
  },
}));
vi.mock("@/server/auth", () => ({
  requireAdmin: () => {
    if (!s.admin) throw new Error("forbidden");
    return "w_admin";
  },
  isAdminWallet: () => true,
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_admin" }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("raid_weather_climate(")) {
      if (s.fail) throw new Error("function does not exist");
      return [{ climate: s.climate }];
    }
    if (/FROM yuplink.raid_maps/.test(sql)) return [{ id: "map_a", name: "А" }];
    if (sql.includes("'weather_climate_world'") && sql.startsWith("SELECT"))
      return [{ climate: s.stored }];
    return [];
  },
}));

const { readWeatherClimate, forgetWeatherClimate } = await import("./weather-climate");
const { adminSetWeatherClimate } = await import("./weather-climate-admin");
const { stationWorld } = await import("@/server/api/weather-station/wstation-list");

type SetFn = {
  h: (a: { data: Record<string, unknown> }) => Promise<{ climate: WeatherClimate }>;
  validate: (d: unknown) => Record<string, unknown>;
};
const setApi = adminSetWeatherClimate as unknown as SetFn;
const DEF = { tempMin: -40, tempMax: 40, levels: ["clear", "overcast", "storm"], anomaly: null };
const COLD = { tempMin: -20, tempMax: 20, levels: ["clear", "overcast"], anomaly: "cold" };

beforeEach(() => {
  Object.assign(s, { sql: [], climate: null, stored: null, fail: false, admin: true });
  forgetWeatherClimate();
});

describe("климат мира для прогноза", () => {
  it("тем же, чем база: raid_weather_climate(мир), кэш на минуту", async () => {
    s.climate = COLD;
    expect(await readWeatherClimate("map_a", 1_000)).toEqual(COLD);
    expect(await readWeatherClimate("map_a", 30_000)).toEqual(COLD);
    expect(s.sql.filter((q) => q.includes("raid_weather_climate('map_a')"))).toHaveLength(1);
  });
  it("сбой базы (weather-08 ещё не накатан) — как всегда, в кэш не кладём", async () => {
    s.fail = true;
    expect(await readWeatherClimate("map_a", 1_000)).toEqual(DEF);
    s.fail = false;
    s.climate = COLD;
    expect(await readWeatherClimate("map_a", 2_000)).toEqual(COLD);
  });
});

describe("запись климата админом", () => {
  it("ввод: только известные поля и значения", () => {
    expect(() => setApi.validate({ mapId: "map_a", ...COLD, extra: 1 })).toThrow();
    expect(() => setApi.validate({ mapId: "map_a", ...COLD, anomaly: "wind" })).toThrow();
    expect(() => setApi.validate({ mapId: "map_a", ...COLD, levels: ["snow"] })).toThrow();
    expect(() => setApi.validate({ mapId: "map_a", ...COLD, tempMin: 1.5 })).toThrow();
    expect(setApi.validate({ mapId: "map_a", ...COLD })).toEqual({ mapId: "map_a", ...COLD });
  });
  it("та же проверка, что у клиента и базы: сетка, мин ≤ макс, уровни подряд", async () => {
    for (const bad of [
      { tempMin: -50 },
      { tempMin: -15 },
      { tempMin: 30, tempMax: 20 },
      { levels: ["clear", "storm"] },
    ])
      await expect(setApi.h({ data: { mapId: "map_a", ...COLD, ...bad } })).rejects.toThrow();
    expect(s.sql.some((q) => q.includes("INSERT"))).toBe(false);
  });
  it("только админ", async () => {
    s.admin = false;
    await expect(setApi.h({ data: { mapId: "map_a", ...COLD } })).rejects.toThrow("forbidden");
    expect(s.sql).toHaveLength(0);
  });
  it("свой климат — ключ мира в weather_climate_world, сверка записанного", async () => {
    s.stored = COLD;
    expect((await setApi.h({ data: { mapId: "map_a", ...COLD } })).climate).toEqual(COLD);
    const put = s.sql.find((q) => q.includes("INSERT INTO yuplink.settings"));
    expect(put).toContain("'weather_climate_world'");
    expect(put).toContain(`jsonb_build_object('map_a', '${JSON.stringify(COLD)}'::jsonb)`);
  });
  it("«как всегда» — ключ мира убирается", async () => {
    s.stored = null;
    await setApi.h({ data: { mapId: "map_a", ...DEF } });
    expect(s.sql.some((q) => q.includes("INSERT INTO yuplink.settings"))).toBe(false);
    expect(s.sql.find((q) => q.startsWith("UPDATE yuplink.settings"))).toContain(
      "value::jsonb - 'map_a'",
    );
  });
  it("не сохранилось (прочитали другое) — ошибка; неизвестный мир — ошибка", async () => {
    s.stored = DEF;
    await expect(setApi.h({ data: { mapId: "map_a", ...COLD } })).rejects.toThrow(/климат/);
    await expect(setApi.h({ data: { mapId: "map_x", ...COLD } })).rejects.toThrow(/Мир/);
  });
});

describe("метеостанция по климату мира", () => {
  const now: RaidWeather = {
    mapId: "map_a",
    kind: "clear",
    level: "clear",
    temperatureC: -20,
    slotAt: 0,
    nextAt: 1,
    coefs: { fish: 1, mine: 1, farm: 1, step: 1, ship: 1 },
    effectsOn: true,
    worldName: null,
  };
  const forecast = {
    now,
    levels: [
      { value: "overcast" as const, p: 50 },
      { value: "clear" as const, p: 50 },
    ],
    temps: [
      { value: -50, p: 30 },
      { value: -20, p: 40 },
      { value: -10, p: 30 },
    ],
    climate: COLD as WeatherClimate,
  };
  it("цели обряда и голоса — по лестнице мира; аномалия — шторм в уровнях", () => {
    const w = stationWorld({ id: "map_a", name: "А" }, forecast, { colder: 1 });
    expect(w.targets).toEqual(["clear", "overcast", "warmer", "colder"]);
    expect(w.temps.map((t) => t.value)).toEqual([-50, -20, -10]);
    expect(w.temps[0].p).toBeGreaterThan(30);
    expect(w.levels.map((l) => l.value)).toEqual(["clear", "overcast", "storm"]);
    expect(w.levels.find((l) => l.value === "storm")?.p).toBeCloseTo(w.temps[0].p, 6);
  });
  it("без климата в прогнозе (старый ответ) — как всегда", () => {
    const w = stationWorld({ id: "map_a", name: "А" }, { ...forecast, climate: undefined });
    expect(w.targets).toEqual(["clear", "overcast", "warmer", "colder"]);
  });
});
