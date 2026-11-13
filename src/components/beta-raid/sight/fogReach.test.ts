import { describe, expect, it } from "vitest";
import { fogTapKind, inReach } from "./fogReach";
import { buildFogZones } from "../fogZones";
import { FOG_REACH_RADIUS } from "@/lib/raid/fogRadius";
import { BINOCULAR_REACH_RADIUS, fogReachRadius } from "@/lib/raid/sight";
import { BUILDER_WORLD_MAP_ID } from "@/lib/raid/builderWorld";
import type { MapStore } from "../mapStore";

const none = { has: () => false };
/** Карта 41×41 вокруг (0,0); глухой туман — на клетке (5,0). */
const store = {
  index: (q: number, r: number) => (Math.abs(q) <= 20 && Math.abs(r) <= 20 ? (q + 20) * 41 + (r + 20) : -1),
  dome: new Set([(5 + 20) * 41 + 20]),
} as unknown as MapStore;
const reach = { q: 0, r: 0, radius: FOG_REACH_RADIUS };
const tap = (q: number, r: number, extra: Partial<Parameters<typeof fogTapKind>[0]> = {}) =>
  fogTapKind({ q, r, free: false, seen: none, visible: none, reach, store, ...extra });

describe("досягаемость в неразведанном", () => {
  it("радиус 10, с биноклем 20 (владелец 11.11)", () => {
    expect(FOG_REACH_RADIUS).toBe(10);
    expect(BINOCULAR_REACH_RADIUS).toBe(20);
  });

  it("гекс-расстояние: 10 — внутри, 11 — снаружи", () => {
    expect(inReach(reach, 10, 0)).toBe(true);
    expect(inReach(reach, 5, -10)).toBe(true);
    expect(inReach(reach, 10, 1)).toBe(false);
    expect(inReach(reach, 0, -11)).toBe(false);
    expect(inReach(null, 0, 0)).toBe(false);
  });

  it("неразведанное в круге — только маршрут, за кругом — мимо", () => {
    expect(tap(3, 4)).toBe("blind");
    expect(tap(12, 0)).toBeNull();
  });

  it("разведанное и видимое — обычный тап на любом расстоянии", () => {
    const seen = { has: (k: string) => k === "15,0" };
    expect(tap(15, 0, { seen })).toBe("full");
    expect(tap(1, 1, { visible: { has: () => true } })).toBe("full");
  });

  it("глухой туман и клетка вне карты — мимо", () => {
    expect(tap(5, 0)).toBeNull();
    const edge = { q: 18, r: 0, radius: 10 };
    expect(tap(25, 0, { reach: edge })).toBeNull();
  });

  it("режим бога, рука, остров — как раньше, без ограничения", () => {
    expect(tap(15, 0, { free: true })).toBe("full");
  });

  it("зоны тумана несут круг досягаемости героя", () => {
    expect(buildFogZones({ heroQ: 3, heroR: -2, reach: 20 }).reach).toEqual({ q: 3, r: -2, radius: 20 });
    expect(buildFogZones({ heroQ: 3, heroR: -2 }).reach?.radius).toBe(FOG_REACH_RADIUS);
    expect(buildFogZones({ heroQ: null, heroR: null }).reach).toBeNull();
    expect(buildFogZones({ heroQ: 3, heroR: -2, reach: null }).reach).toBeNull();
  });

  it("в Свартальвхейме досягаемости нет, в других мирах — 10 и 20 (владелец 12.11)", () => {
    expect(BUILDER_WORLD_MAP_ID).toBe("rmap_builders");
    expect(fogReachRadius("rmap_builders", 20)).toBeNull();
    expect(fogReachRadius("rmap_builders", 40)).toBeNull();
    expect(fogReachRadius("rmap_UthOURxc", 20)).toBe(10);
    expect(fogReachRadius("rmap_UthOURxc", 40)).toBe(20);
    expect(fogReachRadius(undefined, 20)).toBe(10);
    // Нет круга — тап в неразведанное мимо, как было до досягаемости.
    expect(tap(1, 0, { reach: null })).toBeNull();
  });
});
