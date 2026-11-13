// Обряд шамана на сервере: без станции — отказ, отказ базы — ключом перевода, «ok» —
// успех; голоса смены и шаманы для окна; нет таблиц — окно не падает.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = { owned: true, res: "ok", sql: [] as string[], fail: false };
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      handler: (h: (a: { data: unknown }) => unknown) => (a: { data: unknown }) => h(a),
    };
    return {
      ...fn,
      inputValidator: (v: (d: unknown) => unknown) => ({
        handler: (h: (a: { data: unknown }) => unknown) => (a: { data: unknown }) =>
          h({ data: v(a.data) }),
      }),
    };
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (s.fail) throw new Error("relation does not exist");
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: s.owned }];
    if (/raid_weather_ritual\(/.test(sql)) return [{ res: s.res }];
    if (/FROM yuplink.raid_maps/.test(sql)) return [{ id: "map_a", name: "Мир Альфа" }];
    if (/FROM yuplink.raid_weather_vote/.test(sql))
      return [
        { map_id: "map_a", target: "clear", n: 4, mine: false },
        { map_id: "map_a", target: "warmer", n: 1, mine: true },
        { map_id: "map_b", target: "nonsense", n: 9, mine: false },
      ];
    if (/castle_shaman/.test(sql)) return [{ n: 2 }];
    return [];
  },
}));

const { castWeatherRitual, ritualState } = await import("./wstation-ritual");
const cast = (target = "clear") =>
  Promise.resolve().then(() =>
    castWeatherRitual({ data: { mapId: "map_a", target, opId: "op_12345678" } }),
  );

beforeEach(() => Object.assign(s, { owned: true, res: "ok", sql: [], fail: false }));

describe("обряд", () => {
  it("ok — успех; аккаунт, мир, цель и opId уходят в базу", async () => {
    await expect(cast("warmer")).resolves.toEqual({ ok: true });
    expect(s.sql.at(-1)).toMatch(
      /raid_weather_ritual\('acc_me', 'map_a',\s+'warmer', 'op_12345678'\)/,
    );
  });
  it("без станции — отказ, до базы обряд не доходит", async () => {
    s.owned = false;
    await expect(cast()).rejects.toThrow("wstation.not_built");
    expect(s.sql.some((q) => q.includes("raid_weather_ritual"))).toBe(false);
  });
  it("отказы базы — ключами перевода", async () => {
    for (const [res, key] of [
      ["already", "wstation.ritual_already"],
      ["no_shaman", "wstation.ritual_no_shaman"],
      ["cannot", "wstation.ritual_cannot"],
      ["too_late", "wstation.ritual_too_late"],
      ["???", "wstation.ritual_failed"],
    ]) {
      s.res = res;
      await expect(cast()).rejects.toThrow(key);
    }
  });
  it("мир не из окна станции — отказ, шаман не тратится", async () => {
    await expect(
      Promise.resolve().then(() =>
        castWeatherRitual({ data: { mapId: "map_secret", target: "clear", opId: "op_12345678" } }),
      ),
    ).rejects.toThrow("wstation.ritual_no_weather");
    expect(s.sql.some((q) => q.includes("raid_weather_ritual"))).toBe(false);
  });
  it("цель вне списка — отказ проверки ввода", async () => {
    await expect(cast("sunny")).rejects.toThrow();
  });
});

describe("состояние для окна", () => {
  it("голоса по мирам, свой обряд, шаманы; чужие цели отброшены", async () => {
    expect(await ritualState("acc_me")).toEqual({
      votes: { map_a: { clear: 4, warmer: 1 } },
      mine: { map_a: "warmer" },
      shamans: 2,
    });
  });
  it("таблиц ещё нет — пусто, без ошибки", async () => {
    s.fail = true;
    expect(await ritualState("acc_me")).toEqual({ votes: {}, mine: {}, shamans: 0 });
  });
});
