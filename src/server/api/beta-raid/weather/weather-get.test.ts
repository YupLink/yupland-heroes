// getRaidWeather: вход как у ручек бета-рейда, слот карты из базы, формат
// ответа, effectsOn — fx слота, коэффициенты — применяемые сейчас (fx false —
// все 1), settings не читаются; остров и неизвестная карта — null.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  row: null as Record<string, unknown> | null,
  gate: 0,
  swept: 0,
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
vi.mock("@/server/api/beta-raid/gate", () => ({
  requireBetaRaid: async () => {
    s.gate += 1;
    return "me.near";
  },
}));
vi.mock("@/server/api/beta-raid/weather/weather-sweep", () => ({
  startWeatherSweeper: () => {
    s.swept += 1;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("raid_weather_ensure")) return s.row ? [s.row] : [];
    if (sql.includes("FROM yuplink.raid_maps")) return [{ name: "Мидгард" }];
    return [];
  },
}));

const { getRaidWeather, raidWeatherOf } = await import("./weather-get");
const { resetWeatherCache } = await import("./weather-read");

type Fn = {
  h: (a: { data: { mapId: string } }) => Promise<unknown>;
  validate: (d: unknown) => { mapId: string };
};
const api = getRaidWeather as unknown as Fn;
const call = (mapId: string) => api.h({ data: api.validate({ mapId }) });

const T0 = Date.parse("2026-10-26T22:30:00Z");
const row = {
  slot_at: "2026-10-26T21:00:00+00:00",
  temp_c: -12,
  level: "overcast",
  kind: "fog",
  fx: false,
};

beforeEach(() => {
  resetWeatherCache();
  Object.assign(s, { sql: [], row, gate: 0, swept: 0 });
});

describe("getRaidWeather", () => {
  it("формат ответа; у слота fx false — effectsOn false, коэффициенты все 1", async () => {
    await expect(raidWeatherOf("rmap_a", T0)).resolves.toEqual({
      mapId: "rmap_a",
      kind: "fog",
      level: "overcast",
      temperatureC: -12,
      slotAt: Date.parse("2026-10-26T21:00:00Z"),
      nextAt: Date.parse("2026-10-27T01:00:00Z"),
      coefs: { fish: 1, mine: 1, farm: 1, step: 1, ship: 1 },
      effectsOn: false,
      worldName: "Мидгард",
    });
    expect(s.sql.some((x) => x.includes("settings"))).toBe(false);
  });

  it("у слота fx true — применяемые коэффициенты: холодно (−12) + туман", async () => {
    s.row = { ...row, fx: true };
    await expect(raidWeatherOf("rmap_a", T0)).resolves.toMatchObject({
      effectsOn: true,
      coefs: { fish: 2.25, mine: 0.45, farm: 0.45, step: 1.75, ship: 3 },
    });
  });

  it("ручка: вход бета-рейда, обход стартует, слот этой карты из базы", async () => {
    await expect(call("rmap_a")).resolves.toMatchObject({ mapId: "rmap_a", kind: "fog" });
    expect(s.gate).toBe(1);
    expect(s.swept).toBe(1);
    expect(s.sql.some((x) => x.includes("raid_weather_ensure('rmap_a'"))).toBe(true);
  });

  it("остров — null без базы", async () => {
    await expect(call("isle_x")).resolves.toBeNull();
    expect(s.sql).toEqual([]);
  });

  it("неизвестная карта — null", async () => {
    s.row = null;
    await expect(call("rmap_nope")).resolves.toBeNull();
  });

  it("пустой или длинный mapId — отказ входа", () => {
    expect(() => api.validate({ mapId: "" })).toThrow();
    expect(() => api.validate({ mapId: "x".repeat(129) })).toThrow();
    expect(() => api.validate({})).toThrow();
  });
});
