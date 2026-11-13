// Выход «в час» с погодой (владелец, 28.10.2026): шахты v2 — × «шахты» своей карты,
// поля — × «фермы»; грибы и старые шахты — без погоды; коэффициент 1 — число прежнее
// и без значка; группа с разных карт — каждая со своим коэффициентом.
import { describe, expect, it } from "vitest";
import { NO_WEATHER, type WeatherCoefs, type WeatherKind } from "@/lib/raid/weather";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import {
  fieldShownRate,
  groupShownRate,
  mineShownRate,
  weatherByMapOf,
  weatherMapIds,
  weatherShown,
  type WeatherByMap,
} from "./weatherYield";

const NOW = Date.parse("2026-10-28T10:30:00Z");
const H = 3_600_000;

const v2 = {
  mode: "base" as const,
  lifeLeft: 1,
  lifeAt: new Date(NOW).toISOString(),
  breakAt: NOW + 100 * H,
  broken: false,
};
const mine = (over: Partial<MineRow> = {}): MineRow => ({
  mapId: "world",
  q: 1,
  r: 2,
  resource: "stone",
  token: null,
  yield: 10,
  claimedHours: 0,
  capturedAt: NOW - 5 * H,
  maxHours: 100,
  stepHours: 1,
  v2,
  ...over,
});
const coefs = (mine: number, farm: number): WeatherCoefs => ({ ...NO_WEATHER, mine, farm });
const byMap = (...rows: Array<[string, WeatherKind, WeatherCoefs]>): WeatherByMap =>
  new Map(rows.map(([id, kind, c]) => [id, { kind, coefs: c }]));

describe("weatherShown", () => {
  it("коэффициент 1 — число прежнее, без значка", () => {
    expect(weatherShown(615.33, 1, "clear")).toEqual({ value: 615.33, kind: null });
  });
  it("нет погоды или ноль — без значка", () => {
    expect(weatherShown(4, undefined, undefined)).toEqual({ value: 4, kind: null });
    expect(weatherShown(0, 0.5, "rain")).toEqual({ value: 0, kind: null });
  });
  it("ухудшение — число с погодой и значок", () => {
    expect(weatherShown(615.33, 0.5, "rain")).toEqual({ value: 307.665, kind: "rain" });
    expect(weatherShown(0.1, 3, "clear")).toEqual({ value: 0.3, kind: "clear" });
  });
});

describe("шахты", () => {
  const w = byMap(["world", "fog", coefs(0.6, 0.5)], ["floor2", "blizzard", coefs(0.055, 0.055)]);

  it("шахта v2 — × «шахты» своей карты", () => {
    expect(mineShownRate(mine(), NOW, w)).toEqual({ value: 6, kind: "fog" });
  });
  it("грибы и старые шахты — без погоды", () => {
    const mushroom = mine({ v2: null, mushroom: { kind: "gold", image: null, diesAt: NOW + H } });
    expect(mineShownRate(mushroom, NOW, w)).toEqual({ value: 10, kind: null });
    expect(mineShownRate(mine({ v2: null }), NOW, w)).toEqual({ value: 10, kind: null });
  });
  it("сломанная или отнятая — 0 и без значка", () => {
    expect(mineShownRate(mine({ v2: { ...v2, breakAt: NOW - H } }), NOW, w)).toEqual({
      value: 0,
      kind: null,
    });
    expect(mineShownRate(mine({ lost: { id: "x", amount: 3 } }), NOW, w)).toEqual({
      value: 0,
      kind: null,
    });
  });
  it("карта без погоды (остров, нет ответа) — прежнее", () => {
    expect(mineShownRate(mine({ mapId: "island-1" }), NOW, w)).toEqual({ value: 10, kind: null });
  });

  it("группа с разных карт — сумма каждой со своим коэффициентом, значки по картам", () => {
    const rows = [mine(), mine({ q: 5 }), mine({ mapId: "floor2", yield: 20 })];
    // 10 × 0,6 + 10 × 0,6 + 20 × 0,055 = 13,1
    expect(groupShownRate(rows, NOW, w)).toEqual({ value: 13.1, kinds: ["fog", "blizzard"] });
  });
  it("группа: коэффициент 1 у всех — сумма прежняя, без значков", () => {
    const calm = byMap(["world", "clear", coefs(1, 2)], ["floor2", "clear", NO_WEATHER]);
    const rows = [mine(), mine({ mapId: "floor2", yield: 615.33 })];
    expect(groupShownRate(rows, NOW, calm)).toEqual({ value: 625.33, kinds: [] });
  });
  it("группа: значок, если затронута хоть одна; одинаковый вид — один значок; не больше двух", () => {
    const three = byMap(
      ["a", "rain", coefs(0.5, 1)],
      ["b", "rain", coefs(0.35, 1)],
      ["c", "storm", coefs(0.01, 1)],
      ["d", "fog", coefs(0.5, 1)],
      ["e", "clear", NO_WEATHER],
    );
    const rows = ["e", "a", "b", "c", "d"].map((mapId) => mine({ mapId }));
    expect(groupShownRate(rows, NOW, three).kinds).toEqual(["rain", "storm"]);
    expect(groupShownRate([mine({ mapId: "e" }), mine({ mapId: "a" })], NOW, three)).toEqual({
      value: 15,
      kinds: ["rain"],
    });
  });
});

describe("поля", () => {
  it("доля × «фермы» своей карты; коэффициент 1 — прежняя", () => {
    const w = byMap(["world", "clear", coefs(1, 2)], ["floor2", "clear", NO_WEATHER]);
    expect(fieldShownRate({ mapId: "world", perHour: 0.14 }, w)).toEqual({
      value: 0.28,
      kind: "clear",
    });
    expect(fieldShownRate({ mapId: "floor2", perHour: 0.14 }, w)).toEqual({
      value: 0.14,
      kind: null,
    });
    expect(fieldShownRate({ mapId: "nowhere", perHour: 0.2 }, w)).toEqual({
      value: 0.2,
      kind: null,
    });
  });
});

describe("weatherByMapOf", () => {
  const reply = (mapId: string, nextAt: number) => ({
    mapId,
    kind: "rain" as const,
    nextAt,
    coefs: coefs(0.5, 0.5),
  });
  it("берёт только свежие ответы; сбой и сменившийся слот — без погоды", () => {
    const w = weatherByMapOf([reply("a", NOW + H), reply("b", NOW), null, undefined], NOW);
    expect([...w.keys()]).toEqual(["a"]);
  });
});

describe("weatherMapIds", () => {
  it("карты шахт v2 и полей; грибы, старые и отнятые не спрашиваем", () => {
    const ids = weatherMapIds(
      [
        mine({ mapId: "b" }),
        mine({ mapId: "old", v2: null }),
        mine({ mapId: "lost", lost: { id: "x", amount: 1 } }),
        mine({ mapId: "b", q: 9 }),
      ],
      [{ mapId: "a" }, { mapId: "b" }],
    );
    expect(ids).toEqual(["a", "b"]);
  });
});
